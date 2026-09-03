import { describe, expect, it } from "vitest";
import { MOCK_OPTION_BOOK_QUOTES } from "../src/fixtures/mockQuotes";
import { SimulationService } from "../src/services/SimulationService";
import { CandidateStrategy, TypedRiskIntent } from "../src/types";

describe("Simulation & Intent Binding Semantics Tests", () => {
  const simulationService = new SimulationService();

  const mockIntent: TypedRiskIntent = {
    intentId: "intent-test-sim",
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
      value: { timestampMs: Date.now() + 7 * 24 * 3600 * 1000, isoString: "2026-09-04T15:59:59.999Z", formattedDisplay: "Friday, 4 September 2026, 11:59 PM MYT", timezone: "Asia/Kuala_Lumpur (MYT, UTC+8)" },
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    },
    allowedProtocols: { value: ["THETANUTS"], source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
    allowMultiLeg: { value: true, source: "SYSTEM_DEFAULT", confidence: 1.0, requiresConfirmation: false },
  };

  const validCandidate: CandidateStrategy = {
    strategyId: "strategy-sim",
    name: "Long Put Protection",
    strategyType: "LONG_PUT",
    legs: [
      {
        side: "BUY",
        right: "PUT",
        strikePrice: MOCK_OPTION_BOOK_QUOTES[0].strikePrice,
        expiryTimestampMs: MOCK_OPTION_BOOK_QUOTES[0].expiryTimestampMs,
        requestedExposure: mockIntent.exposureAmount.value,
        resolvedOptionQuantity: mockIntent.exposureAmount.value,
        sizingStatus: "RESOLVED",
        quoteReference: MOCK_OPTION_BOOK_QUOTES[0].quoteId,
      },
    ],
    quotes: [
      {
        ...MOCK_OPTION_BOOK_QUOTES[0],
        rawApiData: {
          targetContract: "0x43063a482db1deb8ecf4177263b652882fa87431",
          timestampMs: Date.now(),
        },
      },
    ],
    status: "TECHNICALLY_FEASIBLE",
    rejectionReasons: [],
    scoresStatus: "EVALUATED",
    sizingStatus: "RESOLVED",
    preview: {
      previewStatus: "PREVIEW_AVAILABLE",
      pricePerContract: { amountBaseUnits: "135000000", decimals: 8, symbol: "USD" },
      premiumAmount: { amountBaseUnits: "2700000", decimals: 6, symbol: "USDC" },
      protocolFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
      referrerFee: { amountBaseUnits: "0", decimals: 6, symbol: "USDC" },
      totalExpectedCost: { amountBaseUnits: "2700000", decimals: 6, symbol: "USDC" },
      feeStatus: "ZERO_VERIFIED",
      collateralToken: "USDC",
      previewTimestampMs: Date.now(),
      previewSource: "THETANUTS_OPTIONBOOK_PREVIEW",
    },
  };

  it("should set targetContract from quote or SDK without fake placeholder addresses", async () => {
    const preview = await simulationService.generatePreview(mockIntent, validCandidate);
    expect(preview.targetContract).toBe("0x43063a482db1deb8ecf4177263b652882fa87431");
    expect(preview.status).toBe("PREVIEW_ONLY");
  });

  it("should compute proposalDigest and report bindingStatus as PREVIEW_BOUND", async () => {
    const preview = await simulationService.generatePreview(mockIntent, validCandidate);
    expect(preview.proposalDigest).toBeDefined();
    expect(typeof preview.proposalDigest).toBe("string");
    expect(preview.bindingStatus).toBe("PREVIEW_BOUND");
    expect(preview.bindingStatus).not.toBe("EXACT_TRANSACTION_BOUND");
    expect(preview.authorizedByHuman).toBe(false);
  });
});
