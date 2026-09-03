import {
  formatTokenAmount,
  OptionLeg,
  PreparedActionProposal,
  RFQReasonCode,
  RFQSpecification,
  RFQValidationStatus,
  StrategyType,
  TokenAmount,
  TypedRiskIntent,
} from "../types";
import { OptionSizingAdapter } from "./OptionSizingAdapter";
import { ThetanutsMarketService } from "./ThetanutsMarketService";

export interface RFQSpecificationBuildResult {
  specification: RFQSpecification;
  actionProposal: PreparedActionProposal;
  candidateLegs: OptionLeg[];
}

export class RFQSpecificationBuilder {
  /**
   * Deterministically builds an RFQSpecification from a confirmed TypedRiskIntent.
   * STRICTLY HONEST: No hardcoded fallback spot prices, loss percentages, or expiries.
   * If any required input is unavailable, marks validationStatus = INVALID without inventing fake numbers.
   */
  public static buildSpecification(
    intent: TypedRiskIntent,
    spotPriceUSD: number,
    reasons: RFQReasonCode[],
    marketService?: ThetanutsMarketService
  ): RFQSpecificationBuildResult {
    const intentId = intent.intentId;
    const rfqSpecId = `rfq-spec-${Math.random().toString(36).substring(2, 9)}`;
    const nowMs = Date.now();
    const validationErrors: string[] = [];

    // 1. Sizing Resolution (Reusing verified Delta-1 OptionSizingAdapter)
    if (!intent.exposureAmount?.value) {
      validationErrors.push("Exposure amount is missing from confirmed intent.");
    }
    if (!intent.asset?.value) {
      validationErrors.push("Target asset is missing from confirmed intent.");
    }

    const sizingResult = intent.exposureAmount?.value && intent.asset?.value
      ? OptionSizingAdapter.resolveSizing(intent.exposureAmount.value, intent.asset.value)
      : { sizingStatus: "NOT_RESOLVED" as const, requestedExposure: intent.exposureAmount?.value, contractsDecimal: 18, underlyingUnitsPerContract: 1.0, protocolEvidence: "Missing input" };

    let requestedContracts: TokenAmount;
    if (sizingResult.sizingStatus === "RESOLVED" && sizingResult.resolvedOptionQuantity) {
      requestedContracts = sizingResult.resolvedOptionQuantity;
    } else {
      requestedContracts = {
        amountBaseUnits: "0",
        decimals: 18,
        symbol: "CONTRACTS",
      };
      validationErrors.push("Option sizing could not be resolved for requested exposure.");
    }

    // 2. Strategy Type & Multi-leg Verification
    const isMultiLeg = intent.allowMultiLeg?.value === true;
    const strategyType: StrategyType = isMultiLeg ? "PUT_SPREAD" : "LONG_PUT";

    // 3. Deterministic Strike Derivation (Zero Fake Spot Fallbacks)
    if (spotPriceUSD <= 0 || !Number.isFinite(spotPriceUSD)) {
      validationErrors.push("Live market spot price is unavailable; cannot derive target strike.");
    }
    if (intent.targetMaxLossPercent?.value === undefined || intent.targetMaxLossPercent.value === null) {
      validationErrors.push("Target max loss percentage is missing from confirmed intent.");
    }

    const maxLossPercent = intent.targetMaxLossPercent?.value;
    const strikes: TokenAmount[] = [];
    let primaryStrikeUSD = 0;
    let strikeDerivationMethod = "";
    let putSpreadStatus: "SPECIFICATION_READY" | "BLOCKED_PENDING_STRIKE_SELECTION_POLICY" | undefined = undefined;

    if (spotPriceUSD > 0 && maxLossPercent !== undefined && maxLossPercent !== null) {
      const targetDownsideMultiplier = Math.max(0, 1 - maxLossPercent / 100);
      primaryStrikeUSD = Math.round(spotPriceUSD * targetDownsideMultiplier * 100) / 100;
      const primaryStrikeBaseUnits = (BigInt(Math.floor(primaryStrikeUSD * 100)) * 1000000n).toString(); // 8 decimals USD

      strikes.push({
        amountBaseUnits: primaryStrikeBaseUnits,
        decimals: 8,
        symbol: "USD",
      });

      strikeDerivationMethod = `TARGET_STRIKE_ESTIMATE: spotPrice ($${spotPriceUSD.toFixed(2)}) * (1 - targetMaxLossPercent (${maxLossPercent}%)) = $${primaryStrikeUSD.toFixed(2)} (Pricing pending sealed RFQ quotations)`;

      if (strategyType === "PUT_SPREAD") {
        // Audit Item 3: Do NOT invent arbitrary 2x maxLoss lower strike
        putSpreadStatus = "BLOCKED_PENDING_STRIKE_SELECTION_POLICY";
        validationErrors.push("Put Spread RFQ lower strike selection policy is not verified; blocked pending explicit strike selection policy.");
      } else {
        putSpreadStatus = "SPECIFICATION_READY";
      }
    } else {
      strikeDerivationMethod = "STRIKE_DERIVATION_FAILED: Missing live spot price or loss target";
    }

    // 4. Expiry Selection & Validation (Zero Fake Expiry Fallbacks)
    const horizonMs = intent.horizonTimestamp?.value?.timestampMs;
    if (!horizonMs || horizonMs <= nowMs) {
      validationErrors.push("Confirmed protection horizon is missing or in the past.");
    }
    const resolvedHorizonMs = horizonMs || 0;

    // 5. Asset Validation
    const underlying = (intent.asset?.value || "").toUpperCase();
    if (underlying !== "ETH" && underlying !== "BTC" && underlying !== "SOL") {
      validationErrors.push(`Asset '${underlying}' is not supported on Thetanuts OptionFactory.`);
    }

    // 6. OptionFactory Contract Address Resolution (From verified SDK chainConfig)
    const factoryAddress = marketService
      ? marketService.getOptionFactoryAddress()
      : new ThetanutsMarketService().getOptionFactoryAddress();
    if (!factoryAddress) {
      validationErrors.push("Thetanuts OptionFactory contract address could not be resolved from SDK chain configuration.");
    }

    const validationStatus: RFQValidationStatus =
      validationErrors.length === 0 ? "VALID" : "INVALID";

    const specification: RFQSpecification = {
      rfqSpecId,
      intentId,
      underlying,
      strategyType,
      optionRight: "PUT",
      strikes,
      targetStrikeEstimateUSD: primaryStrikeUSD,
      strikeDerivationStatus: "TARGET_STRIKE_ESTIMATE",
      pricingStatus: "PENDING_RFQ_PRICING_REFINEMENT",
      strikeDerivationMethod,
      expiryTimestampMs: resolvedHorizonMs,
      expiryFormatted: intent.horizonTimestamp?.value?.formattedDisplay || (resolvedHorizonMs > 0 ? new Date(resolvedHorizonMs).toUTCString() : "INVALID_EXPIRY"),
      offerDeadlineMinutes: 15,
      offerDeadlineRationale: "PRODUCT_SELECTED_DEFAULT_REQUIRES_USER_REVIEW",
      requestedContracts,
      settlementType: "CASH",
      collateralAsset: "USDC",
      collateralDecimals: 6,
      sourceReasons: reasons,
      createdAtMs: nowMs,
      validationStatus,
      validationErrors,
      putSpreadStatus,
    };

    // 7. Candidate Legs for Solver / Policy representation
    const candidateLegs: OptionLeg[] = strikes.map((strike, idx) => ({
      side: strategyType === "PUT_SPREAD" && idx === 0 ? "SELL" : "BUY",
      right: "PUT",
      strikePrice: strike,
      expiryTimestampMs: resolvedHorizonMs,
      requestedExposure: intent.exposureAmount?.value || { amountBaseUnits: "0", decimals: 18, symbol: underlying },
      resolvedOptionQuantity: requestedContracts,
      sizingStatus: sizingResult.sizingStatus,
      quoteReference: `rfq-spec-leg-${idx + 1}`,
    }));

    // 8. Non-Executable PreparedActionProposal Boundary (UNAUTHORIZED / NOT_SUBMITTED)
    const proposalId = `prop-${Math.random().toString(36).substring(2, 9)}`;
    const actionProposal: PreparedActionProposal = {
      proposalId,
      actionType: "REQUEST_FOR_QUOTATION",
      protocol: "THETANUTS",
      chainId: 8453,
      intentId,
      rfqSpecId,
      requiredMethod: "requestForQuotation",
      targetContract: factoryAddress || "UNAVAILABLE_OPTION_FACTORY",
      normalizedParams: {
        underlying,
        strategyType,
        isLong: true,
        strikes: strikes.map((s) => s.amountBaseUnits),
        numContracts: requestedContracts.amountBaseUnits,
        expiryTimestamp: Math.floor(resolvedHorizonMs / 1000),
        offerDeadlineMinutes: 15,
        collateralToken: "USDC",
        settlementType: "CASH",
      },
      authorizationStatus: "UNAUTHORIZED",
      submissionStatus: "NOT_SUBMITTED",
    };

    return {
      specification,
      actionProposal,
      candidateLegs,
    };
  }
}
