import { describe, expect, it } from "vitest";
import { MOCK_OPTION_BOOK_QUOTES } from "../src/fixtures/mockQuotes";
import { FinancialConstitutionEngine } from "../src/services/FinancialConstitutionEngine";
import { CandidateStrategy, TypedRiskIntent } from "../src/types";

describe("FinancialConstitutionEngine Core Policy Invariants Tests", () => {
  const policyEngine = new FinancialConstitutionEngine();
  const validQuote = MOCK_OPTION_BOOK_QUOTES[0];

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-test-pol-core",
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
      value: { timestampMs: validQuote.expiryTimestampMs, isoString: "2026-09-04T15:59:59.999Z", formattedDisplay: "Friday, 4 September 2026, 11:59 PM MYT", timezone: "Asia/Kuala_Lumpur (MYT, UTC+8)" },
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
    allowedProtocols: { value: ["THETANUTS"], source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
    allowMultiLeg: { value: true, source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
  };

  const validCandidate: CandidateStrategy = {
    strategyId: "strategy-valid-pol",
    name: "Long Put Protection",
    strategyType: "LONG_PUT",
    legs: [
      {
        side: "BUY",
        right: "PUT",
        strikePrice: validQuote.strikePrice,
        expiryTimestampMs: validQuote.expiryTimestampMs,
        requestedExposure: mockIntent.exposureAmount.value,
        resolvedOptionQuantity: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "CONTRACTS" },
        sizingStatus: "RESOLVED",
        quoteReference: validQuote.quoteId,
      },
    ],
    quotes: [validQuote],
    status: "MARKET_FEASIBLE",
    rejectionReasons: [],
    scoresStatus: "NOT_AVAILABLE",
    sizingStatus: "RESOLVED",
    liquiditySufficient: true,
    preview: {
      previewStatus: "PREVIEW_AVAILABLE",
      pricePerContract: { amountBaseUnits: "135000000", decimals: 8, symbol: "USD" },
      premiumAmount: { amountBaseUnits: "2700000", decimals: 6, symbol: "USDC" },
      protocolFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
      referrerFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
      totalExpectedCost: { amountBaseUnits: "2700000", decimals: 6, symbol: "USDC" },
      feeStatus: "VERIFIED", buyerSpendStatus: "VERIFIED", collateralToken: "0x0000000000000000000000000000000000000001",
      previewTimestampMs: Date.now(), previewSource: "THETANUTS_OPTIONBOOK_PREVIEW",
      rawPreviewData: { numContracts: "2000000" },
    },
    payoffSummary: {
      status: "CALCULATED", spotExposureQuantity: "2 ETH", spotReferencePriceUSD: 3000, spotExposureValueUSD: 6000,
      strikePriceUSD: 2800, protectedFloorValueUSD: 5597.3, effectiveDownsidePercent: 6.7117,
      totalProtectionCostUSD: 2.7, costImpactPercent: 0.045, isConstantFloorGuaranteed: true, scenarios: [],
      details: "MODELED AT EXPIRY", calculationTimestampMs: Date.now(),
      exact: { exposureValuePrice8: "600000000000", protectedFloorValuePrice8: "559730000000", maxLossValuePrice8: "40270000000", totalCostUSDC6: "2700000", quantity18: "2000000000000000000", strikePrice8: "280000000000", spotPrice8: "300000000000" },
    },
  };

  it("should evaluate policy checks and mark INCOMPLETE when unevaluated checks exist in EXECUTION stage", async () => {
    const decision = await policyEngine.evaluatePolicy(mockIntent, validCandidate, "EXECUTION");
    expect(decision.overallStatus).toBe("INCOMPLETE");
    expect(decision.checks.find((c) => c.ruleId === "POL-001")?.status).toBe("PASS");
    expect(decision.checks.find((c) => c.ruleId === "POL-004")?.status).toBe("NOT_EVALUATED");
  });

  it("should fail POL-001 if candidate premium exceeds budget limit (base-unit comparison)", async () => {
    const expensiveCandidate: CandidateStrategy = {
      ...validCandidate,
      quotes: [{ ...validCandidate.quotes[0], premium: { amountBaseUnits: "5000000", decimals: 6, symbol: "USDC" } }],
      preview: validCandidate.preview ? {
        ...validCandidate.preview,
        premiumAmount: { amountBaseUnits: "5000000", decimals: 6, symbol: "USDC" },
        totalExpectedCost: { amountBaseUnits: "5000000", decimals: 6, symbol: "USDC" },
      } : undefined,
    };
    const decision = await policyEngine.evaluatePolicy(mockIntent, expensiveCandidate);
    expect(decision.overallStatus).toBe("FAIL");
    const pol001 = decision.checks.find((c) => c.ruleId === "POL-001");
    expect(pol001?.status).toBe("FAIL");
  });
});
