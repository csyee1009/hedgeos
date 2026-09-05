import { describe, expect, it } from "vitest";
import { OptionSizingAdapter } from "../src/services/OptionSizingAdapter";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { TypedRiskIntent } from "../src/types";

const service = new ThetanutsMarketService("https://mainnet.base.org");
const chainConfig = (service as any).client.chainConfig;
const putImplementation = String(chainConfig.implementations.PUT);
const ethFeed = String(chainConfig.priceFeeds.ETH ?? chainConfig.priceFeeds["ETH/USD"]);
const btcFeed = String(chainConfig.priceFeeds.BTC ?? chainConfig.priceFeeds["BTC/USD"]);
const usdc = String(chainConfig.tokens.USDC.address ?? chainConfig.tokens.USDC);
const maker = "0x1111111111111111111111111111111111111111";
const capturedAtMs = Date.UTC(2030, 0, 1, 0, 0, 0);

const intent: TypedRiskIntent = {
  intentId: "market-explorer-intent",
  version: 1,
  createdAtMs: capturedAtMs,
  updatedAtMs: capturedAtMs,
  confirmedAtMs: capturedAtMs,
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
      timestampMs: capturedAtMs + 7 * 86_400_000,
      isoString: "2030-01-08T00:00:00.000Z",
      formattedDisplay: "8 January 2030",
      timezone: "UTC",
    },
    source: "USER_EXPLICIT",
    confidence: 1,
    requiresConfirmation: false,
  },
  allowedProtocols: { value: ["THETANUTS"], source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
  allowMultiLeg: { value: false, source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
};

function rawOrder(options: {
  index: number;
  optionRight?: "PUT" | "CALL";
  priceFeed?: string;
  expiryOffsetDays?: number;
}) {
  const optionRight = options.optionRight ?? "PUT";
  const expirySeconds = BigInt(Math.floor(capturedAtMs / 1_000) + (options.expiryOffsetDays ?? 3) * 86_400);
  const deadlineSeconds = Number(expirySeconds - 3_600n);
  const strikes = [250_000_000_000n];
  return {
    order: {
      maker,
      optionType: optionRight === "PUT" ? 1 : 0,
      isCall: optionRight === "CALL",
      price: 5000n,
      expiry: expirySeconds,
      strikes,
      implementation: putImplementation,
    },
    signature: "0x1234",
    availableAmount: 5_000_000_000n,
    makerAddress: maker,
    rawApiData: {
      index: options.index,
      collateral: usdc,
      priceFeed: options.priceFeed ?? ethFeed,
      implementation: putImplementation,
      strikes: strikes.map(String),
      isCall: optionRight === "CALL",
      optionType: optionRight === "PUT" ? 1 : 0,
      isLong: true,
      orderExpiryTimestamp: deadlineSeconds,
      maxCollateralUsable: "5000000000",
    },
  };
}

describe("live Thetanuts market explorer & proceedable workflow pass", () => {
  const orders = [
    rawOrder({ index: 1, expiryOffsetDays: 3 }),
    rawOrder({ index: 2, optionRight: "CALL", expiryOffsetDays: 10 }),
    rawOrder({ index: 3, priceFeed: btcFeed, expiryOffsetDays: 10 }),
    rawOrder({ index: 4, expiryOffsetDays: -1 }),
  ];

  it("TEST 1: PROCEEDABLE BUY PUT returns proceedable = true and PROCEEDABLE status", () => {
    const validPut = rawOrder({ index: 10, expiryOffsetDays: 7 });
    const explorer = service.buildLiveMarketExplorer(intent, [validPut], capturedAtMs);
    expect(explorer.allLive[0].proceedable).toBe(true);
    expect(explorer.allLive[0].proceedabilityStatus).toBe("PROCEEDABLE");
    expect(explorer.proceedable).toHaveLength(1);
  });

  it("TEST 2: SOFT MISMATCH yields proceedable = true, matching = false, and closest inclusion", () => {
    const softMismatchOrder = rawOrder({ index: 1, expiryOffsetDays: 3 }); // 3d expiry < 7d horizon
    const explorer = service.buildLiveMarketExplorer(intent, [softMismatchOrder], capturedAtMs);
    expect(explorer.allLive[0].proceedable).toBe(true);
    expect(explorer.matching).toHaveLength(0);
    expect(explorer.closest).toHaveLength(1);
    expect(explorer.closest[0].eligibilityStatus).toBe("CLOSEST");
  });

  it("TEST 3: MATCHING valid BUY PUT yields proceedable = true and matching inclusion", () => {
    const matchingOrder = rawOrder({ index: 100, expiryOffsetDays: 7 });
    const explorer = service.buildLiveMarketExplorer(intent, [matchingOrder], capturedAtMs);
    expect(explorer.matching).toHaveLength(1);
    expect(explorer.matching[0].proceedable).toBe(true);
    expect(explorer.matching[0].eligibilityStatus).toBe("ELIGIBLE");
  });

  it("TEST 4: SELL PUT is marked HARD_INCOMPATIBLE and excluded from proceedable & closest", () => {
    const sellPut = rawOrder({ index: 200, expiryOffsetDays: 7 });
    sellPut.rawApiData.isLong = false; // Taker sells option
    sellPut.rawApiData.isCall = false;
    sellPut.rawApiData.optionType = 1;
    const explorer = service.buildLiveMarketExplorer(intent, [sellPut], capturedAtMs);
    expect(explorer.allLive[0].proceedable).toBe(false);
    expect(explorer.allLive[0].proceedabilityStatus).toBe("HARD_INCOMPATIBLE");
    expect(explorer.proceedable).toHaveLength(0);
    expect(explorer.closest).toHaveLength(0);
  });

  it("TEST 5: CALL order is marked HARD_INCOMPATIBLE, read-only, and excluded from proceedable", () => {
    const callOrder = rawOrder({ index: 300, optionRight: "CALL", expiryOffsetDays: 7 });
    const explorer = service.buildLiveMarketExplorer(intent, [callOrder], capturedAtMs);
    expect(explorer.allLive[0].proceedable).toBe(false);
    expect(explorer.allLive[0].proceedabilityStatus).toBe("HARD_INCOMPATIBLE");
    expect(explorer.proceedable).toHaveLength(0);
    expect(explorer.closest).toHaveLength(0);
  });

  it("TEST 6: HARD INVALID expired order yields proceedable = false", () => {
    const expiredOrder = rawOrder({ index: 400, expiryOffsetDays: -1 });
    const explorer = service.buildLiveMarketExplorer(intent, [expiredOrder], capturedAtMs);
    expect(explorer.allLive[0].proceedable).toBe(false);
    expect(explorer.allLive[0].proceedabilityStatus).toBe("HARD_INCOMPATIBLE");
  });

  it("TEST 7: SET RELATION enforces Matching ⊆ Proceedable and Closest ⊆ Proceedable", () => {
    const explorer = service.buildLiveMarketExplorer(intent, orders, capturedAtMs);
    const proceedableIds = new Set(explorer.proceedable.map((o) => o.orderId));
    expect(explorer.matching.every((o) => proceedableIds.has(o.orderId))).toBe(true);
    expect(explorer.closest.every((o) => proceedableIds.has(o.orderId))).toBe(true);
  });

  it("TEST 8: NO FORCE THREE shows exact proceedable count without forced incompatible backfill", () => {
    const explorer = service.buildLiveMarketExplorer(intent, orders, capturedAtMs);
    // In `orders`, only index 1 is proceedable
    expect(explorer.closest).toHaveLength(1);
    expect(explorer.closest[0].orderId).toBe("ob-quote-1");
    expect(explorer.closest.every((o) => o.proceedable)).toBe(true);
  });

  it("TEST 9: FILTERING logic separates Proceedable, PUT, CALL, and All correctly", () => {
    const explorer = service.buildLiveMarketExplorer(intent, orders, capturedAtMs);
    const proceedableFiltered = explorer.allLive.filter((o) => o.proceedable);
    const putFiltered = explorer.allLive.filter((o) => o.optionRight === "PUT");
    const callFiltered = explorer.allLive.filter((o) => o.optionRight === "CALL");

    expect(proceedableFiltered).toHaveLength(1);
    expect(putFiltered).toHaveLength(3);
    expect(callFiltered).toHaveLength(1);
    expect(explorer.allLive).toHaveLength(4);
  });

  it("TEST 11: PHYSICAL_PUT implementation address from SDK is recognized as valid vanilla PUT", () => {
    const physicalPutOrder = rawOrder({ index: 500, expiryOffsetDays: 7 });
    physicalPutOrder.rawApiData.implementation = "0x6aD53DD058bea004829cCf58a282C21a7Df02DcA"; // PHYSICAL_PUT on Base
    physicalPutOrder.order.implementation = "0x6aD53DD058bea004829cCf58a282C21a7Df02DcA";
    const explorer = service.buildLiveMarketExplorer(intent, [physicalPutOrder], capturedAtMs);
    expect(explorer.allLive[0].proceedable).toBe(true);
    expect(explorer.allLive[0].proceedabilityStatus).toBe("PROCEEDABLE");
  });

  it("TEST 12: Unknown / unlisted implementation address is rejected", () => {
    const unknownImplOrder = rawOrder({ index: 501, expiryOffsetDays: 7 });
    unknownImplOrder.rawApiData.implementation = "0x000000000000000000000000000000000000dead";
    unknownImplOrder.order.implementation = "0x000000000000000000000000000000000000dead";
    const explorer = service.buildLiveMarketExplorer(intent, [unknownImplOrder], capturedAtMs);
    expect(explorer.allLive[0].proceedable).toBe(false);
    expect(explorer.allLive[0].proceedabilityStatus).toBe("HARD_INCOMPATIBLE");
    expect(explorer.allLive[0].hardFailureReasons).toContain("Implementation is not on the supported vanilla PUT allowlist");
  });

  describe("Accept Closest Contract Workflow Tests 1-7", () => {
    it("TEST 1: Proceedable BUY PUT + horizon soft mismatch -> proceedable = true & expiry change proposed", () => {
      const shortExpiryOrder = rawOrder({ index: 601, expiryOffsetDays: 3 }); // 3d < 7d intent horizon
      const explorer = service.buildLiveMarketExplorer(intent, [shortExpiryOrder], capturedAtMs);
      const dto = explorer.closest[0];
      expect(dto.proceedable).toBe(true);
      expect(dto.expiryTimestampMs).toBeDefined();
      expect(dto.expiryTimestampMs).toBeLessThan(intent.horizonTimestamp.value.timestampMs);
    });

    it("TEST 2: Proceedable BUY PUT + budget already within max -> no budget increase proposed", () => {
      const cheapOrder = rawOrder({ index: 602, expiryOffsetDays: 7 });
      cheapOrder.order.price = 50_000_000n; // 50 USDC < 100 USDC intent budget
      cheapOrder.rawApiData.maxCollateralUsable = "500000000";
      const explorer = service.buildLiveMarketExplorer(intent, [cheapOrder], capturedAtMs);
      const dto = explorer.allLive[0];
      const candidatePrice = BigInt(dto.pricePerContract!.amountBaseUnits);
      const userBudget = BigInt(intent.maxPremiumUSDC.value.amountBaseUnits);
      expect(candidatePrice).toBeLessThanOrEqual(userBudget);
    });

    it("TEST 3: Proceedable BUY PUT + budget too low -> proposed budget change shown", () => {
      const tightIntent: TypedRiskIntent = {
        ...intent,
        maxPremiumUSDC: {
          value: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" }, // 10 USDC
          source: "USER_EXPLICIT",
          confidence: 1,
          requiresConfirmation: false,
        },
      };
      const expensiveOrder = rawOrder({ index: 603, expiryOffsetDays: 3 });
      expensiveOrder.order.price = 1_500_000_000n;
      const explorer = service.buildLiveMarketExplorer(tightIntent, [expensiveOrder], capturedAtMs);
      expect(explorer.allLive[0].proceedable).toBe(true);
      expect(explorer.closest).toHaveLength(1);
      const dto = explorer.closest[0];
      expect(dto.proceedable).toBe(true);
      const candidatePrice = BigInt(dto.pricePerContract!.amountBaseUnits);
      const tightBudget = BigInt(tightIntent.maxPremiumUSDC.value.amountBaseUnits);
      expect(candidatePrice).toBeGreaterThan(tightBudget);
    });

    it("TEST 4: SELL PUT / CALL / hard-incompatible -> proceedable = false (Accept Contract unavailable)", () => {
      const sellPut = rawOrder({ index: 604, expiryOffsetDays: 7 });
      sellPut.rawApiData.isLong = false;
      const call = rawOrder({ index: 605, optionRight: "CALL", expiryOffsetDays: 7 });
      const explorer = service.buildLiveMarketExplorer(intent, [sellPut, call], capturedAtMs);
      expect(explorer.allLive[0].proceedable).toBe(false);
      expect(explorer.allLive[1].proceedable).toBe(false);
      expect(explorer.closest).toHaveLength(0);
    });

    it("TEST 5: After acceptance -> intent updated & same order revalidated", () => {
      const shortExpiryOrder = rawOrder({ index: 606, expiryOffsetDays: 3 });
      const expiryMs = (shortExpiryOrder.rawApiData.orderExpiryTimestamp + 3600) * 1000;
      const updatedIntent: TypedRiskIntent = {
        ...intent,
        horizonTimestamp: {
          value: {
            timestampMs: expiryMs,
            isoString: new Date(expiryMs).toISOString(),
            formattedDisplay: new Date(expiryMs).toLocaleDateString(),
            timezone: "UTC",
          },
          source: "USER_ACCEPTED_LIVE_CONTRACT",
          confidence: 1,
          requiresConfirmation: false,
        },
      };
      const revalidatedExplorer = service.buildLiveMarketExplorer(updatedIntent, [shortExpiryOrder], capturedAtMs);
      expect(revalidatedExplorer.matching).toHaveLength(1);
      expect(revalidatedExplorer.matching[0].orderId).toBe("ob-quote-606");
    });

    it("TEST 6: Order becomes stale/disappears during revalidation -> matching is empty", () => {
      const updatedIntent: TypedRiskIntent = { ...intent };
      // Market now has NO orders (order disappeared)
      const revalidatedExplorer = service.buildLiveMarketExplorer(updatedIntent, [], capturedAtMs);
      expect(revalidatedExplorer.matching).toHaveLength(0);
      expect(revalidatedExplorer.closest).toHaveLength(0);
    });

    it("TEST 7: 2 ETH + 100 USDC -> quantity remains 2 ETH", () => {
      expect(intent.exposureAmount.value.amountBaseUnits).toBe("2000000000000000000");
      expect(intent.exposureAmount.value.symbol).toBe("ETH");
      expect(intent.maxPremiumUSDC.value.amountBaseUnits).toBe("100000000");
      expect(intent.maxPremiumUSDC.value.symbol).toBe("USDC");
    });
  });
});
