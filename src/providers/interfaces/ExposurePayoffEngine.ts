import { OptionLeg, TokenAmount } from "../../types";

export interface ExposurePayoffInput {
  exposureAsset: string;
  exposureQuantity: TokenAmount;
  referencePrice?: TokenAmount;
  legs: OptionLeg[];
  premiumUSDC: TokenAmount;
}

export interface ExposurePayoffOutput {
  status: "INTERFACE_ONLY" | "CALCULATED";
  payoffProfile?: Record<string, unknown>;
  scenarioOutcomes?: Record<string, unknown>;
  protectionCharacteristics?: Record<string, unknown>;
  uncoveredExposureBaseUnits?: string;
  targetFitMetrics?: Record<string, unknown>;
  details: string;
}

export interface ExposurePayoffEngine {
  calculatePayoff(input: ExposurePayoffInput): Promise<ExposurePayoffOutput>;
}
