import { describe, expect, it } from "vitest";
import { MOCK_OPTION_BOOK_QUOTES, MOCK_RFQ_QUOTES } from "../src/fixtures/mockQuotes";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { TypedRiskIntent } from "../src/types";

describe("Market Provider Honesty & Data Provenance Tests", () => {
  const unconfiguredService = new ThetanutsMarketService("");

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-test-honesty",
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

  it("should return honest NOT_CONFIGURED state when RPC URL is missing rather than fabricating quotes", async () => {
    const state = unconfiguredService.getMarketStateSync();
    expect(state.status).toBe("NOT_CONFIGURED");
    expect(state.error).toContain("RPC URL not configured");
  });

  it("should verify MarketQuote contains no calldata property", () => {
    const obQuote = MOCK_OPTION_BOOK_QUOTES[0];
    expect((obQuote as any).calldata).toBeUndefined();
  });

  it("should preserve distinct OptionBook and RFQ quote provenance in mock fixtures", () => {
    const obQuote = MOCK_OPTION_BOOK_QUOTES[0];
    const rfqQuote = MOCK_RFQ_QUOTES[0];

    expect(obQuote.sourceType).toBe("OPTION_BOOK");
    expect(rfqQuote.sourceType).toBe("RFQ_OPTION_FACTORY");
    expect(obQuote.sourceType).not.toEqual(rfqQuote.sourceType);
  });
});
