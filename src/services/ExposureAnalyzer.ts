import { TypedRiskIntent } from "../types";

export interface ExposureAnalysisResult {
  assetSymbol: string;
  spotExposureQuantity: number;
  spotExposureQuantityDisplay: string;
  spotReferencePriceUSD: number;
  spotExposureValueUSD: number;
  targetMaxLossPercent: number;
  targetFloorPercent: number;
  targetFloorStrikeUSD: number;
  targetFloorValueUSD: number;
  maxBudgetUSDC: number;
  horizonTimestampMs: number;
  horizonDisplay: string;
}

export class ExposureAnalyzer {
  public static analyze(intent: TypedRiskIntent, spotPriceUSD: number): ExposureAnalysisResult {
    const assetSymbol = intent.asset.value.toUpperCase();
    const exposureAmount = intent.exposureAmount.value;
    const baseUnitsBigInt = BigInt(exposureAmount.amountBaseUnits);
    const divisor = 10 ** exposureAmount.decimals;
    const spotExposureQuantity = Number(baseUnitsBigInt) / divisor;

    const spotExposureValueUSD = spotExposureQuantity * spotPriceUSD;
    const targetMaxLossPercent = intent.targetMaxLossPercent.value;
    const targetFloorPercent = 100 - targetMaxLossPercent;

    const targetFloorStrikeUSD = spotPriceUSD * (1 - targetMaxLossPercent / 100);
    const targetFloorValueUSD = spotExposureValueUSD * (1 - targetMaxLossPercent / 100);

    const budgetBigInt = BigInt(intent.maxPremiumUSDC.value.amountBaseUnits);
    const budgetDivisor = 10 ** intent.maxPremiumUSDC.value.decimals;
    const maxBudgetUSDC = Number(budgetBigInt) / budgetDivisor;

    return {
      assetSymbol,
      spotExposureQuantity,
      spotExposureQuantityDisplay: `${spotExposureQuantity} ${assetSymbol}`,
      spotReferencePriceUSD: spotPriceUSD,
      spotExposureValueUSD,
      targetMaxLossPercent,
      targetFloorPercent,
      targetFloorStrikeUSD,
      targetFloorValueUSD,
      maxBudgetUSDC,
      horizonTimestampMs: intent.horizonTimestamp.value.timestampMs,
      horizonDisplay: intent.horizonTimestamp.value.formattedDisplay,
    };
  }
}
