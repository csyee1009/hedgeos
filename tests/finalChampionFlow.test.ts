import {
  describe,
  expect,
  it,
} from "vitest";
import { ethers } from "ethers";
import {
  OPTION_BOOK_ABI,
} from "@thetanuts-finance/thetanuts-client";

import {
  ActionProposal,
  DiscoveryCandidate,
  ExecutionPreparation,
  MarketQuote,
  MarketSnapshotEvidence,
  ProtectionSituation,
  TokenAmount,
  TypedRiskIntent,
} from "../src/types";

import {
  OptionBookOrderEligibilityEngine,
} from "../src/services/OptionBookOrderEligibilityEngine";

import {
  calculateExactLongPutPayoff,
  ratioLessThanOrEqualPercent,
  usdc6ForContracts6,
} from "../src/services/ExactFinancialMath";

import {
  ProtectionDiscoveryEngine,
} from "../src/services/ProtectionDiscoveryEngine";

import {
  SimpleSituationService,
} from "../src/services/SimpleSituationService";

import {
  IntentEngine,
  formatCustomHorizon,
} from "../src/services/IntentEngine";

import {
  LLMOutputValidator,
} from "../src/services/LLMOutputValidator";

import {
  EvidenceRepository,
} from "../src/repositories/EvidenceRepository";

import {
  SqliteDatabase,
} from "../src/repositories/SqliteDatabase";

import {
  ExactExecutionPreparationService,
} from "../src/services/ExactExecutionPreparationService";

import {
  ActionProposalBuilder,
} from "../src/services/ActionProposalBuilder";

import {
  OnChainExecutionVerifier,
} from "../src/services/OnChainExecutionVerifier";

import {
  ThetanutsMarketService,
} from "../src/services/ThetanutsMarketService";

import {
  sha256Digest,
} from "../src/utils/canonicalDigest";

/* ================================================================
 * FIXTURE CONSTANTS
 * ================================================================ */

const maker =
  "0x1111111111111111111111111111111111111111";

const beneficiary =
  "0x2222222222222222222222222222222222222222";

const optionBook =
  "0x1bDff855d6811728acaDC00989e79143a2bdfDed";

const optionFactory =
  "0x8118daD971dEbffB49B9280047659174128A8B94";

const putImplementation =
  "0x7355EB92dfb0503DB558a70c10843618932ab290";

const priceFeed =
  "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";

const usdc =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const STRIKE_2500_8 =
  "250000000000";

const SPOT_3000_8 =
  "300000000000";

const QUANTITY_2_18 =
  "2000000000000000000";

const COST_10_USDC_6 =
  "10000000";

/* ================================================================
 * SIGNED OPTIONBOOK ORDER
 * ================================================================ */

function signedOrder(
  overrides: Record<
    string,
    unknown
  > = {}
) {
  const expiry =
    BigInt(
      Math.floor(
        Date.now() /
        1000
      ) +
      86_400
    );

  const orderExpiryTimestamp =
    Number(
      expiry -
      3600n
    );

  return {
    order: {
      maker,

      taker:
        ethers.ZeroAddress,

      option:
        ethers.ZeroAddress,

      isBuyer: false,

      numContracts:
        2_000_000n,

      price:
        500_000_000n,

      expiry,

      nonce: 7n,

      isCall: false,

      optionType: 1,

      strikes: [
        250_000_000_000n,
      ],

      implementation:
        putImplementation,
    },

    signature:
      "0x1234",

    availableAmount:
      5_000_000_000n,

    makerAddress:
      maker,

    rawApiData: {
      collateral:
        usdc,

      priceFeed,

      implementation:
        putImplementation,

      strikes: [
        STRIKE_2500_8,
      ],

      isCall:
        false,

      optionType: 1,

      isLong:
        true,

      orderExpiryTimestamp,

      extraOptionData:
        "0x",

      maxCollateralUsable:
        "5000000000",

      optionBookAddress:
        optionBook,
    },

    ...overrides,
  };
}

const implementationEvidence =
  [
    {
      address:
        putImplementation,

      name:
        "PUT",

      type:
        "VANILLA",

      numStrikes: 1,
    },
  ];

/* ================================================================
 * QUOTES / SNAPSHOTS
 * ================================================================ */

function eligibleQuote(
  id: string,
  strike8: string,
  cost6: string,
  rawOrder?: ReturnType<
    typeof signedOrder
  >
): MarketQuote {
  const raw =
    rawOrder ||
    signedOrder();

  const expiryTimestampMs =
    Number(
      raw.order.expiry
    ) * 1000;

  const deadlineMs =
    Number(
      raw.rawApiData
        .orderExpiryTimestamp
    ) * 1000;

  return {
    quoteId:
      id,

    sourceType:
      "OPTION_BOOK",

    protocol:
      "THETANUTS",

    asset:
      "ETH",

    optionRight:
      "PUT",

    strikePrice: {
      amountBaseUnits:
        strike8,

      decimals: 8,

      symbol:
        "USD",
    },

    expiryTimestampMs,

    premium: {
      amountBaseUnits:
        cost6,

      decimals: 6,

      symbol:
        "USDC",
    },

    availableQuantity: {
      amountBaseUnits:
        "10000000",

      decimals: 6,

      symbol:
        "CONTRACTS",
    },

    executableNow:
      true,

    makerAddress:
      maker,

    makerIsSeller:
      true,

    rawOrderIsLong:
      true,

    normalizedOptionType:
      "PUT",

    rawOptionType:
      "PUT",

    allStrikes: [
      {
        amountBaseUnits:
          strike8,

        decimals: 8,

        symbol:
          "USD",
      },
    ],

    implementationAddress:
      putImplementation,

    implementationName:
      "PUT",

    orderValidityDeadlineMs:
      deadlineMs,

    eligibilityEvidence: {
      status:
        "ELIGIBLE_LONG_PUT",

      checkedAtMs:
        Date.now(),

      checks: [],
    },

    rawApiData:
      raw,
  } as MarketQuote;
}

