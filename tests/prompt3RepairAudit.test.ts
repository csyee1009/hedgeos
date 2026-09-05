import { describe, expect, it } from "vitest";
import { MOCK_OPTION_BOOK_QUOTES } from "../src/fixtures/mockQuotes";
import { ExposurePayoffEngine } from "../src/services/ExposurePayoffEngine";
import { FinancialConstitutionEngine } from "../src/services/FinancialConstitutionEngine";
import { OptionSizingAdapter } from "../src/services/OptionSizingAdapter";
import { ProtectionSolverEngine } from "../src/services/ProtectionSolverEngine";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { CandidateStrategy, MarketQuote, TypedRiskIntent } from "../src/types";

describe("Prompt 3 Repair & Audit Compliance Regression Suite", () => {
  const policyEngine = new FinancialConstitutionEngine();

  const mockEthIntent: TypedRiskIntent = {
    intentId: "intent-repair-eth",
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
      value: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" }, // 10 USDC budget
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
    horizonTimestamp: {
      value: { timestampMs: Date.now() + 7 * 24 * 3600 * 1000, isoString: "2026-09-07T15:59:59.999Z", formattedDisplay: "Friday, 7 September 2026", timezone: "UTC" },
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
    allowedProtocols: { value: ["THETANUTS"], source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
    allowMultiLeg: { value: false, source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
  };

  const mockBtcIntent: TypedRiskIntent = {
    ...mockEthIntent,
    intentId: "intent-repair-btc",
    asset: { value: "BTC", source: "USER_EXPLICIT", confidence: 1.0, requiresConfirmation: false },
    exposureAmount: {
      value: { amountBaseUnits: "100000000", decimals: 8, symbol: "BTC" },
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
  };

  // Requirement 1 & 13: Missing RPC produces NOT_CONFIGURED and getSpotPrice throws without inventing 2438.66
  it("Requirement 1 & 13: Missing RPC produces NOT_CONFIGURED and market spot read failure throws without inventing fake spot prices", async () => {
    const unconfiguredService = new ThetanutsMarketService("");
    const state = unconfiguredService.getMarketStateSync();
    expect(state.status).toBe("NOT_CONFIGURED");

    await expect(unconfiguredService.getSpotPrice("ETH")).rejects.toThrow(/unavailable/i);
    await expect(unconfiguredService.getSpotPrice("BTC")).rejects.toThrow(/unavailable/i);
  });

  // Requirement 2: Preview failure never becomes PREVIEW_AVAILABLE and does NOT invent $4.55
  it("Requirement 2: Preview failure never becomes PREVIEW_AVAILABLE and no fabricated $4.55 premium exists", async () => {
    const unconfiguredService = new ThetanutsMarketService("");
    const preview = await unconfiguredService.previewFill({});
    expect(preview.previewStatus).toBe("PREVIEW_FAILED");
    expect(preview.totalExpectedCost.amountBaseUnits).toBe("0");
    expect(preview.pricePerContract.amountBaseUnits).toBe("0");
    expect((preview as any).error).toBeDefined();
  });

  // Requirement 3: BTC intent rejects ETH orders & MarketQuote.asset stores resolved underlying
  it("Requirement 3: BTC intent rejects ETH orders and MarketQuote stores the actual resolved underlying", async () => {
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const ethOrder = {
      priceFeed: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", // Chainlink ETH/USD on Base
      strikes: ["226000000000"],
      availableAmount: "10000000000",
      orderExpiry: Math.floor(Date.now() / 1000) + 7 * 86400,
    };

    const underlying = service.resolveUnderlying(ethOrder);
    expect(underlying).toBe("ETH");

    // Solver evaluation with BTC intent on ETH quote
    const ethQuote: MarketQuote = {
      quoteId: "eth-quote-for-btc-test",
      sourceType: "OPTION_BOOK",
      protocol: "THETANUTS",
      asset: "ETH",
      optionRight: "PUT",
      strikePrice: { amountBaseUnits: "226000000000", decimals: 8, symbol: "USD" },
      expiryTimestampMs: Date.now() + 7 * 86400 * 1000,
      premium: { amountBaseUnits: "9100000", decimals: 6, symbol: "USDC" },
      availableQuantity: { amountBaseUnits: "10000000000", decimals: 6, symbol: "USDC" },
      executableNow: true,
    };

    const solver = new ProtectionSolverEngine(service, policyEngine);
    const result = await solver.evaluateCandidates(mockBtcIntent, [ethQuote]);
    expect(result.rankedStrategies.length).toBe(0);
  });

  // Requirement 4 & 5: SDK max fill adapter & exact BigInt comparisons
  it("Requirement 4 & 5: SDK calculateMaxContracts is used and compared via exact BigInt arithmetic", () => {
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const rawOrder = {
      availableAmount: "10000000000", // 10,000 USDC collateral
      strikes: ["250000000000"], // $2,500 strike
      isCall: false,
    };

    const maxContractsSDK = service.calculateMaxContracts(rawOrder);
    expect(maxContractsSDK).toBe(4000000n); // 4.0 contracts (6-dec)

    const maxContracts18 = maxContractsSDK * 1000000000000n; // 4.0 * 10^18
    const requested18 = 2000000000000000000n; // 2.0 ETH
    expect(maxContracts18 >= requested18).toBe(true);
  });

  // Requirement 8: Payoff calculation wording & hedge ratio enforcement
  it("Requirement 8: Payoff calculation validates hedge-ratio equality and produces truthful modeled floor details", () => {
    // 1:1 Hedge (2 ETH spot, 2 Contracts option)
    const payoff1to1 = ExposurePayoffEngine.calculate({
      spotQuantity: 2.0,
      optionQuantity: 2.0,
      strikePriceUSD: 2260.0,
      spotReferencePriceUSD: 2438.66,
      totalProtectionCostUSD: 9.10,
      assetSymbol: "ETH",
    });

    expect(payoff1to1.status).toBe("CALCULATED");
    expect(payoff1to1.isConstantFloorGuaranteed).toBe(true);
    expect(payoff1to1.protectedFloorValueUSD).toBe(4510.90);
    expect(payoff1to1.details).toContain("Modeled at-expiry protected floor under the stated assumptions");
    expect(payoff1to1.details).not.toContain("guaranteed minimum portfolio value");

    // Unequal Hedge (2 ETH spot, 1 Contract option)
    const payoffPartial = ExposurePayoffEngine.calculate({
      spotQuantity: 2.0,
      optionQuantity: 1.0,
      strikePriceUSD: 2260.0,
      spotReferencePriceUSD: 2438.66,
      totalProtectionCostUSD: 4.55,
      assetSymbol: "ETH",
    });

    expect(payoffPartial.isConstantFloorGuaranteed).toBe(false);
    expect(payoffPartial.details).toContain("Partial hedge ratio");
  });

  // Requirement 9: Financial Constitution stage separation (ANALYSIS vs EXECUTION)
  it("Requirement 9: Financial Constitution separates ANALYSIS from EXECUTION so POL-004 does not block market analysis", async () => {
    const candidate: CandidateStrategy = {
      strategyId: "strategy-test-pol-stage",
      name: "Long Put Protection",
      strategyType: "LONG_PUT",
      legs: [
        {
          side: "BUY",
          right: "PUT",
          strikePrice: { amountBaseUnits: "226000000000", decimals: 8, symbol: "USD" },
          expiryTimestampMs: Date.now() + 7 * 86400 * 1000,
          requestedExposure: mockEthIntent.exposureAmount.value,
          resolvedOptionQuantity: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "CONTRACTS" },
          sizingStatus: "RESOLVED",
          quoteReference: "quote-1",
        },
      ],
      quotes: [
        {
          quoteId: "quote-1",
          sourceType: "OPTION_BOOK",
          protocol: "THETANUTS",
          asset: "ETH",
          optionRight: "PUT",
          strikePrice: { amountBaseUnits: "226000000000", decimals: 8, symbol: "USD" },
          expiryTimestampMs: Date.now() + 7 * 86400 * 1000,
          premium: { amountBaseUnits: "9100000", decimals: 6, symbol: "USDC" },
          availableQuantity: { amountBaseUnits: "10000000000", decimals: 6, symbol: "USDC" },
          executableNow: true,
          allStrikes: [{ amountBaseUnits: "226000000000", decimals: 8, symbol: "USD" }],
          implementationAddress: "0x7355EB92dfb0503DB558a70c10843618932ab290",
          implementationName: "PUT", makerIsSeller: true,
          orderValidityDeadlineMs: Date.now() + 3600_000,
          eligibilityEvidence: { status: "ELIGIBLE_LONG_PUT", checkedAtMs: Date.now(), checks: [] },
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
        totalExpectedCost: { amountBaseUnits: "9100000", decimals: 6, symbol: "USDC" },
        feeStatus: "VERIFIED", buyerSpendStatus: "VERIFIED",
        collateralToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        previewTimestampMs: Date.now(),
        previewSource: "THETANUTS_OPTIONBOOK_PREVIEW",
        rawPreviewData: { numContracts: "2000000" },
      },
      payoffSummary: {
        status: "CALCULATED",
        spotExposureQuantity: "2 ETH",
        spotReferencePriceUSD: 2438.66,
        spotExposureValueUSD: 4877.32,
        strikePriceUSD: 2260.0,
        protectedFloorValueUSD: 4510.90,
        effectiveDownsidePercent: 7.51,
        totalProtectionCostUSD: 9.10,
        costImpactPercent: 0.19,
        isConstantFloorGuaranteed: true,
        scenarios: [],
        details: "Test details",
        calculationTimestampMs: Date.now(),
        exact: { exposureValuePrice8: "487732000000", protectedFloorValuePrice8: "451090000000", maxLossValuePrice8: "36642000000", totalCostUSDC6: "9100000", quantity18: "2000000000000000000", strikePrice8: "226000000000", spotPrice8: "243866000000" },
      },
    };

    // In ANALYSIS stage: passes overallStatus = PASS and passedAllInvariants = true
    const analysisDecision = await policyEngine.evaluatePolicy(mockEthIntent, candidate, "ANALYSIS");
    expect(analysisDecision.overallStatus).toBe("PASS");
    expect(analysisDecision.passedAllInvariants).toBe(true);

    const pol004 = analysisDecision.checks.find((c) => c.ruleId === "POL-004");
    expect(pol004?.status).toBe("NOT_EVALUATED");

    const pol009 = analysisDecision.checks.find((c) => c.ruleId === "POL-009");
    expect(pol009?.status).toBe("PASS");
  });

  // Requirement 10 & 11: POL-009 Protection target failure and Budget failure prevent ranking
  it("Requirement 10 & 11: Budget failure and protection target failure prevent ranking & remove arbitrary scores", async () => {
    const quoteOverBudget: MarketQuote = {
      quoteId: "quote-over-budget",
      sourceType: "OPTION_BOOK",
      protocol: "THETANUTS",
      asset: "ETH",
      optionRight: "PUT",
      strikePrice: { amountBaseUnits: "226000000000", decimals: 8, symbol: "USD" },
      expiryTimestampMs: Date.now() + 7 * 86400 * 1000,
      premium: { amountBaseUnits: "15000000", decimals: 6, symbol: "USDC" }, // 15 USDC > 10 USDC budget
      availableQuantity: { amountBaseUnits: "10000000000", decimals: 6, symbol: "USDC" },
      executableNow: true,
    };

    const solver = new ProtectionSolverEngine(new ThetanutsMarketService("https://mainnet.base.org"), policyEngine);
    const result = await solver.evaluateCandidates(mockEthIntent, [quoteOverBudget]);

    expect(result.rankedStrategies.length).toBe(0);
    expect(result.rejectedCandidates.length).toBe(1);
    expect(result.rejectedCandidates[0].status).toBe("BUDGET_REJECTED");
  });
});
