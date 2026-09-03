import { describe, expect, it } from "vitest";
import { MOCK_OPTION_BOOK_QUOTES } from "../src/fixtures/mockQuotes";
import { ProtectionSolverEngine } from "../src/services/ProtectionSolverEngine";
import { formatTokenAmount, StrategyType, TokenAmount, TypedRiskIntent } from "../src/types";

describe("Phase 0 Final Micro-Repair & Domain Model Tests", () => {
  const solver = new ProtectionSolverEngine();

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-test-domain-001",
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
      value: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" },
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
    asset: { value: "UNSUPPORTED_TOKEN", source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
  };

  it("Test 1: Phase 0 does not generate PUT_SPREAD from generic quotes", async () => {
    const result = await solver.evaluateCandidates(mockIntent, MOCK_OPTION_BOOK_QUOTES);
    const spreadCandidate = result.rankedStrategies.find((c) => c.strategyType === "PUT_SPREAD");

    expect(spreadCandidate).toBeUndefined();
    expect(result.rankedStrategies.every((c) => c.strategyType === "LONG_PUT")).toBe(true);
  });

  it("Test 2: PUT_SPREAD remains represented in the domain model for later use", () => {
    const validStrategyType: StrategyType = "PUT_SPREAD";
    expect(validStrategyType).toBe("PUT_SPREAD");
  });

  it("Test 3: Unsized LONG_PUT candidate is SIZING_UNRESOLVED rather than TECHNICALLY_FEASIBLE", async () => {
    const unsizedQuotes = MOCK_OPTION_BOOK_QUOTES.map((q) => ({ ...q, asset: "UNSUPPORTED_TOKEN" }));
    const result = await solver.evaluateCandidates(unsizedIntent, unsizedQuotes);
    const strat = result.rankedStrategies[0];

    expect(strat.status).toBe("SIZING_UNRESOLVED");
    expect(strat.status).not.toBe("TECHNICALLY_FEASIBLE");
    expect(strat.sizingStatus).toBe("NOT_RESOLVED");
    expect(strat.legs[0].sizingStatus).toBe("NOT_RESOLVED");
  });

  it("Token amount formatting uses BigInt scaling only", () => {
    const tokenAmount: TokenAmount = {
      amountBaseUnits: "2500000000",
      decimals: 9,
      symbol: "TEST",
    };
    const formatted = formatTokenAmount(tokenAmount);
    expect(formatted).toBe("2.5 TEST");
  });
});