function situation():
  ProtectionSituation {
  return {
    asset: {
      value:
        "ETH",

      source:
        "USER_EXPLICIT",

      confidence: 1,

      requiresConfirmation:
        false,
    },

    exposureAmount: {
      value: {
        amountBaseUnits:
          QUANTITY_2_18,

        decimals: 18,

        symbol:
          "ETH",
      },

      source:
        "USER_EXPLICIT",

      confidence: 1,

      requiresConfirmation:
        false,
    },

    horizonTimestamp: {
      value:
        formatCustomHorizon(
          Date.now() +
          3_600_000
        ),

      source:
        "USER_EXPLICIT",

      confidence: 1,

      requiresConfirmation:
        false,
    },

    concern: {
      value:
        "PRICE_FALL",

      source:
        "USER_EXPLICIT",

      confidence: 1,

      requiresConfirmation:
        false,
    },

    missingFactualFields:
      [],

    groundingChecks:
      [],
  };
}

function snapshot(
  quotes:
    MarketQuote[]
): MarketSnapshotEvidence {
  const payload = {
    snapshotId:
      `market-test-${sha256Digest(
        quotes.map(
          (quote) =>
            quote.quoteId
        )
      ).slice(0, 8)}`,

    chainId:
      8453 as const,

    status:
      "LIVE_READ_AVAILABLE" as const,

    source:
      "CONTROLLED_TEST_SNAPSHOT" as const,

    capturedAtMs:
      Date.now(),

    spotPrice: {
      amountBaseUnits:
        SPOT_3000_8,

      decimals: 8,

      symbol:
        "USD",
    },

    rawOrderCount:
      quotes.length,

    eligibleOrderCount:
      quotes.length,

    rejectedOrderCount:
      0,

    quotes,

    rejectionReasons:
      [],
  };

  return {
    ...payload,

    snapshotDigest:
      sha256Digest(
        payload
      ),
  };
}

/* ================================================================
 * CONFIRMED INTENT
 * ================================================================ */

function confirmedIntent():
  TypedRiskIntent {
  const base =
    situation();

  const now =
    Date.now();

  return {
    intentId:
      "intent-final",

    version: 1,

    createdAtMs:
      now,

    updatedAtMs:
      now,

    confirmedByUser:
      true,

    confirmedAtMs:
      now,

    objective: {
      value:
        "DOWNSIDE_PROTECTION",

      source:
        "SYSTEM_DEFAULT",

      confidence: 1,

      requiresConfirmation:
        false,
    },

    asset:
      base.asset!,

    exposureAmount:
      base.exposureAmount!,

    targetMaxLossPercent: {
      value: 20,

      source:
        "USER_EXPLICIT",

      confidence: 1,

      requiresConfirmation:
        false,
    },

    maxPremiumUSDC: {
      value: {
        amountBaseUnits:
          "20000000",

        decimals: 6,

        symbol:
          "USDC",
      },

      source:
        "USER_EXPLICIT",

      confidence: 1,

      requiresConfirmation:
        false,
    },

    horizonTimestamp:
      base.horizonTimestamp!,

    allowedProtocols: {
      value: [
        "THETANUTS",
      ],

      source:
        "SYSTEM_DEFAULT",

      confidence: 1,

      requiresConfirmation:
        false,
    },

    allowMultiLeg: {
      value: false,

      source:
        "SYSTEM_DEFAULT",

      confidence: 1,

      requiresConfirmation:
        false,
    },
  };
}

/* ================================================================
 * THETANUTS SERVICE CONTROLLED FIXTURE
 * ================================================================ */

function serviceWithOrders(
  ordersOrError:
    any[] | Error
) {
  const service =
    new ThetanutsMarketService(
      "https://example.invalid"
    );

  (service as any).client =
  {
    chainConfig: {
      priceFeeds: {
        ETH:
          priceFeed,
      },

      tokens: {
        USDC: {
          address:
            usdc,

          decimals: 6,

          symbol:
            "USDC",
        },
      },

      implementations: {
        PUT:
          putImplementation,
      },

      optionImplementations:
        {},

      contracts: {
        optionBook,

        optionFactory,
      },
    },

    api: {
      fetchOrders:
        async () => {
          if (
            ordersOrError instanceof
            Error
          ) {
            throw ordersOrError;
          }

          return ordersOrError;
        },

      getMarketData:
        async () => ({
          prices: {
            ETH: 3000,
          },
        }),
    },

    optionBook: {
      calculateMaxContracts:
        () =>
          10_000_000n,

      previewFillOrder:
        (
          order: any
        ) => ({
          pricePerContract:
            order.order
              .price,

          totalCollateral:
            10_000_000n,

          collateralToken:
            usdc,

          maker,

          expiry:
            order.order
              .expiry,

          numContracts:
            2_000_000n,

          maxContracts:
            10_000_000n,

          isCall:
            false,

          optionType:
            1,

          strikes:
            order.order
              .strikes,
        }),
    },
  };

  return service;
}

