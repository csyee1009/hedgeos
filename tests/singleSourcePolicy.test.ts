import { describe, expect, it } from "vitest";
import { MOCK_OPTION_BOOK_QUOTES } from "../src/fixtures/mockQuotes";
import { FinancialConstitutionEngine } from "../src/services/FinancialConstitutionEngine";
import { CandidateStrategy, TypedRiskIntent } from "../src/types";

describe("FinancialConstitutionEngine Symbol Verification & Decimal Normalization Tests", () => {
  const policyEngine = new FinancialConstitutionEngine();
  const validQuote = MOCK_OPTION_BOOK_QUOTES[0];

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-test-policy-units",
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
    strategyId: "strategy-valid-units",
    name: "Long Put Protection",
    strategyType: "LONG_PUT",
    legs: [
      {
        side: "BUY",
        right: "PUT",
        strikePrice: validQuote.strikePrice,
        expiryTimestampMs: validQuote.expiryTimestampMs,
        requestedExposure: mockIntent.exposureAmount.value,
        sizingStatus: "NOT_RESOLVED",
        quoteReference: validQuote.quoteId,
      },
    ],
    quotes: [validQuote],
    status: "SIZING_UNRESOLVED",
    rejectionReasons: [],
    scoresStatus: "NOT_AVAILABLE",
    sizingStatus: "NOT_RESOLVED",
  };

  it("Test 4: Different premium/budget token symbols cannot pass POL-001", async () => {
    const symbolMismatchCandidate: CandidateStrategy = {
      ...validCandidate,
      quotes: [{ ...validQuote, premium: { amountBaseUnits: "2700000", decimals: 6, symbol: "WETH" } }],
    };

    const decision = await policyEngine.evaluatePolicy(mockIntent, symbolMismatchCandidate);
    expect(decision.overallStatus).toBe("FAIL");
    const pol001 = decision.checks.find((c) => c.ruleId === "POL-001");
    expect(pol001?.status).toBe("FAIL");
    expect(pol001?.details).toContain("Denomination mismatch");
  });

  it("Test 5: Different decimal scales are handled safely and normalized via BigInt scaling", async () => {
    const normalizedCandidate: CandidateStrategy = {
      ...validCandidate,
      quotes: [
        {
          ...validQuote,
          premium: { amountBaseUnits: "2700000000000000000", decimals: 18, symbol: "USDC" },
        },
      ],
    };

    const decision = await policyEngine.evaluatePolicy(mockIntent, normalizedCandidate);
    const pol001 = decision.checks.find((c) => c.ruleId === "POL-001");
    expect(pol001?.status).toBe("PASS");
    expect(pol001?.details).toContain("Normalized premium");
  });
});
