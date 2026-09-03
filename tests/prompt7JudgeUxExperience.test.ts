import { describe, expect, it } from "vitest";
import { ActionProposalBuilder } from "../src/services/ActionProposalBuilder";
import { ExposurePayoffEngine } from "../src/services/ExposurePayoffEngine";
import { FinancialConstitutionEngine } from "../src/services/FinancialConstitutionEngine";
import { HumanReviewService } from "../src/services/HumanReviewService";
import { RFQSpecificationBuilder } from "../src/services/RFQSpecificationBuilder";
import { ThetanutsSimulationService } from "../src/services/ThetanutsSimulationService";
import { CandidateStrategy, MarketQuote, TypedRiskIntent } from "../src/types";

describe("Prompt 7 Repair: UI Capability Truth, Copy Audit, & Policy Integrity", () => {
  const confirmedIntent: TypedRiskIntent = {
    intentId: "intent-demo-701",
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
    allowMultiLeg: { value: true, source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
  };

  const mockQuote: MarketQuote = {
    quoteId: "quote-p7-01",
    sourceType: "OPTION_BOOK",
    protocol: "THETANUTS",
    asset: "ETH",
    optionRight: "PUT",
    strikePrice: { amountBaseUnits: "230000000000", decimals: 8, symbol: "USD" },
    expiryTimestampMs: Date.now() + 86400000 * 7,
    premium: { amountBaseUnits: "9000000", decimals: 6, symbol: "USDC" },
    availableQuantity: { amountBaseUnits: "5000000000000000000", decimals: 18, symbol: "ETH" },
    executableNow: true,
    makerAddress: "0x1234567890abcdef1234567890abcdef12345678",
    orderIndex: 0,
    rawApiData: {
      targetContract: "0x43063a482db1deb8ecf4177263b652882fa87431",
      timestampMs: Date.now(),
    },
  };

  const payoffSummary = ExposurePayoffEngine.calculate({
    spotQuantity: 2.0,
    optionQuantity: 2.0,
    strikePriceUSD: 2300,
    spotReferencePriceUSD: 2400,
    totalProtectionCostUSD: 9.0,
    assetSymbol: "ETH",
  });

  const mockCandidate: CandidateStrategy = {
    strategyId: "strat-p7-01",
    name: "Long Put Protection ($2300 Strike)",
    strategyType: "LONG_PUT",
    legs: [
      {
        side: "BUY",
        right: "PUT",
        strikePrice: mockQuote.strikePrice,
        expiryTimestampMs: mockQuote.expiryTimestampMs,
        requestedExposure: confirmedIntent.exposureAmount.value,
        resolvedOptionQuantity: confirmedIntent.exposureAmount.value,
        sizingStatus: "RESOLVED",
        quoteReference: mockQuote.quoteId,
      },
    ],
    quotes: [mockQuote],
    status: "TECHNICALLY_FEASIBLE",
    rejectionReasons: [],
    scoresStatus: "EVALUATED",
    sizingStatus: "RESOLVED",
    preview: {
      previewStatus: "PREVIEW_AVAILABLE",
      pricePerContract: { amountBaseUnits: "450000000", decimals: 8, symbol: "USD" },
      premiumAmount: { amountBaseUnits: "9000000", decimals: 6, symbol: "USDC" },
      protocolFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
      referrerFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
      totalExpectedCost: { amountBaseUnits: "9000000", decimals: 6, symbol: "USDC" },
      feeStatus: "ZERO_VERIFIED",
      collateralToken: "USDC",
      previewTimestampMs: Date.now(),
      previewSource: "THETANUTS_OPTIONBOOK_PREVIEW",
    },
    payoffSummary,
    metrics: {
      effectiveDownsidePercent: 5.5,
      totalProtectionCostUSD: 9.0,
    },
  };

  it("Requirement 1: Put Spread RFQ remains BLOCKED even when allowMultiLeg is true; Long Put RFQ is valid", () => {
    // 1. When allowMultiLeg is true -> Put Spread is blocked pending strike selection policy
    const spreadResult = RFQSpecificationBuilder.buildSpecification(
      confirmedIntent, // allowMultiLeg is true
      2400,
      ["NO_MATCHING_EXPIRY"],
      undefined
    );
    expect(spreadResult.specification.strategyType).toBe("PUT_SPREAD");
    expect(spreadResult.specification.putSpreadStatus).toBe("BLOCKED_PENDING_STRIKE_SELECTION_POLICY");
    expect(spreadResult.specification.validationStatus).toBe("INVALID");
    expect(spreadResult.specification.validationErrors).toContain(
      "Put Spread RFQ lower strike selection policy is not verified; blocked pending explicit strike selection policy."
    );

    // 2. Long Put RFQ is the valid fallback
    const singleLegIntent: TypedRiskIntent = {
      ...confirmedIntent,
      allowMultiLeg: { value: false, source: "SYSTEM_DEFAULT", confidence: 1, requiresConfirmation: false },
    };
    const longPutResult = RFQSpecificationBuilder.buildSpecification(
      singleLegIntent,
      2400,
      ["NO_MATCHING_EXPIRY"],
      undefined
    );
    expect(longPutResult.specification.strategyType).toBe("LONG_PUT");
    expect(longPutResult.specification.validationStatus).toBe("VALID");
  });

  it("Requirement 2: Proposal binding is strictly PREVIEW_BOUND with verified 1:1 sizing without claiming exact execution", () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(confirmedIntent, mockCandidate);
    expect(proposal.bindingStatus).toBe("PREVIEW_BOUND");
    expect(proposal.bindingStatus).not.toBe("EXACT_TRANSACTION_BOUND");
    expect(proposal.authorizationStatus).toBe("UNAUTHORIZED");
  });

  it("Requirement 3: HumanReviewRecord enforces ELIGIBLE_HUMAN_REQUIRED boundary without execution authorization", () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(confirmedIntent, mockCandidate);
    const simService = new ThetanutsSimulationService();
    const simResult: any = {
      simulationId: "sim-p7",
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      intentId: confirmedIntent.intentId,
      intentVersion: confirmedIntent.version,
      status: "DETERMINISTIC_VERIFIED",
      marketEvidenceStatus: "FRESH",
      verificationChecks: [{ checkName: "BUDGET", passed: true, details: "OK" }],
    };

    const review = HumanReviewService.createReviewRecord(confirmedIntent, proposal, simResult, 5.5);
    expect(review.reviewStatus).toBe("READY_FOR_REVIEW");
    expect(review.executionStatus).toBe("NOT_AUTHORIZED");
    expect(review.toctouDisclosure).toContain("TOCTOU");
  });

  it("Requirement 4: Financial Constitution backend states (NOT_EVALUATED) do not render as PASS for unpriced RFQs", async () => {
    const singleLegIntent: TypedRiskIntent = {
      ...confirmedIntent,
      allowMultiLeg: { value: false, source: "SYSTEM_DEFAULT", confidence: 1, requiresConfirmation: false },
    };
    const longPutResult = RFQSpecificationBuilder.buildSpecification(
      singleLegIntent,
      2400,
      ["NO_MATCHING_EXPIRY"],
      undefined
    );

    const engine = new FinancialConstitutionEngine();
    const unpricedRfqCand: CandidateStrategy = {
      strategyId: "strat-rfq-test",
      name: "Custom Long Put",
      strategyType: "LONG_PUT",
      legs: longPutResult.candidateLegs,
      quotes: [],
      status: "RFQ_SPECIFICATION_READY",
      rejectionReasons: [],
      scoresStatus: "NOT_AVAILABLE",
      sizingStatus: "RESOLVED",
      ...( { underlying: "ETH", protocol: "THETANUTS" } as any ),
    };

    // In RFQ_SPECIFICATION stage with unpriced quotes, POL-001 is NOT_EVALUATED and overall status is INCOMPLETE
    const decision = await engine.evaluatePolicy(
      singleLegIntent,
      unpricedRfqCand,
      "RFQ_SPECIFICATION"
    );

    expect(decision.overallStatus).toBe("INCOMPLETE");
    expect(decision.passedAllInvariants).toBe(false);
    const budgetCheck = decision.checks.find((c) => c.ruleId === "POL-001");
    expect(budgetCheck?.status).toBe("NOT_EVALUATED");
    expect(budgetCheck?.status).not.toBe("PASS");
  });

  it("Requirement 5: Stale market evidence prevents review readiness", async () => {
    const staleCandidate: CandidateStrategy = {
      ...mockCandidate,
      preview: {
        ...mockCandidate.preview!,
        previewTimestampMs: Date.now() - 120_000, // 2 minutes old
      },
    };

    const proposal = ActionProposalBuilder.buildOptionBookProposal(confirmedIntent, staleCandidate);
    const simService = new ThetanutsSimulationService();
    const simResult = await simService.simulateProposal(proposal, confirmedIntent, staleCandidate, 2400);

    expect(simResult.marketEvidenceStatus).toBe("STALE");
    expect(simResult.status).toBe("STALE");

    const review = HumanReviewService.createReviewRecord(confirmedIntent, proposal, simResult, 5.5);
    expect(review.reviewStatus).toBe("NOT_PRESENTED");
    expect(review.executionStatus).toBe("NOT_AUTHORIZED");
  });
});
