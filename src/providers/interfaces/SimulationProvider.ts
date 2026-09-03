import { CandidateStrategy, SimulationResult, TypedRiskIntent } from "../../types";

export interface SimulationProvider {
  generatePreview(
    intent: TypedRiskIntent,
    candidate: CandidateStrategy
  ): Promise<SimulationResult>;
}
