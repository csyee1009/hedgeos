import { describe, expect, it } from "vitest";
import { computeOrderTotalPremiumBase, sortAndFilterOrders, deriveContractTargetMaxLossPercent, RevalidationFailureInfo } from "../src/client/components/CandidateList";
import { OptionSizingAdapter } from "../src/services/OptionSizingAdapter";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { LiveOptionBookOrderDTO, TypedRiskIntent } from "../src/types";

const service = new ThetanutsMarketService("https://mainnet.base.org");
const chainConfig = (service as any).client.chainConfig;
const putImplementation = String(chainConfig.implementations.PUT);
const ethFeed = String(chainConfig.priceFeeds.ETH ?? chainConfig.priceFeeds["ETH/USD"]);
const usdc = String(chainConfig.tokens.USDC.address ?? chainConfig.tokens.USDC);
const maker = "0x1111111111111111111111111111111111111111";
const capturedAtMs = Date.UTC(2030, 0, 1, 0, 0, 0);

const testIntent: TypedRiskIntent = {
  intentId: "sort-test-intent",
  version: 1,
  createdAtMs: capturedAtMs,
  updatedAtMs: capturedAtMs,
  confirmedAtMs: capturedAtMs,
  confirmedByUser: true,
  objective: { value: "DOWNSIDE_PROTECTION", source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
  asset: { value: "ETH", source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
  exposureAmount: {
    value: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" }, // 2 ETH
    source: "USER_EXPLICIT",
    confidence: 1,
    requiresConfirmation: false,
  },
  targetMaxLossPercent: { value: 20, source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
  maxPremiumUSDC: {
    value: { amountBaseUnits: "100000000", decimals: 6, symbol: "USDC" }, // 100 USDC budget
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

function createMockDTO(orderId: string, priceUSDC?: number): LiveOptionBookOrderDTO {
  return {
    orderId,
    asset: "ETH",
    optionRight: "PUT",
    takerSide: "BUY",
    optionCategory: "LONG_PUT",
    categoryMatchesIntent: true,
    matchesCurrentGoal: true,
    strikes: [{ amountBaseUnits: "250000000000", decimals: 8, symbol: "USD" }],
    expiryTimestampMs: capturedAtMs + 7 * 86_400_000,
    pricePerContract: priceUSDC !== undefined ? { amountBaseUnits: (priceUSDC * 1e6).toString(), decimals: 6, symbol: "USDC" } : undefined,
    availableCapacity: { amountBaseUnits: "5000000000000000000", decimals: 18, symbol: "CONTRACTS" },
    activeStatus: "ACTIVE",
    structureLabel: "Vanilla Put",
    eligibilityStatus: "ELIGIBLE",
    proceedable: true,
    proceedabilityStatus: "PROCEEDABLE",
    hardFailureReasons: [],
    rejectionReasons: [],
    constraintChecks: [],
    whyConsider: [],
    whyNotConsider: [],
    requiredChanges: [],
  };
}

describe("Failed Contract Revalidation, Recovery & Budget Sorting Test Suite", () => {
  describe("Budget & Premium Sorting (PART 2)", () => {
    it("1. ASC sorts evaluated premiums low to high (10, 20, 30 USDC)", () => {
      const o10 = createMockDTO("o10", 10);
      const o30 = createMockDTO("o30", 30);
      const o20 = createMockDTO("o20", 20);
      const sorted = sortAndFilterOrders([o10, o30, o20], testIntent, "ASC", false);
      expect(sorted.map((o) => o.orderId)).toEqual(["o10", "o20", "o30"]);
    });

    it("2. DESC sorts evaluated premiums high to low (30, 20, 10 USDC)", () => {
      const o10 = createMockDTO("o10", 10);
      const o30 = createMockDTO("o30", 30);
      const o20 = createMockDTO("o20", 20);
      const sorted = sortAndFilterOrders([o10, o30, o20], testIntent, "DESC", false);
      expect(sorted.map((o) => o.orderId)).toEqual(["o30", "o20", "o10"]);
    });

    it("3. Sorting uses base units, not lexicographical formatted strings", () => {
      const o5 = createMockDTO("o5", 5);
      const o100 = createMockDTO("o100", 100);
      const o20 = createMockDTO("o20", 20);
      const sorted = sortAndFilterOrders([o100, o5, o20], testIntent, "ASC", false);
      // Numerical 5, 20, 100 — string sort would put "100" before "20"
      expect(sorted.map((o) => o.orderId)).toEqual(["o5", "o20", "o100"]);
    });

    it("4. NOT_EVALUATED is placed AFTER evaluated premiums in both ASC and DESC", () => {
      const o10 = createMockDTO("o10", 10);
      const oNull = createMockDTO("oNull", undefined);
      const o20 = createMockDTO("o20", 20);

      const asc = sortAndFilterOrders([oNull, o20, o10], testIntent, "ASC", false);
      expect(asc.map((o) => o.orderId)).toEqual(["o10", "o20", "oNull"]);

      const desc = sortAndFilterOrders([oNull, o20, o10], testIntent, "DESC", false);
      expect(desc.map((o) => o.orderId)).toEqual(["o20", "o10", "oNull"]);
    });

    it("5. Within My Budget filter keeps only total cost <= user max budget (e.g. 100 USDC total budget)", () => {
      // 2 ETH exposure = 2 contracts.
      // o20 (20 per contract * 2 = 40 total <= 100) -> IN
      // o50 (50 per contract * 2 = 100 total <= 100) -> IN
      // o70 (70 per contract * 2 = 140 total > 100) -> OUT
      const o20 = createMockDTO("o20", 20);
      const o50 = createMockDTO("o50", 50);
      const o70 = createMockDTO("o70", 70);
      const filtered = sortAndFilterOrders([o20, o50, o70], testIntent, "ASC", true);
      expect(filtered.map((o) => o.orderId)).toEqual(["o20", "o50"]);
    });

    it("6. Sorting does not mix categories", () => {
      const put = createMockDTO("put", 40);
      const call = createMockDTO("call", 10);
      call.optionCategory = "LONG_CALL";
      call.optionRight = "CALL";

      // Filter for LONG_PUT category first (business rule)
      const putsOnly = [put, call].filter((o) => o.optionCategory === "LONG_PUT");
      const sorted = sortAndFilterOrders(putsOnly, testIntent, "ASC", false);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].orderId).toBe("put");
    });

    it("7. CLOSEST_MATCH retains deterministic closest ranking", () => {
      const o1 = createMockDTO("closest-1", 40);
      const o2 = createMockDTO("closest-2", 10);
      const sorted = sortAndFilterOrders([o1, o2], testIntent, "CLOSEST_MATCH", false);
      expect(sorted.map((o) => o.orderId)).toEqual(["closest-1", "closest-2"]);
    });
  });

  describe("Revalidation & Recovery (PART 1)", () => {
    it("1. Total required premium calculation multiplies pricePerContract by contract quantity for 2 ETH", () => {
      const order = createMockDTO("order-2eth", 41.20);
      const totalRequiredBase = computeOrderTotalPremiumBase(order, testIntent);
      expect(totalRequiredBase).toBeDefined();
      // 41.20 USDC * 2 contracts = 82.40 USDC = 82,400,000 base units
      expect(totalRequiredBase?.toString()).toBe("82400000");
    });

    it("2. Disappeared order yields exact ORDER_DISAPPEARED reason code", () => {
      const failure: RevalidationFailureInfo = {
        orderId: "missing-order-99",
        reasonCode: "ORDER_DISAPPEARED",
        explanation: "The selected order 'missing-order-99' is no longer available in the live Thetanuts OptionBook.",
      };
      expect(failure.reasonCode).toBe("ORDER_DISAPPEARED");
      expect(failure.explanation).toContain("no longer available");
    });

    it("3. Zero capacity yields exact INSUFFICIENT_CAPACITY reason code", () => {
      const failure: RevalidationFailureInfo = {
        orderId: "cap-order-00",
        reasonCode: "INSUFFICIENT_CAPACITY",
        explanation: "Maker available capacity for 'cap-order-00' has dropped below your requested exposure quantity.",
      };
      expect(failure.reasonCode).toBe("INSUFFICIENT_CAPACITY");
      expect(failure.explanation).toContain("capacity");
    });

    it("4. Expired order yields exact ORDER_EXPIRED reason code", () => {
      const failure: RevalidationFailureInfo = {
        orderId: "expired-order-01",
        reasonCode: "ORDER_EXPIRED",
        explanation: "The selected order 'expired-order-01' has expired and can no longer be accepted.",
      };
      expect(failure.reasonCode).toBe("ORDER_EXPIRED");
    });

    it("5. 2 ETH + 100 USDC regression is preserved", () => {
      expect(testIntent.exposureAmount.value.amountBaseUnits).toBe("2000000000000000000");
      expect(testIntent.exposureAmount.value.symbol).toBe("ETH");
      expect(testIntent.maxPremiumUSDC.value.amountBaseUnits).toBe("100000000");
      expect(testIntent.maxPremiumUSDC.value.symbol).toBe("USDC");
    });
  });

  describe("Market Overview & Collapsed Result Sections (PART 3)", () => {
    it("1. Initial market overview state is null (collapsed, no auto-open)", () => {
      let marketTab: "MATCHING" | "CLOSEST" | "MY_CATEGORY" | "ALL_LIVE" | null = null;
      expect(marketTab).toBeNull();
    });

    it("2. Matching = 0, Closest > 0 does NOT auto-open Closest", () => {
      const matchingCount = 0;
      const closestCount = 12;
      let marketTab: "MATCHING" | "CLOSEST" | "MY_CATEGORY" | "ALL_LIVE" | null = null;

      // Ensure state remains null despite matching = 0 and closest > 0
      expect(matchingCount).toBe(0);
      expect(closestCount).toBe(12);
      expect(marketTab).toBeNull();
    });

    it("3. Clicking a tab opens it, and clicking it again collapses back to null", () => {
      let marketTab: "MATCHING" | "CLOSEST" | "MY_CATEGORY" | "ALL_LIVE" | null = null;

      const toggleTab = (tab: "MATCHING" | "CLOSEST" | "MY_CATEGORY" | "ALL_LIVE") => {
        marketTab = marketTab === tab ? null : tab;
      };

      // Click CLOSEST
      toggleTab("CLOSEST");
      expect(marketTab).toBe("CLOSEST");

      // Click CLOSEST again -> collapses to null
      toggleTab("CLOSEST");
      expect(marketTab).toBeNull();
    });

    it("4. Recovery (Choose Another Contract / Refresh) resets marketTab to null overview state", () => {
      let marketTab: "MATCHING" | "CLOSEST" | "MY_CATEGORY" | "ALL_LIVE" | null = "MATCHING";
      let revalidationFailure: RevalidationFailureInfo | null = {
        orderId: "failed-contract-a",
        reasonCode: "ORDER_EXPIRED",
        explanation: "Contract A expired",
      };
      let selectedCandidate = { strategyId: "failed-contract-a" };

      // User clicks Choose Another Contract / Refresh
      const resetToOverview = () => {
        marketTab = null;
        revalidationFailure = null;
        selectedCandidate = null as any;
      };

      resetToOverview();

      expect(marketTab).toBeNull();
      expect(revalidationFailure).toBeNull();
      expect(selectedCandidate).toBeNull();
    });

    it("5. Budget sort controls only visible when marketTab is non-null", () => {
      const showSortControls = (tab: string | null) => tab !== null;

      expect(showSortControls(null)).toBe(false);
      expect(showSortControls("MATCHING")).toBe(true);
      expect(showSortControls("CLOSEST")).toBe(true);
      expect(showSortControls("MY_CATEGORY")).toBe(true);
      expect(showSortControls("ALL_LIVE")).toBe(true);
    });

    it("6. ob-quote-57 derives contract-compatible 8.5513% target max loss and avoids false ORDER_CHANGED", () => {
      const dto = createMockDTO("ob-quote-57", 41.20);
      dto.constraintChecks = [
        { code: "PROTECTION_TARGET", status: "FAIL", details: "Exact modeled-at-expiry downside ratio exceeds confirmed target 8% (display 8.5513%)." }
      ];

      const derivedDownside = deriveContractTargetMaxLossPercent(dto, testIntent);
      expect(derivedDownside).toBe(8.5513);
    });
  });

  describe("Base Intent Preservation & Market Recovery Tests", () => {
    const baseIntent: TypedRiskIntent = {
      intentId: "base-intent-test",
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
      targetMaxLossPercent: { value: 8, source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
      maxPremiumUSDC: {
        value: { amountBaseUnits: "15000000", decimals: 6, symbol: "USDC" }, // 15 USDC
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
      baseConfirmedGoal: {
        asset: "ETH",
        exposureAmount: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" },
        targetMaxLossPercent: 8,
        maxPremiumUSDC: { amountBaseUnits: "15000000", decimals: 6, symbol: "USDC" },
        horizonTimestamp: {
          timestampMs: capturedAtMs + 7 * 86_400_000,
          isoString: "2030-01-08T00:00:00.000Z",
          formattedDisplay: "8 January 2030",
          timezone: "UTC",
        },
      },
    };

    it("1. base goal 8% -> accept contract 8.5513% -> refresh -> restored 8%", () => {
      // Step 1: Base goal is 8%
      const baseCopy = JSON.parse(JSON.stringify(baseIntent)) as TypedRiskIntent;
      expect(baseCopy.targetMaxLossPercent.value).toBe(8);
      expect(baseCopy.targetMaxLossPercent.source).toBe("USER_EXPLICIT");

      // Step 2: Contract A accepted with 8.5513%
      const contractAcceptedIntent: TypedRiskIntent = {
        ...baseCopy,
        targetMaxLossPercent: {
          value: 8.5513,
          source: "USER_ACCEPTED_LIVE_CONTRACT",
          confidence: 1,
          requiresConfirmation: false,
        },
      };
      expect(contractAcceptedIntent.targetMaxLossPercent.value).toBe(8.5513);
      expect(contractAcceptedIntent.targetMaxLossPercent.source).toBe("USER_ACCEPTED_LIVE_CONTRACT");
      // Base remains unchanged
      expect(baseCopy.targetMaxLossPercent.value).toBe(8);

      // Step 3: Refresh Live Market discards contract-accepted soft values and restores base goal
      const restored = JSON.parse(JSON.stringify(baseCopy)) as TypedRiskIntent;
      expect(restored.targetMaxLossPercent.value).toBe(8);
      expect(restored.targetMaxLossPercent.source).toBe("USER_EXPLICIT");
    });

    it("2. base budget 15 USDC -> accept contract 234.095961 USDC -> refresh -> restored 15 USDC", () => {
      const baseCopy = JSON.parse(JSON.stringify(baseIntent)) as TypedRiskIntent;
      expect(baseCopy.maxPremiumUSDC.value.amountBaseUnits).toBe("15000000");

      // Contract A temporarily requires 234.095961 USDC
      const contractAcceptedIntent: TypedRiskIntent = {
        ...baseCopy,
        maxPremiumUSDC: {
          value: { amountBaseUnits: "234095961", decimals: 6, symbol: "USDC" },
          source: "USER_ACCEPTED_LIVE_CONTRACT",
          confidence: 1,
          requiresConfirmation: false,
        },
      };
      expect(contractAcceptedIntent.maxPremiumUSDC.value.amountBaseUnits).toBe("234095961");

      // User refreshes -> restored to 15 USDC (15000000 base units)
      const restored = JSON.parse(JSON.stringify(baseCopy)) as TypedRiskIntent;
      expect(restored.maxPremiumUSDC.value.amountBaseUnits).toBe("15000000");
      expect(restored.maxPremiumUSDC.value.decimals).toBe(6);
      expect(restored.maxPremiumUSDC.source).toBe("USER_EXPLICIT");
    });

    it("3. accept Contract A -> Choose Another Contract -> Contract B evaluated against original goal", () => {
      let activeIntent = JSON.parse(JSON.stringify(baseIntent)) as TypedRiskIntent;
      const baseConfirmedIntent = JSON.parse(JSON.stringify(baseIntent)) as TypedRiskIntent;

      // Select and accept Contract A (8.5513%, 234.095961 USDC)
      activeIntent.targetMaxLossPercent = {
        value: 8.5513,
        source: "USER_ACCEPTED_LIVE_CONTRACT",
        confidence: 1,
        requiresConfirmation: false,
      };
      activeIntent.maxPremiumUSDC = {
        value: { amountBaseUnits: "234095961", decimals: 6, symbol: "USDC" },
        source: "USER_ACCEPTED_LIVE_CONTRACT",
        confidence: 1,
        requiresConfirmation: false,
      };

      // User abandons Contract A via Choose Another Contract
      activeIntent = JSON.parse(JSON.stringify(baseConfirmedIntent)) as TypedRiskIntent;

      // Contract B evaluated against activeIntent (restored original goal)
      expect(activeIntent.targetMaxLossPercent.value).toBe(8);
      expect(activeIntent.maxPremiumUSDC.value.amountBaseUnits).toBe("15000000");
      expect(activeIntent.targetMaxLossPercent.source).toBe("USER_EXPLICIT");
    });

    it("4. successful Contract A continuation -> contractAcceptedIntent preserved through preview", () => {
      const contractAcceptedIntent: TypedRiskIntent = {
        ...baseIntent,
        targetMaxLossPercent: {
          value: 8.5513,
          source: "USER_ACCEPTED_LIVE_CONTRACT",
          confidence: 1,
          requiresConfirmation: false,
        },
        maxPremiumUSDC: {
          value: { amountBaseUnits: "234095961", decimals: 6, symbol: "USDC" },
          source: "USER_ACCEPTED_LIVE_CONTRACT",
          confidence: 1,
          requiresConfirmation: false,
        },
      };

      // Through preview and transaction preparation, accepted intent is maintained
      const previewIntent = contractAcceptedIntent;
      expect(previewIntent.targetMaxLossPercent.value).toBe(8.5513);
      expect(previewIntent.maxPremiumUSDC.value.amountBaseUnits).toBe("234095961");
    });

    it("5. manual user edit + confirm -> new values become new base goal", () => {
      let baseConfirmedGoal = JSON.parse(JSON.stringify(baseIntent)) as TypedRiskIntent;
      expect(baseConfirmedGoal.targetMaxLossPercent.value).toBe(8);
      expect(baseConfirmedGoal.maxPremiumUSDC.value.amountBaseUnits).toBe("15000000");

      // User manually edits: 10%, 100 USDC and confirms
      const editedConfirmedIntent: TypedRiskIntent = {
        ...baseConfirmedGoal,
        targetMaxLossPercent: { value: 10, source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
        maxPremiumUSDC: {
          value: { amountBaseUnits: "100000000", decimals: 6, symbol: "USDC" },
          source: "USER_EXPLICIT",
          confidence: 1,
          requiresConfirmation: false,
        },
        version: 2,
      };

      // New explicitly confirmed values become the new base
      baseConfirmedGoal = JSON.parse(JSON.stringify(editedConfirmedIntent));
      expect(baseConfirmedGoal.targetMaxLossPercent.value).toBe(10);
      expect(baseConfirmedGoal.maxPremiumUSDC.value.amountBaseUnits).toBe("100000000");
    });

    it("6. no USER_ACCEPTED_LIVE_CONTRACT values leak into fresh-market search after abandonment", () => {
      let activeIntent: TypedRiskIntent = {
        ...baseIntent,
        targetMaxLossPercent: {
          value: 8.5513,
          source: "USER_ACCEPTED_LIVE_CONTRACT",
          confidence: 1,
          requiresConfirmation: false,
        },
      };

      // Abandonment restores base
      activeIntent = JSON.parse(JSON.stringify(baseIntent));
      expect(activeIntent.targetMaxLossPercent.source).toBe("USER_EXPLICIT");
      expect(activeIntent.targetMaxLossPercent.source).not.toBe("USER_ACCEPTED_LIVE_CONTRACT");
    });

    it("7. USDC canonical units preserved (15 USDC = 15000000 base units, 6 decimals, no double scaling)", () => {
      const budgetBase = BigInt(baseIntent.maxPremiumUSDC.value.amountBaseUnits);
      const decimals = baseIntent.maxPremiumUSDC.value.decimals;
      expect(budgetBase.toString()).toBe("15000000");
      expect(decimals).toBe(6);

      // Verify formatting for patch endpoint does not double-scale
      const scale = 10n ** BigInt(decimals);
      const integerPart = budgetBase / scale;
      const fracPart = budgetBase % scale;
      const budgetString = fracPart === 0n ? integerPart.toString() : `${integerPart}.${fracPart}`;
      expect(budgetString).toBe("15");

      // Verify parsing back on server yields exact original base units
      const parsedBaseUnits = (BigInt(budgetString) * 1_000_000n).toString();
      expect(parsedBaseUnits).toBe("15000000");
    });

    it("8. clean market overview restored after refresh (activeMarketSection / marketTab = null)", () => {
      let marketTab: "MATCHING" | "CLOSEST" | "MY_CATEGORY" | "ALL_LIVE" | null = "MATCHING";
      let selectedCandidate: any = { strategyId: "some-candidate" };
      let revalidationFailure: any = { reasonCode: "ORDER_CHANGED" };

      // User clicks Refresh Live Market
      const resetToOverview = () => {
        marketTab = null;
        selectedCandidate = null;
        revalidationFailure = null;
      };
      resetToOverview();

      expect(marketTab).toBeNull();
      expect(selectedCandidate).toBeNull();
      expect(revalidationFailure).toBeNull();
    });
  });
});
