import {
  ActionProposal,
  HumanReviewRecord,
  HumanReviewSummary,
  SimulationResult,
  TypedRiskIntent,
} from "../types";

export class HumanReviewService {
  /**
   * Generates a HumanReviewRecord establishing the strict human authorization boundary.
   * STRICT INVARIANTS:
   * 1. Execution status remains NOT_AUTHORIZED (never switches to AUTHORIZED or EXECUTABLE).
   * 2. Zero default/fake effectiveDownsidePercent (must be genuinely calculated).
   * 3. Requires exact proposal ID, digest, and intent version binding match between proposal and simulation.
   * 4. Requires FRESH market evidence and successful simulation checks for READY_FOR_REVIEW.
   */
  public static createReviewRecord(
    intent: TypedRiskIntent,
    proposal: ActionProposal,
    simulation: SimulationResult,
    effectiveDownsidePercent?: number
  ): HumanReviewRecord {
    const nowMs = Date.now();
    const warnings: string[] = [];

    // Binding check between simulation and proposal
    const isDigestBound = simulation.proposalDigest === proposal.proposalDigest;
    const isProposalBound = simulation.proposalId === proposal.proposalId;
    const isIntentBound = simulation.intentId === intent.intentId && simulation.intentVersion === intent.version;

    if (!isDigestBound) warnings.push("Simulation proposal digest does not match current proposal digest.");
    if (!isProposalBound) warnings.push("Simulation proposal ID does not match current proposal ID.");
    if (!isIntentBound) warnings.push("Simulation intent version does not match confirmed intent version.");

    // Status check
    const isSimStatusOk =
      simulation.status === "PROVIDER_SIMULATED" ||
      simulation.status === "DETERMINISTIC_VERIFIED" ||
      simulation.status === "PREVIEW_ONLY";

    if (!isSimStatusOk) {
      warnings.push(`Simulation status is ${simulation.status}. Proposal is not ready for human review.`);
    }

    if (simulation.marketEvidenceStatus !== "FRESH") {
      warnings.push(`Market evidence is ${simulation.marketEvidenceStatus}. Fresh market evidence is required before review.`);
    }

    const allChecksPassed = simulation.verificationChecks.length > 0 && simulation.verificationChecks.every((c) => c.passed);
    if (!allChecksPassed) {
      warnings.push("One or more simulation verification checks failed.");
    }

    const isDownsideValid =
      effectiveDownsidePercent !== undefined &&
      effectiveDownsidePercent >= 0 &&
      effectiveDownsidePercent <= intent.targetMaxLossPercent.value;

    if (effectiveDownsidePercent === undefined) {
      warnings.push("Modeled downside percentage is not available.");
    } else if (effectiveDownsidePercent > intent.targetMaxLossPercent.value) {
      warnings.push(`Modeled downside (${effectiveDownsidePercent.toFixed(2)}%) exceeds confirmed target max loss (${intent.targetMaxLossPercent.value}%).`);
    }

    const isEligibleForReview =
      isDigestBound &&
      isProposalBound &&
      isIntentBound &&
      isSimStatusOk &&
      simulation.marketEvidenceStatus === "FRESH" &&
      allChecksPassed &&
      isDownsideValid;

    const exposureAmountStr = `${Number(BigInt(intent.exposureAmount.value.amountBaseUnits)) / 10 ** intent.exposureAmount.value.decimals} ${intent.asset.value}`;
    const strikePriceStr = `$${(Number(BigInt(proposal.expectedStrike.amountBaseUnits)) / 10 ** proposal.expectedStrike.decimals).toFixed(2)} USD`;
    const costStr = proposal.expectedTotalCost
      ? `${(Number(BigInt(proposal.expectedTotalCost.amountBaseUnits)) / 10 ** proposal.expectedTotalCost.decimals).toFixed(2)} USDC`
      : "UNPRICED (Sealed RFQ)";

    const summary: HumanReviewSummary = {
      protectingAsset: intent.asset.value,
      exposureQuantity: exposureAmountStr,
      untilDate: intent.horizonTimestamp.value.formattedDisplay,
      structure: proposal.actionType === "OPTIONBOOK_FILL_ORDER" ? "Long Put (OptionBook)" : "Long Put (RFQ)",
      strikePriceUSD: strikePriceStr,
      estimatedCostUSDC: costStr,
      modeledDownsidePercent: effectiveDownsidePercent !== undefined ? `${effectiveDownsidePercent.toFixed(2)}%` : "NOT_AVAILABLE",
      liveMarketCheck: simulation.marketEvidenceStatus === "FRESH" ? "Passed (Fresh)" : simulation.marketEvidenceStatus,
      simulationStatus: isSimStatusOk ? "Passed (Verified)" : `Failed (${simulation.status})`,
      authorizationRequirement: "Requires separate eligible human authorization. No transaction submitted.",
    };

    const reviewStatus: HumanReviewRecord["reviewStatus"] = isEligibleForReview
      ? "READY_FOR_REVIEW"
      : "NOT_PRESENTED";

    return {
      reviewId: `rev-${Math.random().toString(36).substring(2, 9)}`,
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      intentId: intent.intentId,
      intentVersion: intent.version,
      simulationId: simulation.simulationId,
      presentedAtMs: nowMs,
      reviewStatus,
      executionStatus: "NOT_AUTHORIZED", // Strictly immutable boundary
      warnings,
      summary,
      toctouDisclosure:
        "Time-of-check / time-of-use (TOCTOU) limitation: simulation proves this proposal was valid at simulation time and does not eliminate market movement risk prior to separate authorized execution.",
    };
  }
}
