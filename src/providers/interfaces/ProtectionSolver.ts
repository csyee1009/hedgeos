import { CandidateStrategy, MarketQuote, TypedRiskIntent } from "../../types";

export interface SolverEvaluationResult {
  rankedStrategies: CandidateStrategy[];
  rejectedCandidates: CandidateStrategy[];
}

export interface ProtectionSolver {
  evaluateCandidates(
    intent: TypedRiskIntent,
    quotes: MarketQuote[]
  ): Promise<SolverEvaluationResult>;
}
