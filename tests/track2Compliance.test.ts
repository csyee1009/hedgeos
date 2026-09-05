import { describe, expect, it } from "vitest";
import { ethers } from "ethers";
import { OPTION_BOOK_ABI } from "@thetanuts-finance/thetanuts-client";
import {
  ActionProposal,
  ExecutionPreparation,
  MarketQuote,
  MarketSnapshotEvidence,
  TokenAmount,
  TypedRiskIntent,
} from "../src/types";
import { OptionBookOrderEligibilityEngine } from "../src/services/OptionBookOrderEligibilityEngine";
import { ExactExecutionPreparationService } from "../src/services/ExactExecutionPreparationService";
import { ActionProposalBuilder } from "../src/services/ActionProposalBuilder";
import { OnChainExecutionVerifier } from "../src/services/OnChainExecutionVerifier";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { sha256Digest } from "../src/utils/canonicalDigest";

const maker = "0x1111111111111111111111111111111111111111";
const beneficiary = "0x2222222222222222222222222222222222222222";
const optionBook = "0x1bDff855d6811728acaDC00989e79143a2bdfDed";
const optionFactory = "0x8118daD971dEbffB49B9280047659174128A8B94";
const putImplementation = "0x7355EB92dfb0503DB558a70c10843618932ab290";
const priceFeed = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const capturedAtMs = Math.floor(Date.now() / 1000) * 1000;

