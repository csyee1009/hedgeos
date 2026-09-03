import {
  ActionProposal,
  CandidateStrategy,
  MarketEvidenceStatus,
  SimulationResult,
  SimulationVerificationCheck,
  TokenAmount,
  TypedRiskIntent,
} from "../types";
import { ActionProposalBuilder } from "./ActionProposalBuilder";
import { ExposurePayoffEngine } from "./ExposurePayoffEngine";
import { ThetanutsMarketService } from "./ThetanutsMarketService";

export const PRODUCT_MARKET_FRESHNESS_THRESHOLD_MS = 60_000; // 60s HedgeOS Product Freshness Policy (Documented Product Choice)

export class ThetanutsSimulationService {
  constructor(private marketService?: ThetanutsMarketService) {}

  /**
   * Executes a strictly READ-ONLY pre-execution simulation and verification on the ActionProposal.
   * STRICT INVARIANTS:
   * 1. Uses ZERO signers, zero wallets, zero private keys, zero transaction broadcasts.
   * 2. Recomputes and validates the deterministic proposal digest before simulation.
   * 3. Freshly executes SDK read-only protocol preview where available.
   * 4. Reports PROVIDER_SIMULATED ONLY when a genuine provider read occurs; DETERMINISTIC_VERIFIED otherwise.
   * 5. Derives market evidence freshness from real preview/quote timestamps (never Date.now() default).
   * 6. Uses zero fake spot price defaults (rejects if spot price is <= 0).
   * 7. Always marks bindingStatus as PREVIEW_BOUND (never fake EXACT_TRANSACTION_BOUND).
   */
  public async simulateProposal(
    proposal: ActionProposal,
    intent: TypedRiskIntent,
    candidate?: CandidateStrategy,
    spotPriceUSD: number = 0
  ): Promise<SimulationResult> {
    const nowMs = Date.now();
    const verificationChecks: SimulationVerificationCheck[] = [];
    const isRfq = proposal.actionType === "REQUEST_FOR_QUOTATION";

    // 1. Proposal Digest Recomputation & Integrity Check
    const recomputedDigest = ActionProposalBuilder.computeProposalDigest({
      intentId: proposal.intentId,
      intentVersion: proposal.intentVersion,
      strategyId: proposal.strategyId,
      protocol: proposal.protocol,
      chainId: proposal.chainId,
      actionType: proposal.actionType,
      targetContract: proposal.targetContract,
      asset: proposal.expectedAsset,
      optionRight: proposal.expectedOptionRight,
      strikeBaseUnits: proposal.expectedStrike.amountBaseUnits,
      expiryTimestampMs: proposal.expectedExpiryMs,
      quantityBaseUnits: proposal.expectedQuantity.amountBaseUnits,
      expectedTotalCostBaseUnits: proposal.expectedTotalCost?.amountBaseUnits,
      boundQuoteId: proposal.boundQuoteId,
      orderIndex: proposal.normalizedParameters?.orderIndex,
      makerAddress: proposal.normalizedParameters?.makerAddress,
      feeStatus: proposal.feeStatus,
    });

    const isDigestValid = recomputedDigest === proposal.proposalDigest;
    verificationChecks.push({
      checkName: "PROPOSAL_DIGEST_INTEGRITY",
      passed: isDigestValid,
      details: isDigestValid
        ? "Proposal digest recomputation matches proposal identity exactly."
        : `Proposal digest mismatch: stored '${proposal.proposalDigest}', recomputed '${recomputedDigest}'.`,
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
        providerResultSummary: "Simulation rejected: proposal digest recomputation mismatch (material parameters altered).",
        revertReason: "PROPOSAL_DIGEST_MISMATCH",
        verificationChecks,
        authorizedByHuman: false,
      };
    }

    // 2. Intent Version Binding Check
    const isIntentVersionValid = proposal.intentId === intent.intentId && proposal.intentVersion === intent.version;
    verificationChecks.push({
      checkName: "INTENT_VERSION_BINDING",
      passed: isIntentVersionValid,
      details: isIntentVersionValid
        ? `Proposal bound to confirmed intent ${intent.intentId} at version ${intent.version}.`
        : `Intent version mismatch: proposal is for version ${proposal.intentVersion}, current confirmed intent is version ${intent.version}.`,
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
        providerResultSummary: "Simulation rejected: confirmed intent was modified after proposal generation.",
        revertReason: "INTENT_VERSION_STALE",
        verificationChecks,
        authorizedByHuman: false,
      };
    }

    // 3. RFQ Path Honesty: Unsubmitted RFQs cannot be simulated as live transactions
    if (isRfq) {
      verificationChecks.push({
        checkName: "RFQ_STATUS_CHECK",
        passed: false,
        details: "RFQ specification is unsubmitted. Cannot simulate unrevealed market maker quotation.",
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
        providerResultSummary: "Simulation unavailable: RFQ specification has not been broadcast or quoted by market makers.",
        revertReason: "RFQ_NOT_SUBMITTED_NO_LIVE_QUOTATION",
        verificationChecks,
        authorizedByHuman: false,
      };
    }

    // 4. Market Freshness Check (Derives strictly from real evidence timestamp)
    const marketEvidenceTimestampMs =
      candidate?.preview?.previewTimestampMs ||
      (candidate?.quotes[0]?.rawApiData as any)?.timestampMs ||
      (candidate?.quotes[0] as any)?.timestampMs ||
      0;

    let marketEvidenceStatus: MarketEvidenceStatus = "UNAVAILABLE";
    if (marketEvidenceTimestampMs > 0) {
      const ageMs = nowMs - marketEvidenceTimestampMs;
      marketEvidenceStatus = ageMs <= PRODUCT_MARKET_FRESHNESS_THRESHOLD_MS ? "FRESH" : "STALE";
    }

    verificationChecks.push({
      checkName: "MARKET_EVIDENCE_FRESHNESS",
      passed: marketEvidenceStatus === "FRESH",
      details:
        marketEvidenceStatus === "FRESH"
          ? `Market evidence is fresh (${Math.round((nowMs - marketEvidenceTimestampMs) / 1000)}s old <= ${PRODUCT_MARKET_FRESHNESS_THRESHOLD_MS / 1000}s threshold).`
          : marketEvidenceStatus === "STALE"
          ? `Market evidence is STALE (${Math.round((nowMs - marketEvidenceTimestampMs) / 1000)}s old > ${PRODUCT_MARKET_FRESHNESS_THRESHOLD_MS / 1000}s threshold). Refresh required.`
          : "Market evidence timestamp is unavailable.",
    });

    // 5. Exact Parameter Alignment Check
    const isChainMatch = proposal.chainId === 8453;
    const isProtocolMatch = proposal.protocol === "THETANUTS";
    const isAssetMatch = proposal.expectedAsset.toUpperCase() === intent.asset.value.toUpperCase();
    const isRightMatch = proposal.expectedOptionRight === "PUT";

    verificationChecks.push({
      checkName: "PROTOCOL_AND_ASSET_MATCH",
      passed: isChainMatch && isProtocolMatch && isAssetMatch && isRightMatch,
      details: `Base Mainnet (8453), Protocol ${proposal.protocol}, Underlying ${proposal.expectedAsset}, Right ${proposal.expectedOptionRight}.`,
    });

    // 6. Fresh Read-Only Simulation Invocation vs Deterministic Verification
    let simulatedPremium = proposal.expectedPremium;
    let simulatedFees = proposal.expectedFees;
    let simulatedTotalCost = proposal.expectedTotalCost;
    let simulatedFeeStatus = proposal.feeStatus;
    let simulationMethod: SimulationResult["simulationMethod"] = "DETERMINISTIC_VERIFICATION";
    let isProviderCallSuccessful = false;

    if (this.marketService && candidate?.quotes[0]) {
      try {
        const freshPreview = await this.marketService.previewFill(
          candidate.quotes[0],
          BigInt(proposal.expectedQuantity.amountBaseUnits)
        );

        if (freshPreview.previewStatus === "PREVIEW_AVAILABLE") {
          simulatedPremium = freshPreview.premiumAmount;
          simulatedFees = freshPreview.protocolFee
            ? {
                amountBaseUnits: (
                  BigInt(freshPreview.protocolFee.amountBaseUnits) +
                  BigInt(freshPreview.referrerFee?.amountBaseUnits || "0")
                ).toString(),
                decimals: 6,
                symbol: "USDC",
              }
            : undefined;
          simulatedTotalCost = freshPreview.totalExpectedCost;
          simulatedFeeStatus = freshPreview.feeStatus;
          simulationMethod = "THETANUTS_OPTIONBOOK_PREVIEW";
          isProviderCallSuccessful = true;
        }
      } catch {
        isProviderCallSuccessful = false;
      }
    }

    // 7. Cost Budget Constraint Check (Exact BigInt Base Units)
    const budgetBaseUnits = BigInt(intent.maxPremiumUSDC.value.amountBaseUnits);
    const totalCostBaseUnits = simulatedTotalCost ? BigInt(simulatedTotalCost.amountBaseUnits) : -1n;
    const isCostWithinBudget = totalCostBaseUnits >= 0n && totalCostBaseUnits <= budgetBaseUnits;

    verificationChecks.push({
      checkName: "BUDGET_COMPLIANCE",
      passed: isCostWithinBudget,
      details: isCostWithinBudget
        ? `Simulated total cost (${Number(totalCostBaseUnits) / 1e6} USDC) is within confirmed budget (${Number(budgetBaseUnits) / 1e6} USDC).`
        : `Cost violation: simulated cost (${totalCostBaseUnits >= 0n ? Number(totalCostBaseUnits) / 1e6 : "UNKNOWN"} USDC) exceeds budget (${Number(budgetBaseUnits) / 1e6} USDC).`,
    });

    // 8. Protection Target Re-evaluation (Truthful spot price required, no $2400 fake default)
    let isProtectionTargetMet = false;
    if (spotPriceUSD <= 0) {
      verificationChecks.push({
        checkName: "PROTECTION_TARGET_RECHECK",
        passed: false,
        details: "Live market spot price unavailable: protection payoff cannot be truthfully re-evaluated.",
      });
    } else if (!simulatedTotalCost) {
      verificationChecks.push({
        checkName: "PROTECTION_TARGET_RECHECK",
        passed: false,
        details: "Simulated total cost unavailable: protection payoff cannot be evaluated.",
      });
    } else {
      const exposureQuantityNum = Number(BigInt(intent.exposureAmount.value.amountBaseUnits)) / 10 ** intent.exposureAmount.value.decimals;
      const strikePriceNum = Number(BigInt(proposal.expectedStrike.amountBaseUnits)) / 10 ** proposal.expectedStrike.decimals;
      const totalCostUSDNum = Number(BigInt(simulatedTotalCost.amountBaseUnits)) / 1e6;

      const payoff = ExposurePayoffEngine.calculate({
        spotQuantity: exposureQuantityNum,
        optionQuantity: exposureQuantityNum,
        strikePriceUSD: strikePriceNum,
        spotReferencePriceUSD: spotPriceUSD,
        totalProtectionCostUSD: totalCostUSDNum,
        assetSymbol: intent.asset.value,
      });

      isProtectionTargetMet = payoff.effectiveDownsidePercent <= intent.targetMaxLossPercent.value;
      verificationChecks.push({
        checkName: "PROTECTION_TARGET_RECHECK",
        passed: isProtectionTargetMet,
        details: isProtectionTargetMet
          ? `Modeled downside (${payoff.effectiveDownsidePercent.toFixed(2)}%) satisfies target max loss (<= ${intent.targetMaxLossPercent.value}%).`
          : `Protection target violation: modeled downside (${payoff.effectiveDownsidePercent.toFixed(2)}%) exceeds allowed max loss (${intent.targetMaxLossPercent.value}%).`,
      });
    }

    const allPassed = verificationChecks.every((c) => c.passed);

    let status: SimulationResult["status"] = isProviderCallSuccessful
      ? "PROVIDER_SIMULATED"
      : "DETERMINISTIC_VERIFIED";

    if (marketEvidenceStatus === "STALE") {
      status = "STALE";
    } else if (marketEvidenceStatus === "UNAVAILABLE") {
      status = "NOT_AVAILABLE";
    } else if (spotPriceUSD <= 0) {
      status = "FAILED";
    } else if (!allPassed) {
      status = (!isCostWithinBudget || !isProtectionTargetMet) ? "SIMULATION_MISMATCH" : "FAILED";
    }

    return {
      simulationId: `sim-${Math.random().toString(36).substring(2, 9)}`,
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      intentId: intent.intentId,
      intentVersion: intent.version,
      strategyId: proposal.strategyId,
      status,
      simulationMethod,
      chainId: proposal.chainId,
      targetContract: proposal.targetContract,
      bindingStatus: "PREVIEW_BOUND", // Truthful PREVIEW_BOUND
      simulatedAtMs: nowMs,
      marketEvidenceTimestampMs,
      marketEvidenceStatus,
      expectedPremium: simulatedPremium,
      expectedFees: simulatedFees,
      expectedTotalCost: simulatedTotalCost,
      feeStatus: simulatedFeeStatus,
      expectedExpiryMs: proposal.expectedExpiryMs,
      expectedOptionQuantity: proposal.expectedQuantity,
      expectedUnderlying: proposal.expectedAsset,
      providerResultSummary: allPassed
        ? `Read-only ${simulationMethod === "THETANUTS_OPTIONBOOK_PREVIEW" ? "protocol preview simulation" : "deterministic verification"} passed: parameters verified.`
        : `Simulation check failed: ${verificationChecks.filter((c) => !c.passed).map((c) => c.details).join("; ")}`,
      verificationChecks,
      authorizedByHuman: false,
    };
  }
}