/* ================================================================
 * FINANCIAL / MARKET FOUNDATION
 * ================================================================ */

describe(
  "Final champion financial evidence foundation",
  () => {
    it(
      "accepts maker-sells/taker-buys vanilla PUT orders",
      () => {
        const result =
          OptionBookOrderEligibilityEngine.evaluate(
            signedOrder(),
            implementationEvidence
          );

        expect(
          result.eligible
        ).toBe(true);

        const wrong =
          signedOrder();

        wrong.rawApiData.isLong =
          false;

        expect(
          OptionBookOrderEligibilityEngine.evaluate(
            wrong,
            implementationEvidence
          ).eligible
        ).toBe(false);
      }
    );

    it(
      "rejects native multi-strike and unsupported implementation structures",
      () => {
        const multi =
          signedOrder();

        multi.rawApiData.strikes =
          [
            "240000000000",
            STRIKE_2500_8,
          ];

        multi.order.strikes =
          [
            240000000000n,
            250000000000n,
          ];

        expect(
          OptionBookOrderEligibilityEngine.evaluate(
            multi,
            implementationEvidence
          ).eligible
        ).toBe(false);

        const unsupported =
          signedOrder();

        unsupported.rawApiData.implementation =
          "0x3333333333333333333333333333333333333333";

        expect(
          OptionBookOrderEligibilityEngine.evaluate(
            unsupported,
            implementationEvidence
          ).eligible
        ).toBe(false);
      }
    );

    it(
      "rejects expired deadlines and zero maker capacity",
      () => {
        const expired =
          signedOrder();

        expired.rawApiData.orderExpiryTimestamp =
          Math.floor(
            Date.now() /
            1000
          ) - 1;

        expect(
          OptionBookOrderEligibilityEngine.evaluate(
            expired,
            implementationEvidence
          ).eligible
        ).toBe(false);

        const empty =
          signedOrder({
            availableAmount:
              0n,
          });

        expect(
          OptionBookOrderEligibilityEngine.evaluate(
            empty,
            implementationEvidence
          ).eligible
        ).toBe(false);
      }
    );

    it(
      "market adapter exposes only eligible protective PUT orders",
      async () => {
        const valid =
          signedOrder();

        const wrongDirection =
          signedOrder();

        wrongDirection.rawApiData.isLong =
          false;

        const multi =
          signedOrder();

        multi.rawApiData.strikes =
          [
            "240000000000",
            STRIKE_2500_8,
          ];

        multi.order.strikes =
          [
            240000000000n,
            250000000000n,
          ];

        const service =
          serviceWithOrders([
            valid,
            wrongDirection,
            multi,
          ]);

        const quotes =
          await service.fetchMarketQuotes(
            confirmedIntent()
          );

        expect(
          quotes
        ).toHaveLength(1);

        expect(
          quotes[0]
            .optionRight
        ).toBe("PUT");

        expect(
          quotes[0]
            .makerIsSeller
        ).toBe(true);

        expect(
          quotes[0]
            .allStrikes
        ).toHaveLength(1);
      }
    );

    it(
      "distinguishes verified empty orderbooks from failed reads",
      async () => {
        const empty =
          serviceWithOrders(
            []
          );

        expect(
          await empty.fetchRawOrders()
        ).toEqual([]);

        expect(
          empty.getMarketStateSync()
            .status
        ).toBe(
          "VERIFIED_EMPTY_ORDERBOOK"
        );

        const failed =
          serviceWithOrders(
            new Error(
              "network"
            )
          );

        await expect(
          failed.fetchRawOrders()
        ).rejects.toThrow();

        expect(
          failed.getMarketStateSync()
            .status
        ).toBe(
          "LIVE_READ_FAILED"
        );
      }
    );

    it(
      "does not interpret rate limiting as an empty market",
      async () => {
        const service =
          serviceWithOrders(
            new Error(
              "429 Too Many Requests - rate limit"
            )
          );

        await expect(
          service.fetchRawOrders()
        ).rejects.toThrow();

        expect(
          service.getMarketStateSync()
            .status
        ).toBe(
          "RATE_LIMITED"
        );
      }
    );

    it(
      "fails preview closed when SDK quantity differs from requested quantity",
      async () => {
        const raw =
          signedOrder();

        const service =
          serviceWithOrders([
            raw,
          ]);

        (
          service as any
        ).client.optionBook.previewFillOrder =
          (
            order: any
          ) => ({
            pricePerContract:
              order.order
                .price,

            totalCollateral:
              10_000_000n,

            collateralToken:
              usdc,

            maker,

            expiry:
              order.order
                .expiry,

            numContracts:
              1_999_999n,

            maxContracts:
              10_000_000n,

            isCall:
              false,

            optionType:
              1,

            strikes:
              order.order
                .strikes,
          });

        const preview =
          await service.previewFill(
            {
              rawApiData:
                raw,
            } as any,

            2n *
            10n ** 18n
          );

        expect(
          preview.previewStatus
        ).toBe(
          "PREVIEW_FAILED"
        );

        expect(
          preview.error
        ).toMatch(
          /quantity mismatch/i
        );
      }
    );

    it(
      "keeps verified buyer spend separate from incomplete fee breakdown",
      async () => {
        const raw =
          signedOrder();

        const service =
          serviceWithOrders([
            raw,
          ]);

        const preview =
          await service.previewFill(
            {
              rawApiData:
                raw,
            } as any,

            2n *
            10n ** 18n
          );

        expect(
          preview.previewStatus
        ).toBe(
          "PREVIEW_AVAILABLE"
        );

        expect(
          preview.buyerSpendStatus
        ).toBe(
          "VERIFIED"
        );

        expect(
          preview.feeStatus
        ).toBe(
          "INCOMPLETE"
        );
      }
    );

    it(
      "uses exact contract and downside threshold arithmetic",
      () => {
        expect(
          usdc6ForContracts6(
            2_000_000n,
            500_000_000n
          )
        ).toBe(
          10_000_000n
        );

        const payoff =
          calculateExactLongPutPayoff(
            {
              quantity18:
                2n *
                10n ** 18n,

              strikePrice8:
                2500n *
                10n ** 8n,

              spotPrice8:
                3000n *
                10n ** 8n,

              totalCostUSDC6:
                10n *
                10n ** 6n,

              assetSymbol:
                "ETH",
            }
          );

        expect(
          ratioLessThanOrEqualPercent(
            BigInt(
              payoff.exact!
                .maxLossValuePrice8
            ),
            BigInt(
              payoff.exact!
                .exposureValuePrice8
            ),
            "16.833333"
          )
        ).toBe(false);

        expect(
          ratioLessThanOrEqualPercent(
            BigInt(
              payoff.exact!
                .maxLossValuePrice8
            ),
            BigInt(
              payoff.exact!
                .exposureValuePrice8
            ),
            "16.833334"
          )
        ).toBe(true);
      }
    );
  }
);

