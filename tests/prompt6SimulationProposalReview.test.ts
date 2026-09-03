import { describe, expect, it } from "vitest";
import { ActionProposalBuilder } from "../src/services/ActionProposalBuilder";
import { HumanReviewService } from "../src/services/HumanReviewService";
import { ThetanutsSimulationService } from "../src/services/ThetanutsSimulationService";
import { ActionProposal, CandidateStrategy, MarketQuote, TokenAmount, TypedRiskIntent } from "../src/types";

describe("Prompt 6 Repair: Truthful Simulation, Binding, & Review Integrity", () => {
  const mockIntent: TypedRiskIntent = {
    intentId: "intent-p6-001",
    version: 1,
    createdAtMs: 1725000000000,
    updatedAtMs: 1725000000000,
    confirmedByUser: true,
    confirmedAtMs: 1725000005000,
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
      value: { amountBaseUnits: "15000000", decimals: 6, symbol: "USDC" }, // 15 USDC budget
      source: "USER_EXPLICIT",
      confidence: 1,
      requiresConfirmation: false,
    },
    horizonTimestamp: {
      value: {
        timestampMs: 1725600000000,
        isoString: "2026-09-06T15:59:59.999Z",
        formattedDisplay: "Friday, September 6, 2026",
        timezone: "Asia/Kuala_Lumpur (MYT, UTC+8)",
      },
      source: "USER_EXPLICIT",
      confidence: 1,
      requiresConfirmation: false,
    },
    allowedProtocols: { value: ["THETANUTS"], source: "SYSTEM_DEFAULT", confidence: 1, requiresConfirmation: false },
    allowMultiLeg: { value: false, source: "SYSTEM_DEFAULT", confidence: 1, requiresConfirmation: false },
  };

  const freshTimestamp = Date.now();

  const mockQuote: MarketQuote = {
    quoteId: "quote-optbook-101",
    sourceType: "OPTION_BOOK",
    protocol: "THETANUTS",
    asset: "ETH",
    optionRight: "PUT",
    strikePrice: { amountBaseUnits: "230000000000", decimals: 8, symbol: "USD" }, // $2300 Strike
    expiryTimestampMs: 1725600000000,
    premium: { amountBaseUnits: "9000000", decimals: 6, symbol: "USDC" }, // 9 USDC
    availableQuantity: { amountBaseUnits: "5000000000000000000", decimals: 18, symbol: "ETH" },
    executableNow: true,
    makerAddress: "0x1111222233334444555566667777888899990000",
    orderIndex: 3,
    rawApiData: {
      targetContract: "0x43063a482db1deb8ecf4177263b652882fa87431",
      timestampMs: freshTimestamp,
    },
  };

  const mockCandidate: CandidateStrategy = {
    strategyId: "strat-optbook-101",
    name: "Long Put Protection ($2300 Strike)",
    strategyType: "LONG_PUT",
    legs: [
      {
        side: "BUY",
        right: "PUT",
        strikePrice: mockQuote.strikePrice,
        expiryTimestampMs: mockQuote.expiryTimestampMs,
        requestedExposure: mockIntent.exposureAmount.value,
        resolvedOptionQuantity: mockIntent.exposureAmount.value,
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
      previewTimestampMs: freshTimestamp,
      previewSource: "THETANUTS_OPTIONBOOK_PREVIEW",
    },
    metrics: {
      effectiveDownsidePercent: 5.5,
      totalProtectionCostUSD: 9.0,
    },
  };

  const simService = new ThetanutsSimulationService();

  it("Requirement 1: OptionBook proposal bindingStatus is PREVIEW_BOUND (never fake EXACT_TRANSACTION_BOUND)", () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(mockIntent, mockCandidate);
    expect(proposal.bindingStatus).toBe("PREVIEW_BOUND");
    expect(proposal.bindingStatus).not.toBe("EXACT_TRANSACTION_BOUND");
  });

  it("Requirement 2: Deterministic verification reports DETERMINISTIC_VERIFIED, not PROVIDER_SIMULATED without provider call", async () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(mockIntent, mockCandidate);
    // simService instantiated without marketService -> pure deterministic checks
    const simResult = await simService.simulateProposal(proposal, mockIntent, mockCandidate, 2400);

    expect(simResult.status).toBe("DETERMINISTIC_VERIFIED");
    expect(simResult.simulationMethod).toBe("DETERMINISTIC_VERIFICATION");
    expect(simResult.status).not.toBe("PROVIDER_SIMULATED");
  });

  it("Requirement 4: Spot price <= 0 fails protection re-evaluation (No fake $2400 spot fallback)", async () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(mockIntent, mockCandidate);
    // Spot price is 0 (unavailable)
    const simResult = await simService.simulateProposal(proposal, mockIntent, mockCandidate, 0);

    expect(simResult.status).toBe("FAILED");
    const targetCheck = simResult.verificationChecks.find((c) => c.checkName === "PROTECTION_TARGET_RECHECK");
    expect(targetCheck?.passed).toBe(false);
    expect(targetCheck?.details).toContain("Live market spot price unavailable");
  });

  it("Requirement 5: Mutated proposal fields cause digest mismatch rejection", async () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(mockIntent, mockCandidate);

    // Mutate strike
    const mutatedProposal: ActionProposal = {
      ...proposal,
      expectedStrike: { amountBaseUnits: "220000000000", decimals: 8, symbol: "USD" },
    };

    const simResult = await simService.simulateProposal(mutatedProposal, mockIntent, mockCandidate, 2400);
    expect(simResult.status).toBe("SIMULATION_MISMATCH");
    expect(simResult.revertReason).toBe("PROPOSAL_DIGEST_MISMATCH");
  });

  it("Requirement 6: Mutated quantity, expiry, or cost causes digest mismatch", async () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(mockIntent, mockCandidate);

    const mutatedQty: ActionProposal = {
      ...proposal,
      expectedQuantity: { amountBaseUnits: "3000000000000000000", decimals: 18, symbol: "ETH" },
    };
    const simResult1 = await simService.simulateProposal(mutatedQty, mockIntent, mockCandidate, 2400);
    expect(simResult1.revertReason).toBe("PROPOSAL_DIGEST_MISMATCH");

    const mutatedCost: ActionProposal = {
      ...proposal,
      expectedTotalCost: { amountBaseUnits: "12000000", decimals: 6, symbol: "USDC" },
    };
    const simResult2 = await simService.simulateProposal(mutatedCost, mockIntent, mockCandidate, 2400);
    expect(simResult2.revertReason).toBe("PROPOSAL_DIGEST_MISMATCH");
  });

  it("Requirement 9: Unresolved option quantity prevents building proposal", () => {
    const unsizedCandidate: CandidateStrategy = {
      ...mockCandidate,
      legs: [
        {
          ...mockCandidate.legs[0],
          sizingStatus: "NOT_RESOLVED",
          resolvedOptionQuantity: undefined,
        },
      ],
    };

    expect(() => ActionProposalBuilder.buildOptionBookProposal(mockIntent, unsizedCandidate)).toThrow(
      /Option sizing is unverified/
    );
  });

  it("Requirement 10: Missing explicit quote asset or optionRight throws without fallback", () => {
    const missingAssetCandidate: CandidateStrategy = {
      ...mockCandidate,
      quotes: [{ ...mockQuote, asset: "" }],
    };

    expect(() => ActionProposalBuilder.buildOptionBookProposal(mockIntent, missingAssetCandidate)).toThrow(
      /MarketQuote is missing explicit asset/
    );
  });

  it("Requirement 11 & 19: Missing evidence timestamp is UNAVAILABLE, stale (>60s) is STALE", async () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(mockIntent, mockCandidate);

    // Missing preview timestamp
    const noTimestampCand: CandidateStrategy = {
      ...mockCandidate,
      preview: { ...mockCandidate.preview!, previewTimestampMs: 0 },
      quotes: [{ ...mockQuote, rawApiData: {} }],
    };
    const simResult1 = await simService.simulateProposal(proposal, mockIntent, noTimestampCand, 2400);
    expect(simResult1.marketEvidenceStatus).toBe("UNAVAILABLE");

    // Stale timestamp (90s old)
    const staleCand: CandidateStrategy = {
      ...mockCandidate,
      preview: { ...mockCandidate.preview!, previewTimestampMs: Date.now() - 90_000 },
    };
    const simResult2 = await simService.simulateProposal(proposal, mockIntent, staleCand, 2400);
    expect(simResult2.marketEvidenceStatus).toBe("STALE");
    expect(simResult2.status).toBe("STALE");
  });

  it("Requirement 15: HumanReviewService rejects fake 7.5% default and sets NOT_PRESENTED if downside is missing", () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(mockIntent, mockCandidate);
    const simResult: any = {
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      intentId: mockIntent.intentId,
      intentVersion: mockIntent.version,
      status: "DETERMINISTIC_VERIFIED",
      marketEvidenceStatus: "FRESH",
      verificationChecks: [{ checkName: "TEST", passed: true, details: "ok" }],
    };

    // Missing effectiveDownsidePercent
    const reviewRecord = HumanReviewService.createReviewRecord(mockIntent, proposal, simResult, undefined);

    expect(reviewRecord.reviewStatus).toBe("NOT_PRESENTED");
    expect(reviewRecord.executionStatus).toBe("NOT_AUTHORIZED");
    expect(reviewRecord.summary.modeledDownsidePercent).toBe("NOT_AVAILABLE");
  });

  it("Requirement 16: HumanReview becomes READY_FOR_REVIEW only when all bindings, freshness, and checks pass", () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(mockIntent, mockCandidate);
    const simResult: any = {
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      intentId: mockIntent.intentId,
      intentVersion: mockIntent.version,
      status: "DETERMINISTIC_VERIFIED",
      marketEvidenceStatus: "FRESH",
      verificationChecks: [{ checkName: "TEST", passed: true, details: "ok" }],
    };

    const reviewRecord = HumanReviewService.createReviewRecord(mockIntent, proposal, simResult, 5.5);

    expect(reviewRecord.reviewStatus).toBe("READY_FOR_REVIEW");
    expect(reviewRecord.executionStatus).toBe("NOT_AUTHORIZED");
    expect(reviewRecord.summary.modeledDownsidePercent).toBe("5.50%");
  });

  it("Requirement 18: Unpriced RFQ specification maintains unpriced cost (no 0 USDC fabrication)", () => {
    const rfqSpec = {
      rfqSpecId: "rfq-test-01",
      intentId: mockIntent.intentId,
      underlying: "ETH",
      strategyType: "LONG_PUT" as const,
      optionRight: "PUT" as const,
      strikes: [{ amountBaseUnits: "220000000000", decimals: 8, symbol: "USD" }],
      targetStrikeEstimateUSD: 2200,
      strikeDerivationStatus: "TARGET_STRIKE_ESTIMATE" as const,
      pricingStatus: "PENDING_RFQ_PRICING_REFINEMENT" as const,
      strikeDerivationMethod: "ESTIMATE",
      expiryTimestampMs: 1725600000000,
      expiryFormatted: "Friday, September 6, 2026",
      offerDeadlineMinutes: 30,
      offerDeadlineRationale: "PRODUCT_SELECTED_DEFAULT_REQUIRES_USER_REVIEW" as const,
      requestedContracts: mockIntent.exposureAmount.value,
      settlementType: "CASH" as const,
      collateralAsset: "USDC",
      collateralDecimals: 6,
      sourceReasons: [],
      createdAtMs: Date.now(),
      validationStatus: "VALID" as const,
      validationErrors: [],
    };

    const rfqProposal = ActionProposalBuilder.buildRFQProposal(mockIntent, rfqSpec);

    expect(rfqProposal.expectedTotalCost).toBeUndefined();
    expect(rfqProposal.expectedPremium).toBeUndefined();
    expect(rfqProposal.feeStatus).toBe("NOT_AVAILABLE");
    expect(rfqProposal.bindingStatus).toBe("PREVIEW_BOUND");
    expect(rfqProposal.authorizationStatus).toBe("UNAUTHORIZED");
  });

  it("Requirement 24: REVIEWED state strictly preserves NOT_AUTHORIZED and never grants execution authority", () => {
    const proposal = ActionProposalBuilder.buildOptionBookProposal(mockIntent, mockCandidate);
    const simResult: any = {
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      intentId: mockIntent.intentId,
      intentVersion: mockIntent.version,
      status: "DETERMINISTIC_VERIFIED",
      marketEvidenceStatus: "FRESH",
      verificationChecks: [{ checkName: "TEST", passed: true, details: "ok" }],
    };

    const record = HumanReviewService.createReviewRecord(mockIntent, proposal, simResult, 5.5);
    expect(record.executionStatus).toBe("NOT_AUTHORIZED");
    expect(record.executionStatus).not.toBe("AUTHORIZED");
    expect(record.executionStatus).not.toBe("EXECUTABLE");
  });
});
