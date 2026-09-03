import { describe, expect, it } from "vitest";
import { ExposurePayoffEngine } from "../src/services/ExposurePayoffEngine";

describe("ExposurePayoffEngine Math & Scenarios Tests", () => {
  it("should calculate exact protected floor and downside percentage for 2 ETH holding", () => {
    // 2 ETH @ $2,438.66 spot ($4,877.32 total value)
    // Long Put strike: $2,260.00
    // Total protection cost: $9.11 USDC
    const payoff = ExposurePayoffEngine.calculate({
      spotQuantity: 2.0,
      optionQuantity: 2.0,
      strikePriceUSD: 2260.0,
      spotReferencePriceUSD: 2438.66,
      totalProtectionCostUSD: 9.11,
      assetSymbol: "ETH",
    });

    expect(payoff.status).toBe("CALCULATED");
    expect(payoff.spotExposureValueUSD).toBe(4877.32);

    // Floor = 2 * 2260 - 9.11 = $4,510.89 USD
    expect(payoff.protectedFloorValueUSD).toBe(4510.89);

    // Max Loss = 4877.32 - 4510.89 = 366.43 USD
    // Effective Downside % = (366.43 / 4877.32) * 100 = 7.51%
    expect(payoff.effectiveDownsidePercent).toBe(7.51);

    // Cost Impact % = (9.11 / 4877.32) * 100 = 0.19%
    expect(payoff.costImpactPercent).toBe(0.19);

    expect(payoff.details).toContain("AT-EXPIRY ANALYSIS");
  });

  it("should generate 7 scenario payoff points across spot rally, unchanged, and severe crash", () => {
    const payoff = ExposurePayoffEngine.calculate({
      spotQuantity: 2.0,
      optionQuantity: 2.0,
      strikePriceUSD: 2260.0,
      spotReferencePriceUSD: 2438.66,
      totalProtectionCostUSD: 9.11,
      assetSymbol: "ETH",
    });

    expect(payoff.scenarios.length).toBe(7);

    // Scenario 1: +10% rally (spot = $2682.53) -> Put expires worthless, portfolio = 2 * 2682.53 - 9.11 = $5355.94
    const rally = payoff.scenarios.find((s) => s.scenarioLabel.includes("+10%"));
    expect(rally?.pnlUSD).toBeGreaterThan(0);

    // Scenario 6: -30% severe crash (spot = $1707.06) -> Put intrinsic = 2260 - 1707.06 = 552.94, payoff = floor = $4510.89
    const crash30 = payoff.scenarios.find((s) => s.scenarioLabel.includes("-30%"));
    expect(crash30?.portfolioValueUSD).toBe(4510.89);

    // Scenario 7: -50% extreme crash (spot = $1219.33) -> Put intrinsic offsets loss, portfolio = floor = $4510.89
    const crash50 = payoff.scenarios.find((s) => s.scenarioLabel.includes("-50%"));
    expect(crash50?.portfolioValueUSD).toBe(4510.89);
  });
});
