import { describe, expect, it } from "vitest";
import { FinancialConstitutionEngine } from "../src/services/FinancialConstitutionEngine";
import { CandidateStrategy, TypedRiskIntent } from "../src/types";

describe("FinancialConstitutionEngine Prompt 3 Invariants Tests", () => {
  const policyEngine = new FinancialConstitutionEngine();

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-p3-policy",
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
      value: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" }, // 10 USDC
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
    allowMultiLeg: { value: false, source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
  };

  const validCandidate: CandidateStrategy = {
    strategyId: "strategy-live-put-001",
    name: "Long Put Protection ($2260 Strike)",
    strategyType: "LONG_PUT",
    legs: [
      {
        side: "BUY",
        right: "PUT",
        strikePrice: { amountBaseUnits: "226000000000", decimals: 8, symbol: "USD" },
        expiryTimestampMs: Date.now() + 7 * 24 * 3600 * 1000,
        requestedExposure: mockIntent.exposureAmount.value,
        resolvedOptionQuantity: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "CONTRACTS" },
        sizingStatus: "RESOLVED",
        quoteReference: "ob-quote-1",
      },
    ],
    quotes: [
      {
        quoteId: "ob-quote-1",
        sourceType: "OPTION_BOOK",
        protocol: "THETANUTS",
        asset: "ETH",
        optionRight: "PUT",
        strikePrice: { amountBaseUnits: "226000000000", decimals: 8, symbol: "USD" },
        expiryTimestampMs: Date.now() + 7 * 24 * 3600 * 1000,
        premium: { amountBaseUnits: "9100000", decimals: 6, symbol: "USDC" },
        availableQuantity: { amountBaseUnits: "10000000000", decimals: 6, symbol: "USDC" },
        executableNow: true,
      },
    ],
    status: "TECHNICALLY_FEASIBLE",
    rejectionReasons: [],
    scoresStatus: "EVALUATED",
    sizingStatus: "RESOLVED",
    liquiditySufficient: true,
    preview: {
      previewStatus: "PREVIEW_AVAILABLE",
      pricePerContract: { amountBaseUnits: "455000000", decimals: 8, symbol: "USD" },
      premiumAmount: { amountBaseUnits: "9100000", decimals: 6, symbol: "USDC" },
      protocolFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
      referrerFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
      totalExpectedCost: { amountBaseUnits: "9100000", decimals: 6, symbol: "USDC" }, // 9.10 USDC <= 10.00 USDC
      feeStatus: "ZERO_VERIFIED",
      collateralToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      previewTimestampMs: Date.now(),
      previewSource: "THETANUTS_OPTIONBOOK_PREVIEW",
    },
  };

  it("should pass POL-001 when total expected preview cost is within budget", async () => {
    const decision = await policyEngine.evaluatePolicy(mockIntent, validCandidate);
    const pol001 = decision.checks.find((c) => c.ruleId === "POL-001");
    expect(pol001?.status).toBe("PASS");
    expect(pol001?.details).toContain("9100000");
  });

  it("should fail POL-001 when preview cost exceeds budget", async () => {
    const expensiveCandidate: CandidateStrategy = {
      ...validCandidate,
      preview: {
        ...validCandidate.preview!,
        totalExpectedCost: { amountBaseUnits: "15000000", decimals: 6, symbol: "USDC" }, // 15 USDC > 10 USDC
      },
    };

    const decision = await policyEngine.evaluatePolicy(mockIntent, expensiveCandidate);
    expect(decision.overallStatus).toBe("FAIL");
    const pol001 = decision.checks.find((c) => c.ruleId === "POL-001");
    expect(pol001?.status).toBe("FAIL");
  });

  it("should pass POL-005 only when intent is confirmed by user", async () => {
    const unconfirmedIntent: TypedRiskIntent = {
      ...mockIntent,
      confirmedByUser: false,
    };

    const decision = await policyEngine.evaluatePolicy(unconfirmedIntent, validCandidate);
    expect(decision.overallStatus).toBe("FAIL");
    const pol005 = decision.checks.find((c) => c.ruleId === "POL-005");
    expect(pol005?.status).toBe("FAIL");
  });
});
