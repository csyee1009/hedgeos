import {
  ActionProposal,
  CandidateStrategy,
  MarketEvidenceStatus,
  SimulationResult,
  SimulationVerificationCheck,
  TypedRiskIntent,
} from "../types";
import { ActionProposalBuilder } from "./ActionProposalBuilder";
import { ExposurePayoffEngine } from "./ExposurePayoffEngine";
import { ThetanutsMarketService } from "./ThetanutsMarketService";

export const PRODUCT_MARKET_FRESHNESS_THRESHOLD_MS = 60_000;

const normalizeAsset = (asset: string): string => {
  const normalized = asset.toUpperCase();

  if (normalized === "WETH") {
    return "ETH";
  }

  if (normalized === "CBBTC") {
    return "BTC";
  }

  return normalized;
};

const normalizeBaseUnits = (
  amount: bigint,
  fromDecimals: number,
  toDecimals: number
): bigint => {
  if (fromDecimals === toDecimals) {
    return amount;
  }

  if (fromDecimals < toDecimals) {
    return amount * 10n ** BigInt(toDecimals - fromDecimals);
  }

  return amount / 10n ** BigInt(fromDecimals - toDecimals);
};

export class ThetanutsSimulationService {
  constructor(private marketService?: ThetanutsMarketService) { }

