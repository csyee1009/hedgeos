import { describe, expect, it } from "vitest";
import request from "supertest";
import {
  app,
  checkRateLimit,
  cleanExpiredRateLimits,
  clearRateLimitCache,
  intentRepository,
} from "../src/server";
import { ActionProposalBuilder } from "../src/services/ActionProposalBuilder";
import { ApplicationStateMachine } from "../src/services/ApplicationStateMachine";
import {
  IntentVersionGuard,
  ProposalDigestGuard,
  SequenceRaceGuard,
} from "../src/utils/asyncRaceGuard";
import { ThetanutsSimulationService } from "../src/services/ThetanutsSimulationService";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import {
  CandidateStrategy,
  MarketQuote,
  TypedRiskIntent,
} from "../src/types";

describe(
  "Prompt 8 Repair: State Machine Hardening, API Defenses & Async Race Guards",
  () => {
    const simService =
      new ThetanutsSimulationService();

    const marketService =
      new ThetanutsMarketService("");

    marketService.getOrderIdentityDigest =
      () =>
        "controlled-test-order-digest";

    const validConfirmedIntent:
      TypedRiskIntent = {
      intentId: "intent-repair-001",
      version: 1,

      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),

      confirmedByUser: true,
      confirmedAtMs: Date.now(),

      objective: {
        value:
          "DOWNSIDE_PROTECTION",
        source:
          "USER_EXPLICIT",
        confidence: 1,
        requiresConfirmation:
          false,
      },

      asset: {
        value: "ETH",
        source:
          "USER_EXPLICIT",
        confidence: 1,
        requiresConfirmation:
          false,
      },

      exposureAmount: {
        value: {
          amountBaseUnits:
            "2000000000000000000",
          decimals: 18,
          symbol: "ETH",
        },
        source:
          "USER_EXPLICIT",
        confidence: 1,
        requiresConfirmation:
          false,
      },

      targetMaxLossPercent: {
        value: 8,
        source:
          "USER_EXPLICIT",
        confidence: 1,
        requiresConfirmation:
          false,
      },

      maxPremiumUSDC: {
        value: {
          amountBaseUnits:
            "15000000",
          decimals: 6,
          symbol: "USDC",
        },
        source:
          "USER_EXPLICIT",
        confidence: 1,
        requiresConfirmation:
          false,
      },

      horizonTimestamp: {
        value: {
          timestampMs:
            Date.now() +
            86400000 * 7,
          isoString:
            "2026-09-07T15:59:59.999Z",
          formattedDisplay:
            "Friday, September 7, 2026",
          timezone:
            "Asia/Kuala_Lumpur (MYT, UTC+8)",
        },
        source:
          "USER_EXPLICIT",
        confidence: 1,
        requiresConfirmation:
          false,
      },

      allowedProtocols: {
        value: ["THETANUTS"],
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

    const validQuote:
      MarketQuote = {
      quoteId:
        "quote-repair-01",

      sourceType:
        "OPTION_BOOK",

      protocol:
        "THETANUTS",

      asset: "ETH",

      optionRight:
        "PUT",

      strikePrice: {
        amountBaseUnits:
          "230000000000",
        decimals: 8,
        symbol: "USD",
      },

      expiryTimestampMs:
        Date.now() +
        86400000 * 7,

      premium: {
        amountBaseUnits:
          "9000000",
        decimals: 6,
        symbol: "USDC",
      },

      availableQuantity: {
        amountBaseUnits:
          "5000000000000000000",
        decimals: 18,
        symbol: "ETH",
      },

      executableNow: true,

      makerAddress:
        "0x1234567890abcdef1234567890abcdef12345678",

      orderIndex: 0,

      allStrikes: [
        {
          amountBaseUnits:
            "230000000000",
          decimals: 8,
          symbol: "USD",
        },
      ],

      implementationAddress:
        "0x7355EB92dfb0503DB558a70c10843618932ab290",

      implementationName:
        "PUT",

      makerIsSeller: true,

      rawOrderIsLong: true,

      normalizedOptionType:
        "PUT",

      rawOptionType: 1,

      orderValidityDeadlineMs:
        Date.now() +
        3_600_000,

      eligibilityEvidence: {
        status:
          "ELIGIBLE_LONG_PUT",

        checkedAtMs:
          Date.now(),

        checks: [],
      },
    };

    const validCandidate:
      CandidateStrategy = {
      strategyId:
        "strat-repair-01",

      name:
        "Long Put Protection",

      strategyType:
        "LONG_PUT",

      legs: [
        {
          side: "BUY",

          right: "PUT",

          strikePrice:
            validQuote
              .strikePrice,

          expiryTimestampMs:
            validQuote
              .expiryTimestampMs,

          requestedExposure:
            validConfirmedIntent
              .exposureAmount
              .value,

          resolvedOptionQuantity:
            validConfirmedIntent
              .exposureAmount
              .value,

          sizingStatus:
            "RESOLVED",

          quoteReference:
            validQuote.quoteId,
        },
      ],

      quotes: [
        validQuote,
      ],

      status:
        "TECHNICALLY_FEASIBLE",

      rejectionReasons: [],

      scoresStatus:
        "NOT_AVAILABLE",

      sizingStatus:
        "RESOLVED",

      preview: {
        previewStatus:
          "PREVIEW_AVAILABLE",

        pricePerContract: {
          amountBaseUnits:
            "450000000",
          decimals: 8,
          symbol: "USD",
        },

        premiumAmount: {
          amountBaseUnits:
            "9000000",
          decimals: 6,
          symbol: "USDC",
        },

        protocolFee: {
          amountBaseUnits:
            "0",
          decimals: 6,
          symbol: "USDC",
        },

        referrerFee: {
          amountBaseUnits:
            "0",
          decimals: 6,
          symbol: "USDC",
        },

        totalExpectedCost: {
          amountBaseUnits:
            "9000000",
          decimals: 6,
          symbol: "USDC",
        },

        feeStatus:
          "INCOMPLETE",

        buyerSpendStatus:
          "VERIFIED",

        buyerSpendVerificationMode:
          "TOTAL_BUYER_SPEND_PROVEN",

        collateralToken:
          "USDC",

        previewTimestampMs:
          Date.now(),

        previewSource:
          "THETANUTS_OPTIONBOOK_PREVIEW",
      },
    };

    // 1. Legacy Endpoints Removed
    it(
      "Repair 1: Legacy routes (POST /api/solver/solve, /api/policy/verify, /api/simulate) return 404",
      async () => {
        const res1 =
          await request(app)
            .post(
              "/api/solver/solve"
            )
            .send({});

        expect(
          res1.status
        ).toBe(404);

        const res2 =
          await request(app)
            .post(
              "/api/policy/verify"
            )
            .send({});

        expect(
          res2.status
        ).toBe(404);

        const res3 =
          await request(app)
            .post(
              "/api/simulate"
            )
            .send({});

        expect(
          res3.status
        ).toBe(404);
      }
    );

    // 2. Unconfirmed / Client-Forged Intent Solver Bypass Blocked
    it(
      "Repair 2: POST /api/v1/intents/:id/solve rejects unconfirmed intent with HTTP 400",
      async () => {
        const unconfirmedIntent =
        {
          ...validConfirmedIntent,

          intentId:
            "intent-unconf-test",

          confirmedByUser:
            false,
        };

        await intentRepository.save(
          unconfirmedIntent as any
        );

        const res =
          await request(app)
            .post(
              `/api/v1/intents/${unconfirmedIntent.intentId}/solve`
            )
            .send();

        expect(
          res.status
        ).toBe(400);

        expect(
          res.body.code
        ).toBe(
          "CANNOT_SOLVE_UNCONFIRMED"
        );
      }
    );

    // 3. Request-Controlled Mock Activation Blocked
    it(
      "Repair 3: POST /api/v1/intents/:id/solve with ?useMock=true does NOT activate mock mode when server demo mode is false",
      async () => {
        const previousDemoMode =
          process.env
            .DEMO_SNAPSHOT_MODE;

        process.env
          .DEMO_SNAPSHOT_MODE =
          "false";

        try {
          await intentRepository.save(
            validConfirmedIntent as any
          );

          const res =
            await request(app)
              .post(
                `/api/v1/intents/${validConfirmedIntent.intentId}/solve?useMock=true`
              )
              .send({
                useMockFixtures:
                  true,
              });

          /*
           * This test verifies the security property only:
           * client-controlled query/body flags cannot enable
           * server demo snapshot mode.
           *
           * The real market path may return 200, 409, 500,
           * or 503 depending on external market availability.
           * That external dependency must not determine whether
           * this security test passes.
           */
          expect(
            res.body
              ?.isMockData
          ).not.toBe(true);

          expect(
            res.body?.mode
          ).not.toBe(
            "RECORDED_DEMO_SNAPSHOT"
          );
        } finally {
          if (
            previousDemoMode ===
            undefined
          ) {
            delete process.env
              .DEMO_SNAPSHOT_MODE;
          } else {
            process.env
              .DEMO_SNAPSHOT_MODE =
              previousDemoMode;
          }
        }
      }
    );

    // 4. SDK-Resolved RFQ Contract Address
    it(
      "Repair 4: GET /api/v1/rfq/existing resolves factory address dynamically via SDK",
      async () => {
        const res =
          await request(app)
            .get(
              "/api/v1/rfq/existing"
            );

        expect(
          res.status
        ).toBe(200);

        expect(
          res.body
            .factoryAddress
        ).toMatch(
          /^0x[a-fA-F0-9]{40}$/
        );

        expect(
          res.body.chainId
        ).toBe(8453);
      }
    );

    // 5. Confirmation Requires expectedVersion and Checks Mismatch
    it(
      "Repair 5: POST /api/v1/intents/:id/confirm requires integer expectedVersion & rejects mismatch",
      async () => {
        const intentToConfirm =
        {
          ...validConfirmedIntent,

          intentId:
            "intent-confirm-ver",

          version: 1,

          confirmedByUser:
            false,
        };

        await intentRepository.save(
          intentToConfirm as any
        );

        const resMissing =
          await request(app)
            .post(
              `/api/v1/intents/${intentToConfirm.intentId}/confirm`
            )
            .send({});

        expect(
          resMissing.status
        ).toBe(400);

        expect(
          resMissing.body.code
        ).toBe(
          "INVALID_CONFIRMATION_VERSION"
        );

        const resStale =
          await request(app)
            .post(
              `/api/v1/intents/${intentToConfirm.intentId}/confirm`
            )
            .send({
              expectedVersion:
                99,
            });

        expect(
          resStale.status
        ).toBe(409);

        expect(
          resStale.body.code
        ).toBe(
          "STALE_INTENT_VERSION"
        );

        const resOk =
          await request(app)
            .post(
              `/api/v1/intents/${intentToConfirm.intentId}/confirm`
            )
            .send({
              expectedVersion:
                1,
            });

        expect(
          resOk.status
        ).toBe(200);

        expect(
          resOk.body
            .confirmedByUser
        ).toBe(true);
      }
    );

    // 6. Strict Request Validation: Rejects String for allowMultiLeg
    it(
      "Repair 6: PATCH /api/v1/intents/:id rejects string 'false' for allowMultiLeg with HTTP 400",
      async () => {
        const intentForPatch =
        {
          ...validConfirmedIntent,

          intentId:
            "intent-patch-bool",
        };

        await intentRepository.save(
          intentForPatch as any
        );

        const res =
          await request(app)
            .patch(
              `/api/v1/intents/${intentForPatch.intentId}`
            )
            .send({
              allowMultiLeg:
                "false" as any,
            });

        expect(
          res.status
        ).toBe(400);

        expect(
          res.body.code
        ).toBe(
          "INVALID_REQUEST"
        );
      }
    );

    // 7. Verified BTC 8-Decimal Resolution on PATCH
    it(
      "Repair 7: PATCH /api/v1/intents/:id sets exact 8 decimals for BTC exposure",
      async () => {
        const btcIntent =
        {
          ...validConfirmedIntent,

          intentId:
            "intent-btc-patch",

          asset: {
            value: "BTC",

            source:
              "USER_EXPLICIT",

            confidence: 1,

            requiresConfirmation:
              false,
          },
        };

        await intentRepository.save(
          btcIntent as any
        );

        const res =
          await request(app)
            .patch(
              `/api/v1/intents/${btcIntent.intentId}`
            )
            .send({
              exposureAmount:
              {
                amount:
                  "2.5",
              },
            });

        expect(
          res.status
        ).toBe(200);

        expect(
          res.body
            .candidateIntent
            .exposureAmount
            .value
            .decimals
        ).toBe(8);

        expect(
          res.body
            .candidateIntent
            .exposureAmount
            .value
            .amountBaseUnits
        ).toBe(
          "250000000"
        );
      }
    );

    // 8. Request Body Size Limit (16KB)
    it(
      "Repair 8: Oversized JSON payload (>16KB) is rejected with HTTP 413",
      async () => {
        const hugePrompt =
          "A".repeat(
            70 * 1024
          );

        const res =
          await request(app)
            .post(
              "/api/v1/intents/parse"
            )
            .send({
              prompt:
                hugePrompt,
            });

        expect(
          res.status
        ).toBe(413);

        expect(
          res.body.code ||
          res.body.errorCode
        ).toBe(
          "PAYLOAD_TOO_LARGE"
        );
      }
    );

    // 9. Rate Limiter Memory Hygiene & Periodic Expiration
    it(
      "Repair 9: Rate limiter cleans expired entries without memory leak",
      () => {
        clearRateLimitCache();

        expect(
          checkRateLimit(
            "10.0.0.1"
          )
        ).toBe(true);

        cleanExpiredRateLimits();

        expect(
          checkRateLimit(
            "10.0.0.1"
          )
        ).toBe(true);
      }
    );

    // 10. Application State Machine: Allowed & Blocked Transitions
    it(
      "Repair 10: ApplicationStateMachine validates lifecycle transitions and blocks illegal shortcuts",
      () => {
        expect(
          ApplicationStateMachine.canTransition(
            "EMPTY",
            "PARSING"
          ).allowed
        ).toBe(true);

        expect(
          ApplicationStateMachine.canTransition(
            "PARSING",
            "INTENT_REVIEW"
          ).allowed
        ).toBe(true);

        expect(
          ApplicationStateMachine.canTransition(
            "INTENT_REVIEW",
            "CONFIRMED"
          ).allowed
        ).toBe(true);

        expect(
          ApplicationStateMachine.canTransition(
            "CONFIRMED",
            "MARKET_CHECKING"
          ).allowed
        ).toBe(true);

        expect(
          ApplicationStateMachine.canTransition(
            "MARKET_CHECKING",
            "OPTIONBOOK_AVAILABLE"
          ).allowed
        ).toBe(true);

        expect(
          ApplicationStateMachine.canTransition(
            "EMPTY",
            "REVIEW_READY"
          ).allowed
        ).toBe(false);

        expect(
          ApplicationStateMachine.canTransition(
            "INTENT_REVIEW",
            "MARKET_CHECKING"
          ).allowed
        ).toBe(false);

        const unconfirmedPrecondition =
          ApplicationStateMachine
            .validateReviewReadyPreconditions(
              {
                isIntentConfirmed:
                  false,

                passedFinancialInvariants:
                  true,

                marketEvidenceStatus:
                  "FRESH",
              }
            );

        expect(
          unconfirmedPrecondition
            .allowed
        ).toBe(false);

        const stalePrecondition =
          ApplicationStateMachine
            .validateReviewReadyPreconditions(
              {
                isIntentConfirmed:
                  true,

                passedFinancialInvariants:
                  true,

                marketEvidenceStatus:
                  "STALE",
              }
            );

        expect(
          stalePrecondition
            .allowed
        ).toBe(false);
      }
    );

    // 11. Async Race & Stale Response Guards
    it(
      "Repair 11: Async race guards reject out-of-order, stale-version, and superseded responses",
      () => {
        const seqGuard =
          new SequenceRaceGuard();

        const seqA =
          seqGuard.nextSequence();

        const seqB =
          seqGuard.nextSequence();

        expect(
          seqGuard.isFresh(
            seqB
          )
        ).toBe(true);

        expect(
          seqGuard.isFresh(
            seqA
          )
        ).toBe(false);

        expect(
          IntentVersionGuard
            .isResponseFresh(
              1,
              2
            )
        ).toBe(false);

        expect(
          IntentVersionGuard
            .isResponseFresh(
              2,
              2
            )
        ).toBe(true);

        expect(
          ProposalDigestGuard
            .isProposalFresh(
              "digest-old-111",
              "digest-new-222"
            )
        ).toBe(false);

        expect(
          ProposalDigestGuard
            .isProposalFresh(
              "digest-current-333",
              "digest-current-333"
            )
        ).toBe(true);
      }
    );

    // 12. Simulation State Guards: Mutated proposal digest & stale intent version
    it(
      "Repair 12: Simulation rejects mutated proposal digest and stale intent version",
      async () => {
        const proposal =
          ActionProposalBuilder
            .buildOptionBookProposal(
              validConfirmedIntent,
              validCandidate,
              marketService
            );

        const tampered =
        {
          ...proposal,

          expectedStrike:
          {
            amountBaseUnits:
              "999900000000",

            decimals: 8,

            symbol: "USD",
          },
        };

        const resDigest =
          await simService
            .simulateProposal(
              tampered,
              validConfirmedIntent,
              validCandidate,
              2400
            );

        expect(
          resDigest.status
        ).toBe(
          "SIMULATION_MISMATCH"
        );

        expect(
          resDigest.revertReason
        ).toBe(
          "PROPOSAL_DIGEST_MISMATCH"
        );

        const updatedIntent =
        {
          ...validConfirmedIntent,

          version: 2,
        };

        const resVersion =
          await simService
            .simulateProposal(
              proposal,
              updatedIntent,
              validCandidate,
              2400
            );

        expect(
          resVersion.status
        ).toBe(
          "SIMULATION_MISMATCH"
        );

        expect(
          resVersion.revertReason
        ).toBe(
          "INTENT_VERSION_STALE"
        );
      }
    );
  }
);