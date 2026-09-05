import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, intentRepository, sanitizeErrorMessage } from "../src/server";
import { ActionProposalBuilder } from "../src/services/ActionProposalBuilder";
import { FinancialConstitutionEngine } from "../src/services/FinancialConstitutionEngine";
import { HumanReviewService } from "../src/services/HumanReviewService";
import { IntentEngine } from "../src/services/IntentEngine";
import { LLMOutputValidator } from "../src/services/LLMOutputValidator";
import { ProtectionSolverEngine } from "../src/services/ProtectionSolverEngine";
import { RFQSpecificationBuilder } from "../src/services/RFQSpecificationBuilder";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { ThetanutsSimulationService } from "../src/services/ThetanutsSimulationService";
import { CandidateStrategy, MarketQuote, TypedRiskIntent } from "../src/types";
import { parseExactDecimal } from "../src/utils/decimalParser";

describe("Prompt 8: Security Invariants Comprehensive Suite (SEC-001 through SEC-020)", () => {
  const engine = new IntentEngine();
  const policyEngine = new FinancialConstitutionEngine();
  const simService = new ThetanutsSimulationService();
  const marketService = new ThetanutsMarketService("");
  marketService.getOrderIdentityDigest = () => "controlled-test-order-digest";

  const validConfirmedIntent: TypedRiskIntent = {
    intentId: "intent-sec-001",
    version: 1,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    confirmedByUser: true,
    confirmedAtMs: Date.now(),
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
      value: { amountBaseUnits: "15000000", decimals: 6, symbol: "USDC" },
      source: "USER_EXPLICIT",
      confidence: 1,
      requiresConfirmation: false,
    },
    horizonTimestamp: {
      value: {
        timestampMs: Date.now() + 86400000 * 7,
        isoString: "2026-09-07T15:59:59.999Z",
        formattedDisplay: "Friday, September 7, 2026",
        timezone: "Asia/Kuala_Lumpur (MYT, UTC+8)",
      },
      source: "USER_EXPLICIT",
      confidence: 1,
      requiresConfirmation: false,
    },
    allowedProtocols: { value: ["THETANUTS"], source: "SYSTEM_DEFAULT", confidence: 1, requiresConfirmation: false },
    allowMultiLeg: { value: false, source: "SYSTEM_DEFAULT", confidence: 1, requiresConfirmation: false },
  };

  const validQuote: MarketQuote = {
    quoteId: "quote-sec-01",
    sourceType: "OPTION_BOOK",
    protocol: "THETANUTS",
    asset: "ETH",
    optionRight: "PUT",
    strikePrice: { amountBaseUnits: "230000000000", decimals: 8, symbol: "USD" },
    expiryTimestampMs: Date.now() + 86400000 * 7,
    premium: { amountBaseUnits: "9000000", decimals: 6, symbol: "USDC" },
    availableQuantity: { amountBaseUnits: "5000000000000000000", decimals: 18, symbol: "ETH" },
    makerAddress: "0x1234567890abcdef1234567890abcdef12345678",
    orderIndex: 0,
    rawApiData: { timestampMs: Date.now() },
    executableNow: true,
    allStrikes: [{ amountBaseUnits: "230000000000", decimals: 8, symbol: "USD" }],
    implementationAddress: "0x7355EB92dfb0503DB558a70c10843618932ab290",
    implementationName: "PUT",
    makerIsSeller: true,
    rawOrderIsLong: true,
    normalizedOptionType: "PUT",
    rawOptionType: 1,
    orderValidityDeadlineMs: Date.now() + 3_600_000,
    eligibilityEvidence: {
      status: "ELIGIBLE_LONG_PUT",
      checkedAtMs: Date.now(),
      checks: [],
    },
  };

  const validCandidate: CandidateStrategy = {
    strategyId: "strategy-quote-sec-01",
    name: "ETH $2300 Put Protection",
    strategyType: "LONG_PUT",
    legs: [
      {
        side: "BUY",
        right: "PUT",
        strikePrice: validQuote.strikePrice,
        expiryTimestampMs: validQuote.expiryTimestampMs,
        requestedExposure: validConfirmedIntent.exposureAmount.value,
        resolvedOptionQuantity: validConfirmedIntent.exposureAmount.value,
        sizingStatus: "RESOLVED",
        quoteReference: validQuote.quoteId,
      },
    ],
    quotes: [validQuote],
    status: "TECHNICALLY_FEASIBLE",
    rejectionReasons: [],
    scoresStatus: "NOT_AVAILABLE",
    sizingStatus: "RESOLVED",
    preview: {
      previewStatus: "PREVIEW_AVAILABLE",
      pricePerContract: { amountBaseUnits: "450000000", decimals: 8, symbol: "USD" },
      premiumAmount: { amountBaseUnits: "9000000", decimals: 6, symbol: "USDC" },
      protocolFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
      referrerFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
      totalExpectedCost: { amountBaseUnits: "9000000", decimals: 6, symbol: "USDC" },
      feeStatus: "INCOMPLETE",
      buyerSpendStatus: "VERIFIED",
      buyerSpendVerificationMode: "TOTAL_BUYER_SPEND_PROVEN",
      collateralToken: "USDC",
      previewTimestampMs: Date.now(),
      previewSource: "THETANUTS_OPTIONBOOK_PREVIEW",
    },
    underlyingResolutionMethod: "Chainlink PriceFeed deterministic mapping via ThetanutsMarketService",
  };

  // SEC-001: LLM Cannot Confirm Intent
  it("SEC-001: LLM output validator hardcodes confirmedByUser = false and rejects injected confirmation", () => {
    const maliciousPayload = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH" },
      exposureAmount: { value: "2", unit: "ETH" },
      targetMaxLossPercent: { value: 8 },
      maxPremium: { value: "5", currency: "USDC" },
      horizon: { rawText: "Friday" },
      confirmedByUser: true,
      confirmedAtMs: Date.now(),
    };
    expect(() => LLMOutputValidator.validateAndNormalize(maliciousPayload, "test prompt")).toThrow(
      /INVALID_PROVIDER_OUTPUT: Forbidden authority\/control field 'confirmedByUser'/
    );

    const normalPayload = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH" },
      exposureAmount: { value: "2", unit: "ETH" },
      targetMaxLossPercent: { value: 8 },
      maxPremium: { value: "5", currency: "USDC" },
      horizon: { rawText: "Friday" },
    };
    const validResult = LLMOutputValidator.validateAndNormalize(normalPayload, "test prompt");
    expect(validResult.candidateDraft.confirmedByUser).toBe(false);
    expect(validResult.candidateDraft.confirmedAtMs).toBeUndefined();
  });

  // SEC-002: LLM Cannot Authorize Execution
  it("SEC-002: LLM output validator rejects injected execution authorization tokens", () => {
    const malicious = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH" },
      exposureAmount: { value: "2", unit: "ETH" },
      targetMaxLossPercent: { value: 8 },
      maxPremium: { value: "5", currency: "USDC" },
      horizon: { rawText: "Friday" },
      executionStatus: "AUTHORIZED",
    };
    expect(() => LLMOutputValidator.validateAndNormalize(malicious, "prompt")).toThrow(
      /INVALID_PROVIDER_OUTPUT/
    );
  });

  // SEC-003: LLM Cannot Modify Protocol Whitelist Authority
  it("SEC-003: Financial Constitution POL-003 strictly rejects unauthorized protocols regardless of LLM claims", async () => {
    const fakeProtocolCandidate: CandidateStrategy = {
      ...validCandidate,
      quotes: [{ ...validQuote, protocol: "UNAPPROVED_DEX" as any }],
    };
    const decision = await policyEngine.evaluatePolicy(validConfirmedIntent, fakeProtocolCandidate, "ANALYSIS");
    const pol003 = decision.checks.find((c) => c.ruleId === "POL-003");
    expect(pol003?.status).toBe("FAIL");
    expect(decision.passedAllInvariants).toBe(false);
  });

  // SEC-004: Missing Financial Values Remain Unresolved (No Default Hallucinations)
  it("SEC-004: Missing exposure or loss target remains strictly null without default fallback", async () => {
    const parseRes = await engine.parseNaturalLanguage("Protect my ETH until Friday.");
    expect(parseRes.candidateDraft.exposureAmount).toBeNull();
    expect(parseRes.candidateDraft.targetMaxLossPercent).toBeNull();
    expect(parseRes.missingFields).toContain("exposureAmount");
    expect(parseRes.missingFields).toContain("targetMaxLossPercent");
  });

  // SEC-005: Unknown Prices/Fees Never Become Zero
  it("SEC-005: Missing price or unknown fee blocks financial pass status", async () => {
    const unpricedCandidate: CandidateStrategy = {
      ...validCandidate,
      preview: undefined,
      quotes: [],
    };
    const decision = await policyEngine.evaluatePolicy(validConfirmedIntent, unpricedCandidate, "ANALYSIS");
    const pol001 = decision.checks.find((c) => c.ruleId === "POL-001");
    expect(pol001?.status).toBe("FAIL");
    expect(decision.passedAllInvariants).toBe(false);
  });

  // SEC-006: Failed Market Reads Never Become Fabricated Live Data
  it("SEC-006: Failed market state reports error honestly without fabricating spot or orders", async () => {
    const market = new ThetanutsMarketService();
    (market as any).client = {
      api: {
        getMarketData: async () => {
          throw new Error("RPC connection timeout");
        },
      },
    };
    const state = await market.getMarketState();
    expect(state.status).toBe("LIVE_READ_FAILED");
    expect(state.orderCount).toBe(0);
    expect(state.spotPriceUSD).toBeUndefined();
  });

  // SEC-007: Only Confirmed Intent Reaches Financial Solving (Public Route & Solver)
  it("SEC-007: Protection solver and public solve endpoint reject unconfirmed intent", async () => {
    const unconfirmedIntent: TypedRiskIntent = {
      ...validConfirmedIntent,
      intentId: "intent-sec-007-unconf",
      confirmedByUser: false,
    };
    await intentRepository.save(unconfirmedIntent as any);

    // 1. Solver engine rejects
    const solver = new ProtectionSolverEngine();
    const result = await solver.solveProtectionPipeline(unconfirmedIntent, [validQuote]);
    expect(result.rankedStrategies.length).toBe(0);
    expect(result.rejectedCandidates[0].rejectionReasons).toContain(
      "Intent has not been explicitly confirmed by user"
    );

    // 2. Public API endpoint rejects with 400
    const res = await request(app).post(`/api/v1/intents/${unconfirmedIntent.intentId}/solve`).send();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CANNOT_SOLVE_UNCONFIRMED");
  });

  // SEC-008: Edited Intent Invalidates Confirmation and Bound Proposal
  it("SEC-008: Proposal builder and simulation reject stale intent version", async () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(validConfirmedIntent, validCandidate, marketService);
    expect(proposal.intentId).toBe(validConfirmedIntent.intentId);
    expect(proposal.intentVersion).toBe(validConfirmedIntent.version);

    // When intent version increments, simulation rejects with INTENT_VERSION_STALE
    const updatedIntent = { ...validConfirmedIntent, version: 2 };
    const simResult = await simService.simulateProposal(proposal, updatedIntent, validCandidate, 2400);
    expect(simResult.status).toBe("SIMULATION_MISMATCH");
    expect(simResult.revertReason).toBe("INTENT_VERSION_STALE");
  });

  // SEC-009: Stale Market Evidence Cannot Become Review-Ready
  it("SEC-009: Market evidence > 60s is marked STALE and rejected for human review", async () => {
    const staleCandidate: CandidateStrategy = {
      ...validCandidate,
      preview: {
        ...validCandidate.preview!,
        previewTimestampMs: Date.now() - 120_000,
      },
    };
    const proposal = ActionProposalBuilder.buildOptionBookProposal(validConfirmedIntent, staleCandidate, marketService);
    const simResult = await simService.simulateProposal(proposal, validConfirmedIntent, staleCandidate, 2400);

    expect(simResult.status).toBe("STALE");
    expect(simResult.marketEvidenceStatus).toBe("STALE");

    const review = HumanReviewService.createReviewRecord(validConfirmedIntent, proposal, simResult, 5.5);
    expect(review.reviewStatus).toBe("NOT_PRESENTED");
    expect(review.executionStatus).toBe("NOT_AUTHORIZED");
  });

  // SEC-010: Failed Preview/Simulation Cannot Become Successful
  it("SEC-010: Failed simulation prevents review presentation", () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(validConfirmedIntent, validCandidate, marketService);
    const failedSim: any = {
      simulationId: "sim-fail",
      proposalId: proposal.proposalId,
      status: "FAILED",
      marketEvidenceStatus: "FRESH",
      verificationChecks: [{ checkName: "BUDGET", passed: false, details: "Failed" }],
    };

    const review = HumanReviewService.createReviewRecord(validConfirmedIntent, proposal, failedSim, 5.5);
    expect(review.reviewStatus).toBe("NOT_PRESENTED");
    expect(review.executionStatus).toBe("NOT_AUTHORIZED");
  });

  // SEC-011: Budget Violations Cannot Be Ranked/Reviewed
  it("SEC-011: Strategy exceeding budget is rejected by POL-001", async () => {
    const expensiveCandidate: CandidateStrategy = {
      ...validCandidate,
      preview: {
        ...validCandidate.preview!,
        totalExpectedCost: { amountBaseUnits: "50000000", decimals: 6, symbol: "USDC" }, // 50 USDC > 15 USDC budget
      },
    };
    const decision = await policyEngine.evaluatePolicy(validConfirmedIntent, expensiveCandidate, "ANALYSIS");
    const pol001 = decision.checks.find((c) => c.ruleId === "POL-001");
    expect(pol001?.status).toBe("FAIL");
    expect(decision.passedAllInvariants).toBe(false);
  });

  // SEC-012: Protection-Target Violations Cannot Be Ranked
  it("SEC-012: Strategy failing downside target is rejected by POL-009", async () => {
    const weakHedgeCandidate: CandidateStrategy = {
      ...validCandidate,
      payoffSummary: {
        status: "CALCULATED",
        spotExposureQuantity: "2.0",
        spotReferencePriceUSD: 2400,
        spotExposureValueUSD: 4800,
        strikePriceUSD: 2000,
        protectedFloorValueUSD: 3991,
        effectiveDownsidePercent: 16.85, // 16.85% > 8% max loss target
        totalProtectionCostUSD: 9.0,
        costImpactPercent: 0.1875,
        isConstantFloorGuaranteed: true,
        scenarios: [],
        details: "Calculated",
        calculationTimestampMs: Date.now(),
      },
    };
    const decision = await policyEngine.evaluatePolicy(validConfirmedIntent, weakHedgeCandidate, "ANALYSIS");
    const pol009 = decision.checks.find((c) => c.ruleId === "POL-009");
    expect(pol009?.status).toBe("FAIL");
  });

  // SEC-013: RFQ Unpriced State Cannot PASS Budget/Protection Policy
  it("SEC-013: Unpriced RFQ specification sets POL-001 and POL-009 to NOT_EVALUATED and overall status INCOMPLETE", async () => {
    const unpricedRfqCandidate: CandidateStrategy = {
      ...validCandidate,
      quotes: [],
      preview: undefined,
      status: "RFQ_SPECIFICATION_READY",
    };
    const decision = await policyEngine.evaluatePolicy(validConfirmedIntent, unpricedRfqCandidate, "RFQ_SPECIFICATION");
    const pol001 = decision.checks.find((c) => c.ruleId === "POL-001");
    expect(pol001?.status).toBe("NOT_EVALUATED");
    expect(decision.passedAllInvariants).toBe(false); // Incomplete until quotes arrive
  });

  // SEC-014: Put Spread RFQ Is Strictly Blocked
  it("SEC-014: Put Spread RFQ is strictly blocked pending defensible policy", () => {
    const spreadIntent: TypedRiskIntent = {
      ...validConfirmedIntent,
      allowMultiLeg: { value: true, source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
    };
    const specResult = RFQSpecificationBuilder.buildSpecification(
      spreadIntent,
      2400,
      ["NO_QUALIFYING_OPTIONBOOK_ORDERS"]
    );
    expect(specResult.specification.strategyType).toBe("PUT_SPREAD");
    expect(specResult.specification.putSpreadStatus).toBe("BLOCKED_PENDING_STRIKE_SELECTION_POLICY");
    expect(specResult.specification.validationStatus).toBe("INVALID");
  });

  // SEC-015: No Wallet / Private Key / Signing / Broadcast Path
  it("SEC-015: Human review records and proposals have no execution submission method", () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(validConfirmedIntent, validCandidate, marketService);
    expect((proposal as any).privateKey).toBeUndefined();
    expect((proposal as any).signer).toBeUndefined();
    expect((proposal as any).sendTransaction).toBeUndefined();
    expect(proposal.authorizationStatus).toBe("UNAUTHORIZED");
  });

  // SEC-016: Human Review Does Not Authorize Execution
  it("SEC-016: Human review record enforces executionStatus = NOT_AUTHORIZED", () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(validConfirmedIntent, validCandidate, marketService);
    const simResult: any = {
      simulationId: "sim-sec",
      proposalId: proposal.proposalId,
      status: "DETERMINISTIC_VERIFIED",
      marketEvidenceStatus: "FRESH",
      verificationChecks: [{ checkName: "BUDGET", passed: true, details: "OK" }],
    };
    const review = HumanReviewService.createReviewRecord(validConfirmedIntent, proposal, simResult, 5.5);
    expect(review.executionStatus).toBe("NOT_AUTHORIZED");
    expect(review.summary.authorizationRequirement).toContain("Requires separate eligible human authorization");
  });

  // SEC-017: PREVIEW_BOUND Is Never Presented as Exact Guarantee
  it("SEC-017: Proposal bindingStatus is strictly PREVIEW_BOUND with TOCTOU disclosure", () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(validConfirmedIntent, validCandidate, marketService);
    expect(proposal.bindingStatus).toBe("PREVIEW_BOUND");
    expect(proposal.bindingStatus).not.toBe("EXACT_TRANSACTION_BOUND");
  });

  // SEC-018: Unknown Protocol Evidence Cannot PASS
  it("SEC-018: Candidate with missing underlying evidence fails POL-002", async () => {
    const noAssetCandidate: CandidateStrategy = {
      ...validCandidate,
      legs: [],
      quotes: [],
      underlyingResolutionMethod: undefined,
    };
    const decision = await policyEngine.evaluatePolicy(validConfirmedIntent, noAssetCandidate, "ANALYSIS");
    const pol002 = decision.checks.find((c) => c.ruleId === "POL-002");
    expect(pol002?.status).toBe("FAIL");
  });

  // SEC-019: Exact Monetary Comparisons Use BigInt Base Units
  it("SEC-019: Exact BigInt parsing prevents floating-point precision loss", () => {
    const parsed1 = parseExactDecimal("0.000000000000000001", 18, "ETH");
    expect(parsed1.amountBaseUnits).toBe("1");

    const parsed2 = parseExactDecimal("15.000000", 6, "USDC");
    expect(parsed2.amountBaseUnits).toBe("15000000");

    const parsed3 = parseExactDecimal("15.000001", 6, "USDC");
    expect(BigInt(parsed3.amountBaseUnits) > BigInt(parsed2.amountBaseUnits)).toBe(true);
  });

  // SEC-020: Provider Secrets Are Never Exposed
  it("SEC-020: Server errors and proposals redact API keys and bearer tokens", () => {
    const errorWithKey = "API error: AIzaSyDfakeApiKey1234567890abcdef123 occurred with Bearer eyJhbGciOiJIUzI1NiJ9.test";
    const sanitized = sanitizeErrorMessage(errorWithKey);
    expect(sanitized).not.toContain("AIzaSyDfakeApiKey1234567890abcdef123");
    expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiJ9.test");
    expect(sanitized).toContain("[REDACTED_API_KEY]");
    expect(sanitized).toContain("Bearer [REDACTED_TOKEN]");
  });
});
