import { describe, expect, it } from "vitest";
import { MOCK_OPTION_BOOK_QUOTES } from "../src/fixtures/mockQuotes";
import { ExposurePayoffEngine } from "../src/services/ExposurePayoffEngine";
import { ProtectionSolverEngine } from "../src/services/ProtectionSolverEngine";
import { TypedRiskIntent } from "../src/types";

describe("ExposurePayoffEngine & Ranking Scores Status Tests", () => {
  const solver = new ProtectionSolverEngine();

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-test-payoff",
    version: 1,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    confirmedByUser: true,
    objective: { value: "DOWNSIDE_PROTECTION", source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
    asset: { value: "ETH", source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
    exposureAmount: {
      value: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" },
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
    targetMaxLossPercent: { value: 8, source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
    maxPremiumUSDC: {
      value: { amountBaseUnits: "3000000", decimals: 6, symbol: "USDC" },
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
    horizonTimestamp: {
      value: { timestampMs: Date.now() + 7 * 24 * 3600 * 1000, isoString: "2026-09-04T15:59:59.999Z", formattedDisplay: "Friday, 4 September 2026, 11:59 PM MYT", timezone: "Asia/Kuala_Lumpur (MYT, UTC+8)" },
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
    allowedProtocols: { value: ["THETANUTS"], source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
    allowMultiLeg: { value: true, source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
  };

  const unsizedIntent: TypedRiskIntent = {
    ...mockIntent,
    asset: { value: "UNRESOLVED_TOKEN", source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
  };

  it("should report payoffSummary status as INTERFACE_ONLY when sizing is unverified", async () => {
    const unsizedQuotes = [{ ...MOCK_OPTION_BOOK_QUOTES[0], asset: "UNRESOLVED_TOKEN" }];
    const result = await solver.evaluateCandidates(unsizedIntent, unsizedQuotes);
    const strat = result.rankedStrategies[0];

    expect(strat.payoffSummary).toBeDefined();
    expect(strat.payoffSummary?.status).toBe("INTERFACE_ONLY");
    expect((strat.payoffSummary as any).maxLossPercent).toBeUndefined();
    expect(strat.scoresStatus).toBe("NOT_AVAILABLE");
    expect(strat.scores).toBeUndefined();
  });

  it("should report payoffSummary status as CALCULATED with at-expiry scenarios when inputs are verified", () => {
    const payoff = ExposurePayoffEngine.calculate({
      spotQuantity: 2.0,
      optionQuantity: 2.0,
      strikePriceUSD: 2260.0,
      spotReferencePriceUSD: 2438.66,
      totalProtectionCostUSD: 9.10,
      assetSymbol: "ETH",
    });

    expect(payoff.status).toBe("CALCULATED");
    expect(payoff.protectedFloorValueUSD).toBe(4510.9); // 2 * 2260 - 9.10 = 4510.90
    expect(payoff.effectiveDownsidePercent).toBeGreaterThan(7.0);
    expect(payoff.effectiveDownsidePercent).toBeLessThan(9.0);
    expect(payoff.scenarios.length).toBe(7);
    expect(payoff.details).toContain("AT-EXPIRY ANALYSIS");
  });
});