/* ================================================================
 * AI / SIMPLE MODE
 * ================================================================ */

describe(
  "AI grounding and simple-mode boundaries",
  () => {
    it(
      "extracts factual context without inventing budget or downside",
      async () => {
        const parsed =
          await new SimpleSituationService(
            new IntentEngine()
          ).parse(
            "I have 2 ETH and I'm worried the price may fall this week. I don't know what protection makes sense."
          );

        expect(
          parsed.missingFactualFields
        ).toEqual([]);

        expect(
          parsed.asset?.value
        ).toBe("ETH");

        expect(
          parsed.exposureAmount
            ?.value
            .amountBaseUnits
        ).toBe(
          QUANTITY_2_18
        );

        expect(
          parsed.horizonTimestamp
            ?.source
        ).toBe(
          "PARSER_INFERRED"
        );

        expect(
          parsed.horizonTimestamp
            ?.requiresConfirmation
        ).toBe(true);

        expect(
          (
            parsed as any
          ).maxPremiumUSDC
        ).toBeUndefined();

        expect(
          (
            parsed as any
          ).targetMaxLossPercent
        ).toBeUndefined();
      }
    );

    it(
      "rejects AI-invented financial thresholds that are absent from user text",
      () => {
        const rawModelOutput =
        {
          objective:
            "DOWNSIDE_PROTECTION",

          asset: {
            value:
              "ETH",

            evidence:
              "ETH",
          },

          exposureAmount: {
            value:
              "2",

            unit:
              "ETH",

            evidence:
              "2 ETH",
          },

          targetMaxLossPercent:
          {
            value: 8,

            evidence:
              "worried",
          },

          maxPremium: {
            value:
              "15",

            currency:
              "USDC",

            evidence:
              "worried",
          },

          horizon: {
            rawText:
              "this week",

            evidence:
              "this week",
          },

          allowMultiLeg: {
            value:
              false,

            evidence:
              null,
          },

          ambiguities:
            [],

          clarificationQuestions:
            [],
        };

        const result =
          LLMOutputValidator.validateAndNormalize(
            rawModelOutput,
            "I have 2 ETH and I'm worried this week."
          );

        expect(
          result
            .candidateDraft
            .targetMaxLossPercent
        ).toBeNull();

        expect(
          result
            .candidateDraft
            .maxPremiumUSDC
        ).toBeNull();

        expect(
          result.missingFields
        ).toContain(
          "targetMaxLossPercent"
        );

        expect(
          result.missingFields
        ).toContain(
          "maxPremiumUSDC"
        );
      }
    );
  }
);

/* ================================================================
 * DETERMINISTIC DISCOVERY
 * ================================================================ */

