import { describe, expect, it } from "vitest";
import { ProtectionSolverEngine } from "../src/services/ProtectionSolverEngine";
import { MarketQuote, TypedRiskIntent } from "../src/types";

describe("PUT SPREAD Atomic Policy Tests", () => {
  const solver = new ProtectionSolverEngine();

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-put-spread-test",
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

  const vanillaQuotes: MarketQuote[] = [
    {
      quoteId: "vanilla-put-long",
      sourceType: "OPTION_BOOK",
      protocol: "THETANUTS",
      asset: "ETH",
      optionRight: "PUT",
      strikePrice: { amountBaseUnits: "230000000000", decimals: 8, symbol: "USD" },
      expiryTimestampMs: Date.now() + 7 * 24 * 3600 * 1000,
      premium: { amountBaseUnits: "8000000", decimals: 6, symbol: "USDC" },
      availableQuantity: { amountBaseUnits: "10000000000", decimals: 6, symbol: "USDC" },
      executableNow: true,
    },
    {
      quoteId: "vanilla-put-short",
      sourceType: "OPTION_BOOK",
      protocol: "THETANUTS",
      asset: "ETH",
      optionRight: "PUT",
      strikePrice: { amountBaseUnits: "210000000000", decimals: 8, symbol: "USD" },
      expiryTimestampMs: Date.now() + 7 * 24 * 3600 * 1000,
      premium: { amountBaseUnits: "3000000", decimals: 6, symbol: "USDC" },
      availableQuantity: { amountBaseUnits: "10000000000", decimals: 6, symbol: "USDC" },
      executableNow: true,
    },
  ];

  it("should NOT synthesize a fake PUT_SPREAD by stitching two separate vanilla orders together", async () => {
    const result = await solver.evaluateCandidates(mockIntent, vanillaQuotes);

    // Each vanilla quote generates its own LONG_PUT strategy
    expect(result.rankedStrategies.every((c) => c.strategyType === "LONG_PUT")).toBe(true);

    // No synthetic PUT_SPREAD created from unrelated single legs
    const spread = result.rankedStrategies.find((c) => c.strategyType === "PUT_SPREAD");
    expect(spread).toBeUndefined();
  });
});
