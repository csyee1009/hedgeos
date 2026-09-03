import { MarketQuote } from "../types";

/**
 * VISIBLY LABELED MOCK MARKET QUOTES FOR UNIT TESTING AND DEMO FIXTURES ONLY.
 * PRODUCTION MARKET PROVIDERS MUST NOT RETURN THESE STATIC QUOTES AS LIVE INTEGRATION DATA.
 */
export const MOCK_OPTION_BOOK_QUOTES: MarketQuote[] = [
  {
    quoteId: "mock-quote-ob-001",
    sourceType: "OPTION_BOOK",
    protocol: "THETANUTS",
    asset: "ETH",
    optionRight: "PUT",
    strikePrice: { amountBaseUnits: "280000000000", decimals: 8, symbol: "USDC" },
    expiryTimestampMs: Date.now() + 7 * 24 * 3600 * 1000,
    premium: { amountBaseUnits: "2700000", decimals: 6, symbol: "USDC" },
    availableQuantity: { amountBaseUnits: "10000000", decimals: 6, symbol: "CONTRACTS" },
    executableNow: true,
  },
  {
    quoteId: "mock-quote-ob-002",
    sourceType: "OPTION_BOOK",
    protocol: "THETANUTS",
    asset: "ETH",
    optionRight: "PUT",
    strikePrice: { amountBaseUnits: "275000000000", decimals: 8, symbol: "USDC" },
    expiryTimestampMs: Date.now() + 7 * 24 * 3600 * 1000,
    premium: { amountBaseUnits: "5200000", decimals: 6, symbol: "USDC" },
    availableQuantity: { amountBaseUnits: "5000000", decimals: 6, symbol: "CONTRACTS" },
    executableNow: true,
  },
];

export const MOCK_RFQ_QUOTES: MarketQuote[] = [
  {
    quoteId: "mock-quote-rfq-001",
    sourceType: "RFQ_OPTION_FACTORY",
    protocol: "THETANUTS",
    asset: "ETH",
    optionRight: "PUT",
    strikePrice: { amountBaseUnits: "278000000000", decimals: 8, symbol: "USDC" },
    expiryTimestampMs: Date.now() + 7 * 24 * 3600 * 1000,
    premium: { amountBaseUnits: "2900000", decimals: 6, symbol: "USDC" },
    availableQuantity: { amountBaseUnits: "2000000", decimals: 6, symbol: "CONTRACTS" },
    executableNow: true,
  },
];