describe(
  "Deterministic protection discovery",
  () => {
    it(
      "builds a Pareto frontier and removes dominated points",
      async () => {
        const quotes = [
          eligibleQuote(
            "low",
            "250000000000",
            "10000000"
          ),

          eligibleQuote(
            "strong",
            "270000000000",
            "20000000"
          ),

          eligibleQuote(
            "dominated",
            "260000000000",
            "25000000"
          ),
        ];

        const fakeMarket =
        {
          calculateMaxContracts:
            () =>
              10_000_000n,

          previewFill:
            async (
              quote:
                MarketQuote
            ) => ({
              previewStatus:
                "PREVIEW_AVAILABLE",

              pricePerContract: {
                amountBaseUnits:
                  quote.premium
                    .amountBaseUnits,

                decimals: 8,

                symbol:
                  "USD",
              },

              premiumAmount:
                quote.premium,

              protocolFee: {
                amountBaseUnits:
                  "0",

                decimals: 6,

                symbol:
                  "USDC",
              },

              referrerFee: {
                amountBaseUnits:
                  "0",

                decimals: 6,

                symbol:
                  "USDC",
              },

              totalExpectedCost:
                quote.premium,

              feeStatus:
                "INCOMPLETE",

              buyerSpendStatus:
                "VERIFIED",

              buyerSpendVerificationMode:
                "TOTAL_BUYER_SPEND_PROVEN",

              collateralToken:
                usdc,

              previewTimestampMs:
                Date.now(),

              previewSource:
                "THETANUTS_OPTIONBOOK_PREVIEW",

              rawPreviewData: {
                numContracts:
                  "2000000",
              },
            }),
        };

        const engine =
          new ProtectionDiscoveryEngine(
            fakeMarket as any
          );

        const result =
          await engine.discoverFromSnapshot(
            situation(),
            snapshot(
              quotes
            )
          );

        expect(
          result.paretoFrontier.map(
            (item) =>
              item.quoteId
          )
        ).toEqual([
          "low",
          "strong",
        ]);

        expect(
          result
            .paretoFrontier[0]
            .labels
        ).toContain(
          "LOWER_COST"
        );

        expect(
          result
            .paretoFrontier[1]
            .labels
        ).toContain(
          "STRONGER_MODELED_PROTECTION"
        );

        expect(
          engine
            .strongestWithinBudget(
              result
                .paretoFrontier,
              {
                amountBaseUnits:
                  "15000000",

                decimals: 6,

                symbol:
                  "USDC",
              }
            )
            ?.quoteId
        ).toBe("low");

        expect(
          engine
            .lowestCostForDownside(
              result
                .paretoFrontier,
              11
            )
            ?.quoteId
        ).toBe(
          "strong"
        );
      }
    );

    it(
      "fails closed when market evidence is rate limited",
      async () => {
        const unavailable =
          snapshot([]);

        (
          unavailable as any
        ).status =
          "RATE_LIMITED";

        (
          unavailable as any
        ).error =
          "429 rate limited";

        const engine =
          new ProtectionDiscoveryEngine(
            {} as any
          );

        const result =
          await engine.discoverFromSnapshot(
            situation(),
            unavailable
          );

        expect(
          result.status
        ).toBe(
          "LIVE_MARKET_UNAVAILABLE"
        );

        expect(
          result.paretoFrontier
        ).toHaveLength(0);
      }
    );
  }
);

/* ================================================================
 * EVIDENCE TAMPER DETECTION
 * ================================================================ */

describe(
  "Tamper-evident evidence repository",
  () => {
    it(
      "rejects a modified stored discovery payload",
      () => {
        const db =
          new SqliteDatabase(
            ":memory:"
          );

        const repo =
          new EvidenceRepository(
            db
          );

        const unavailablePayload =
        {
          discoveryId:
            "discovery-tamper",

          situation:
            situation(),

          marketSnapshot:
            snapshot([]),

          status:
            "PRECISE_INFEASIBILITY" as const,

          paretoFrontier:
            [],

          excludedCandidateCount:
            0,

          deterministicRule:
            "rule",

          explanation:
            "none",
        };

        const discovery =
        {
          ...unavailablePayload,

          discoveryDigest:
            sha256Digest(
              unavailablePayload
            ),
        };

        repo.saveDiscovery(
          discovery
        );

        const row =
          db.rawDb
            .prepare(
              "SELECT payload_json FROM discovery_snapshots WHERE discovery_id = ?"
            )
            .get(
              discovery.discoveryId
            ) as any;

        const tampered =
          JSON.parse(
            row.payload_json
          );

        tampered.explanation =
          "fabricated";

        db.rawDb
          .prepare(
            "UPDATE discovery_snapshots SET payload_json = ? WHERE discovery_id = ?"
          )
          .run(
            JSON.stringify(
              tampered
            ),
            discovery.discoveryId
          );

        expect(() =>
          repo.getDiscovery(
            discovery.discoveryId
          )
        ).toThrow(
          /digest validation/i
        );

        db.close();
      }
    );
  }
);

/* ================================================================
 * EXACT EXECUTION FIXTURE
 * ================================================================ */