  public async simulateProposal(
    proposal: ActionProposal,
    intent: TypedRiskIntent,
    candidate?: CandidateStrategy,
    spotPriceUSD: number = 0
  ): Promise<SimulationResult> {
    const nowMs = Date.now();
    const verificationChecks: SimulationVerificationCheck[] = [];
    const isRfq =
      proposal.actionType === "REQUEST_FOR_QUOTATION";

    if (!intent.confirmedByUser) {
      verificationChecks.push({
        checkName: "CONFIRMED_INTENT_REQUIRED",
        passed: false,
        details:
          "Simulation blocked because the Typed Risk Intent has not been explicitly confirmed by the user.",
      });

      return {
        simulationId: `sim-${Math.random().toString(36).substring(2, 9)}`,
        proposalId: proposal.proposalId,
        proposalDigest: proposal.proposalDigest,
        intentId: intent.intentId,
        intentVersion: intent.version,
        strategyId: proposal.strategyId,
        status: "FAILED",
        simulationMethod: "NONE",
        chainId: proposal.chainId,
        targetContract: proposal.targetContract,
        bindingStatus: "PREVIEW_BOUND",
        simulatedAtMs: nowMs,
        marketEvidenceTimestampMs: 0,
        marketEvidenceStatus: "UNAVAILABLE",
        expectedPremium: proposal.expectedPremium,
        expectedFees: proposal.expectedFees,
        expectedTotalCost: proposal.expectedTotalCost,
        feeStatus: proposal.feeStatus,
        expectedExpiryMs: proposal.expectedExpiryMs,
        expectedOptionQuantity: proposal.expectedQuantity,
        expectedUnderlying: proposal.expectedAsset,
        providerResultSummary:
          "Simulation blocked: intent has not been explicitly confirmed.",
        revertReason: "UNCONFIRMED_INTENT",
        verificationChecks,
        authorizedByHuman: false,
      };
    }

    const recomputedDigest =
      ActionProposalBuilder.computeProposalDigest({
        intentId: proposal.intentId,
        intentVersion: proposal.intentVersion,
        strategyId: proposal.strategyId,
        protocol: proposal.protocol,
        chainId: proposal.chainId,
        actionType: proposal.actionType,
        targetContract: proposal.targetContract,
        asset: proposal.expectedAsset,
        optionRight: proposal.expectedOptionRight,
        strikeBaseUnits:
          proposal.expectedStrike.amountBaseUnits,
        expiryTimestampMs:
          proposal.expectedExpiryMs,
        quantityBaseUnits:
          proposal.expectedQuantity.amountBaseUnits,
        expectedTotalCostBaseUnits:
          proposal.expectedTotalCost?.amountBaseUnits,
        boundQuoteId: proposal.boundQuoteId,
        orderIndex:
          proposal.normalizedParameters?.orderIndex,
        makerAddress:
          proposal.normalizedParameters?.makerAddress,
        feeStatus: proposal.feeStatus,
      });

    const isDigestValid =
      recomputedDigest === proposal.proposalDigest;

    verificationChecks.push({
      checkName: "PROPOSAL_DIGEST_INTEGRITY",
      passed: isDigestValid,
      details: isDigestValid
        ? "Proposal digest recomputation matches proposal identity exactly."
        : "Proposal digest does not match the current proposal parameters.",
    });

    if (!isDigestValid) {
      return {
        simulationId: `sim-${Math.random().toString(36).substring(2, 9)}`,
        proposalId: proposal.proposalId,
        proposalDigest: proposal.proposalDigest,
        intentId: intent.intentId,
        intentVersion: intent.version,
        strategyId: proposal.strategyId,
        status: "SIMULATION_MISMATCH",
        simulationMethod: "NONE",
        chainId: proposal.chainId,
        targetContract: proposal.targetContract,
        bindingStatus: "PREVIEW_BOUND",
        simulatedAtMs: nowMs,
        marketEvidenceTimestampMs: 0,
        marketEvidenceStatus: "UNAVAILABLE",
        expectedPremium: proposal.expectedPremium,
        expectedFees: proposal.expectedFees,
        expectedTotalCost: proposal.expectedTotalCost,
        feeStatus: proposal.feeStatus,
        expectedExpiryMs: proposal.expectedExpiryMs,
        expectedOptionQuantity: proposal.expectedQuantity,
        expectedUnderlying: proposal.expectedAsset,
        providerResultSummary:
          "Simulation rejected: proposal digest recomputation mismatch.",
        revertReason: "PROPOSAL_DIGEST_MISMATCH",
        verificationChecks,
        authorizedByHuman: false,
      };
    }

    const isIntentVersionValid =
      proposal.intentId === intent.intentId &&
      proposal.intentVersion === intent.version;

    verificationChecks.push({
      checkName: "INTENT_VERSION_BINDING",
      passed: isIntentVersionValid,
      details: isIntentVersionValid
        ? `Proposal is bound to confirmed intent ${intent.intentId} version ${intent.version}.`
        : `Proposal intent/version does not match the current confirmed intent.`,
    });

    if (!isIntentVersionValid) {
      return {
        simulationId: `sim-${Math.random().toString(36).substring(2, 9)}`,
        proposalId: proposal.proposalId,
        proposalDigest: proposal.proposalDigest,
        intentId: intent.intentId,
        intentVersion: intent.version,
        strategyId: proposal.strategyId,
        status: "SIMULATION_MISMATCH",
        simulationMethod: "NONE",
        chainId: proposal.chainId,
        targetContract: proposal.targetContract,
        bindingStatus: "PREVIEW_BOUND",
        simulatedAtMs: nowMs,
        marketEvidenceTimestampMs: 0,
        marketEvidenceStatus: "UNAVAILABLE",
        expectedPremium: proposal.expectedPremium,
        expectedFees: proposal.expectedFees,
        expectedTotalCost: proposal.expectedTotalCost,
        feeStatus: proposal.feeStatus,
        expectedExpiryMs: proposal.expectedExpiryMs,
        expectedOptionQuantity: proposal.expectedQuantity,
        expectedUnderlying: proposal.expectedAsset,
        providerResultSummary:
          "Simulation rejected: confirmed intent changed after proposal generation.",
        revertReason: "INTENT_VERSION_STALE",
        verificationChecks,
        authorizedByHuman: false,
      };
    }

    if (isRfq) {
      verificationChecks.push({
        checkName: "RFQ_STATUS_CHECK",
        passed: false,
        details:
          "RFQ specification is unsubmitted and has no live market-maker quotation.",
      });

      return {
        simulationId: `sim-rfq-${Math.random().toString(36).substring(2, 9)}`,
        proposalId: proposal.proposalId,
        proposalDigest: proposal.proposalDigest,
        intentId: intent.intentId,
        intentVersion: intent.version,
        strategyId: proposal.strategyId,
        status: "NOT_AVAILABLE",
        simulationMethod: "NONE",
        chainId: proposal.chainId,
        targetContract: proposal.targetContract,
        bindingStatus: "PREVIEW_BOUND",
        simulatedAtMs: nowMs,
        marketEvidenceTimestampMs: 0,
        marketEvidenceStatus: "UNAVAILABLE",
        expectedPremium: undefined,
        expectedFees: undefined,
        expectedTotalCost: undefined,
        feeStatus: "NOT_AVAILABLE",
        expectedExpiryMs: proposal.expectedExpiryMs,
        expectedOptionQuantity: proposal.expectedQuantity,
        expectedUnderlying: proposal.expectedAsset,
        providerResultSummary:
          "Simulation unavailable: RFQ specification has not been submitted or priced.",
        revertReason:
          "RFQ_NOT_SUBMITTED_NO_LIVE_QUOTATION",
        verificationChecks,
        authorizedByHuman: false,
      };
    }

    const isChainMatch =
      proposal.chainId === 8453;

    const isProtocolMatch =
      proposal.protocol === "THETANUTS";

    const isAssetMatch =
      normalizeAsset(proposal.expectedAsset) ===
      normalizeAsset(intent.asset.value);

    const isRightMatch =
      proposal.expectedOptionRight === "PUT";

    verificationChecks.push({
      checkName: "PROTOCOL_AND_ASSET_MATCH",
      passed:
        isChainMatch &&
        isProtocolMatch &&
        isAssetMatch &&
        isRightMatch,
      details:
        `Chain ${proposal.chainId}, protocol ${proposal.protocol}, underlying ${proposal.expectedAsset}, option right ${proposal.expectedOptionRight}.`,
    });

    const candidateQuote =
      candidate?.quotes[0];

    const quoteBindingMatches =
      !proposal.boundQuoteId ||
      candidateQuote?.quoteId === proposal.boundQuoteId;

    verificationChecks.push({
      checkName: "QUOTE_BINDING",
      passed: quoteBindingMatches,
      details: quoteBindingMatches
        ? proposal.boundQuoteId
          ? `Candidate quote matches bound quote ${proposal.boundQuoteId}.`
          : "Proposal does not require a bound OptionBook quote."
        : "Candidate quote does not match the quote bound into the proposal.",
    });

    let simulatedPremium =
      proposal.expectedPremium;

    let simulatedFees =
      proposal.expectedFees;

    let simulatedTotalCost =
      proposal.expectedTotalCost;

    let simulatedFeeStatus =
      proposal.feeStatus;

    let simulationMethod:
      SimulationResult["simulationMethod"] =
      "DETERMINISTIC_VERIFICATION";

    let isProviderCallSuccessful = false;

    let marketEvidenceTimestampMs =
      candidate?.preview?.previewTimestampMs ||
      (candidateQuote?.rawApiData as any)?.timestampMs ||
      (candidateQuote as any)?.timestampMs ||
      0;

    if (
      quoteBindingMatches &&
      this.marketService &&
      candidateQuote
    ) {
      try {
        const freshPreview =
          await this.marketService.previewFill(
            candidateQuote,
            BigInt(
              proposal.expectedQuantity.amountBaseUnits
            )
          );

        if (
          freshPreview.previewStatus ===
          "PREVIEW_AVAILABLE"
        ) {
          simulatedPremium =
            freshPreview.premiumAmount;

          simulatedFees = {
            amountBaseUnits: (
              BigInt(
                freshPreview.protocolFee.amountBaseUnits
              ) +
              BigInt(
                freshPreview.referrerFee
                  ?.amountBaseUnits || "0"
              )
            ).toString(),
            decimals: 6,
            symbol: "USDC",
          };

          simulatedTotalCost =
            freshPreview.totalExpectedCost;

          simulatedFeeStatus =
            freshPreview.feeStatus;

          simulationMethod =
            "THETANUTS_OPTIONBOOK_PREVIEW";

          isProviderCallSuccessful = true;

          marketEvidenceTimestampMs =
            freshPreview.previewTimestampMs;
        }
      } catch {
        isProviderCallSuccessful = false;
      }
    }

    let marketEvidenceStatus:
      MarketEvidenceStatus = "UNAVAILABLE";

    if (marketEvidenceTimestampMs > 0) {
      const ageMs =
        nowMs - marketEvidenceTimestampMs;

      marketEvidenceStatus =
        ageMs >= 0 &&
          ageMs <=
          PRODUCT_MARKET_FRESHNESS_THRESHOLD_MS
          ? "FRESH"
          : "STALE";
    }

    verificationChecks.push({
      checkName: "MARKET_EVIDENCE_FRESHNESS",
      passed:
        marketEvidenceStatus === "FRESH",
      details:
        marketEvidenceStatus === "FRESH"
          ? `Market evidence is fresh (${Math.round(
            (nowMs -
              marketEvidenceTimestampMs) /
            1000
          )}s old).`
          : marketEvidenceStatus === "STALE"
            ? "Market evidence is stale and should be refreshed."
            : "Market evidence timestamp is unavailable.",
    });

    if (
      this.marketService &&
      candidateQuote
    ) {
      verificationChecks.push({
        checkName: "FRESH_READ_ONLY_PREVIEW",
        passed: isProviderCallSuccessful,
        details: isProviderCallSuccessful
          ? "Fresh Thetanuts OptionBook preview completed successfully."
          : "Fresh Thetanuts OptionBook preview was unavailable.",
      });
    }

    const budgetSymbol =
      intent.maxPremiumUSDC.value.symbol.toUpperCase();

    const totalCostSymbol =
      simulatedTotalCost?.symbol.toUpperCase();

    let isCostWithinBudget = false;

    let totalCostBaseUnits = -1n;

    let normalizedBudgetBaseUnits = 0n;

    if (
      simulatedTotalCost &&
      totalCostSymbol === budgetSymbol
    ) {
      const comparisonDecimals =
        Math.max(
          simulatedTotalCost.decimals,
          intent.maxPremiumUSDC.value.decimals
        );

      totalCostBaseUnits =
        normalizeBaseUnits(
          BigInt(
            simulatedTotalCost.amountBaseUnits
          ),
          simulatedTotalCost.decimals,
          comparisonDecimals
        );

      normalizedBudgetBaseUnits =
        normalizeBaseUnits(
          BigInt(
            intent.maxPremiumUSDC.value
              .amountBaseUnits
          ),
          intent.maxPremiumUSDC.value.decimals,
          comparisonDecimals
        );

      isCostWithinBudget =
        totalCostBaseUnits >= 0n &&
        totalCostBaseUnits <=
        normalizedBudgetBaseUnits;
    }

    verificationChecks.push({
      checkName: "BUDGET_COMPLIANCE",
      passed: isCostWithinBudget,
      details: !simulatedTotalCost
        ? "Total protection cost is unavailable."
        : totalCostSymbol !== budgetSymbol
          ? `Cost denomination ${totalCostSymbol} does not match confirmed budget denomination ${budgetSymbol}.`
          : isCostWithinBudget
            ? "Freshly evaluated total protection cost is within the confirmed budget."
            : "Freshly evaluated total protection cost exceeds the confirmed budget.",
    });

    let isProtectionTargetMet = false;

    if (spotPriceUSD <= 0) {
      verificationChecks.push({
        checkName: "PROTECTION_TARGET_RECHECK",
        passed: false,
        details:
          "Live market spot price unavailable: protection payoff cannot be truthfully re-evaluated.",
      });
    } else if (!simulatedTotalCost) {
      verificationChecks.push({
        checkName: "PROTECTION_TARGET_RECHECK",
        passed: false,
        details:
          "Protection cost is unavailable, so modeled downside cannot be re-evaluated.",
      });
    } else {
      const exposureQuantityNum =
        Number(
          BigInt(
            intent.exposureAmount.value
              .amountBaseUnits
          )
        ) /
        10 **
        intent.exposureAmount.value.decimals;

      const strikePriceNum =
        Number(
          BigInt(
            proposal.expectedStrike
              .amountBaseUnits
          )
        ) /
        10 **
        proposal.expectedStrike.decimals;

      const totalCostUSDNum =
        Number(
          BigInt(
            simulatedTotalCost.amountBaseUnits
          )
        ) /
        10 **
        simulatedTotalCost.decimals;

      const payoff =
        ExposurePayoffEngine.calculate({
          spotQuantity:
            exposureQuantityNum,
          optionQuantity:
            exposureQuantityNum,
          strikePriceUSD:
            strikePriceNum,
          spotReferencePriceUSD:
            spotPriceUSD,
          totalProtectionCostUSD:
            totalCostUSDNum,
          assetSymbol:
            intent.asset.value,
        });

      isProtectionTargetMet =
        payoff.effectiveDownsidePercent <=
        intent.targetMaxLossPercent.value;

      verificationChecks.push({
        checkName: "PROTECTION_TARGET_RECHECK",
        passed: isProtectionTargetMet,
        details: isProtectionTargetMet
          ? `Modeled at-expiry downside (${payoff.effectiveDownsidePercent.toFixed(
            2
          )}%) satisfies the confirmed target (${intent.targetMaxLossPercent.value}%).`
          : `Modeled at-expiry downside (${payoff.effectiveDownsidePercent.toFixed(
            2
          )}%) exceeds the confirmed target (${intent.targetMaxLossPercent.value}%).`,
      });
    }

    const allPassed =
      verificationChecks.every(
        (check) => check.passed
      );

    let status: SimulationResult["status"] = isProviderCallSuccessful
      ? "PROVIDER_SIMULATED"
      : "DETERMINISTIC_VERIFIED";

    if (spotPriceUSD <= 0) {
      status = "FAILED";
    } else if (marketEvidenceStatus === "STALE") {
      status = "STALE";
    } else if (marketEvidenceStatus === "UNAVAILABLE") {
      status = "NOT_AVAILABLE";
    } else if (!allPassed) {
      status =
        !isCostWithinBudget ||
          !isProtectionTargetMet ||
          !quoteBindingMatches
          ? "SIMULATION_MISMATCH"
          : "FAILED";
    }

    return {
      simulationId: `sim-${Math.random().toString(36).substring(2, 9)}`,
      proposalId: proposal.proposalId,
      proposalDigest:
        proposal.proposalDigest,
      intentId: intent.intentId,
      intentVersion: intent.version,
      strategyId: proposal.strategyId,
      status,
      simulationMethod,
      chainId: proposal.chainId,
      targetContract:
        proposal.targetContract,
      bindingStatus: "PREVIEW_BOUND",
      simulatedAtMs: nowMs,
      marketEvidenceTimestampMs,
      marketEvidenceStatus,
      expectedPremium:
        simulatedPremium,
      expectedFees: simulatedFees,
      expectedTotalCost:
        simulatedTotalCost,
      feeStatus: simulatedFeeStatus,
      expectedExpiryMs:
        proposal.expectedExpiryMs,
      expectedOptionQuantity:
        proposal.expectedQuantity,
      expectedUnderlying:
        proposal.expectedAsset,
      providerResultSummary:
        spotPriceUSD <= 0
          ? "Simulation rejected: Live market spot price unavailable for protection target re-evaluation."
          : allPassed
            ? `Read-only ${simulationMethod === "THETANUTS_OPTIONBOOK_PREVIEW"
              ? "Thetanuts protocol preview"
              : "deterministic verification"
            } passed.`
            : `Simulation verification incomplete or failed: ${verificationChecks
              .filter((check) => !check.passed)
              .map((check) => check.details)
              .join("; ")}`,
      verificationChecks,
      authorizedByHuman: false,
    };
  }
}