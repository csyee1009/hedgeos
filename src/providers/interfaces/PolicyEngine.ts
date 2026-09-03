import { CandidateStrategy, PolicyDecisionRecord, TypedRiskIntent } from "../../types";

export interface PolicyEngine {
  evaluatePolicy(
    intent: TypedRiskIntent,
    candidate: CandidateStrategy
  ): Promise<PolicyDecisionRecord>;
}
