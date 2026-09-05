import { createHash } from "crypto";
import {
  ActionProposal,
  CandidateStrategy,
  FeeStatus,
  RFQSpecification,
  TokenAmount,
  TypedRiskIntent,
} from "../types";
import { ThetanutsMarketService } from "./ThetanutsMarketService";

export class ActionProposalBuilder {
  /**
   * Computes deterministic proposal digest over normalized financial and execution parameters.
   * STRICT INVARIANTS:
   * 1. Does not hash timestamps, random IDs, nonces, or secret keys.
   * 2. Binds all materially relevant proposal data: intentId, version, strategyId,
   *    protocol, chainId, actionType, targetContract, asset, right, strike, expiry,
   *    quantity, max cost, quote/order reference, order index, maker, fee status.
   */
  public static computeProposalDigest(params: {
    intentId: string;
    intentVersion: number;
    strategyId: string;
    protocol: string;
    chainId: number;
    actionType: string;
    targetContract: string;
    asset: string;
    optionRight: string;
    strikeBaseUnits: string;
    expiryTimestampMs: number;
    quantityBaseUnits: string;
    expectedTotalCostBaseUnits?: string;
    boundQuoteId?: string;
    orderIndex?: number;
    makerAddress?: string;
    feeStatus?: string;
  }): string {
    const payload = [
      params.intentId,
      params.intentVersion.toString(),
      params.strategyId,
      params.protocol,
      params.chainId.toString(),
      params.actionType,
      (params.targetContract || "UNRESOLVED").toLowerCase(),
      (params.asset || "UNRESOLVED").toUpperCase(),
      (params.optionRight || "UNRESOLVED").toUpperCase(),
      params.strikeBaseUnits || "0",
      (params.expiryTimestampMs || 0).toString(),
      params.quantityBaseUnits || "0",
      params.expectedTotalCostBaseUnits || "UNPRICED",
      params.boundQuoteId || "NONE",
      (params.orderIndex !== undefined ? params.orderIndex.toString() : "NONE"),
      (params.makerAddress || "NONE").toLowerCase(),
      params.feeStatus || "NOT_AVAILABLE",
    ].join(":");

    return createHash("sha256").update(payload).digest("hex");
  }

  /**
   * Builds an ActionProposal for a top-ranked OptionBook Candidate.
   * STRICT INVARIANTS:
   * - Never hardcodes fallback contract addresses; resolves through SDK / marketService.
   * - Never falls back to requestedExposure if resolvedOptionQuantity is missing.
   * - Never sets unknown fees to zero.
   * - Never sets bindingStatus to EXACT_TRANSACTION_BOUND for preview fills (remains PREVIEW_BOUND).
   * - Never uses quote.asset || intent.asset fallback.
   */
  public static buildOptionBookProposal(
    intent: TypedRiskIntent,
    candidate: CandidateStrategy,
    marketService?: ThetanutsMarketService
  ): ActionProposal {
    if (!intent.confirmedByUser) {
      throw new Error(
        "Cannot build action proposal: Intent has not been explicitly confirmed by user."
      );
    }

    const quote = candidate.quotes[0];
    const leg = candidate.legs[0];
    const nowMs = Date.now();

    if (!quote || !leg) {
      throw new Error("Cannot build action proposal: CandidateStrategy has no legs or quotes.");
    }

    // Strict Requirement: Explicit quote asset and option right (No fallback copies)
    if (!quote.asset || !quote.optionRight) {
      throw new Error("Cannot build action proposal: MarketQuote is missing explicit asset or option right.");
    }

    // Strict Requirement: Option Sizing must be resolved (No fallback to requested exposure)
    if (leg.sizingStatus !== "RESOLVED" || !leg.resolvedOptionQuantity) {
      throw new Error("Cannot build action proposal: Option sizing is unverified. Resolved quantity is required.");
    }

    // SDK-resolved OptionBook contract address (No hardcoded fallbacks)
    const targetContract = marketService
      ? marketService.getOptionBookAddress()
      : (quote.rawApiData?.targetContract || (quote as any).targetContract || "");

    // Strict Fee and Cost Resolution (Unknown fees are NOT zero)
    let expectedPremium: TokenAmount | undefined = undefined;
    let expectedFees: TokenAmount | undefined = undefined;
    let expectedTotalCost: TokenAmount | undefined = undefined;
    let feeStatus: FeeStatus = "NOT_AVAILABLE";

    if (candidate.preview && candidate.preview.previewStatus === "PREVIEW_AVAILABLE") {
      expectedPremium = candidate.preview.premiumAmount;
      feeStatus = candidate.preview.feeStatus;

      if (feeStatus === "ZERO_VERIFIED") {
        expectedFees = {
          amountBaseUnits: "0",
          decimals: 6,
          symbol: "USDC",
        };
      } else if (feeStatus === "AVAILABLE") {
        const protoFee = BigInt(candidate.preview.protocolFee?.amountBaseUnits || "0");
        const refFee = BigInt(candidate.preview.referrerFee?.amountBaseUnits || "0");
        expectedFees = {
          amountBaseUnits: (protoFee + refFee).toString(),
          decimals: 6,
          symbol: "USDC",
        };
      } else {
        expectedFees = undefined;
      }

      expectedTotalCost = candidate.preview.totalExpectedCost;
    }

    const isComplete = Boolean(
      targetContract &&
      expectedTotalCost &&
      (feeStatus === "ZERO_VERIFIED" || feeStatus === "AVAILABLE")
    );

    const digest = this.computeProposalDigest({
      intentId: intent.intentId,
      intentVersion: intent.version,
      strategyId: candidate.strategyId,
      protocol: "THETANUTS",
      chainId: 8453,
      actionType: "OPTIONBOOK_FILL_ORDER",
      targetContract,
      asset: quote.asset,
      optionRight: quote.optionRight,
      strikeBaseUnits: quote.strikePrice.amountBaseUnits,
      expiryTimestampMs: quote.expiryTimestampMs,
      quantityBaseUnits: leg.resolvedOptionQuantity.amountBaseUnits,
      expectedTotalCostBaseUnits: expectedTotalCost?.amountBaseUnits,
      boundQuoteId: quote.quoteId,
      orderIndex: quote.orderIndex,
      makerAddress: quote.makerAddress,
      feeStatus,
    });

    return {
      proposalId: `prop-${Math.random().toString(36).substring(2, 9)}`,
      intentId: intent.intentId,
      intentVersion: intent.version,
      strategyId: candidate.strategyId,
      protocol: "THETANUTS",
      chainId: 8453,
      actionType: "OPTIONBOOK_FILL_ORDER",
      targetContract,
      normalizedParameters: {
        strategyType: candidate.strategyType,
        quoteId: quote.quoteId,
        orderIndex: quote.orderIndex,
        makerAddress: quote.makerAddress,
        optionRight: quote.optionRight,
        strike: quote.strikePrice,
        expiry: quote.expiryTimestampMs,
        contracts: leg.resolvedOptionQuantity,
        pricePerContractUSD: candidate.preview?.pricePerContract?.amountBaseUnits,
      },
      expectedAsset: quote.asset,
      expectedOptionRight: quote.optionRight,
      expectedStrike: quote.strikePrice,
      expectedQuantity: leg.resolvedOptionQuantity,
      expectedPremium,
      expectedFees,
      expectedTotalCost,
      feeStatus,
      expectedExpiryMs: quote.expiryTimestampMs,
      boundQuoteId: quote.quoteId,
      proposalCreatedAtMs: nowMs,
      proposalStatus: isComplete ? "PREPARED" : "INCOMPLETE",
      bindingStatus: "PREVIEW_BOUND", // Strictly PREVIEW_BOUND; previewFillOrder does not prove exact tx binding
      proposalDigest: digest,
      authorizationStatus: "UNAUTHORIZED",
    };
  }

