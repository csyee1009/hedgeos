import { describe, expect, it } from "vitest";
import { MOCK_OPTION_BOOK_QUOTES } from "../src/fixtures/mockQuotes";
import { FinancialConstitutionEngine } from "../src/services/FinancialConstitutionEngine";
import { ProtectionSolverEngine } from "../src/services/ProtectionSolverEngine";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { TypedRiskIntent } from "../src/types";

describe("ProtectionSolverEngine Technical Feasibility Tests", () => {
  const policyEngine = new FinancialConstitutionEngine();
  const marketService = new ThetanutsMarketService();
  marketService.getSpotPrice = async () => 2400;
  const solver = new ProtectionSolverEngine(marketService, policyEngine);

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-test-solver-tech",
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
      value: { timestampMs: MOCK_OPTION_BOOK_QUOTES[0].expiryTimestampMs, isoString: "2026-09-04T15:59:59.999Z", formattedDisplay: "Friday, 4 September 2026, 11:59 PM MYT", timezone: "Asia/Kuala_Lumpur (MYT, UTC+8)" },
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
    allowedProtocols: { value: ["THETANUTS"], source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
    allowMultiLeg: { value: true, source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
  };

  const unsizedIntent: TypedRiskIntent = {
    ...mockIntent,
    asset: { value: "UNSUPPORTED_MEME", source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
  };

  it("should evaluate technical feasibility of valid quotes and assign SIZING_UNRESOLVED with unassigned rank when sizing adapter is unverified", async () => {
    const unsizedQuotes = MOCK_OPTION_BOOK_QUOTES.map((q) => ({ ...q, asset: "UNSUPPORTED_MEME" }));
    const result = await solver.evaluateCandidates(unsizedIntent, unsizedQuotes);

    expect(result.rankedStrategies.length).toBe(2);
    expect(result.rankedStrategies[0].status).toBe("SIZING_UNRESOLVED");
    expect(result.rankedStrategies[0].rank).toBeUndefined();
    expect(result.rankedStrategies[0].scoresStatus).toBe("NOT_AVAILABLE");
  });

  it("should evaluate technical feasibility of verified quotes, set status to TECHNICALLY_FEASIBLE, and assign deterministic rank", async () => {
    const quotes = MOCK_OPTION_BOOK_QUOTES;
    const result = await solver.evaluateCandidates(mockIntent, quotes);

    expect(result.rankedStrategies.length).toBe(2);
    expect(result.rankedStrategies[0].status).toBe("TECHNICALLY_FEASIBLE");
    expect(result.rankedStrategies[0].rank).toBe(1);
    expect(result.rankedStrategies[0].metrics).toBeDefined();
  });

  it("should reject quotes with zero available orderbook liquidity", async () => {
    const zeroLiquidityQuote = {
      ...MOCK_OPTION_BOOK_QUOTES[0],
      quoteId: "zero-liq-quote",
      availableQuantity: { amountBaseUnits: "0", decimals: 6, symbol: "CONTRACTS" },
    };

    const result = await solver.evaluateCandidates(mockIntent, [zeroLiquidityQuote]);

    expect(result.rankedStrategies.length).toBe(0);
    expect(result.rejectedCandidates.length).toBe(1);
    expect(result.rejectedCandidates[0].status).toBe("TECHNICALLY_REJECTED");
    expect(result.rejectedCandidates[0].rejectionReasons[0]).toContain("zero available quantity");
  });
});