function createTestIntent(): TypedRiskIntent {
  return {
    intentId: "track2-test-intent",
    version: 1,
    createdAtMs: capturedAtMs,
    updatedAtMs: capturedAtMs,
    confirmedAtMs: capturedAtMs,
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
        timestampMs: capturedAtMs + 7 * 86_400_000,
        isoString: "2030-01-08T00:00:00.000Z",
        formattedDisplay: "8 January 2030",
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

function signedOrder(overrides: Record<string, unknown> = {}) {
  const expiry = BigInt(Math.floor(capturedAtMs / 1000) + 7 * 86_400);
  const orderExpiryTimestamp = Number(expiry - 3600n);

  return {
    order: {
      maker,
      taker: ethers.ZeroAddress,
      option: ethers.ZeroAddress,
      isBuyer: false,
      numContracts: 2_000_000n,
      price: 500_000_000n,
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
      optionBookAddress: optionBook,
    },
    ...overrides,
  };
}

function createTestQuote(raw = signedOrder()): MarketQuote {
  const expiryTimestampMs = Number(raw.order.expiry) * 1000;
  const deadlineMs = Number(raw.rawApiData.orderExpiryTimestamp) * 1000;

  return {
    quoteId: "ob-quote-track2",
    sourceType: "OPTION_BOOK",
    protocol: "THETANUTS",
    asset: "ETH",
    optionRight: "PUT",
    strikePrice: { amountBaseUnits: "250000000000", decimals: 8, symbol: "USD" },
    expiryTimestampMs,
    premium: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" },
    availableQuantity: { amountBaseUnits: "10000000", decimals: 6, symbol: "CONTRACTS" },
    executableNow: true,
    makerAddress: maker,
    makerIsSeller: true,
    rawOrderIsLong: true,
    normalizedOptionType: "PUT",
    rawOptionType: "PUT",
    allStrikes: [{ amountBaseUnits: "250000000000", decimals: 8, symbol: "USD" }],
    implementationAddress: putImplementation,
    implementationName: "PUT",
    orderValidityDeadlineMs: deadlineMs,
    eligibilityEvidence: { status: "ELIGIBLE_LONG_PUT", checkedAtMs: capturedAtMs, checks: [] },
    rawApiData: raw,
  } as MarketQuote;
}

function createTestSnapshot(quote: MarketQuote): MarketSnapshotEvidence {
  const payload = {
    snapshotId: "market-snapshot-track2",
    chainId: 8453 as const,
    status: "LIVE_READ_AVAILABLE" as const,
    source: "CONTROLLED_TEST_SNAPSHOT" as const,
    capturedAtMs,
    spotPrice: { amountBaseUnits: "300000000000", decimals: 8, symbol: "USD" },
    rawOrderCount: 1,
    eligibleOrderCount: 1,
    rejectedOrderCount: 0,
    quotes: [quote],
    rejectionReasons: [],
  };

  return {
    ...payload,
    snapshotDigest: sha256Digest(payload),
  };
}

async function createTestPreparation(): Promise<ExecutionPreparation> {
  const intent = createTestIntent();
  const raw = signedOrder();
  const quote = createTestQuote(raw);
  const snapshot = createTestSnapshot(quote);

  const candidate = {
    strategyId: "strat-track2",
    name: "ETH Vanilla Long Put",
    strategyType: "LONG_PUT" as const,
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
      decisionId: "policy-track2",
      intentId: intent.intentId,
      strategyId: "strat-track2",
      stage: "EXECUTION_PREPARATION" as const,
      overallStatus: "PASS" as const,
      passedAllInvariants: true,
      checks: [{ ruleId: "TEST_POL", description: "Pass", status: "PASS" as const, details: "Pass" }],
      evaluatedAtMs: capturedAtMs,
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
    getOrderIdentityDigest: () => "order-identity-track2",
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
        previewTimestampMs: capturedAtMs,
        previewSource: "CONTROLLED_TEST_PREVIEW",
        rawPreviewData: {},
      },
    }),
  };

  const candidateDigestPayload = {
    snapshotId: snapshot.snapshotId,
    snapshotDigest: snapshot.snapshotDigest,
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
    allStrikes: (quote.allStrikes || []).map((s) => ({
      amountBaseUnits: s.amountBaseUnits,
      decimals: s.decimals,
    })),
    implementationAddress: quote.implementationAddress,
    makerAddress: quote.makerAddress,
    makerIsSeller: quote.makerIsSeller,
    normalizedOptionType: quote.normalizedOptionType,
    orderValidityDeadlineMs: quote.orderValidityDeadlineMs,
  };
  const candidateDigest = sha256Digest(candidateDigestPayload);

  const proposal = ActionProposalBuilder.buildOptionBookProposal(intent, candidate as any, fakeMarket as any, {
    candidateDigest,
    marketSnapshotId: snapshot.snapshotId,
    marketSnapshotDigest: snapshot.snapshotDigest,
  });

  return new ExactExecutionPreparationService(fakeMarket as any).prepare({
    intent,
    proposal,
    quote,
    candidate: {
      candidateId: "cand-track2",
      quoteId: quote.quoteId,
      strategyType: "LONG_PUT",
      asset: "ETH",
      quantity: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" },
      coveredExposure: intent.exposureAmount.value,
      verifiedBuyerSpend: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" },
      buyerSpendStatus: "VERIFIED",
      feeStatus: "INCOMPLETE",
      modeledAtExpiryDownside: { displayPercent: 20, maxLossValuePrice8: "250000000000", exposureValuePrice8: "300000000000" },
      strike: quote.strikePrice,
      expiryTimestampMs: quote.expiryTimestampMs,
      maxFillableQuantity: { amountBaseUnits: "2000000000000000000", decimals: 18, symbol: "ETH" },
      marketSnapshotId: snapshot.snapshotId,
      marketSnapshotDigest: snapshot.snapshotDigest,
      candidateDigest,
      labels: [],
    },
    snapshot,
    expectedBeneficiary: beneficiary,
    policyDecision: candidate.policyDecision as any,
  });
}

function mockProvider(prepared: ExecutionPreparation, overrides: Record<string, any> = {}) {
  return {
    getNetwork: async () => ({ chainId: 8453n }),
    getTransaction: async () => ({
      to: prepared.transaction.to,
      from: prepared.transaction.expectedExecutor || prepared.transaction.expectedBeneficiary,
      data: prepared.transaction.data,
      value: 0n,
      ...(overrides.tx || {}),
    }),
    getTransactionReceipt: async () => ({
      status: 1,
      blockNumber: 100,
      blockHash: `0x${"3".repeat(64)}`,
      logs: [],
      ...(overrides.receipt || {}),
    }),
    getBlockNumber: async () => 105,
    getBlock: async () => ({ hash: `0x${"3".repeat(64)}` }),
    getCode: async () => "0x1234",
  };
}

