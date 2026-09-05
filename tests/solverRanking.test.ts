import { describe, expect, it } from "vitest";
import { FinancialConstitutionEngine } from "../src/services/FinancialConstitutionEngine";
import { ProtectionSolverEngine } from "../src/services/ProtectionSolverEngine";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { MarketQuote, TypedRiskIntent } from "../src/types";

describe("Solver Deterministic Ranking & Rationale Tests", () => {
  const policyEngine = new FinancialConstitutionEngine();
  const marketService = new ThetanutsMarketService();
  marketService.getSpotPrice = async () => 2400;
  const solver = new ProtectionSolverEngine(marketService, policyEngine);

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-ranking-test",
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
    targetMaxLossPercent: { value: 10, source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
    maxPremiumUSDC: {
      value: { amountBaseUnits: "40000000", decimals: 6, symbol: "USDC" }, // 40 USDC budget
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

  const quotes: MarketQuote[] = [
    {
      quoteId: "quote-strike-2260", // ~7.5% downside (closest to 8%)
      sourceType: "OPTION_BOOK",
      protocol: "THETANUTS",
      asset: "ETH",
      optionRight: "PUT",
      strikePrice: { amountBaseUnits: "226000000000", decimals: 8, symbol: "USD" },
      expiryTimestampMs: Date.now() + 7 * 24 * 3600 * 1000,
      premium: { amountBaseUnits: "9100000", decimals: 6, symbol: "USDC" },
      availableQuantity: { amountBaseUnits: "10000000000", decimals: 6, symbol: "USDC" },
      executableNow: true,
      allStrikes: [{ amountBaseUnits: "226000000000", decimals: 8, symbol: "USD" }],
      implementationAddress: "0x7355EB92dfb0503DB558a70c10843618932ab290", implementationName: "PUT", makerIsSeller: true,
      orderValidityDeadlineMs: Date.now() + 3600_000,
      eligibilityEvidence: { status: "ELIGIBLE_LONG_PUT", checkedAtMs: Date.now(), checks: [] },
    },
    {
      quoteId: "quote-strike-2350", // ~3.8% downside
      sourceType: "OPTION_BOOK",
      protocol: "THETANUTS",
      asset: "ETH",
      optionRight: "PUT",
      strikePrice: { amountBaseUnits: "235000000000", decimals: 8, symbol: "USD" },
      expiryTimestampMs: Date.now() + 7 * 24 * 3600 * 1000,
      premium: { amountBaseUnits: "14000000", decimals: 6, symbol: "USDC" },
      availableQuantity: { amountBaseUnits: "10000000000", decimals: 6, symbol: "USDC" },
      executableNow: true,
      allStrikes: [{ amountBaseUnits: "235000000000", decimals: 8, symbol: "USD" }],
      implementationAddress: "0x7355EB92dfb0503DB558a70c10843618932ab290", implementationName: "PUT", makerIsSeller: true,
      orderValidityDeadlineMs: Date.now() + 3600_000,
      eligibilityEvidence: { status: "ELIGIBLE_LONG_PUT", checkedAtMs: Date.now(), checks: [] },
    },
  ];

  it("should deterministically rank candidate closest to target downside objective at Rank #1", async () => {
    const result = await solver.evaluateCandidates(mockIntent, quotes);
    if (result.rankedStrategies.length < 2) {
      console.log("REJECTED:", JSON.stringify(result.rejectedCandidates.map((r) => ({ id: r.strategyId, status: r.status, reasons: r.rejectionReasons })), null, 2));
    }
    expect(result.rankedStrategies.length).toBe(2);
    expect(result.rankedStrategies[0].rank).toBe(1);
    expect(result.rankedStrategies[0].strategyId).toContain("quote-strike-2260");
    expect(result.rankedStrategies[0].rankExplanation).toContain("Rank #1");
    expect(result.rankedStrategies[0].rankExplanation).toContain("USDC");
  });

  it("should store actual observed metrics rather than arbitrary confidence scores", async () => {
    const result = await solver.evaluateCandidates(mockIntent, quotes);
    const top = result.rankedStrategies[0];

    expect(top.metrics).toBeDefined();
    expect(top.metrics?.effectiveDownsidePercent).toBeGreaterThan(0);
    expect(top.metrics?.totalProtectionCostUSD).toBeGreaterThan(0);
    expect(top.metrics?.modeledProtectedFloorUSD).toBeGreaterThan(0);
  });
});