async function buildPreparationFixture(
  mutateProposal?: (
    proposal: ActionProposal
  ) => void
):
  Promise<{
    preparation:
    ExecutionPreparation;

    quote:
    MarketQuote;

    candidate:
    DiscoveryCandidate;

    marketSnapshot:
    MarketSnapshotEvidence;
  }> {
  const raw =
    signedOrder();

  const quote =
    eligibleQuote(
      "exact",
      STRIKE_2500_8,
      COST_10_USDC_6,
      raw
    );

  const marketSnapshot =
    snapshot([
      quote,
    ]);

  const intent =
    confirmedIntent();

  const payoff =
    calculateExactLongPutPayoff(
      {
        quantity18:
          BigInt(
            QUANTITY_2_18
          ),

        strikePrice8:
          BigInt(
            STRIKE_2500_8
          ),

        spotPrice8:
          BigInt(
            SPOT_3000_8
          ),

        totalCostUSDC6:
          BigInt(
            COST_10_USDC_6
          ),

        assetSymbol:
          "ETH",
      }
    );

  const exact =
    payoff.exact!;

  const digestPayload =
  {
    snapshotId:
      marketSnapshot
        .snapshotId,

    snapshotDigest:
      marketSnapshot
        .snapshotDigest,

    quoteId:
      quote.quoteId,

    strategyType:
      "LONG_PUT",

    asset:
      "ETH",

    quantity18:
      QUANTITY_2_18,

    spendUSDC6:
      COST_10_USDC_6,

    maxLossValuePrice8:
      exact.maxLossValuePrice8,

    exposureValuePrice8:
      exact.exposureValuePrice8,

    strikePrice8:
      STRIKE_2500_8,

    spotPrice8:
      SPOT_3000_8,

    expiryTimestampMs:
      quote.expiryTimestampMs,

    allStrikes:
      (
        quote.allStrikes ??
        [quote.strikePrice]
      ).map(
        (strike) => ({
          amountBaseUnits:
            strike.amountBaseUnits,

          decimals:
            strike.decimals,
        })
      ),

    implementationAddress:
      quote.implementationAddress,

    makerAddress:
      quote.makerAddress,

    makerIsSeller:
      quote.makerIsSeller,

    normalizedOptionType:
      quote.normalizedOptionType,

    orderValidityDeadlineMs:
      quote.orderValidityDeadlineMs,
  };

  const candidateDigest =
    sha256Digest(
      digestPayload
    );

  const candidate:
    DiscoveryCandidate =
  {
    candidateId:
      `candidate-${candidateDigest.slice(
        0,
        16
      )}`,

    quoteId:
      quote.quoteId,

    strategyType:
      "LONG_PUT",

    asset:
      "ETH",

    quantity: {
      amountBaseUnits:
        QUANTITY_2_18,

      decimals: 18,

      symbol:
        "CONTRACTS",
    },

    coveredExposure:
      intent.exposureAmount
        .value,

    verifiedBuyerSpend:
    {
      amountBaseUnits:
        COST_10_USDC_6,

      decimals: 6,

      symbol:
        "USDC",
    },

    buyerSpendStatus:
      "VERIFIED",

    feeStatus:
      "INCOMPLETE",

    modeledAtExpiryDownside:
    {
      displayPercent:
        payoff.effectiveDownsidePercent,

      maxLossValuePrice8:
        exact.maxLossValuePrice8,

      exposureValuePrice8:
        exact.exposureValuePrice8,
    },

    strike:
      quote.strikePrice,

    expiryTimestampMs:
      quote.expiryTimestampMs,

    maxFillableQuantity:
    {
      amountBaseUnits:
        "10000000000000000000",

      decimals: 18,

      symbol:
        "CONTRACTS",
    },

    marketSnapshotId:
      marketSnapshot
        .snapshotId,

    marketSnapshotDigest:
      marketSnapshot
        .snapshotDigest,

    candidateDigest,

    labels: [],
  };

  const proposal:
    ActionProposal =
  {
    proposalId:
      "proposal-final",

    intentId:
      intent.intentId,

    intentVersion:
      intent.version,

    strategyId:
      "strategy-exact",

    protocol:
      "THETANUTS",

    chainId: 8453,

    actionType:
      "OPTIONBOOK_FILL_ORDER",

    targetContract:
      optionBook,

    normalizedParameters:
      {},

    expectedAsset:
      "ETH",

    expectedOptionRight:
      "PUT",

    expectedStrike:
      quote.strikePrice,

    expectedQuantity:
      candidate.quantity,

    expectedTotalCost:
      candidate.verifiedBuyerSpend,

    feeStatus:
      "INCOMPLETE",

    buyerSpendStatus:
      "VERIFIED",

    expectedExpiryMs:
      quote.expiryTimestampMs,

    boundQuoteId:
      quote.quoteId,

    boundCandidateDigest:
      candidateDigest,

    boundMarketSnapshotId:
      marketSnapshot
        .snapshotId,

    boundMarketSnapshotDigest:
      marketSnapshot
        .snapshotDigest,

    proposalCreatedAtMs:
      Date.now(),

    proposalStatus:
      "PREPARED",

    bindingStatus:
      "PREVIEW_BOUND",

    proposalDigest:
      "a".repeat(64),

    authorizationStatus:
      "UNAUTHORIZED",
  };

  proposal.proposalDigest =
    ActionProposalBuilder.computeProposalDigest({
      intentId: proposal.intentId,
      intentVersion: proposal.intentVersion,
      strategyId: proposal.strategyId,
      protocol: proposal.protocol,
      chainId: proposal.chainId,
      actionType: proposal.actionType,
      targetContract: proposal.targetContract,
      asset: proposal.expectedAsset,
      optionRight: proposal.expectedOptionRight,
      strikeBaseUnits:
        proposal.expectedStrike.amountBaseUnits,
      strikeDecimals:
        proposal.expectedStrike.decimals,
      expiryTimestampMs:
        proposal.expectedExpiryMs,
      quantityBaseUnits:
        proposal.expectedQuantity.amountBaseUnits,
      quantityDecimals:
        proposal.expectedQuantity.decimals,
      expectedTotalCostBaseUnits:
        proposal.expectedTotalCost?.amountBaseUnits,
      expectedTotalCostDecimals:
        proposal.expectedTotalCost?.decimals,
      boundQuoteId:
        proposal.boundQuoteId,
      orderIndex:
        proposal.normalizedParameters?.orderIndex,
      makerAddress:
        proposal.normalizedParameters?.makerAddress,
      feeStatus:
        proposal.feeStatus,
      buyerSpendStatus:
        proposal.buyerSpendStatus,
      orderSemanticDigest:
        proposal.normalizedParameters?.orderSemanticDigest,
      boundCandidateDigest:
        proposal.boundCandidateDigest,
      boundMarketSnapshotId:
        proposal.boundMarketSnapshotId,
      boundMarketSnapshotDigest:
        proposal.boundMarketSnapshotDigest,
    });

  mutateProposal?.(proposal);

  const contractOrder =
  {
    maker,

    orderExpiryTimestamp:
      BigInt(
        raw.rawApiData
          .orderExpiryTimestamp
      ),

    collateral:
      usdc,

    isCall:
      false,

    priceFeed,

    implementation:
      putImplementation,

    isLong:
      true,

    maxCollateralUsable:
      BigInt(
        raw.rawApiData
          .maxCollateralUsable
      ),

    strikes: [
      250000000000n,
    ],

    expiry:
      raw.order.expiry,

    price:
      raw.order.price,

    numContracts:
      2_000_000n,

    extraOptionData:
      "0x",
  };

  const data =
    new ethers.Interface(
      OPTION_BOOK_ABI as any
    ).encodeFunctionData(
      "fillOrder",
      [
        contractOrder,
        raw.signature,
        ethers.ZeroAddress,
      ]
    );

  const fakeMarket =
  {
    getOrderIdentityDigest:
      () =>
        "order-identity",

    computeOptionBookNonce:
      () =>
        String(
          raw.order.nonce
        ),

    getOptionBookAddress:
      () =>
        optionBook,

    getOptionFactoryAddress:
      () =>
        optionFactory,

    encodeExactFill:
      async () => ({
        to:
          optionBook,

        data,

        buyerSpendUSDC6:
          10_000_000n,

        numContracts6:
          2_000_000n,

        rawOrder:
          raw,

        preview: {
          previewStatus:
            "PREVIEW_AVAILABLE",

          buyerSpendStatus:
            "VERIFIED",

          buyerSpendVerificationMode:
            "TOTAL_BUYER_SPEND_PROVEN",

          feeStatus:
            "INCOMPLETE",

          premiumAmount: {
            amountBaseUnits:
              COST_10_USDC_6,

            decimals: 6,

            symbol:
              "USDC",
          },

          protocolFee: {
            amountBaseUnits:
              "0",

            decimals: 6,

            symbol:
              "USDC",
          },

          referrerFee: {
            amountBaseUnits:
              "0",

            decimals: 6,

            symbol:
              "USDC",
          },

          totalExpectedCost:
          {
            amountBaseUnits:
              COST_10_USDC_6,

            decimals: 6,

            symbol:
              "USDC",
          },

          previewTimestampMs:
            Date.now(),

          previewSource:
            "CONTROLLED_TEST_PREVIEW",

          rawPreviewData:
            {},
        },
      }),
  };

  const policyDecision =
    {
      decisionId:
        "policy-final",

      intentId:
        intent.intentId,

      strategyId:
        proposal.strategyId,

      stage:
        "EXECUTION_PREPARATION",

      overallStatus:
        "PASS",

      passedAllInvariants:
        true,

      checks: [
        {
          ruleId:
            "TEST_POLICY",

          description:
            "Controlled exact preparation policy evidence",

          status:
            "PASS",

          details:
            "All controlled-test invariants pass.",
        },
      ],

      evaluatedAtMs:
        Date.now(),
    } as any;

  const preparation =
    await new ExactExecutionPreparationService(
      fakeMarket as any
    ).prepare({
      intent,

      proposal,

      quote,

      candidate,

      snapshot:
        marketSnapshot,

      expectedBeneficiary:
        beneficiary,

      policyDecision,
    });

  return {
    preparation,
    quote,
    candidate,
    marketSnapshot,
  };
}

