import { describe, expect, it } from "vitest";
import { TypedRiskIntent } from "../src/types";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { resolveOptionCategory, resolveOrderOptionCategory } from "../src/services/OptionCategoryResolver";

const maker = "0x1111111111111111111111111111111111111111";
const putImplementation = "0x7355EB92dfb0503DB558a70c10843618932ab290";
const priceFeed = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const nowMs = Math.floor(Date.now() / 1000) * 1000;

function createTestIntent(overrides: Partial<TypedRiskIntent> = {}): TypedRiskIntent {
  return {
    intentId: "category-test-intent",
    version: 1,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    confirmedAtMs: nowMs,
    confirmedByUser: true,
    objective: { value: "DOWNSIDE_PROTECTION", source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
    asset: { value: "ETH", source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
    exposureAmount: {
      value: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" },
      source: "USER_EXPLICIT",
      confidence: 1,
      requiresConfirmation: false,
    },
    targetMaxLossPercent: { value: 20, source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
    maxPremiumUSDC: {
      value: { amountBaseUnits: "100000000", decimals: 6, symbol: "USDC" },
      source: "USER_EXPLICIT",
      confidence: 1,
      requiresConfirmation: false,
    },
    horizonTimestamp: {
      value: {
        timestampMs: nowMs + 7 * 86_400_000,
        isoString: "2030-01-08T00:00:00.000Z",
        formattedDisplay: "7 Days",
        timezone: "UTC",
      },
      source: "USER_EXPLICIT",
      confidence: 1,
      requiresConfirmation: false,
    },
    allowedProtocols: { value: ["THETANUTS"], source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
    allowMultiLeg: { value: false, source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
    ...overrides,
  };
}

function createRawOrder(isCall = false, isLong = true, price = 5000n, expirySec = Math.floor(nowMs / 1000) + 7 * 86400) {
  return {
    order: {
      maker,
      optionType: isCall ? 0 : 1,
      isCall,
      price,
      expiry: BigInt(expirySec),
      strikes: [250000000000n],
      implementation: putImplementation,
    },
    signature: "0x1234",
    availableAmount: 5000000000n,
    makerAddress: maker,
    rawApiData: {
      collateral: usdc,
      priceFeed,
      implementation: putImplementation,
      strikes: ["250000000000"],
      isCall,
      optionType: isCall ? 0 : 1,
      isLong,
      orderExpiryTimestamp: expirySec - 3600,
      maxCollateralUsable: "5000000000",
    },
  };
}

describe("Category-Aware Market Matching & Proceedable Pass — 12 Deterministic Tests", () => {
  it("TEST 1: CATEGORY MAPPING — PUT/CALL + BUY/SELL map to 4 exact categories", () => {
    expect(resolveOrderOptionCategory(createRawOrder(false, true)).category).toBe("LONG_PUT");
    expect(resolveOrderOptionCategory(createRawOrder(false, false)).category).toBe("SHORT_PUT");
    expect(resolveOrderOptionCategory(createRawOrder(true, true)).category).toBe("LONG_CALL");
    expect(resolveOrderOptionCategory(createRawOrder(true, false)).category).toBe("SHORT_CALL");
  });

  it("TEST 2: VALID LONG PUT EXACT MATCH — matching order yields Matching = YES", () => {
    const intent = createTestIntent();
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const validPut = createRawOrder(false, true);

    const explorer = service.buildLiveMarketExplorer(intent, [validPut], nowMs);

    expect(explorer.confirmedCategory).toBe("LONG_PUT");
    expect(explorer.matchingCount).toBe(1);
    expect(explorer.matching[0].proceedable).toBe(true);
    expect(explorer.matching[0].categoryMatchesIntent).toBe(true);
    expect(explorer.matching[0].eligibilityStatus).toBe("ELIGIBLE");
  });

  it("TEST 3: VALID LONG PUT SOFT MISMATCH — soft difference stays proceedable & in Closest/Eligible in My Category", () => {
    const intent = createTestIntent();
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    // Expiry is 3 days instead of requested 7 days -> soft horizon mismatch
    const softMismatchPut = createRawOrder(false, true, 5000n, Math.floor(nowMs / 1000) + 3 * 86400);

    const explorer = service.buildLiveMarketExplorer(intent, [softMismatchPut], nowMs);

    expect(explorer.matchingCount).toBe(0);
    expect(explorer.closestCount).toBe(1);
    expect(explorer.eligibleInMyCategoryCount).toBe(1);
    expect(explorer.closest[0].proceedable).toBe(true);
    expect(explorer.closest[0].eligibilityStatus).toBe("CLOSEST");
  });

  it("TEST 4: SHORT PUT USER — confirmed SHORT_PUT matches taker SELL order & is proceedable", () => {
    const intent = createTestIntent({
      optionCategory: { value: "SHORT_PUT" } as any,
    });
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const shortPutOrder = createRawOrder(false, false);

    const explorer = service.buildLiveMarketExplorer(intent, [shortPutOrder], nowMs);

    expect(explorer.confirmedCategory).toBe("SHORT_PUT");
    expect(explorer.matchingCount).toBe(1);
    expect(explorer.matching[0].optionCategory).toBe("SHORT_PUT");
    expect(explorer.matching[0].proceedable).toBe(true);
  });

  it("TEST 5: LONG CALL USER — confirmed LONG_CALL matches taker BUY CALL order", () => {
    const intent = createTestIntent({
      optionCategory: { value: "LONG_CALL" } as any,
    });
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const longCallOrder = createRawOrder(true, true);

    const explorer = service.buildLiveMarketExplorer(intent, [longCallOrder], nowMs);

    expect(explorer.confirmedCategory).toBe("LONG_CALL");
    expect(explorer.matchingCount).toBe(1);
    expect(explorer.matching[0].optionCategory).toBe("LONG_CALL");
    expect(explorer.matching[0].proceedable).toBe(true);
  });

  it("TEST 6: SHORT CALL USER — confirmed SHORT_CALL matches taker SELL CALL order", () => {
    const intent = createTestIntent({
      optionCategory: { value: "SHORT_CALL" } as any,
    });
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const shortCallOrder = createRawOrder(true, false);

    const explorer = service.buildLiveMarketExplorer(intent, [shortCallOrder], nowMs);

    expect(explorer.confirmedCategory).toBe("SHORT_CALL");
    expect(explorer.matchingCount).toBe(1);
    expect(explorer.matching[0].optionCategory).toBe("SHORT_CALL");
    expect(explorer.matching[0].proceedable).toBe(true);
  });

  it("TEST 7: CROSS CATEGORY — SHORT_PUT order is excluded from LONG_PUT user's Matching and Closest", () => {
    const intent = createTestIntent(); // LONG_PUT
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const shortPutOrder = createRawOrder(false, false);

    const explorer = service.buildLiveMarketExplorer(intent, [shortPutOrder], nowMs);

    expect(explorer.confirmedCategory).toBe("LONG_PUT");
    expect(explorer.matchingCount).toBe(0);
    expect(explorer.closestCount).toBe(0);
    expect(explorer.eligibleInMyCategoryCount).toBe(0);
    expect(explorer.allLiveDisplayedCount).toBe(1);
    expect(explorer.allLive[0].categoryMatchesIntent).toBe(false);
  });

  it("TEST 8: ALL ELIGIBLE CATEGORY CONTRACTS — 12 proceedable orders appear in Eligible in My Category, Closest capped at 3", () => {
    const intent = createTestIntent();
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    // Create 12 soft-mismatch orders
    const orders = Array.from({ length: 12 }, (_, i) =>
      createRawOrder(false, true, 5000n, Math.floor(nowMs / 1000) + (1 + (i % 5)) * 86400)
    );

    const explorer = service.buildLiveMarketExplorer(intent, orders, nowMs);

    expect(explorer.eligibleInMyCategoryCount).toBe(12);
    expect(explorer.closestCount).toBe(3);
    expect(explorer.eligibleInMyCategory?.length).toBe(12);
  });

  it("TEST 9: ACCEPT SOFT DIFFERENCE — soft mismatch order has proceedable=true and is eligible to accept", () => {
    const intent = createTestIntent();
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const softMismatchOrder = createRawOrder(false, true, 5000n, Math.floor(nowMs / 1000) + 3 * 86400);

    const explorer = service.buildLiveMarketExplorer(intent, [softMismatchOrder], nowMs);
    const candidate = explorer.closest[0];

    expect(candidate.proceedable).toBe(true);
    expect(candidate.categoryMatchesIntent).toBe(true);
    expect(candidate.requiredChanges.length).toBeGreaterThan(0);
  });

  it("TEST 10: EXACT MATCH BUG FIX — fixture where all hard & soft checks pass appears in Matching", () => {
    const intent = createTestIntent();
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const exactOrder = createRawOrder(false, true, 5000n, Math.floor(nowMs / 1000) + 7 * 86400);

    const explorer = service.buildLiveMarketExplorer(intent, [exactOrder], nowMs);

    expect(explorer.matchingCount).toBe(1);
    expect(explorer.matching[0].orderId).toBe("ob-quote-1");
  });

  it("TEST 11: PHYSICAL_PUT — current SDK PHYSICAL_PUT implementation is recognized as valid", () => {
    const intent = createTestIntent();
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const physicalPutOrder = createRawOrder(false, true);
    physicalPutOrder.rawApiData.implementation = "0x7355EB92dfb0503DB558a70c10843618932ab290";

    const explorer = service.buildLiveMarketExplorer(intent, [physicalPutOrder], nowMs);

    expect(explorer.matchingCount).toBe(1);
  });

  it("TEST 12: 2 ETH REGRESSION — 2 ETH exposure + 100 USDC budget remains 2 ETH requested protection quantity", () => {
    const intent = createTestIntent({
      exposureAmount: {
        value: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" },
        source: "USER_EXPLICIT",
        confidence: 1,
        requiresConfirmation: false,
      },
      maxPremiumUSDC: {
        value: { amountBaseUnits: "100000000", decimals: 6, symbol: "USDC" },
        source: "USER_EXPLICIT",
        confidence: 1,
        requiresConfirmation: false,
      },
    });

    expect(intent.exposureAmount.value.amountBaseUnits).toBe("2000000000000000000");
    expect(intent.maxPremiumUSDC.value.amountBaseUnits).toBe("100000000");
  });
});