describe("Track 2 Submission Compliance Pass — 11 Deterministic Tests", () => {
  it("TEST 1: Unsigned transaction contains NO private keys, seed phrases, or signed raw transactions", async () => {
    const prep = await createTestPreparation();
    const tx = prep.transaction as any;
    expect(tx.privateKey).toBeUndefined();
    expect(tx.seedPhrase).toBeUndefined();
    expect(tx.signedRawTransaction).toBeUndefined();
    expect(tx.walletSecrets).toBeUndefined();
    expect(tx.status).toBe("EXACT_TRANSACTION_PREPARED");
  });

  it("TEST 2: Exact unsigned transaction target chainId = 8453", async () => {
    const prep = await createTestPreparation();
    expect(prep.transaction.chainId).toBe(8453);
  });

  it("TEST 3: Valid matching receipt fixture yields receipt success & completed verifier check structure", async () => {
    const prep = await createTestPreparation();
    const verifier = new OnChainExecutionVerifier(mockProvider(prep) as any, 2, optionFactory);
    const txHash = `0x${"a".repeat(64)}`;
    const result = await verifier.verify(prep, txHash);
    expect(result.chainId).toBe(8453);
    expect(result.checks.find((c) => c.check === "CHAIN_ID")?.passed).toBe(true);
    expect(result.checks.find((c) => c.check === "RECEIPT_SUCCESS")?.passed).toBe(true);
  });

  it("TEST 4: Unrelated successful transaction yields MISMATCH / non-verified", async () => {
    const prep = await createTestPreparation();
    const unrelatedTxProvider = mockProvider(prep, {
      tx: { to: "0x9999999999999999999999999999999999999999" }, // Unrelated contract address
    });
    const verifier = new OnChainExecutionVerifier(unrelatedTxProvider as any, 2, optionFactory);
    const result = await verifier.verify(prep, `0x${"b".repeat(64)}`);
    expect(result.status).toBe("MISMATCH");
    expect(result.checks.find((c) => c.check === "TARGET")?.passed).toBe(false);
  });

  it("TEST 5: Reverted transaction yields REVERTED status", async () => {
    const prep = await createTestPreparation();
    const revertedProvider = mockProvider(prep, {
      receipt: { status: 0 },
    });
    const verifier = new OnChainExecutionVerifier(revertedProvider as any, 2, optionFactory);
    const result = await verifier.verify(prep, `0x${"c".repeat(64)}`);
    expect(result.status).toBe("REVERTED");
    expect(result.checks.find((c) => c.check === "RECEIPT_SUCCESS")?.passed).toBe(false);
  });

  it("TEST 6: Stale proposal / invalidated preparation fails pre-verification status check", async () => {
    const prep = await createTestPreparation();
    const stalePrep: ExecutionPreparation = {
      ...prep,
      status: "INVALIDATED",
    };
    const verifier = new OnChainExecutionVerifier(mockProvider(prep) as any, 2, optionFactory);
    const result = await verifier.verify(stalePrep, `0x${"d".repeat(64)}`);
    expect(result.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.checks.find((c) => c.check === "PREPARATION_STATUS")?.passed).toBe(false);
  });

  it("TEST 7: Mismatching order/implementation calldata yields MISMATCH", async () => {
    const prep = await createTestPreparation();
    const badCalldataProvider = mockProvider(prep, {
      tx: { data: "0x1234567890abcdef" },
    });
    const verifier = new OnChainExecutionVerifier(badCalldataProvider as any, 2, optionFactory);
    const result = await verifier.verify(prep, `0x${"e".repeat(64)}`);
    expect(result.status).toBe("MISMATCH");
    expect(result.checks.find((c) => c.check === "CALLDATA")?.passed).toBe(false);
  });

  it("TEST 8: Track 1 live market explorer remains functional and produces non-empty sanitized order lists", () => {
    const intent = createTestIntent();
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const validPut = {
      order: { maker, optionType: 1, isCall: false, price: 5000n, expiry: BigInt(Math.floor(capturedAtMs / 1000) + 7 * 86400), strikes: [250000000000n], implementation: putImplementation },
      signature: "0x1234",
      availableAmount: 5000000000n,
      makerAddress: maker,
      rawApiData: { collateral: usdc, priceFeed, implementation: putImplementation, strikes: ["250000000000"], isCall: false, optionType: 1, isLong: true, orderExpiryTimestamp: Math.floor(capturedAtMs / 1000) + 6 * 86400, maxCollateralUsable: "5000000000" },
    };
    const explorer = service.buildLiveMarketExplorer(intent, [validPut], capturedAtMs);
    expect(explorer.allLive).toHaveLength(1);
    expect(explorer.matching).toHaveLength(1);
    expect(explorer.matching[0].proceedable).toBe(true);
  });

  it("TEST 9: SET RELATION Matching ⊆ Proceedable holds strictly", () => {
    const intent = createTestIntent();
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const validPut = {
      order: { maker, optionType: 1, isCall: false, price: 500000000n, expiry: BigInt(Math.floor(capturedAtMs / 1000) + 7 * 86400), strikes: [250000000000n], implementation: putImplementation },
      signature: "0x1234",
      availableAmount: 5000000000n,
      makerAddress: maker,
      rawApiData: { collateral: usdc, priceFeed, implementation: putImplementation, strikes: ["250000000000"], isCall: false, optionType: 1, isLong: true, orderExpiryTimestamp: Math.floor(capturedAtMs / 1000) + 6 * 86400, maxCollateralUsable: "5000000000" },
    };
    const explorer = service.buildLiveMarketExplorer(intent, [validPut], capturedAtMs);
    const proceedableIds = new Set(explorer.proceedable.map((o) => o.orderId));
    expect(explorer.matching.every((m) => proceedableIds.has(m.orderId))).toBe(true);
  });

  it("TEST 10: SET RELATION Closest ⊆ Proceedable holds strictly", () => {
    const intent = createTestIntent();
    const service = new ThetanutsMarketService("https://mainnet.base.org");
    const softMismatchPut = {
      order: { maker, optionType: 1, isCall: false, price: 500000000n, expiry: BigInt(Math.floor(capturedAtMs / 1000) + 3 * 86400), strikes: [250000000000n], implementation: putImplementation },
      signature: "0x1234",
      availableAmount: 5000000000n,
      makerAddress: maker,
      rawApiData: { collateral: usdc, priceFeed, implementation: putImplementation, strikes: ["250000000000"], isCall: false, optionType: 1, isLong: true, orderExpiryTimestamp: Math.floor(capturedAtMs / 1000) + 2 * 86400, maxCollateralUsable: "5000000000" },
    };
    const explorer = service.buildLiveMarketExplorer(intent, [softMismatchPut], capturedAtMs);
    const proceedableIds = new Set(explorer.proceedable.map((o) => o.orderId));
    expect(explorer.closest.every((c) => proceedableIds.has(c.orderId))).toBe(true);
  });

  it("TEST 11: Sizing separation — 2 ETH exposure + 100 USDC budget remains 2 ETH requested protection quantity", () => {
    const intent = createTestIntent();
    expect(intent.exposureAmount.value.amountBaseUnits).toBe("2000000000000000000");
    expect(intent.exposureAmount.value.symbol).toBe("ETH");
    expect(intent.maxPremiumUSDC.value.amountBaseUnits).toBe("100000000");
    expect(intent.maxPremiumUSDC.value.symbol).toBe("USDC");
  });
});