  /**
   * Builds an ActionProposal for an RFQ Specification.
   * STRICT INVARIANTS:
   * - Unpriced RFQ does not fabricate 0 USDC costs.
   * - SDK resolves OptionFactory contract address.
   */
  public static buildRFQProposal(
    intent: TypedRiskIntent,
    rfqSpec: RFQSpecification,
    marketService?: ThetanutsMarketService
  ): ActionProposal {
    if (!intent.confirmedByUser) {
      throw new Error(
        "Cannot build RFQ proposal: Intent has not been explicitly confirmed by user."
      );
    }

    const nowMs = Date.now();
    const primaryStrike = rfqSpec.strikes[0] || {
      amountBaseUnits: "0",
      decimals: 8,
      symbol: "USD",
    };

    const targetContract = marketService
      ? marketService.getOptionFactoryAddress()
      : "";

    const digest = this.computeProposalDigest({
      intentId: intent.intentId,
      intentVersion: intent.version,
      strategyId: `rfq-${rfqSpec.rfqSpecId}`,
      protocol: "THETANUTS",
      chainId: 8453,
      actionType: "REQUEST_FOR_QUOTATION",
      targetContract,
      asset: rfqSpec.underlying,
      optionRight: rfqSpec.optionRight,
      strikeBaseUnits: primaryStrike.amountBaseUnits,
      expiryTimestampMs: rfqSpec.expiryTimestampMs,
      quantityBaseUnits: rfqSpec.requestedContracts.amountBaseUnits,
      expectedTotalCostBaseUnits: "UNPRICED",
      boundQuoteId: rfqSpec.rfqSpecId,
      feeStatus: "NOT_AVAILABLE",
    });

    return {
      proposalId: `prop-rfq-${Math.random().toString(36).substring(2, 9)}`,
      intentId: intent.intentId,
      intentVersion: intent.version,
      strategyId: `rfq-${rfqSpec.rfqSpecId}`,
      protocol: "THETANUTS",
      chainId: 8453,
      actionType: "REQUEST_FOR_QUOTATION",
      targetContract,
      normalizedParameters: {
        rfqSpecId: rfqSpec.rfqSpecId,
        strategyType: rfqSpec.strategyType,
        underlying: rfqSpec.underlying,
        strikes: rfqSpec.strikes,
        expiryTimestampMs: rfqSpec.expiryTimestampMs,
        requestedContracts: rfqSpec.requestedContracts,
        offerDeadlineMinutes: rfqSpec.offerDeadlineMinutes,
      },
      expectedAsset: rfqSpec.underlying,
      expectedOptionRight: rfqSpec.optionRight,
      expectedStrike: primaryStrike,
      expectedQuantity: rfqSpec.requestedContracts,
      expectedPremium: undefined, // Truthful: sealed-bid unpriced RFQ
      expectedFees: undefined,
      expectedTotalCost: undefined,
      feeStatus: "NOT_AVAILABLE",
      expectedExpiryMs: rfqSpec.expiryTimestampMs,
      boundQuoteId: rfqSpec.rfqSpecId,
      proposalCreatedAtMs: nowMs,
      proposalStatus:
        rfqSpec.validationStatus === "VALID" && targetContract
          ? "PREPARED"
          : "INCOMPLETE",
      bindingStatus: "PREVIEW_BOUND",
      proposalDigest: digest,
      authorizationStatus: "UNAUTHORIZED",
    };
  }
}
