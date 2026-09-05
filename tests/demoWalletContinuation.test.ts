import { describe, expect, it } from "vitest";
import { ethers } from "ethers";
import { OPTION_BOOK_ABI } from "@thetanuts-finance/thetanuts-client";
import { TypedRiskIntent } from "../src/types";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { resolveOptionCategory } from "../src/services/OptionCategoryResolver";
import { ActionProposalBuilder } from "../src/services/ActionProposalBuilder";
import { ExactExecutionPreparationService } from "../src/services/ExactExecutionPreparationService";
import { sha256Digest } from "../src/utils/canonicalDigest";

const maker = "0x1111111111111111111111111111111111111111";
const demoBeneficiary = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const optionBook = "0x1bDff855d6811728acaDC00989e79143a2bdfDed";
const optionFactory = "0x8118daD971dEbffB49B9280047659174128A8B94";
const putImplementation = "0x7355EB92dfb0503DB558a70c10843618932ab290";
const priceFeed = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const nowMs = Math.floor(Date.now() / 1000) * 1000;

function createTestIntent(): TypedRiskIntent {
  return {
    intentId: "demo-intent-001",
    version: 1,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    confirmedAtMs: nowMs,
    confirmedByUser: true,
    objective: { value: "DOWNSIDE_PROTECTION", source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
    asset: { value: "ETH", source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
    exposureAmount: {
      value: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" },
      source: "USER_EXPLICIT",
      confidence: 1,
      requiresConfirmation: false,
    },
    targetMaxLossPercent: { value: 20, source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
    maxPremiumUSDC: {
      value: { amountBaseUnits: "100000000", decimals: 6, symbol: "USDC" },
      source: "USER_EXPLICIT",
      confidence: 1,
      requiresConfirmation: false,
    },
    horizonTimestamp: {
      value: {
        timestampMs: nowMs + 7 * 86_400_000,
        isoString: "2030-01-08T00:00:00.000Z",
        formattedDisplay: "7 Days",
        timezone: "UTC",
      },
      source: "USER_EXPLICIT",
      confidence: 1,
      requiresConfirmation: false,
    },
    allowedProtocols: { value: ["THETANUTS"], source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
    allowMultiLeg: { value: false, source: "USER_EXPLICIT", confidence: 1, requiresConfirmation: false },
  };
}

function signedOrder() {
  const expiry = BigInt(Math.floor(nowMs / 1000) + 7 * 86_400);
  const orderExpiryTimestamp = Number(expiry - 3600n);

  return {
    order: {
      maker,
      taker: ethers.ZeroAddress,
      option: ethers.ZeroAddress,
      isBuyer: false,
      numContracts: 2_000_000n,
      price: 5000n,
      expiry,
      nonce: 7n,
      isCall: false,
      optionType: 1,
      strikes: [250_000_000_000n],
      implementation: putImplementation,
    },
    signature: "0x1234",
    availableAmount: 5_000_000_000n,
    makerAddress: maker,
    rawApiData: {
      collateral: usdc,
      priceFeed,
      implementation: putImplementation,
      strikes: ["250000000000"],
      isCall: false,
      optionType: 1,
      isLong: true,
      orderExpiryTimestamp,
      extraOptionData: "0x",
      maxCollateralUsable: "5000000000",
    },
  };
}

describe("Demo Wallet Continuation Suite — Full Workflow Pre-Authorization", () => {
  it("DEMO TEST 1: Synthetic DEMO portfolio source allows full read-only workflow up to unsigned transaction preparation", async () => {
    const intent = createTestIntent();
    const category = resolveOptionCategory(intent);
    expect(category).toBe("LONG_PUT");

    const marketService = new ThetanutsMarketService("https://mainnet.base.org");
    const raw = signedOrder();
    const explorer = marketService.buildLiveMarketExplorer(intent, [raw], nowMs);

    expect(explorer.matchingCount).toBe(1);
    const selectedDTO = explorer.matching[0];
    expect(selectedDTO.proceedable).toBe(true);

    const quote = {
      quoteId: "ob-quote-demo",
      sourceType: "OPTION_BOOK" as const,
      protocol: "THETANUTS" as const,
      asset: "ETH",
      optionRight: "PUT" as const,
      strikePrice: { amountBaseUnits: "250000000000", decimals: 8, symbol: "USD" },
      expiryTimestampMs: Number(raw.order.expiry) * 1000,
      premium: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" },
      availableQuantity: { amountBaseUnits: "10000000", decimals: 6, symbol: "CONTRACTS" },
      executableNow: true,
      makerAddress: maker,
      makerIsSeller: true,
      rawOrderIsLong: true,
      normalizedOptionType: "PUT" as const,
      rawOptionType: "PUT" as const,
      allStrikes: [{ amountBaseUnits: "250000000000", decimals: 8, symbol: "USD" }],
      implementationAddress: putImplementation,
      implementationName: "PUT",
      orderValidityDeadlineMs: Number(raw.rawApiData.orderExpiryTimestamp) * 1000,
      eligibilityEvidence: { status: "ELIGIBLE_LONG_PUT" as const, checkedAtMs: nowMs, checks: [] },
      rawApiData: raw,
    };

    const snapshot = {
      snapshotId: "demo-snapshot",
      chainId: 8453 as const,
      status: "LIVE_READ_AVAILABLE" as const,
      source: "CONTROLLED_TEST_SNAPSHOT" as const,
      capturedAtMs: nowMs,
      spotPrice: { amountBaseUnits: "300000000000", decimals: 8, symbol: "USD" },
      rawOrderCount: 1,
      eligibleOrderCount: 1,
      rejectedOrderCount: 0,
      quotes: [quote],
      rejectionReasons: [],
    };
    const snapshotWithDigest = {
      ...snapshot,
      snapshotDigest: sha256Digest(snapshot),
    };

    const candidateDigestPayload = {
      snapshotId: snapshotWithDigest.snapshotId,
      snapshotDigest: snapshotWithDigest.snapshotDigest,
      quoteId: quote.quoteId,
      strategyType: "LONG_PUT",
      asset: "ETH",
      quantity18: "2000000000000000000",
      spendUSDC6: "10000000",
      maxLossValuePrice8: "250000000000",
      exposureValuePrice8: "300000000000",
      strikePrice8: "250000000000",
      spotPrice8: "300000000000",
      expiryTimestampMs: quote.expiryTimestampMs,
      allStrikes: quote.allStrikes.map((s) => ({ amountBaseUnits: s.amountBaseUnits, decimals: s.decimals })),
      implementationAddress: quote.implementationAddress,
      makerAddress: quote.makerAddress,
      makerIsSeller: quote.makerIsSeller,
      normalizedOptionType: quote.normalizedOptionType,
      orderValidityDeadlineMs: quote.orderValidityDeadlineMs,
    };
    const candidateDigest = sha256Digest(candidateDigestPayload);

    const candidate = {
      candidateId: "cand-demo",
      quoteId: quote.quoteId,
      strategyId: "strat-demo",
      name: "ETH Vanilla Long Put",
      strategyType: "LONG_PUT" as const,
      asset: "ETH",
      quantity: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" },
      coveredExposure: intent.exposureAmount.value,
      verifiedBuyerSpend: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" },
      buyerSpendStatus: "VERIFIED" as const,
      feeStatus: "INCOMPLETE" as const,
      modeledAtExpiryDownside: { displayPercent: 20, maxLossValuePrice8: "250000000000", exposureValuePrice8: "300000000000" },
      strike: quote.strikePrice,
      expiryTimestampMs: quote.expiryTimestampMs,
      maxFillableQuantity: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" },
      marketSnapshotId: snapshotWithDigest.snapshotId,
      marketSnapshotDigest: snapshotWithDigest.snapshotDigest,
      candidateDigest,
      labels: [],
      legs: [
        {
          side: "BUY" as const,
          right: "PUT" as const,
          strikePrice: quote.strikePrice,
          expiryTimestampMs: quote.expiryTimestampMs,
          requestedExposure: intent.exposureAmount.value,
          resolvedOptionQuantity: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" },
          sizingStatus: "RESOLVED" as const,
          quoteReference: quote.quoteId,
        },
      ],
      quotes: [quote],
      status: "TECHNICALLY_FEASIBLE" as const,
      rejectionReasons: [],
      scoresStatus: "NOT_AVAILABLE" as const,
      sizingStatus: "RESOLVED" as const,
      underlyingResolutionMethod: "EXACT_RESERVATION" as const,
      policyDecision: {
        decisionId: "policy-demo",
        intentId: intent.intentId,
        strategyId: "strat-demo",
        stage: "EXECUTION_PREPARATION" as const,
        overallStatus: "PASS" as const,
        passedAllInvariants: true,
        checks: [{ ruleId: "TEST_POL", description: "Pass", status: "PASS" as const, details: "Pass" }],
        evaluatedAtMs: nowMs,
      },
    };

    const contractOrder = {
      maker,
      orderExpiryTimestamp: BigInt(raw.rawApiData.orderExpiryTimestamp),
      collateral: usdc,
      isCall: false,
      priceFeed,
      implementation: putImplementation,
      isLong: true,
      maxCollateralUsable: BigInt(raw.rawApiData.maxCollateralUsable),
      strikes: [250000000000n],
      expiry: raw.order.expiry,
      price: raw.order.price,
      numContracts: 2_000_000n,
      extraOptionData: "0x",
    };

    const data = new ethers.Interface(OPTION_BOOK_ABI as any).encodeFunctionData("fillOrder", [
      contractOrder,
      raw.signature,
      ethers.ZeroAddress,
    ]);

    const fakeMarket = {
      getOrderIdentityDigest: () => "order-identity-demo",
      computeOptionBookNonce: () => String(raw.order.nonce),
      getOptionBookAddress: () => optionBook,
      getOptionFactoryAddress: () => optionFactory,
      encodeExactFill: async () => ({
        to: optionBook,
        data,
        buyerSpendUSDC6: 10_000_000n,
        numContracts6: 2_000_000n,
        rawOrder: raw,
        preview: {
          previewStatus: "PREVIEW_AVAILABLE",
          buyerSpendStatus: "VERIFIED",
          buyerSpendVerificationMode: "TOTAL_BUYER_SPEND_PROVEN",
          feeStatus: "INCOMPLETE",
          premiumAmount: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" },
          protocolFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
          referrerFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
          totalExpectedCost: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" },
          previewTimestampMs: nowMs,
          previewSource: "CONTROLLED_TEST_PREVIEW",
          rawPreviewData: {},
        },
      }),
    };

    const proposal = ActionProposalBuilder.buildOptionBookProposal(intent, candidate as any, fakeMarket as any, {
      candidateDigest,
      marketSnapshotId: snapshotWithDigest.snapshotId,
      marketSnapshotDigest: snapshotWithDigest.snapshotDigest,
    });

    const preparation = await new ExactExecutionPreparationService(fakeMarket as any).prepare({
      intent,
      proposal,
      quote,
      candidate: candidate as any,
      snapshot: snapshotWithDigest,
      expectedBeneficiary: demoBeneficiary,
      policyDecision: candidate.policyDecision as any,
    });

    expect(preparation.preparationId).toBeDefined();
    expect(preparation.transaction.chainId).toBe(8453);
    expect(preparation.transaction.to.toLowerCase()).toBe(optionBook.toLowerCase());
    expect(preparation.transaction.data).toBe(data);

    // Verify truthfulness invariants:
    const txObj = JSON.stringify(preparation);
    expect(txObj).not.toContain("privateKey");
    expect(txObj).not.toContain("seedPhrase");
    expect(txObj).not.toContain("signedRawTransaction");
  });
});
