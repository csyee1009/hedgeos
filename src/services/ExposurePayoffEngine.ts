import { AtExpiryPayoffSummary, ScenarioPayoffPoint } from "../types";

export interface ExposurePayoffInput {
  spotQuantity: number;
  optionQuantity: number;
  strikePriceUSD: number;
  spotReferencePriceUSD: number;
  totalProtectionCostUSD: number;
  assetSymbol: string;
}

export class ExposurePayoffEngine {
  /**
   * Evaluates at-expiry protective payoff economics for a delta-1 spot holding hedged by Long Put options.
   *
   * Payoff Formula:
   * PortfolioValue(S_T) = (S_T * Q_spot) + max(0, K - S_T) * Q_option - TotalCost
   *
   * Hedge-Ratio Invariant:
   * Constant floor is valid ONLY when Q_option == Q_spot.
   */
  public static calculate(input: ExposurePayoffInput): AtExpiryPayoffSummary {
    const {
      spotQuantity,
      optionQuantity,
      strikePriceUSD,
      spotReferencePriceUSD,
      totalProtectionCostUSD,
      assetSymbol,
    } = input;

    if (
      spotQuantity <= 0 ||
      optionQuantity <= 0 ||
      strikePriceUSD <= 0 ||
      spotReferencePriceUSD <= 0 ||
      totalProtectionCostUSD < 0
    ) {
      return {
        status: "NOT_AVAILABLE",
        spotExposureQuantity: `${spotQuantity} ${assetSymbol}`,
        spotReferencePriceUSD,
        spotExposureValueUSD: 0,
        strikePriceUSD,
        protectedFloorValueUSD: 0,
        effectiveDownsidePercent: 0,
        totalProtectionCostUSD,
        costImpactPercent: 0,
        isConstantFloorGuaranteed: false,
        scenarios: [],
        details: "Payoff calculation unavailable: missing or invalid numerical inputs",
        calculationTimestampMs: Date.now(),
      };
    }

    const spotExposureValueUSD = spotQuantity * spotReferencePriceUSD;
    const isHedge1to1 = Math.abs(spotQuantity - optionQuantity) < 1e-6;

    // Floor calculation
    let protectedFloorValueUSD: number;
    if (isHedge1to1) {
      // When Q_spot == Q_option, for any S_T <= K:
      // PortfolioValue(S_T) = S_T * Q + (K - S_T) * Q - Cost = K * Q - Cost (strictly constant)
      protectedFloorValueUSD = strikePriceUSD * spotQuantity - totalProtectionCostUSD;
    } else {
      // General floor when S_T = 0
      protectedFloorValueUSD = strikePriceUSD * optionQuantity - totalProtectionCostUSD;
    }

    const maxLossUSD = Math.max(0, spotExposureValueUSD - protectedFloorValueUSD);
    const effectiveDownsidePercent = spotExposureValueUSD > 0
      ? Number(((maxLossUSD / spotExposureValueUSD) * 100).toFixed(2))
      : 0;

    const costImpactPercent = spotExposureValueUSD > 0
      ? Number(((totalProtectionCostUSD / spotExposureValueUSD) * 100).toFixed(2))
      : 0;

    // At-Expiry Scenario Payoff Table
    const scenarioShifts = [
      { label: "+10% Spot Rally", factor: 1.10 },
      { label: "Unchanged (0%)", factor: 1.00 },
      { label: "-5% Market Dip", factor: 0.95 },
      { label: "-8% Target Loss", factor: 0.92 },
      { label: "-15% Correction", factor: 0.85 },
      { label: "-30% Severe Crash", factor: 0.70 },
      { label: "-50% Extreme Crash", factor: 0.50 },
    ];

    const scenarios: ScenarioPayoffPoint[] = scenarioShifts.map((shift) => {
      const spotScenario = Number((spotReferencePriceUSD * shift.factor).toFixed(2));
      const spotValue = spotScenario * spotQuantity;
      const optionIntrinsic = Math.max(0, strikePriceUSD - spotScenario) * optionQuantity;
      const portfolioValue = Number((spotValue + optionIntrinsic - totalProtectionCostUSD).toFixed(2));
      const pnlUSD = Number((portfolioValue - spotExposureValueUSD).toFixed(2));
      const pnlPercent = Number(((pnlUSD / spotExposureValueUSD) * 100).toFixed(2));

      return {
        spotPriceScenarioUSD: spotScenario,
        scenarioLabel: shift.label,
        portfolioValueUSD: portfolioValue,
        pnlUSD,
        pnlPercent,
      };
    });

    const hedgeRatioText = isHedge1to1
      ? "1:1 delta hedge ratio verified"
      : `Partial hedge ratio (${(optionQuantity / spotQuantity).toFixed(2)}x)`;

    const details = `AT-EXPIRY ANALYSIS: Modeled at-expiry protected floor under the stated assumptions ($${protectedFloorValueUSD.toFixed(2)} USD, max loss ${effectiveDownsidePercent}%) with ${hedgeRatioText}. Protection cost: $${totalProtectionCostUSD.toFixed(2)} USDC (${costImpactPercent}% of exposure value).`;

    return {
      status: "CALCULATED",
      spotExposureQuantity: `${spotQuantity} ${assetSymbol}`,
      spotReferencePriceUSD,
      spotExposureValueUSD,
      strikePriceUSD,
      protectedFloorValueUSD,
      effectiveDownsidePercent,
      totalProtectionCostUSD,
      costImpactPercent,
      isConstantFloorGuaranteed: isHedge1to1,
      scenarios,
      details,
      calculationTimestampMs: Date.now(),
    };
  }
}
