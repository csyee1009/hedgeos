import { SimulationProvider } from "../providers/interfaces/SimulationProvider";
import { CandidateStrategy, MarketEvidenceStatus, SimulationResult, TypedRiskIntent } from "../types";
import { ActionProposalBuilder } from "./ActionProposalBuilder";
import { PRODUCT_MARKET_FRESHNESS_THRESHOLD_MS } from "./ThetanutsSimulationService";

export class SimulationService implements SimulationProvider {
  public async generatePreview(
    intent: TypedRiskIntent,
    candidate: CandidateStrategy
  ): Promise<SimulationResult> {
    const quote = candidate.quotes[0];
    const proposal = ActionProposalBuilder.buildOptionBookProposal(intent, candidate);
    const nowMs = Date.now();

    const previewTimestamp = candidate.preview?.previewTimestampMs || 0;
    let marketEvidenceStatus: MarketEvidenceStatus = "UNAVAILABLE";

    if (previewTimestamp > 0) {
      const ageMs = nowMs - previewTimestamp;
      marketEvidenceStatus = ageMs <= PRODUCT_MARKET_FRESHNESS_THRESHOLD_MS ? "FRESH" : "STALE";
    }

    const hasValidPreview = candidate.preview?.previewStatus === "PREVIEW_AVAILABLE";

    return {
      simulationId: `sim-${Math.random().toString(36).substring(2, 9)}`,
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      intentId: intent.intentId,
      intentVersion: intent.version,
      strategyId: candidate.strategyId,
      status: hasValidPreview ? "PREVIEW_ONLY" : "NOT_AVAILABLE",
      simulationMethod: "THETANUTS_OPTIONBOOK_PREVIEW",
      chainId: 8453,
      targetContract: proposal.targetContract,
      bindingStatus: "PREVIEW_BOUND",
      simulatedAtMs: nowMs,
      marketEvidenceTimestampMs: previewTimestamp,
      marketEvidenceStatus,
      expectedPremium: proposal.expectedPremium,
      expectedFees: proposal.expectedFees,
      expectedTotalCost: proposal.expectedTotalCost,
      feeStatus: proposal.feeStatus,
      expectedExpiryMs: proposal.expectedExpiryMs,
      expectedOptionQuantity: proposal.expectedQuantity,
      expectedUnderlying: proposal.expectedAsset,
      providerResultSummary: hasValidPreview
        ? "Preview generated: read-only preview bounded by confirmed intent."
        : "Preview unavailable: candidate contains no valid preview evidence.",
      verificationChecks: [
        {
          checkName: "INTENT_VERSION_BINDING",
          passed: true,
          details: `Bound to intent ${intent.intentId} v${intent.version}`,
        },
        {
          checkName: "PREVIEW_BOUND",
          passed: hasValidPreview,
          details: hasValidPreview ? `Preview bound to quote ${quote.quoteId}` : "Quote preview unavailable",
        },
      ],
      authorizedByHuman: false,
    };
  }
}
