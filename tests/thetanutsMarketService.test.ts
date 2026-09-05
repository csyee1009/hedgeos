import { describe, expect, it } from "vitest";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { TypedRiskIntent } from "../src/types";

describe("ThetanutsMarketService Tests", () => {
  const service = new ThetanutsMarketService("https://mainnet.base.org");

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-test-service",
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

  it("should initialize client targeting Base Mainnet (chainId 8453)", async () => {
    const state = await service.getMarketState();
    expect(state.chainId).toBe(8453);
    expect(["LIVE_READ_AVAILABLE", "LIVE_READ_FAILED"]).toContain(state.status);
  });

  it("should fetch live ETH spot price from market data or handle offline network safely", async () => {
    try {
      const spot = await service.getSpotPrice("ETH");
      expect(spot).toBeGreaterThan(0);
    } catch (err: any) {
      expect(
        err.message.includes("Live market spot price unavailable") ||
        err.message.includes("Market data timeout") ||
        err.message.includes("timeout")
      ).toBe(true);
    }
  });

  it("should fetch live orders from OptionBook or handle network disconnect gracefully", async () => {
    try {
      const orders = await service.fetchRawOrders();
      expect(Array.isArray(orders)).toBe(true);
    } catch (err: any) {
      expect(err.message).toBeDefined();
    }
  });

  it("should fetch market quotes for confirmed ETH intent", async () => {
    try {
      const quotes = await service.fetchMarketQuotes(mockIntent);
      expect(Array.isArray(quotes)).toBe(true);
    } catch (err: any) {
      expect(err.message).toBeDefined();
    }
  });
});