/* ================================================================
 * EXACT PREPARATION
 * ================================================================ */

describe(
  "Exact non-custodial preparation",
  () => {
    it(
      "rejects a proposal changed after its digest was created",
      async () => {
        await expect(
          buildPreparationFixture(
            (proposal) => {
              proposal.expectedExpiryMs += 1;
            }
          )
        ).rejects.toThrow(
          /Proposal digest does not match proposal contents/
        );
      }
    );

    it(
      "binds selected candidate, snapshot, policy and exact calldata without a signer",
      async () => {
        const {
          preparation,
          candidate,
          marketSnapshot,
        } =
          await buildPreparationFixture();

        expect(
          preparation
            .transaction
            .status
        ).toBe(
          "EXACT_TRANSACTION_PREPARED"
        );

        expect(
          preparation
            .transaction
            .calldataHash
        ).toBe(
          ethers.keccak256(
            preparation
              .transaction
              .data
          )
        );

        expect(
          preparation
            .candidateDigest
        ).toBe(
          candidate
            .candidateDigest
        );

        expect(
          preparation
            .marketSnapshotId
        ).toBe(
          marketSnapshot
            .snapshotId
        );

        expect(
          preparation
            .marketSnapshotDigest
        ).toBe(
          marketSnapshot
            .snapshotDigest
        );

        expect(
          preparation
            .transaction
            .order
            .strikes
        ).toEqual([
          STRIKE_2500_8,
        ]);

        expect(
          preparation
            .transaction
            .order
            .isLong
        ).toBe(true);

        expect(
          preparation
            .transaction
            .order
            .isCall
        ).toBe(false);

        expect(
          preparation
            .transaction
            .canonicalOptionFactory
        ).toBe(
          ethers.getAddress(
            optionFactory
          )
        );

        expect(
          preparation
            .transaction
            .expectedBeneficiary
        ).toBe(
          ethers.getAddress(
            beneficiary
          )
        );
      }
    );

    it(
      "changes semantic evidence when a financially material order field changes",
      async () => {
        const {
          preparation,
        } =
          await buildPreparationFixture();

        const changed =
        {
          ...preparation
            .transaction,

          order: {
            ...preparation
              .transaction
              .order,

            nonce: "8",
          },
        };

        expect(
          sha256Digest(
            changed
          )
        ).not.toBe(
          sha256Digest(
            preparation
              .transaction
          )
        );
      }
    );
  }
);

