import { describe, expect, it } from "vitest";
import { ActionProposalBuilder } from "../src/services/ActionProposalBuilder";
import { FinancialConstitutionEngine } from "../src/services/FinancialConstitutionEngine";
import { ProtectionSolverEngine } from "../src/services/ProtectionSolverEngine";
import { RFQRequirementEngine } from "../src/services/RFQRequirementEngine";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { ThetanutsSimulationService } from "../src/services/ThetanutsSimulationService";
import { CandidateStrategy, MarketQuote, TypedRiskIntent } from "../src/types";

describe("Prompt 8: Market Failure Matrix & Fault Resilience", () => {
  const proposalMarketService = new ThetanutsMarketService("");
  proposalMarketService.getOrderIdentityDigest = () => "controlled-test-order-digest";

  const confirmedIntent: TypedRiskIntent = {
    intentId: "intent-fail-001",
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

  it("Scenario 1: RPC endpoint fails or throws -> reports LIVE_READ_FAILED without inventing fake data", async () => {
    const market = new ThetanutsMarketService();
    (market as any).client = {
      api: {
        getMarketData: async () => {
          throw new Error("RPC timeout error");
        },
      },
    };
    const state = await market.getMarketState();
    expect(state.status).toBe("LIVE_READ_FAILED");
    expect(state.orderCount).toBe(0);
    expect(state.spotPriceUSD).toBeUndefined();
  });

  it("Scenario 2: Empty OptionBook orders -> cleanly triggers RFQ required fallback", async () => {
    const rfqAnalysis = RFQRequirementEngine.evaluateRequirement(confirmedIntent, [], []);
    expect(rfqAnalysis.status).toBe("REQUIRED");
    expect(rfqAnalysis.reasons).toContain("NO_QUALIFYING_OPTIONBOOK_ORDERS");
  });

  it("Scenario 3: Zero available maker collateral -> candidate marked MARKET_INFEASIBLE", async () => {
    const solver = new ProtectionSolverEngine();
    const zeroCollateralQuote: MarketQuote = {
      quoteId: "quote-zero-col",
      sourceType: "OPTION_BOOK",
      protocol: "THETANUTS",
      asset: "ETH",
      optionRight: "PUT",
      strikePrice: { amountBaseUnits: "230000000000", decimals: 8, symbol: "USD" },
      expiryTimestampMs: Date.now() + 86400000 * 7,
      premium: { amountBaseUnits: "9000000", decimals: 6, symbol: "USDC" },
      availableQuantity: { amountBaseUnits: "0", decimals: 18, symbol: "ETH" }, // Zero collateral
      executableNow: true,
    };

    const result = await solver.evaluateCandidates(confirmedIntent, [zeroCollateralQuote]);
    expect(result.rankedStrategies.length).toBe(0);
    expect(result.rejectedCandidates.length).toBe(1);
    expect(result.rejectedCandidates[0].rejectionReasons).toContain("Quote has zero available quantity");
  });

  it("Scenario 4: Expired order (expiry in the past) -> candidate rejected by POL-006", async () => {
    const policyEngine = new FinancialConstitutionEngine();
    const expiredQuote: MarketQuote = {
      quoteId: "quote-expired",
      sourceType: "OPTION_BOOK",
      protocol: "THETANUTS",
      asset: "ETH",
      optionRight: "PUT",
      strikePrice: { amountBaseUnits: "230000000000", decimals: 8, symbol: "USD" },
      expiryTimestampMs: Date.now() - 3600_000, // 1 hour ago
      premium: { amountBaseUnits: "9000000", decimals: 6, symbol: "USDC" },
      availableQuantity: { amountBaseUnits: "5000000000000000000", decimals: 18, symbol: "ETH" },
      executableNow: false,
    };

    const expiredCandidate: CandidateStrategy = {
      strategyId: "strat-exp",
      name: "Expired Put",
      strategyType: "LONG_PUT",
      legs: [
        {
          side: "BUY",
          right: "PUT",
          strikePrice: expiredQuote.strikePrice,
          expiryTimestampMs: expiredQuote.expiryTimestampMs,
          requestedExposure: confirmedIntent.exposureAmount.value,
          resolvedOptionQuantity: confirmedIntent.exposureAmount.value,
          sizingStatus: "RESOLVED",
          quoteReference: expiredQuote.quoteId,
        },
      ],
      quotes: [expiredQuote],
      status: "MARKET_FEASIBLE",
      rejectionReasons: [],
      scoresStatus: "NOT_AVAILABLE",
      sizingStatus: "RESOLVED",
    };

    const decision = await policyEngine.evaluatePolicy(confirmedIntent, expiredCandidate, "ANALYSIS");
    const pol006 = decision.checks.find((c) => c.ruleId === "POL-006");
    expect(pol006?.status).toBe("FAIL");
    expect(decision.passedAllInvariants).toBe(false);
  });

  it("Scenario 5: Spot price unavailable (spot = 0) -> simulation re-evaluation fails honestly", async () => {
    const simService = new ThetanutsSimulationService();
    const quote: MarketQuote = {
      quoteId: "quote-valid-spot",
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

    const candidate: CandidateStrategy = {
      strategyId: "strat-valid",
      name: "Valid Long Put",
      strategyType: "LONG_PUT",
      legs: [
        {
          side: "BUY",
          right: "PUT",
          strikePrice: quote.strikePrice,
          expiryTimestampMs: quote.expiryTimestampMs,
          requestedExposure: confirmedIntent.exposureAmount.value,
          resolvedOptionQuantity: confirmedIntent.exposureAmount.value,
          sizingStatus: "RESOLVED",
          quoteReference: quote.quoteId,
        },
      ],
      quotes: [quote],
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
    };

    const proposal = ActionProposalBuilder.buildOptionBookProposal(
      confirmedIntent,
      candidate,
      proposalMarketService
    );
    const simResult = await simService.simulateProposal(proposal, confirmedIntent, candidate, 0); // 0 spot price

    expect(simResult.status).toBe("FAILED");
    expect(simResult.providerResultSummary).toContain("Live market spot price unavailable");
  });
});
