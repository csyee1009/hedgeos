import { CandidateStrategy, RFQReasonCode, RFQRequirementStatus, TypedRiskIntent } from "../types";

export interface RFQRequirementAnalysisResult {
  status: RFQRequirementStatus;
  reasons: RFQReasonCode[];
  explanation: string;
}

export class RFQRequirementEngine {
  /**
   * Deterministically evaluates whether a confirmed risk intent requires RFQ fallback.
   * RFQ is triggered ONLY when existing OptionBook liquidity cannot satisfy the user's objective.
   */
  public static evaluateRequirement(
    intent: TypedRiskIntent,
    optionBookRanked: CandidateStrategy[],
    optionBookRejected: CandidateStrategy[]
  ): RFQRequirementAnalysisResult {
    // 1. If eligible OptionBook candidates exist, RFQ is NOT required
    if (optionBookRanked && optionBookRanked.length > 0) {
      const hasFeasible = optionBookRanked.some(
        (c) => c.status === "TECHNICALLY_FEASIBLE" && c.liquiditySufficient !== false
      );
      if (hasFeasible) {
        return {
          status: "NOT_REQUIRED",
          reasons: [],
          explanation: "Eligible OptionBook liquidity is available to fulfill protection objective directly.",
        };
      }
    }

    // 2. Identify deterministic reason codes for RFQ fallback
    const reasons: RFQReasonCode[] = [];

    if (!optionBookRejected || optionBookRejected.length === 0) {
      reasons.push("NO_QUALIFYING_OPTIONBOOK_ORDERS");
    } else {
      for (const rej of optionBookRejected) {
        if (rej.status === "EXPIRY_MISMATCH" && !reasons.includes("NO_MATCHING_EXPIRY")) {
          reasons.push("NO_MATCHING_EXPIRY");
        }
        if (rej.status === "LIQUIDITY_INSUFFICIENT" && !reasons.includes("INSUFFICIENT_LIQUIDITY")) {
          reasons.push("INSUFFICIENT_LIQUIDITY");
        }
        if (rej.status === "BUDGET_REJECTED" && !reasons.includes("BUDGET_NOT_SATISFIED")) {
          reasons.push("BUDGET_NOT_SATISFIED");
        }
        if (rej.status === "PROTECTION_TARGET_NOT_MET" && !reasons.includes("PROTECTION_TARGET_NOT_SATISFIED")) {
          reasons.push("PROTECTION_TARGET_NOT_SATISFIED");
        }
        if (rej.strategyType === "PUT_SPREAD" && rej.status === "TECHNICALLY_REJECTED" && !reasons.includes("ATOMIC_STRUCTURE_NOT_AVAILABLE")) {
          reasons.push("ATOMIC_STRUCTURE_NOT_AVAILABLE");
        }
      }
    }

    if (reasons.length === 0) {
      reasons.push("NO_QUALIFYING_OPTIONBOOK_ORDERS");
    }

    const explanation = `OptionBook cannot fulfill protection intent due to: ${reasons.join(", ")}. Custom quote (RFQ) specification generated.`;

    return {
      status: "REQUIRED",
      reasons,
      explanation,
    };
  }
}