/* ================================================================
 * READ-ONLY ON-CHAIN VERIFICATION
 * ================================================================ */

function chainProvider(
  prepared:
    ExecutionPreparation,

  overrides:
    Record<
      string,
      any
    > = {}
) {
  return {
    getNetwork:
      async () => ({
        chainId:
          8453n,
      }),

    getTransaction:
      async () => ({
        to:
          prepared.transaction
            .to,

        from:
          prepared.transaction
            .expectedExecutor ||
          prepared.transaction
            .expectedBeneficiary,

        data:
          prepared.transaction
            .data,

        value:
          0n,

        ...(overrides.tx ||
          {}),
      }),

    getTransactionReceipt:
      async () => ({
        status: 1,

        blockNumber:
          100,

        blockHash:
          `0x${"3".repeat(
            64
          )}`,

        logs: [],

        ...(overrides.receipt ||
          {}),
      }),

    getBlockNumber:
      async () =>
        102,

    getBlock:
      async () => ({
        hash:
          `0x${"3".repeat(
            64
          )}`,
      }),

    getCode:
      async () =>
        "0x01",
  };
}

describe(
  "Independent on-chain verification",
  () => {
    it(
      "rejects verification on the wrong chain",
      async () => {
        const {
          preparation,
        } =
          await buildPreparationFixture();

        const verifier =
          new OnChainExecutionVerifier(
            {
              getNetwork:
                async () => ({
                  chainId:
                    1n,
                }),
            } as any
          );

        const result =
          await verifier.verify(
            preparation,
            `0x${"1".repeat(
              64
            )}`
          );

        expect(
          result.status
        ).toBe(
          "MISMATCH"
        );
      }
    );

    it(
      "does not confirm protection from receipt success alone",
      async () => {
        const {
          preparation,
        } =
          await buildPreparationFixture();

        const result =
          await new OnChainExecutionVerifier(
            chainProvider(
              preparation
            ) as any
          ).verify(
            preparation,
            `0x${"2".repeat(
              64
            )}`
          );

        expect(
          result.status
        ).toBe(
          "INSUFFICIENT_EVIDENCE"
        );

        expect(
          result.explanation
        ).toMatch(
          /successful receipt|intended protection|position/i
        );
      }
    );

    it(
      "rejects wrong target, calldata and executor independently",
      async () => {
        const {
          preparation,
        } =
          await buildPreparationFixture();

        const hash =
          `0x${"4".repeat(
            64
          )}`;

        const mutatedData =
          `${preparation.transaction.data.slice(
            0,
            -2
          )}${preparation.transaction.data.endsWith(
            "00"
          )
            ? "01"
            : "00"
          }`;

        for (
          const tx of
          [
            {
              to:
                maker,
            },

            {
              data:
                mutatedData,
            },

            {
              from:
                maker,
            },
          ]
        ) {
          const result =
            await new OnChainExecutionVerifier(
              chainProvider(
                preparation,
                {
                  tx,
                }
              ) as any
            ).verify(
              preparation,
              hash
            );

          expect(
            result.status
          ).toBe(
            "MISMATCH"
          );
        }
      }
    );

    it(
      "reports a reverted external transaction without claiming protection",
      async () => {
        const {
          preparation,
        } =
          await buildPreparationFixture();

        const result =
          await new OnChainExecutionVerifier(
            chainProvider(
              preparation,
              {
                receipt: {
                  status: 0,
                },
              }
            ) as any
          ).verify(
            preparation,
            `0x${"5".repeat(
              64
            )}`
          );

        expect(
          result.status
        ).toBe(
          "REVERTED"
        );
      }
    );

    it(
      "does not equate event premium with total buyer spend and rejects premium above committed spend",
      async () => {
        const {
          preparation,
        } =
          await buildPreparationFixture();

        const iface =
          new ethers.Interface(
            OPTION_BOOK_ABI as any
          );

        const event =
          iface.getEvent(
            "OrderFilled"
          )!;

        const encoded =
          iface.encodeEventLog(
            event,
            [
              7n,

              beneficiary,

              maker,

              "0x4444444444444444444444444444444444444444",

              25_000_000n,

              0n,

              ethers.ZeroAddress,

              0n,

              true,
            ]
          );

        const log =
        {
          address:
            optionBook,

          topics:
            encoded.topics,

          data:
            encoded.data,

          index: 1,
        };

        const result =
          await new OnChainExecutionVerifier(
            chainProvider(
              preparation,
              {
                receipt: {
                  logs: [
                    log,
                  ],
                },
              }
            ) as any
          ).verify(
            preparation,
            `0x${"6".repeat(
              64
            )}`
          );

        expect(
          result.status
        ).toBe(
          "MISMATCH"
        );

        expect(
          result.checks.find(
            (item) =>
              item.check ===
              "EVENT_PREMIUM_WITHIN_COMMITTED_SPEND"
          )?.passed
        ).toBe(false);
      }
    );
  }
);
