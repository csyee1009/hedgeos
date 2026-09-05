import { describe, expect, it } from "vitest";
import { FinancialConstitutionEngine } from "../src/services/FinancialConstitutionEngine";
import { ProtectionSolverEngine } from "../src/services/ProtectionSolverEngine";
import { RFQRequirementEngine } from "../src/services/RFQRequirementEngine";
import { RFQSpecificationBuilder } from "../src/services/RFQSpecificationBuilder";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { CandidateStrategy, MarketQuote, TypedRiskIntent } from "../src/types";

describe("Prompt 4 Repair: RFQ Honesty + Policy Semantics Suite", () => {
  const policyEngine = new FinancialConstitutionEngine();
  const marketService = new ThetanutsMarketService("https://mainnet.base.org");
  const solver = new ProtectionSolverEngine(marketService, policyEngine);

  const mockEthIntent: TypedRiskIntent = {
    intentId: "intent-p4-eth",
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
    targetMaxLossPercent: { value: 10, source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
    maxPremiumUSDC: {
      value: { amountBaseUnits: "20000000", decimals: 6, symbol: "USDC" }, // 20 USDC budget
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
    horizonTimestamp: {
      value: { timestampMs: Date.now() + 7 * 86400 * 1000, isoString: "2026-09-07T15:59:59.999Z", formattedDisplay: "Monday, 7 September 2026", timezone: "UTC" },
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
    allowedProtocols: { value: ["THETANUTS"], source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
    allowMultiLeg: { value: false, source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
  };

  const eligibleQuote: MarketQuote = {
    quoteId: "quote-eligible-ob",
    sourceType: "OPTION_BOOK",
    protocol: "THETANUTS",
    asset: "ETH",
    optionRight: "PUT",
    strikePrice: { amountBaseUnits: "235000000000", decimals: 8, symbol: "USD" },
    expiryTimestampMs: Date.now() + 7 * 86400 * 1000,
    premium: { amountBaseUnits: "9100000", decimals: 6, symbol: "USDC" },
    availableQuantity: { amountBaseUnits: "10000000000", decimals: 6, symbol: "USDC" },
    executableNow: true,
  };

  it("Requirement 1: Missing or invalid spot price prevents strike derivation without inventing 2400", () => {
    const specResult = RFQSpecificationBuilder.buildSpecification(
      mockEthIntent,
      0, // Zero / unavailable spot price
      ["NO_MATCHING_STRIKE"],
      marketService
    );

    expect(specResult.specification.validationStatus).toBe("INVALID");
    expect(specResult.specification.validationErrors).toContain(
      "Live market spot price is unavailable; cannot derive target strike."
    );
    expect(specResult.specification.targetStrikeEstimateUSD).toBe(0);
    expect(specResult.specification.strikes.length).toBe(0);
  });

  it("Requirement 2: Missing target max loss prevents strike derivation without inventing 8%", () => {
    const incompleteIntent: any = {
      ...mockEthIntent,
      targetMaxLossPercent: null,
    };

    const specResult = RFQSpecificationBuilder.buildSpecification(
      incompleteIntent,
      2500.0,
      ["NO_MATCHING_STRIKE"],
      marketService
    );

    expect(specResult.specification.validationStatus).toBe("INVALID");
    expect(specResult.specification.validationErrors).toContain(
      "Target max loss percentage is missing from confirmed intent."
    );
  });

  it("Requirement 3: Missing or past horizon prevents expiry without inventing now + 7 days", () => {
    const pastIntent: any = {
      ...mockEthIntent,
      horizonTimestamp: { value: { timestampMs: Date.now() - 10000 } },
    };

    const specResult = RFQSpecificationBuilder.buildSpecification(
      pastIntent,
      2500.0,
      ["NO_MATCHING_EXPIRY"],
      marketService
    );

    expect(specResult.specification.validationStatus).toBe("INVALID");
    expect(specResult.specification.validationErrors).toContain(
      "Confirmed protection horizon is missing or in the past."
    );
  });

  it("Requirement 4: Multi-leg permission (allowMultiLeg = true) alone does NOT trigger ATOMIC_STRUCTURE_NOT_AVAILABLE", () => {
    const multiLegAllowedIntent: TypedRiskIntent = {
      ...mockEthIntent,
      allowMultiLeg: { value: true, source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
    };

    const analysis = RFQRequirementEngine.evaluateRequirement(multiLegAllowedIntent, [], []);
    expect(analysis.status).toBe("REQUIRED");
    // Should NOT automatically push ATOMIC_STRUCTURE_NOT_AVAILABLE when only permission was granted
    expect(analysis.reasons).not.toContain("ATOMIC_STRUCTURE_NOT_AVAILABLE");
    expect(analysis.reasons).toContain("NO_QUALIFYING_OPTIONBOOK_ORDERS");
  });

  it("Requirement 5: Put Spread RFQ lower strike is NOT arbitrarily 2x; blocks pending explicit strike selection policy", () => {
    const spreadIntent: TypedRiskIntent = {
      ...mockEthIntent,
      allowMultiLeg: { value: true, source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
    };

    const specResult = RFQSpecificationBuilder.buildSpecification(
      spreadIntent,
      2500.0,
      ["NO_MATCHING_STRIKE"],
      marketService
    );

    expect(specResult.specification.strategyType).toBe("PUT_SPREAD");
    expect(specResult.specification.putSpreadStatus).toBe("BLOCKED_PENDING_STRIKE_SELECTION_POLICY");
    expect(specResult.specification.validationStatus).toBe("INVALID");
    expect(specResult.specification.validationErrors).toContain(
      "Put Spread RFQ lower strike selection policy is not verified; blocked pending explicit strike selection policy."
    );
  });

  it("Requirement 6: Structural RFQ validity (VALID) is separated from financial policy (INCOMPLETE)", async () => {
    const specResult = RFQSpecificationBuilder.buildSpecification(
      mockEthIntent,
      2500.0,
      ["NO_MATCHING_STRIKE"],
      marketService
    );

    // 1. Structural specification is VALID
    expect(specResult.specification.validationStatus).toBe("VALID");
    expect(specResult.specification.validationErrors.length).toBe(0);

    // 2. Financial policy evaluation for unpriced RFQ specification is INCOMPLETE (never falsely marked PASS)
    const rfqCand: CandidateStrategy = {
      strategyId: "strat-rfq-test",
      name: "Custom Long Put",
      strategyType: "LONG_PUT",
      legs: specResult.candidateLegs,
      quotes: [],
      status: "RFQ_SPECIFICATION_READY",
      rejectionReasons: [],
      scoresStatus: "NOT_AVAILABLE",
      sizingStatus: "RESOLVED",
      ...( { underlying: "ETH", protocol: "THETANUTS" } as any ),
    };

    const decision = await policyEngine.evaluatePolicy(mockEthIntent, rfqCand, "RFQ_SPECIFICATION");
    expect(decision.overallStatus).toBe("INCOMPLETE");
    expect(decision.passedAllInvariants).toBe(false);

    // Material financial checks are NOT_EVALUATED pending quotes
    expect(decision.checks.find((c) => c.ruleId === "POL-001")?.status).toBe("NOT_EVALUATED");
    expect(decision.checks.find((c) => c.ruleId === "POL-009")?.status).toBe("NOT_EVALUATED");
  });

  it("Requirement 7 & 8: Policy evidence must come from candidate/spec; never defaults asset or protocol from intent", async () => {
    // Candidate without asset evidence
    const noAssetCand: CandidateStrategy = {
      strategyId: "strat-no-asset",
      name: "Bad Candidate",
      strategyType: "LONG_PUT",
      legs: [],
      quotes: [],
      status: "MARKET_FEASIBLE",
      rejectionReasons: [],
      scoresStatus: "NOT_AVAILABLE",
      sizingStatus: "RESOLVED",
    };

    const decision = await policyEngine.evaluatePolicy(mockEthIntent, noAssetCand, "ANALYSIS");
    const pol002 = decision.checks.find((c) => c.ruleId === "POL-002");
    expect(pol002?.status).toBe("FAIL");
    expect(pol002?.details).toContain("Candidate provides no underlying asset evidence");

    const pol003 = decision.checks.find((c) => c.ruleId === "POL-003");
    expect(pol003?.status).toBe("FAIL");
    expect(pol003?.details).toContain("Candidate provides no protocol provenance evidence");
  });

  it("Requirement 9: POL-008 (Sizing) and POL-009 (Protection Target) always exist in policy checks", async () => {
    const unpricedCand: CandidateStrategy = {
      strategyId: "strat-unpriced",
      name: "Unpriced Cand",
      strategyType: "LONG_PUT",
      legs: [],
      quotes: [{ ...eligibleQuote }],
      status: "MARKET_FEASIBLE",
      rejectionReasons: [],
      scoresStatus: "NOT_AVAILABLE",
      sizingStatus: "NOT_RESOLVED",
      ...( { underlying: "ETH", protocol: "THETANUTS" } as any ),
    };

    const decision = await policyEngine.evaluatePolicy(mockEthIntent, unpricedCand, "ANALYSIS");
    const pol008 = decision.checks.find((c) => c.ruleId === "POL-008");
    expect(pol008).toBeDefined();
    expect(pol008?.status).toBe("FAIL");

    const pol009 = decision.checks.find((c) => c.ruleId === "POL-009");
    expect(pol009).toBeDefined();
    expect(pol009?.status).toBe("NOT_EVALUATED");
  });

  it("Requirement 10: Honest sealed-bid RFQQuote normalization contains no fake numbers for unrevealed quotes", async () => {
    const quotes = await marketService.normalizeExistingRFQQuotes(mockEthIntent);
    expect(Array.isArray(quotes)).toBe(true);

    for (const q of quotes) {
      if (q.quoteStatus === "PENDING_REVEAL") {
        expect(q.pricingStatus).toBe("NOT_AVAILABLE");
        expect((q as any).premium).toBeUndefined();
        expect((q as any).totalExpectedCost).toBeUndefined();
      } else {
        expect(q.pricingStatus).toBe("AVAILABLE");
        expect(q.premium).toBeDefined();
        expect(q.totalExpectedCost).toBeDefined();
      }
    }
  }, 15000);

  it("Requirement 11: Priced atomic spread evaluates real net cost in Financial Constitution", async () => {
    const pricedSpreadCand: CandidateStrategy = {
      strategyId: "strat-spread-priced",
      name: "Priced Spread",
      strategyType: "PUT_SPREAD",
      legs: [
        {
          side: "SELL",
          right: "PUT",
          strikePrice: { amountBaseUnits: "200000000000", decimals: 8, symbol: "USD" },
          expiryTimestampMs: mockEthIntent.horizonTimestamp.value.timestampMs + 86400000,
          requestedExposure: mockEthIntent.exposureAmount.value,
          resolvedOptionQuantity: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "CONTRACTS" },
          sizingStatus: "RESOLVED",
          quoteReference: "leg-1",
        },
        {
          side: "BUY",
          right: "PUT",
          strikePrice: { amountBaseUnits: "230000000000", decimals: 8, symbol: "USD" },
          expiryTimestampMs: mockEthIntent.horizonTimestamp.value.timestampMs + 86400000,
          requestedExposure: mockEthIntent.exposureAmount.value,
          resolvedOptionQuantity: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "CONTRACTS" },
          sizingStatus: "RESOLVED",
          quoteReference: "leg-2",
        },
      ],
      quotes: [{ ...eligibleQuote, premium: { amountBaseUnits: "12000000", decimals: 6, symbol: "USDC" } }],
      preview: {
        previewStatus: "PREVIEW_AVAILABLE",
        pricePerContract: { amountBaseUnits: "600000000", decimals: 8, symbol: "USD" },
        premiumAmount: { amountBaseUnits: "12000000", decimals: 6, symbol: "USDC" },
        protocolFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
        referrerFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
        totalExpectedCost: { amountBaseUnits: "12000000", decimals: 6, symbol: "USDC" }, // 12 USDC <= 20 USDC budget
        feeStatus: "INCOMPLETE",
        buyerSpendStatus: "VERIFIED",
        buyerSpendVerificationMode: "TOTAL_BUYER_SPEND_PROVEN",
        collateralToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        previewTimestampMs: Date.now(),
        previewSource: "THETANUTS_MM_PRICING",
      },
      status: "MARKET_FEASIBLE",
      rejectionReasons: [],
      scoresStatus: "NOT_AVAILABLE",
      sizingStatus: "RESOLVED",
      liquiditySufficient: true,
      ...( { underlying: "ETH", protocol: "THETANUTS" } as any ),
    };

    const multiLegIntent: TypedRiskIntent = {
      ...mockEthIntent,
      allowMultiLeg: { value: true, source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
    };

    const decision = await policyEngine.evaluatePolicy(multiLegIntent, pricedSpreadCand, "ANALYSIS");
    const pol001 = decision.checks.find((c) => c.ruleId === "POL-001");
    expect(pol001?.status).toBe("PASS");
    expect(pol001?.details).toContain("Normalized premium (12000000) <= Normalized budget (20000000)");
  });

  it("Requirement 12: OptionFactory address resolves from SDK configuration & proposal remains UNAUTHORIZED / NOT_SUBMITTED", () => {
    const factoryAddress = marketService.getOptionFactoryAddress();
    expect(factoryAddress).toBe("0x8118daD971dEbffB49B9280047659174128A8B94");

    const specResult = RFQSpecificationBuilder.buildSpecification(
      mockEthIntent,
      2500.0,
      ["NO_QUALIFYING_OPTIONBOOK_ORDERS"],
      marketService
    );

    const proposal = specResult.actionProposal;
    expect(proposal.targetContract).toBe(factoryAddress);
    expect(proposal.authorizationStatus).toBe("UNAUTHORIZED");
    expect(proposal.submissionStatus).toBe("NOT_SUBMITTED");
    expect(proposal.requiredMethod).toBe("requestForQuotation");
  });
});
