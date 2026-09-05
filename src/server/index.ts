import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import "dotenv/config";
import cors from "cors";
import express from "express";
import { ethers } from "ethers";
import { z } from "zod";

import {
  IntentConfirmationDTO,
  IntentParseResponseDTO,
  IntentReviewDTO,
} from "../dtos/intentDTOs";

import {
  MOCK_OPTION_BOOK_QUOTES,
  MOCK_RFQ_QUOTES,
} from "../fixtures/mockQuotes";

import { IntentProviderFactory } from "../providers/IntentProviderFactory";
import {
  AIProviderError,
  AIProviderErrorCode,
} from "../providers/RealLLMIntentProvider";

import {
  IntentRepository,
} from "../repositories/IntentRepository";
import { SqliteDatabase } from "../repositories/SqliteDatabase";
import { SqliteIntentRepository } from "../repositories/SqliteIntentRepository";
import { AuditReceiptRepository } from "../repositories/AuditReceiptRepository";
import { AuthorizationHandoffRepository } from "../repositories/AuthorizationHandoffRepository";
import { EvidenceRepository } from "../repositories/EvidenceRepository";

import { ExposurePayoffEngine } from "../services/ExposurePayoffEngine";
import {
  formatCustomHorizon,
} from "../services/IntentEngine";
import { HumanReviewService } from "../services/HumanReviewService";
import { ProtectionSolverEngine } from "../services/ProtectionSolverEngine";
import { ThetanutsMarketService } from "../services/ThetanutsMarketService";
import { ThetanutsSimulationService } from "../services/ThetanutsSimulationService";
import { BoundedAuthorizationAttestationService } from "../services/BoundedAuthorizationAttestationService";
import { ExecutionCommitmentService } from "../services/ExecutionCommitmentService";
import { ExternalHumanAuthorizationHandoffService } from "../services/ExternalHumanAuthorizationHandoffService";
import { AuditReceiptService } from "../services/AuditReceiptService";
import { ReadOnlyPortfolioService } from "../services/ReadOnlyPortfolioService";
import { ProtectionDiscoveryEngine } from "../services/ProtectionDiscoveryEngine";
import { SimpleSituationService } from "../services/SimpleSituationService";
import { ExactExecutionPreparationService } from "../services/ExactExecutionPreparationService";
import { OnChainExecutionVerifier } from "../services/OnChainExecutionVerifier";
import { ActionProposalBuilder } from "../services/ActionProposalBuilder";
import { FeasibilityAlternativeService } from "../services/FeasibilityAlternativeService";
import {
  scaleExact,
} from "../services/ExactFinancialMath";

import {
  ActionProposal,
  CandidateStrategy,
  DiscoveryCandidate,
  LiveMarketExplorer,
  ParsedRiskIntentDraft,
  ProtectionSituation,
  StoredIntent,
  TokenAmount,
  TypedRiskIntent,
} from "../types";

import { sha256Digest } from "../utils/canonicalDigest";

import {
  parseExactDecimal,
  validateBudgetAmount,
  validateExposureAmount,
  validateHorizonTimestamp,
  validateLossPercent,
} from "../utils/decimalParser";

import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { requestIdMiddleware } from "./middleware/requestId";
import {
  requestLoggerMiddleware,
  redactSensitiveText,
} from "./middleware/requestLogger";

/* ================================================================
 * APPLICATION
 * ================================================================ */

const app = express();

app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

/* ================================================================
 * CORS
 * ================================================================ */

const allowedOriginsEnv =
  process.env.HEDGEOS_ALLOWED_ORIGINS;

const isProd =
  process.env.NODE_ENV === "production";

let allowedOrigins: string[] = [];

if (allowedOriginsEnv) {
  allowedOrigins =
    allowedOriginsEnv
      .split(",")
      .map((value) =>
        value.trim()
      )
      .filter(Boolean);
} else if (!isProd) {
  allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
}

if (
  isProd &&
  allowedOrigins.length === 0
) {
  console.error(
    "FATAL: HEDGEOS_ALLOWED_ORIGINS must be configured in production."
  );

  process.exit(1);
}

app.use(
  cors({
    origin: (
      origin,
      callback
    ) => {
      if (!origin) {
        return callback(
          null,
          true
        );
      }

      if (
        allowedOrigins.includes(
          origin
        )
      ) {
        return callback(
          null,
          true
        );
      }

      return callback(
        new Error(
          "CORS origin not allowed"
        )
      );
    },
  })
);

/* ================================================================
 * JSON
 * ================================================================ */

app.set(
  "json replacer",
  (
    _key: string,
    value: any
  ) =>
    typeof value === "bigint"
      ? value.toString()
      : value
);

app.use(
  express.json({
    limit: "64kb",
  })
);

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (
      err &&
      (
        err.type ===
        "entity.too.large" ||
        err.status === 413
      )
    ) {
      return res
        .status(413)
        .json({
          error:
            "Request payload too large. Maximum permitted body size is 64KB.",

          code:
            "PAYLOAD_TOO_LARGE",

          errorCode:
            "PAYLOAD_TOO_LARGE",
        });
    }

    if (
      err &&
      err.status === 400 &&
      "body" in err
    ) {
      return res
        .status(400)
        .json({
          error:
            "Malformed JSON payload in request.",

          code:
            "MALFORMED_JSON",

          errorCode:
            "MALFORMED_JSON",
        });
    }

    next(err);
  }
);

/* ================================================================
 * RATE LIMITING
 * ================================================================ */

const rateLimitHandler = (
  _req: express.Request,
  res: express.Response
) => {
  return sendSafeError(
    res,
    429,
    "RATE_LIMITED",
    "Too many requests. Please try again shortly."
  );
};

export const generalLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max: 300,

    handler:
      rateLimitHandler,
  });

export const parseLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max: 30,

    handler:
      rateLimitHandler,
  });

export const portfolioLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max: 60,

    handler:
      rateLimitHandler,
  });

export const solveLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max: 30,

    handler:
      rateLimitHandler,
  });

export const simulateLimiter =
  rateLimit({
    windowMs:
      10 * 60 * 1000,

    max: 30,

    handler:
      rateLimitHandler,
  });

app.use(
  "/api/",
  generalLimiter
);

/* ================================================================
 * DATABASE / SERVICES
 * ================================================================ */

let sqliteDb:
  SqliteDatabase;

try {
  sqliteDb =
    new SqliteDatabase();
} catch (err: any) {
  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    console.error(
      "FATAL: Failed to initialize SQLite database in production environment.",
      err
    );

    process.exit(1);
  }

  throw err;
}

const intentRepository:
  IntentRepository =
  new SqliteIntentRepository(
    sqliteDb
  );

const auditReceiptRepository =
  new AuditReceiptRepository(
    sqliteDb
  );

const authorizationHandoffRepository =
  new AuthorizationHandoffRepository(
    sqliteDb
  );

const evidenceRepository =
  new EvidenceRepository(
    sqliteDb
  );

const marketService =
  new ThetanutsMarketService();

const solverEngine =
  new ProtectionSolverEngine(
    marketService
  );

const discoveryEngine =
  new ProtectionDiscoveryEngine(
    marketService
  );

/* ================================================================
 * ERROR HELPERS
 * ================================================================ */

export function sanitizeErrorMessage(
  err: any
): string {
  const message =
    typeof err === "string"
      ? err
      : err?.message ||
      "Internal server error";

  return redactSensitiveText(
    message
  );
}

export function sendSafeError(
  res: express.Response,
  statusCode: number,
  code: string,
  userMessage: string,
  _internalErr?: any
) {
  (res as any).locals =
    (res as any).locals || {};

  (res as any).locals.errorCode =
    code;

  const requestId =
    (res.req as any)
      ?.requestId;

  const sanitized =
    redactSensitiveText(
      userMessage
    );

  return res
    .status(statusCode)
    .json({
      error:
        sanitized,

      code,

      errorCode:
        code,

      ...(requestId
        ? {
          requestId,
        }
        : {}),
    });
}

export interface IntentParseErrorResponse {
  statusCode: number;
  code: string;
  userMessage: string;
  providerCategory?: AIProviderErrorCode;
}

export function classifyIntentParseError(error: unknown): IntentParseErrorResponse {
  let category: AIProviderErrorCode | undefined;
  if (error instanceof AIProviderError) {
    category = error.code;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    const knownCategories: AIProviderErrorCode[] = [
      "RATE_LIMITED",
      "TIMEOUT",
      "AUTHENTICATION_FAILED",
      "MODEL_UNAVAILABLE",
      "INVALID_REQUEST",
      "INVALID_PROVIDER_OUTPUT",
      "PROVIDER_UNAVAILABLE",
    ];
    category = knownCategories.find((candidate) => message.startsWith(`${candidate}:`));
  }

  if (category === "RATE_LIMITED") {
    return {
      statusCode: 429,
      code: "AI_PROVIDER_RATE_LIMITED",
      userMessage: "AI intent interpretation is temporarily unavailable. Please try again shortly.",
      providerCategory: category,
    };
  }
  if (category === "TIMEOUT" || category === "PROVIDER_UNAVAILABLE") {
    return {
      statusCode: 503,
      code: "AI_PROVIDER_TEMPORARILY_UNAVAILABLE",
      userMessage: "AI intent interpretation is temporarily unavailable. Please try again shortly.",
      providerCategory: category,
    };
  }
  if (category === "INVALID_PROVIDER_OUTPUT") {
    return {
      statusCode: 502,
      code: "AI_PROVIDER_INVALID_RESPONSE",
      userMessage: "AI intent interpretation returned an invalid response. Please try again.",
      providerCategory: category,
    };
  }
  if (
    category === "AUTHENTICATION_FAILED" ||
    category === "MODEL_UNAVAILABLE" ||
    category === "INVALID_REQUEST"
  ) {
    return {
      statusCode: 503,
      code: "AI_PROVIDER_CONFIGURATION_ERROR",
      userMessage: "AI intent interpretation is unavailable because the configured provider could not accept the request.",
      providerCategory: category,
    };
  }
  return {
    statusCode: 500,
    code: "PARSE_ERROR",
    userMessage: "Failed to parse natural language intent.",
  };
}

/* ================================================================
 * HEALTH
 * ================================================================ */

app.get(
  "/healthz",
  (_req, res) => {
    res.json({
      status: "ok",
      service: "hedgeos",
      timestampMs:
        Date.now(),
    });
  }
);

app.get(
  "/readyz",
  (_req, res) => {
    const dbAlive =
      sqliteDb.ping();

    const llmConfigured =
      Boolean(
        process.env.OPENAI_API_KEY
      );

    const baseRpcConfigured =
      Boolean(
        process.env.BASE_RPC_URL
      );

    const thetanutsConfigured =
      baseRpcConfigured;

    const isReady =
      dbAlive;

    res
      .status(
        isReady
          ? 200
          : 503
      )
      .json({
        status:
          isReady
            ? "ready"
            : "not_ready",

        checks: {
          database:
            dbAlive
              ? "READY"
              : "FAILED",

          llm:
            llmConfigured
              ? "CONFIGURED"
              : "NOT_CONFIGURED",

          baseRpc:
            baseRpcConfigured
              ? "CONFIGURED"
              : "NOT_CONFIGURED",

          thetanuts:
            thetanutsConfigured
              ? "CONFIGURED"
              : "NOT_CONFIGURED",
        },
      });
  }
);

/* ================================================================
 * INTENT HELPERS
 * ================================================================ */

export function computeMissingFields(
  intent: StoredIntent
): string[] {
  const missing:
    string[] = [];

  if (
    !intent.asset ||
    !intent.asset.value
  ) {
    missing.push(
      "asset"
    );
  }

  if (
    !intent.exposureAmount ||
    !intent.exposureAmount.value ||
    intent.exposureAmount
      .value.amountBaseUnits ===
    "0"
  ) {
    missing.push(
      "exposureAmount"
    );
  }

  if (
    !intent.targetMaxLossPercent ||
    intent.targetMaxLossPercent
      .value === undefined ||
    intent.targetMaxLossPercent
      .value === null
  ) {
    missing.push(
      "targetMaxLossPercent"
    );
  }

  if (
    !intent.maxPremiumUSDC ||
    !intent.maxPremiumUSDC
      .value
  ) {
    missing.push(
      "maxPremiumUSDC"
    );
  }

  if (
    !intent.horizonTimestamp ||
    !intent.horizonTimestamp
      .value ||
    !intent.horizonTimestamp
      .value.timestampMs
  ) {
    missing.push(
      "horizonTimestamp"
    );
  }

  return missing;
}

/* ================================================================
 * SIMPLE-MODE FACTUAL CONFIRMATION
 * ================================================================ */

function situationConfirmationFields(
  situation: ProtectionSituation
): string[] {
  const fields:
    string[] = [];

  if (
    situation.asset
      ?.requiresConfirmation
  ) {
    fields.push(
      "asset"
    );
  }

  if (
    situation.exposureAmount
      ?.requiresConfirmation
  ) {
    fields.push(
      "exposureAmount"
    );
  }

  if (
    situation.horizonTimestamp
      ?.requiresConfirmation
  ) {
    fields.push(
      "horizonTimestamp"
    );
  }

  if (
    situation.concern
      ?.requiresConfirmation
  ) {
    fields.push(
      "concern"
    );
  }

  return fields;
}

function acceptSituationInterpretation(
  situation: ProtectionSituation
): ProtectionSituation {
  return {
    ...situation,

    asset:
      situation.asset
        ? {
          ...situation.asset,
          requiresConfirmation:
            false,
        }
        : null,

    exposureAmount:
      situation.exposureAmount
        ? {
          ...situation.exposureAmount,
          requiresConfirmation:
            false,
        }
        : null,

    horizonTimestamp:
      situation.horizonTimestamp
        ? {
          ...situation.horizonTimestamp,
          requiresConfirmation:
            false,
        }
        : null,

    concern: {
      ...situation.concern,
      requiresConfirmation:
        false,
    },
  };
}

/* ================================================================
 * EXACT FINANCIAL HELPERS
 * ================================================================ */

function tokenAmountToDecimals(
  amount: TokenAmount,
  decimals: number
): bigint {
  return scaleExact(
    BigInt(
      amount.amountBaseUnits
    ),
    amount.decimals,
    decimals
  );
}

function exactRatioToCeilingPercent(
  numerator: bigint,
  denominator: bigint,
  decimalPlaces = 6
): number {
  if (
    numerator < 0n ||
    denominator <= 0n
  ) {
    throw new Error(
      "Invalid exact payoff ratio"
    );
  }

  const scale =
    10n **
    BigInt(
      decimalPlaces
    );

  const scaled =
    (
      numerator *
      100n *
      scale +
      denominator -
      1n
    ) /
    denominator;

  const whole =
    scaled / scale;

  const fraction =
    (
      scaled % scale
    )
      .toString()
      .padStart(
        decimalPlaces,
        "0"
      );

  const value =
    Number(
      `${whole.toString()}.${fraction}`
    );

  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 100
  ) {
    throw new Error(
      "Selected modeled downside cannot be represented as a valid Typed Risk Intent percentage"
    );
  }

  return value;
}

function getExactPayoff(
  candidate: CandidateStrategy
): {
  maxLossValuePrice8: string;
  exposureValuePrice8: string;
  totalCostUSDC6?: string;
  quantity18?: string;
  strikePrice8?: string;
  spotPrice8?: string;
} | null {
  const payoff =
    candidate.payoffSummary as any;

  if (
    !payoff ||
    !payoff.exact
  ) {
    return null;
  }

  return payoff.exact;
}

/**
 * Converts a freshly solved CandidateStrategy into the exact
 * DiscoveryCandidate evidence shape consumed by
 * ExactExecutionPreparationService.
 *
 * This gives Simple and Advanced mode the same execution-binding
 * semantics.
 */
function buildExecutionCandidate(
  intent: TypedRiskIntent,
  candidate:
    CandidateStrategy,
  snapshot: {
    snapshotId: string;
    snapshotDigest: string;
    spotPrice: TokenAmount | null;
  }
): DiscoveryCandidate {
  const quote =
    candidate.quotes[0];

  const leg =
    candidate.legs[0];

  const preview =
    candidate.preview;

  const exact =
    getExactPayoff(
      candidate
    );

  if (
    !quote ||
    !leg ||
    !leg.resolvedOptionQuantity ||
    !preview ||
    preview.previewStatus !==
    "PREVIEW_AVAILABLE" ||
    preview.buyerSpendStatus !==
    "VERIFIED" ||
    !exact ||
    !snapshot.spotPrice
  ) {
    throw new Error(
      "Selected strategy does not contain complete exact execution evidence"
    );
  }

  const quantity18 =
    tokenAmountToDecimals(
      leg.resolvedOptionQuantity,
      18
    );

  const spendUSDC6 =
    tokenAmountToDecimals(
      preview.totalExpectedCost,
      6
    );

  const strikePrice8 =
    tokenAmountToDecimals(
      quote.strikePrice,
      8
    );

  const spotPrice8 =
    tokenAmountToDecimals(
      snapshot.spotPrice,
      8
    );

  const maxContracts6 =
    marketService.calculateMaxContracts(
      quote
    );

  if (
    maxContracts6 <= 0n
  ) {
    throw new Error(
      "Fresh maker capacity is unavailable"
    );
  }

  const digestPayload = {
    snapshotId:
      snapshot.snapshotId,

    snapshotDigest:
      snapshot.snapshotDigest,

    quoteId:
      quote.quoteId,

    strategyType:
      "LONG_PUT",

    asset:
      intent.asset.value,

    quantity18:
      quantity18.toString(),

    spendUSDC6:
      spendUSDC6.toString(),

    maxLossValuePrice8:
      String(
        exact.maxLossValuePrice8
      ),

    exposureValuePrice8:
      String(
        exact.exposureValuePrice8
      ),

    strikePrice8:
      strikePrice8.toString(),

    spotPrice8:
      spotPrice8.toString(),

    expiryTimestampMs:
      quote.expiryTimestampMs,

    allStrikes:
      quote.allStrikes?.map(
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

  return {
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
      intent.asset.value,

    quantity:
      leg.resolvedOptionQuantity,

    coveredExposure:
      intent.exposureAmount.value,

    verifiedBuyerSpend:
      preview.totalExpectedCost,

    buyerSpendStatus:
      "VERIFIED",

    feeStatus:
      preview.feeStatus,

    modeledAtExpiryDownside: {
      displayPercent:
        Number(
          (candidate.payoffSummary as any)
            ?.effectiveDownsidePercent ??
          exactRatioToCeilingPercent(
            BigInt(
              exact.maxLossValuePrice8
            ),
            BigInt(
              exact.exposureValuePrice8
            )
          )
        ),

      maxLossValuePrice8:
        String(
          exact.maxLossValuePrice8
        ),

      exposureValuePrice8:
        String(
          exact.exposureValuePrice8
        ),
    },

    strike:
      quote.strikePrice,

    expiryTimestampMs:
      quote.expiryTimestampMs,

    maxFillableQuantity: {
      amountBaseUnits:
        (
          maxContracts6 *
          1_000_000_000_000n
        ).toString(),

      decimals: 18,

      symbol:
        "CONTRACTS",
    },

    marketSnapshotId:
      snapshot.snapshotId,

    marketSnapshotDigest:
      snapshot.snapshotDigest,

    candidateDigest,

    labels: [],
  };
}

/* ================================================================
 * ADDITIONAL IP GUARD
 * ================================================================ */

interface RateLimitRecord {
  count: number;
  windowStartMs: number;
}

const ipRateLimits =
  new Map<
    string,
    RateLimitRecord
  >();

const RATE_LIMIT_WINDOW_MS =
  60_000;

const MAX_REQUESTS_PER_WINDOW =
  60;

const MAX_PROMPT_LENGTH =
  2000;

const MAX_RATE_LIMIT_ENTRIES =
  5000;

export function cleanExpiredRateLimits() {
  const now =
    Date.now();

  for (
    const [
      ip,
      record,
    ] of ipRateLimits.entries()
  ) {
    if (
      now -
      record.windowStartMs >
      RATE_LIMIT_WINDOW_MS
    ) {
      ipRateLimits.delete(
        ip
      );
    }
  }
}

export function checkRateLimit(
  ip: string
): boolean {
  const now =
    Date.now();

  if (
    ipRateLimits.size >
    MAX_RATE_LIMIT_ENTRIES
  ) {
    cleanExpiredRateLimits();
  }

  const record =
    ipRateLimits.get(ip);

  if (
    !record ||
    now -
    record.windowStartMs >
    RATE_LIMIT_WINDOW_MS
  ) {
    ipRateLimits.set(
      ip,
      {
        count: 1,
        windowStartMs:
          now,
      }
    );

    return true;
  }

  if (
    record.count >=
    MAX_REQUESTS_PER_WINDOW
  ) {
    return false;
  }

  record.count += 1;

  return true;
}

export function clearRateLimitCache() {
  ipRateLimits.clear();
}

/* ================================================================
 * REQUEST SCHEMAS
 * ================================================================ */

const ParseIntentRequestSchema =
  z
    .object({
      prompt:
        z
          .string()
          .min(
            1,
            "Prompt cannot be empty"
          )
          .max(
            MAX_PROMPT_LENGTH,
            `Prompt exceeds maximum of ${MAX_PROMPT_LENGTH} characters`
          ),
    })
    .strict();

const AnalyzePortfolioRequestSchema =
  z
    .object({
      address:
        z
          .string()
          .min(
            1,
            "Address cannot be empty"
          ),
    })
    .strict();

const PatchIntentRequestSchema =
  z
    .object({
      asset:
        z
          .string()
          .optional(),

      exposureAmount:
        z
          .object({
            amount:
              z
                .string()
                .min(1),
          })
          .strict()
          .optional(),

      targetMaxLossPercent:
        z
          .number()
          .positive()
          .max(100)
          .optional(),

      maxPremiumUSDC:
        z
          .object({
            amount:
              z
                .string()
                .min(1),
          })
          .strict()
          .optional(),

      horizonTimestampMs:
        z
          .number()
          .int()
          .positive()
          .optional(),

      allowMultiLeg:
        z
          .boolean()
          .optional(),

      source:
        z
          .string()
          .optional(),
    })
    .strict();

const ConfirmIntentRequestSchema =
  z
    .object({
      expectedVersion:
        z
          .number()
          .int()
          .positive(),
    })
    .strict();

const SimulateProposalRequestSchema =
  z
    .object({
      proposal:
        z
          .object({
            proposalId:
              z
                .string()
                .min(1),

            proposalDigest:
              z
                .string()
                .min(1),
          })
          .passthrough(),
    })
    .strict();

const DiscoveryRequestSchema =
  z
    .object({
      prompt:
        z
          .string()
          .min(1)
          .max(
            MAX_PROMPT_LENGTH
          ),

      /**
       * User explicitly accepts any grounded parser-resolved
       * interpretation such as "this week" -> a concrete timestamp.
       */
      confirmInferredFacts:
        z
          .boolean()
          .optional()
          .default(false),
    })
    .strict();

const CompileDiscoveryRequestSchema =
  z
    .object({
      candidateId:
        z
          .string()
          .min(1),
    })
    .strict();

const PrepareExecutionRequestSchema =
  z
    .object({
      intentId:
        z
          .string()
          .min(1),

      expectedBeneficiary:
        z
          .string()
          .min(1),

      strategyId:
        z
          .string()
          .min(1)
          .optional(),
    })
    .strict();

const VerifyExecutionRequestSchema =
  z
    .object({
      preparationId:
        z
          .string()
          .min(1),

      transactionHash:
        z
          .string()
          .regex(
            /^0x[0-9a-fA-F]{64}$/
          ),
    })
    .strict();

const ApplyAlternativeRequestSchema =
  z
    .object({
      alternativeId:
        z
          .string()
          .min(1),

      alternativeDigest:
        z
          .string()
          .length(64),

      expectedVersion:
        z
          .number()
          .int()
          .positive(),
    })
    .strict();

/* ================================================================
 * API: HEALTH
 * ================================================================ */

app.get(
  "/api/v1/health",
  async (
    _req,
    res
  ) => {
    try {
      const marketState =
        await marketService.getMarketState();

      const isLiveRead =
        marketState.status ===
        "LIVE_READ_AVAILABLE";

      res.json({
        status: "ok",

        system:
          "HedgeOS Intent Execution Pipeline",

        thetanutsStatus:
          marketState.status,

        optionBookStatus:
          isLiveRead
            ? "SDK_CONFIRMED, LIVE_READ_AVAILABLE"
            : "MARKET_UNAVAILABLE",

        rfqStatus:
          "SPECIFICATION_ONLY, NOT_SUBMITTED, UNPRICED",

        baseChainId:
          8453,

        marketState,

        repositoryStorage:
          intentRepository.storageType,

        executionMode:
          "NON_CUSTODIAL_UNSIGNED_PREPARATION",
      });
    } catch (err: any) {
      return sendSafeError(
        res,
        500,
        "HEALTH_CHECK_FAILED",
        "Failed to query system health.",
        err
      );
    }
  }
);

app.get(
  "/api/v1/market/status",
  async (
    _req,
    res
  ) => {
    try {
      const state =
        await marketService.getMarketState();

      res.json(state);
    } catch (err: any) {
      return sendSafeError(
        res,
        500,
        "MARKET_UNAVAILABLE",
        "Failed to query market state.",
        err
      );
    }
  }
);

app.get(
  "/api/v1/ai/status",
  (
    _req,
    res
  ) => {
    res.json(
      IntentProviderFactory.getProviderStatusSummary()
    );
  }
);

/* ================================================================
 * API: SIMPLE MODE
 * ================================================================ */

app.post(
  "/api/v1/discovery/parse",
  parseLimiter,
  async (
    req,
    res
  ) => {
    const validation =
      DiscoveryRequestSchema.safeParse(
        req.body
      );

    if (
      !validation.success
    ) {
      return sendSafeError(
        res,
        400,
        "INVALID_DISCOVERY_REQUEST",
        "A concise protection situation is required."
      );
    }

    try {
      const service =
        new SimpleSituationService(
          IntentProviderFactory.getActiveProvider()
        );

      let situation =
        await service.parse(
          validation.data.prompt
        );

      const confirmationNeeded =
        situationConfirmationFields(
          situation
        );

      if (
        validation.data
          .confirmInferredFacts &&
        confirmationNeeded.length >
        0
      ) {
        situation =
          acceptSituationInterpretation(
            situation
          );
      }

      const unresolvedConfirmation =
        situationConfirmationFields(
          situation
        );

      const canDiscover =
        situation.missingFactualFields
          .length === 0 &&
        unresolvedConfirmation
          .length === 0;

      return res.json({
        situation,

        canDiscover,

        clarificationNeeded:
          situation.missingFactualFields,

        confirmationNeeded:
          unresolvedConfirmation,

        financialPreferencesSelectedByAI:
          false,

        message:
          canDiscover
            ? "Factual protection context is ready for deterministic live-market discovery."
            : "Review missing or parser-resolved factual context before market discovery.",
      });
    } catch (err) {
      return sendSafeError(
        res,
        422,
        "SITUATION_PARSE_FAILED",
        sanitizeErrorMessage(
          err
        ),
        err
      );
    }
  }
);

app.post(
  "/api/v1/discovery/search",
  solveLimiter,
  async (
    req,
    res
  ) => {
    const validation =
      DiscoveryRequestSchema.safeParse(
        req.body
      );

    if (
      !validation.success
    ) {
      return sendSafeError(
        res,
        400,
        "INVALID_DISCOVERY_REQUEST",
        "A concise protection situation is required."
      );
    }

    try {
      const parser =
        new SimpleSituationService(
          IntentProviderFactory.getActiveProvider()
        );

      let situation =
        await parser.parse(
          validation.data.prompt
        );

      if (
        situation.missingFactualFields
          .length > 0
      ) {
        return res
          .status(422)
          .json({
            status:
              "CLARIFICATION_REQUIRED",

            situation,

            missingFactualFields:
              situation.missingFactualFields,

            confirmationNeeded:
              situationConfirmationFields(
                situation
              ),
          });
      }

      const confirmationNeeded =
        situationConfirmationFields(
          situation
        );

      if (
        confirmationNeeded.length >
        0 &&
        !validation.data
          .confirmInferredFacts
      ) {
        return res
          .status(422)
          .json({
            status:
              "CONFIRMATION_REQUIRED",

            situation,

            missingFactualFields:
              [],

            confirmationNeeded,

            message:
              "The factual phrase is grounded, but its exact parser-resolved interpretation must be accepted before deterministic market discovery.",
          });
      }

      if (
        validation.data
          .confirmInferredFacts
      ) {
        situation =
          acceptSituationInterpretation(
            situation
          );
      }

      const discovery =
        await discoveryEngine.discover(
          situation
        );

      evidenceRepository.saveDiscovery(
        discovery
      );

      return res.json(
        discovery
      );
    } catch (err) {
      return sendSafeError(
        res,
        503,
        "DISCOVERY_FAILED",
        sanitizeErrorMessage(
          err
        ),
        err
      );
    }
  }
);

app.get(
  "/api/v1/discovery/:id",
  (
    req,
    res
  ) => {
    try {
      const discovery =
        evidenceRepository.getDiscovery(
          String(
            req.params.id
          )
        );

      if (!discovery) {
        return sendSafeError(
          res,
          404,
          "DISCOVERY_NOT_FOUND",
          "Discovery evidence was not found."
        );
      }

      return res.json(
        discovery
      );
    } catch (err) {
      return sendSafeError(
        res,
        409,
        "DISCOVERY_EVIDENCE_INVALID",
        "Stored discovery evidence failed digest validation.",
        err
      );
    }
  }
);

app.post(
  "/api/v1/discovery/:id/compile",
  solveLimiter,
  async (
    req,
    res
  ) => {
    const validation =
      CompileDiscoveryRequestSchema.safeParse(
        req.body
      );

    if (
      !validation.success
    ) {
      return sendSafeError(
        res,
        400,
        "INVALID_DISCOVERY_SELECTION",
        "A valid candidateId is required."
      );
    }

    try {
      const discovery =
        evidenceRepository.getDiscovery(
          String(
            req.params.id
          )
        );

      if (!discovery) {
        return sendSafeError(
          res,
          404,
          "DISCOVERY_NOT_FOUND",
          "Discovery evidence was not found."
        );
      }

      if (
        Date.now() -
        discovery.marketSnapshot
          .capturedAtMs >
        60_000
      ) {
        return sendSafeError(
          res,
          409,
          "STALE_DISCOVERY",
          "Discovery evidence is stale. Check live possibilities again before choosing."
        );
      }

      if (
        discovery.marketSnapshot
          .status !==
        "LIVE_READ_AVAILABLE"
      ) {
        return sendSafeError(
          res,
          409,
          "MARKET_EVIDENCE_NOT_LIVE",
          "The selected discovery no longer represents a successful live market snapshot."
        );
      }

      const candidate =
        discovery.paretoFrontier.find(
          (item) =>
            item.candidateId ===
            validation.data
              .candidateId
        );

      if (!candidate) {
        return sendSafeError(
          res,
          404,
          "CANDIDATE_NOT_FOUND",
          "The selected candidate is not on this discovery frontier."
        );
      }

      /*
       * IMPORTANT:
       * Do not compile the rounded display percentage.
       *
       * Convert the authoritative exact payoff ratio into a
       * conservative ceiling percentage.
       */
      const exactTargetPercent =
        exactRatioToCeilingPercent(
          BigInt(
            candidate
              .modeledAtExpiryDownside
              .maxLossValuePrice8
          ),
          BigInt(
            candidate
              .modeledAtExpiryDownside
              .exposureValuePrice8
          )
        );

      const nowMs =
        Date.now();

      const draft:
        ParsedRiskIntentDraft =
      {
        intentId:
          `intent-${Math.random()
            .toString(36)
            .slice(2, 9)}`,

        version: 1,

        createdAtMs:
          nowMs,

        updatedAtMs:
          nowMs,

        confirmedByUser:
          false,

        objective: {
          value:
            "DOWNSIDE_PROTECTION",

          source:
            "SYSTEM_DEFAULT",

          confidence: 1,

          requiresConfirmation:
            false,
        },

        asset: {
          ...discovery
            .situation
            .asset!,

          requiresConfirmation:
            false,
        },

        exposureAmount: {
          ...discovery
            .situation
            .exposureAmount!,

          requiresConfirmation:
            false,
        },

        /*
         * The user explicitly selected this observed market
         * outcome. The financial preference comes from that
         * selection, not from the AI.
         */
        targetMaxLossPercent:
        {
          value:
            exactTargetPercent,

          source:
            "USER_EXPLICIT",

          confidence: 1,

          requiresConfirmation:
            false,

          originalPhrase:
            `Selected observed protection outcome ${candidate.candidateId}`,
        },

        maxPremiumUSDC: {
          value:
            candidate
              .verifiedBuyerSpend,

          source:
            "USER_EXPLICIT",

          confidence: 1,

          requiresConfirmation:
            false,

          originalPhrase:
            `Selected observed protection outcome ${candidate.candidateId}`,
        },

        horizonTimestamp: {
          ...discovery
            .situation
            .horizonTimestamp!,

          requiresConfirmation:
            false,
        },

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

        missingFields: [],

        ambiguitiesFound: [],

        requiresClarification:
          false,

        originalPromptText:
          discovery
            .situation
            .originalPromptText,

        providerMetadata:
          discovery
            .situation
            .providerMetadata,
      };

      await intentRepository.save(
        draft
      );

      return res
        .status(201)
        .json({
          intent:
            draft,

          sourceDiscoveryId:
            discovery.discoveryId,

          sourceDiscoveryDigest:
            discovery.discoveryDigest,

          sourceMarketSnapshotId:
            discovery.marketSnapshot
              .snapshotId,

          sourceMarketSnapshotDigest:
            discovery.marketSnapshot
              .snapshotDigest,

          sourceCandidateId:
            candidate.candidateId,

          sourceCandidateDigest:
            candidate.candidateDigest,

          exactModeledDownsideEvidence:
            candidate
              .modeledAtExpiryDownside,

          compiledTargetMaxLossPercent:
            exactTargetPercent,

          requiresExplicitConfirmation:
            true,

          message:
            "Your selected observed outcome is now a new draft Typed Risk Intent. Review and explicitly confirm it before any financial preparation.",
        });
    } catch (err) {
      return sendSafeError(
        res,
        409,
        "DISCOVERY_COMPILE_FAILED",
        sanitizeErrorMessage(
          err
        ),
        err
      );
    }
  }
);

/* ================================================================
 * API: PORTFOLIO
 * ================================================================ */

app.post(
  "/api/v1/portfolio/analyze",
  portfolioLimiter,
  async (
    req,
    res
  ) => {
    try {
      const clientIp =
        req.ip ||
        req.socket
          .remoteAddress ||
        "127.0.0.1";

      if (
        !checkRateLimit(
          clientIp
        )
      ) {
        return sendSafeError(
          res,
          429,
          "RATE_LIMIT_EXCEEDED",
          "Rate limit exceeded. Please wait a moment before sending additional requests."
        );
      }

      const validation =
        AnalyzePortfolioRequestSchema.safeParse(
          req.body
        );

      if (
        !validation.success
      ) {
        const errorMessage =
          validation.error.issues
            .map(
              (issue) =>
                issue.message
            )
            .join("; ");

        return sendSafeError(
          res,
          400,
          "INVALID_ADDRESS",
          errorMessage
        );
      }

      const {
        address,
      } =
        validation.data;

      const portfolioService =
        new ReadOnlyPortfolioService();

      if (
        !portfolioService.validateAddress(
          address
        )
      ) {
        return sendSafeError(
          res,
          400,
          "INVALID_ADDRESS",
          "Invalid EVM address format. Must be 0x followed by 40 hexadecimal characters."
        );
      }

      const snapshot =
        await portfolioService.analyzePortfolio(
          address
        );

      if (
        snapshot.status ===
        "UNAVAILABLE"
      ) {
        return sendSafeError(
          res,
          503,
          "PORTFOLIO_UNAVAILABLE",
          "Base Mainnet portfolio reads are currently unavailable."
        );
      }

      return res.json(
        snapshot
      );
    } catch (err: any) {
      return sendSafeError(
        res,
        503,
        "PORTFOLIO_ANALYSIS_FAILED",
        "Failed to read balances from Base Mainnet.",
        err
      );
    }
  }
);

/* ================================================================
 * API: ADVANCED INTENT PARSE
 * ================================================================ */

app.post(
  "/api/v1/intents/parse",
  parseLimiter,
  async (
    req,
    res
  ) => {
    try {
      const clientIp =
        req.ip ||
        req.socket
          .remoteAddress ||
        "127.0.0.1";

      if (
        !checkRateLimit(
          clientIp
        )
      ) {
        return sendSafeError(
          res,
          429,
          "RATE_LIMIT_EXCEEDED",
          "Rate limit exceeded. Please wait a moment before sending additional requests."
        );
      }

      const parseValidation =
        ParseIntentRequestSchema.safeParse(
          req.body
        );

      if (
        !parseValidation.success
      ) {
        const errorMessage =
          parseValidation.error.issues
            .map(
              (issue) =>
                issue.message
            )
            .join("; ");

        const isLength =
          parseValidation.error.issues.some(
            (issue) =>
              issue.code ===
              "too_big"
          );

        return sendSafeError(
          res,
          400,
          isLength
            ? "PROMPT_TOO_LONG"
            : "INVALID_PROMPT",
          errorMessage
        );
      }

      const {
        prompt,
      } =
        parseValidation.data;

      const provider =
        IntentProviderFactory.getActiveProvider();

      const parseResult =
        await provider.parseNaturalLanguage(
          prompt
        );

      if (
        parseResult
          .unsupportedObjective
      ) {
        (
          parseResult
            .candidateDraft as any
        ).unsupportedObjective =
          true;

        (
          parseResult
            .candidateDraft as any
        ).unsupportedObjectiveReason =
          parseResult
            .unsupportedObjectiveReason;
      }

      await intentRepository.save(
        parseResult.candidateDraft
      );

      const dto:
        IntentParseResponseDTO =
      {
        intentId:
          parseResult
            .candidateDraft
            .intentId,

        adapterName:
          parseResult
            .adapterName,

        candidateDraft:
          parseResult
            .candidateDraft,

        ambiguitiesFound:
          parseResult
            .ambiguitiesFound,

        missingFields:
          parseResult
            .missingFields,

        requiresClarification:
          parseResult
            .requiresClarification ||
          parseResult
            .missingFields
            .length > 0,

        unsupportedObjective:
          parseResult
            .unsupportedObjective,

        unsupportedObjectiveReason:
          parseResult
            .unsupportedObjectiveReason,

        providerMetadata:
          parseResult
            .providerMetadata,
      };

      return res.json(dto);
    } catch (err: any) {
      const failure = classifyIntentParseError(err);
      if (failure.providerCategory) {
        const providerStatus = IntentProviderFactory.getProviderStatusSummary();
        console.error("AI intent parse provider failure", {
          category: failure.providerCategory,
          model: providerStatus.realModel,
          requestId: (req as any).requestId,
        });
      }
      return sendSafeError(
        res,
        failure.statusCode,
        failure.code,
        failure.userMessage,
        err
      );
    }
  }
);

/* ================================================================
 * API: INTENT REVIEW
 * ================================================================ */

app.get(
  "/api/v1/intents/:id",
  async (
    req,
    res
  ) => {
    try {
      const intent =
        await intentRepository.findById(
          String(
            req.params.id
          )
        );

      if (!intent) {
        return sendSafeError(
          res,
          404,
          "INTENT_NOT_FOUND",
          `Intent with ID '${req.params.id}' not found.`
        );
      }

      const missing =
        computeMissingFields(
          intent
        );

      const dto:
        IntentReviewDTO =
      {
        candidateIntent:
          intent,

        missingFields:
          missing,

        ambiguitiesFound:
          "ambiguitiesFound" in intent &&
            Array.isArray(intent.ambiguitiesFound)
            ? intent.ambiguitiesFound
              .map((item) => {
                if (typeof item === "string") {
                  return item;
                }

                if (
                  item &&
                  typeof item === "object" &&
                  "reason" in item &&
                  typeof item.reason === "string"
                ) {
                  return item.reason;
                }

                return "";
              })
              .filter((item): item is string => Boolean(item))
            : [],

        canConfirm:
          !intent.confirmedByUser &&
          missing.length === 0,
      };

      return res.json(dto);
    } catch (err: any) {
      return sendSafeError(
        res,
        500,
        "INTERNAL_ERROR",
        "Failed to retrieve intent.",
        err
      );
    }
  }
);

/* ================================================================
 * API: INTENT PATCH
 * ================================================================ */

app.patch(
  "/api/v1/intents/:id",
  async (
    req,
    res
  ) => {
    try {
      const intent =
        await intentRepository.findById(
          String(
            req.params.id
          )
        );

      if (!intent) {
        return sendSafeError(
          res,
          404,
          "INTENT_NOT_FOUND",
          `Intent with ID '${req.params.id}' not found.`
        );
      }

      const parseValidation =
        PatchIntentRequestSchema.safeParse(
          req.body
        );

      if (
        !parseValidation.success
      ) {
        const errorMessage =
          parseValidation.error.issues
            .map(
              (issue) =>
                issue.message
            )
            .join("; ");

        return sendSafeError(
          res,
          400,
          "INVALID_REQUEST",
          errorMessage
        );
      }

      const updates =
        parseValidation.data;

      const fieldSource = (updates.source as any) || "USER_EXPLICIT";

      let materialChange =
        false;

      if (
        updates.asset
      ) {
        const newAsset =
          updates.asset
            .trim()
            .toUpperCase();

        if (
          newAsset !== "ETH" &&
          newAsset !== "BTC"
        ) {
          return sendSafeError(
            res,
            400,
            "UNSUPPORTED_ASSET",
            `Unsupported asset '${newAsset}'. Supported assets are ETH or BTC.`
          );
        }

        intent.asset = {
          value:
            newAsset,

          source:
            fieldSource,

          confidence: 1,

          requiresConfirmation:
            false,
        };

        materialChange =
          true;
      }

      if (
        updates.exposureAmount
          ?.amount
      ) {
        if (
          !intent.asset?.value
        ) {
          return sendSafeError(
            res,
            400,
            "MISSING_ASSET",
            "Please specify target asset before setting exposure amount."
          );
        }

        const assetSymbol =
          intent.asset.value
            .toUpperCase();

        const decimals =
          assetSymbol ===
            "BTC" ||
            assetSymbol ===
            "CBBTC"
            ? 8
            : 18;

        const parsedAmount =
          parseExactDecimal(
            updates
              .exposureAmount
              .amount,
            decimals,
            assetSymbol
          );

        const validationResult =
          validateExposureAmount(
            parsedAmount
          );

        if (
          !validationResult.isValid
        ) {
          return sendSafeError(
            res,
            400,
            "INVALID_EXPOSURE",
            validationResult.error ||
            "Invalid exposure amount."
          );
        }

        intent.exposureAmount =
        {
          value:
            parsedAmount,

          source:
            fieldSource,

          confidence: 1,

          requiresConfirmation:
            false,
        };

        materialChange =
          true;
      }

      if (
        updates
          .targetMaxLossPercent !==
        undefined
      ) {
        const validationResult =
          validateLossPercent(
            updates
              .targetMaxLossPercent
          );

        if (
          !validationResult.isValid
        ) {
          return sendSafeError(
            res,
            400,
            "INVALID_LOSS_TARGET",
            validationResult.error ||
            "Invalid max loss percentage."
          );
        }

        intent.targetMaxLossPercent =
        {
          value:
            updates
              .targetMaxLossPercent,

          source:
            fieldSource,

          confidence: 1,

          requiresConfirmation:
            false,
        };

        materialChange =
          true;
      }

      if (
        updates.maxPremiumUSDC
          ?.amount
      ) {
        const parsedBudget =
          parseExactDecimal(
            updates
              .maxPremiumUSDC
              .amount,
            6,
            "USDC"
          );

        const validationResult =
          validateBudgetAmount(
            parsedBudget
          );

        if (
          !validationResult.isValid
        ) {
          return sendSafeError(
            res,
            400,
            "INVALID_BUDGET",
            validationResult.error ||
            "Invalid budget amount."
          );
        }

        intent.maxPremiumUSDC =
        {
          value:
            parsedBudget,

          source:
            fieldSource,

          confidence: 1,

          requiresConfirmation:
            false,
        };

        materialChange =
          true;
      }

      if (
        updates
          .horizonTimestampMs !==
        undefined
      ) {
        const validationResult =
          validateHorizonTimestamp(
            updates
              .horizonTimestampMs
          );

        if (
          !validationResult.isValid
        ) {
          return sendSafeError(
            res,
            400,
            "INVALID_HORIZON",
            validationResult.error ||
            "Invalid horizon timestamp."
          );
        }

        intent.horizonTimestamp =
        {
          value:
            formatCustomHorizon(
              updates
                .horizonTimestampMs
            ),

          source:
            fieldSource,

          confidence: 1,

          requiresConfirmation:
            false,
        };

        materialChange =
          true;
      }

      if (
        updates.allowMultiLeg !==
        undefined
      ) {
        intent.allowMultiLeg =
        {
          value:
            updates
              .allowMultiLeg,

          source:
            "USER_EXPLICIT",

          confidence: 1,

          requiresConfirmation:
            false,
        };

        materialChange =
          true;
      }

      if (
        materialChange
      ) {
        intent.confirmedByUser =
          false;

        intent.confirmedAtMs =
          undefined;

        intent.version += 1;

        intent.updatedAtMs =
          Date.now();
      }

      const missing =
        computeMissingFields(
          intent
        );

      const reviewMetadataIntent = intent as typeof intent & {
        missingFields?: string[];
        ambiguitiesFound?: [];
        requiresClarification?: boolean;
      };

      reviewMetadataIntent.missingFields = missing;
      if (missing.length === 0) {
        reviewMetadataIntent.ambiguitiesFound = [];
        reviewMetadataIntent.requiresClarification = false;
      } else {
        reviewMetadataIntent.requiresClarification = true;
      }

      await intentRepository.update(
        intent
      );

      const dto:
        IntentReviewDTO =
      {
        candidateIntent:
          intent,

        missingFields:
          missing,

        ambiguitiesFound:
          [],

        canConfirm:
          missing.length === 0,
      };

      return res.json(dto);
    } catch (err: any) {
      return sendSafeError(
        res,
        400,
        "INVALID_UPDATE",
        "Invalid update request.",
        err
      );
    }
  }
);

/* ================================================================
 * API: INTENT CONFIRMATION
 * ================================================================ */

app.post(
  "/api/v1/intents/:id/confirm",
  async (
    req,
    res
  ) => {
    try {
      const intent =
        await intentRepository.findById(
          req.params.id
        );

      if (!intent) {
        return sendSafeError(
          res,
          404,
          "INTENT_NOT_FOUND",
          `Intent with ID '${req.params.id}' not found.`
        );
      }

      const parseValidation =
        ConfirmIntentRequestSchema.safeParse(
          req.body
        );

      if (
        !parseValidation.success
      ) {
        return sendSafeError(
          res,
          400,
          "INVALID_CONFIRMATION_VERSION",
          "Confirmation requires an integer 'expectedVersion' matching the reviewed intent version."
        );
      }

      const {
        expectedVersion,
      } =
        parseValidation.data;

      if (
        expectedVersion !==
        intent.version
      ) {
        return sendSafeError(
          res,
          409,
          "STALE_INTENT_VERSION",
          `Stale intent confirmation request. Expected version ${expectedVersion}, but current intent is at version ${intent.version}. Please review updated details before confirming.`
        );
      }

      if (
        (
          intent as any
        ).unsupportedObjective ===
        true
      ) {
        return sendSafeError(
          res,
          400,
          "UNSUPPORTED_OBJECTIVE",
          "Cannot confirm intent with unsupported objective. HedgeOS currently supports Downside Protection intents only."
        );
      }

      const missing =
        computeMissingFields(
          intent
        );

      if (
        missing.length > 0
      ) {
        return sendSafeError(
          res,
          400,
          "INCOMPLETE_INTENT",
          `Cannot confirm incomplete intent. Missing required fields: ${missing.join(
            ", "
          )}.`
        );
      }

      const exposureValidation =
        validateExposureAmount(
          intent
            .exposureAmount!
            .value
        );

      if (
        !exposureValidation.isValid
      ) {
        return sendSafeError(
          res,
          400,
          "INVALID_EXPOSURE",
          `Cannot confirm intent: ${exposureValidation.error}`
        );
      }

      const budgetValidation =
        validateBudgetAmount(
          intent
            .maxPremiumUSDC!
            .value
        );

      if (
        !budgetValidation.isValid
      ) {
        return sendSafeError(
          res,
          400,
          "INVALID_BUDGET",
          `Cannot confirm intent: ${budgetValidation.error}`
        );
      }

      const lossValidation =
        validateLossPercent(
          intent
            .targetMaxLossPercent!
            .value
        );

      if (
        !lossValidation.isValid
      ) {
        return sendSafeError(
          res,
          400,
          "INVALID_LOSS_TARGET",
          `Cannot confirm intent: ${lossValidation.error}`
        );
      }

      const horizonValidation =
        validateHorizonTimestamp(
          intent
            .horizonTimestamp!
            .value
            .timestampMs
        );

      if (
        !horizonValidation.isValid
      ) {
        return sendSafeError(
          res,
          400,
          "INVALID_HORIZON",
          `Cannot confirm intent: ${horizonValidation.error}`
        );
      }

      const nowMs =
        Date.now();

      intent.confirmedByUser =
        true;

      intent.confirmedAtMs =
        nowMs;

      intent.updatedAtMs =
        nowMs;

      const confirmedMetadataIntent = intent as typeof intent & {
        missingFields?: string[];
        ambiguitiesFound?: [];
        requiresClarification?: boolean;
      };

      confirmedMetadataIntent.missingFields = [];
      confirmedMetadataIntent.ambiguitiesFound = [];
      confirmedMetadataIntent.requiresClarification = false;

      await intentRepository.update(
        intent
      );

      const confirmedTypedIntent =
        intent as TypedRiskIntent;

      const dto:
        IntentConfirmationDTO =
      {
        intentId:
          confirmedTypedIntent
            .intentId,

        version:
          confirmedTypedIntent
            .version,

        confirmedByUser:
          true,

        confirmedAtMs:
          nowMs,

        confirmedIntent:
          confirmedTypedIntent,

        message:
          "Your protection goal is confirmed.",

        nextStage:
          "Ready to check live Thetanuts market protection options.",
      };

      return res.json(dto);
    } catch (err: any) {
      return sendSafeError(
        res,
        500,
        "CONFIRMATION_FAILED",
        "Failed to confirm risk intent.",
        err
      );
    }
  }
);

/* ================================================================
 * API: SOLVER
 * ================================================================ */

app.post(
  "/api/v1/intents/:id/solve",
  solveLimiter,
  async (
    req,
    res
  ) => {
    try {
      const intent =
        await intentRepository.findById(
          String(
            req.params.id
          )
        );

      if (!intent) {
        return sendSafeError(
          res,
          404,
          "INTENT_NOT_FOUND",
          `Intent with ID '${req.params.id}' not found.`
        );
      }

      if (
        !intent.confirmedByUser
      ) {
        return sendSafeError(
          res,
          400,
          "CANNOT_SOLVE_UNCONFIRMED",
          "Cannot solve protection for unconfirmed intent. Please confirm risk intent first."
        );
      }

      const confirmedIntent =
        intent as TypedRiskIntent;

      const isServerDemoSnapshotMode =
        process.env
          .DEMO_SNAPSHOT_MODE ===
        "true";

      let quotes;
      let marketExplorer:
        LiveMarketExplorer |
        undefined;

      if (
        isServerDemoSnapshotMode
      ) {
        quotes = [
          ...MOCK_OPTION_BOOK_QUOTES,
          ...MOCK_RFQ_QUOTES,
        ];
      } else {
        try {
          const rawOrders =
            await marketService.fetchRawOrders();

          quotes =
            await marketService.fetchMarketQuotes(
              confirmedIntent,
              rawOrders
            );

          marketExplorer =
            marketService.buildLiveMarketExplorer(
              confirmedIntent,
              rawOrders
            );
        } catch {
          const marketState =
            marketService.getMarketStateSync();

          return res
            .status(503)
            .json({
              intentId:
                confirmedIntent
                  .intentId,

              outcome:
                "LIVE_MARKET_UNAVAILABLE",

              marketState,

              rfqSpecification:
                undefined,

              explanation:
                "The OptionBook read failed. HedgeOS did not infer an empty market and did not create an RFQ fallback from failed evidence.",
            });
        }
      }

      const pipelineResult =
        await solverEngine.solveProtectionPipeline(
          confirmedIntent,
          quotes
        );

      if (marketExplorer) {
        const matchingOrderIds = new Set(
          pipelineResult.rankedStrategies.flatMap((candidate) =>
            candidate.legs.map((leg) => leg.quoteReference)
          )
        );

        const matching = marketExplorer.allLive
          .filter((order) => matchingOrderIds.has(order.orderId))
          .map((order) => ({
            ...order,
            eligibilityStatus: "ELIGIBLE" as const,
            rejectionReasons: [],
          }));

        const closest = marketExplorer.closest
          .filter((order) => !matchingOrderIds.has(order.orderId))
          .map((order) => ({
            ...order,
            eligibilityStatus: order.eligibilityStatus === "CLOSEST_INCOMPATIBLE" ? ("CLOSEST_INCOMPATIBLE" as const) : ("CLOSEST" as const),
          }));

        const statusById = new Map([
          ...matching.map((order) => [order.orderId, "ELIGIBLE" as const] as const),
          ...closest.map((order) => [order.orderId, order.eligibilityStatus] as const),
        ]);

        marketExplorer = {
          ...marketExplorer,
          matchingCount: matching.length,
          closestCount: closest.length,
          matching,
          closest,
          allLive: marketExplorer.allLive.map((order) => ({
            ...order,
            eligibilityStatus: statusById.get(order.orderId) ?? "OTHER",
          })),
        };
      }

      const marketState =
        isServerDemoSnapshotMode
          ? marketService.getMarketStateSync()
          : await marketService.getMarketState();

      const responseMode =
        isServerDemoSnapshotMode
          ? "RECORDED_DEMO_SNAPSHOT"
          : pipelineResult.mode;

      const proposedAlternatives =
        FeasibilityAlternativeService.derive(
          confirmedIntent,
          pipelineResult
            .rejectedCandidates
        );

      const authorizationAttestation =
        pipelineResult
          .actionProposal &&
          pipelineResult
            .simulationResult &&
          pipelineResult
            .humanReviewRecord
          ? BoundedAuthorizationAttestationService.createScopeAttestation(
            confirmedIntent,
            pipelineResult
              .actionProposal,
            pipelineResult
              .simulationResult,
            pipelineResult
              .humanReviewRecord
          )
          : undefined;

      const executionCommitment =
        authorizationAttestation &&
          pipelineResult
            .actionProposal &&
          pipelineResult
            .simulationResult
          ? ExecutionCommitmentService.createCommitment(
            confirmedIntent,
            pipelineResult
              .actionProposal,
            pipelineResult
              .simulationResult,
            authorizationAttestation
          )
          : undefined;

      const externalHumanAuthorizationHandoff =
        authorizationAttestation &&
          executionCommitment
          ? ExternalHumanAuthorizationHandoffService.createHandoff(
            confirmedIntent,
            authorizationAttestation,
            executionCommitment
          )
          : undefined;

      if (
        externalHumanAuthorizationHandoff
      ) {
        await authorizationHandoffRepository.save(
          externalHumanAuthorizationHandoff
        );
      }

      const auditReceipt =
        AuditReceiptService.createReceipt({
          intent:
            confirmedIntent,

          selectedStrategy:
            pipelineResult
              .rankedStrategies[0],

          policyDecisions:
            pipelineResult
              .policyDecisions,

          actionProposal:
            pipelineResult
              .actionProposal,

          simulationResult:
            pipelineResult
              .simulationResult,

          humanReviewRecord:
            pipelineResult
              .humanReviewRecord,

          authorizationAttestation,

          executionCommitment,

          externalHumanAuthorizationHandoff,
        });

      await auditReceiptRepository.save(
        auditReceipt
      );

      return res.json({
        intentId:
          confirmedIntent
            .intentId,

        mode:
          responseMode,

        rankedStrategies:
          pipelineResult
            .rankedStrategies,

        rejectedCandidates:
          pipelineResult
            .rejectedCandidates,

        rfqRequirement:
          pipelineResult
            .rfqRequirement,

        rfqSpecification:
          pipelineResult
            .rfqSpecification,

        rfqLifecycle:
          pipelineResult.mode ===
            "RFQ_REQUIRED"
            ? {
              status:
                "RFQ_SPECIFICATION_PREPARED",

              submissionStatus:
                "NOT_SUBMITTED",

              pricingStatus:
                "UNPRICED",

              policyStatus:
                "POLICY_INCOMPLETE_PENDING_PRICING",
            }
            : undefined,

        marketExplorer,

        /*
         * Frontend must surface these rather than silently ignoring
         * deterministic closest-feasible alternatives.
         */
        proposedAlternatives,

        actionProposal:
          pipelineResult
            .actionProposal,

        simulationResult:
          pipelineResult
            .simulationResult,

        humanReviewRecord:
          pipelineResult
            .humanReviewRecord,

        authorizationAttestation,

        executionCommitment,

        externalHumanAuthorizationHandoff,

        auditReceipt,

        policyDecisions:
          pipelineResult
            .policyDecisions,

        marketState:
          isServerDemoSnapshotMode
            ? {
              ...marketState,
              status:
                "DEMO_SNAPSHOT",
            }
            : marketState,

        isMockData:
          isServerDemoSnapshotMode,

        snapshotTimestampMs:
          isServerDemoSnapshotMode
            ? 1725408000000
            : undefined,
      });
    } catch (err: any) {
      return sendSafeError(
        res,
        500,
        "SOLVER_FAILED",
        "Failed to solve protection options.",
        err
      );
    }
  }
);

/* ================================================================
 * API: APPLY DETERMINISTIC ALTERNATIVE
 * ================================================================ */

app.post(
  "/api/v1/intents/:id/alternatives/apply",
  solveLimiter,
  async (
    req,
    res
  ) => {
    const validation =
      ApplyAlternativeRequestSchema.safeParse(
        req.body
      );

    if (
      !validation.success
    ) {
      return sendSafeError(
        res,
        400,
        "INVALID_ALTERNATIVE_REVIEW",
        "Alternative identity, digest, and expected intent version are required."
      );
    }

    try {
      const stored =
        await intentRepository.findById(
          String(
            req.params.id
          )
        );

      if (
        !stored ||
        !stored.confirmedByUser
      ) {
        return sendSafeError(
          res,
          404,
          "CONFIRMED_INTENT_NOT_FOUND",
          "A confirmed source intent is required."
        );
      }

      const intent =
        stored as TypedRiskIntent;

      if (
        intent.version !==
        validation.data
          .expectedVersion
      ) {
        return sendSafeError(
          res,
          409,
          "STALE_INTENT_VERSION",
          "The source intent changed. Review a fresh alternative."
        );
      }

      let quotes;

      try {
        quotes =
          await marketService.fetchMarketQuotes(
            intent
          );
      } catch {
        return sendSafeError(
          res,
          503,
          "LIVE_MARKET_UNAVAILABLE",
          "Live market evidence could not be revalidated; no alternative was applied."
        );
      }

      const result =
        await solverEngine.evaluateCandidates(
          intent,
          quotes
        );

      const alternatives =
        FeasibilityAlternativeService.derive(
          intent,
          result.rejectedCandidates
        );

      const alternative =
        alternatives.find(
          (item) =>
            item.alternativeId ===
            validation.data
              .alternativeId &&
            item.alternativeDigest ===
            validation.data
              .alternativeDigest
        );

      if (!alternative) {
        return sendSafeError(
          res,
          409,
          "STALE_ALTERNATIVE",
          "The proposed alternative is no longer supported by current market evidence."
        );
      }

      const nowMs =
        Date.now();

      const draft:
        ParsedRiskIntentDraft =
      {
        ...intent,

        intentId:
          `intent-${Math.random()
            .toString(36)
            .slice(2, 9)}`,

        supersedesIntentId:
          intent.intentId,

        version:
          intent.version +
          1,

        createdAtMs:
          nowMs,

        updatedAtMs:
          nowMs,

        confirmedAtMs:
          undefined,

        confirmedByUser:
          false,

        missingFields:
          [],

        ambiguitiesFound:
          [],

        requiresClarification:
          false,
      };

      if (
        alternative.dimension ===
        "MAX_PREMIUM_USDC"
      ) {
        draft.maxPremiumUSDC =
        {
          value: {
            amountBaseUnits:
              alternative
                .proposedValue,

            decimals: 6,

            symbol:
              "USDC",
          },

          source:
            "USER_EXPLICIT",

          confidence: 1,

          requiresConfirmation:
            false,

          originalPhrase:
            `User selected reviewed alternative ${alternative.alternativeId}`,
        };
      } else if (
        alternative.dimension ===
        "TARGET_MAX_LOSS_PERCENT"
      ) {
        const proposedLoss =
          Number(
            alternative
              .proposedValue
          );

        if (
          !Number.isFinite(
            proposedLoss
          ) ||
          proposedLoss <= 0 ||
          proposedLoss > 100
        ) {
          return sendSafeError(
            res,
            409,
            "INVALID_ALTERNATIVE_VALUE",
            "The refreshed downside alternative cannot be represented as a valid Typed Risk Intent."
          );
        }

        draft.targetMaxLossPercent =
        {
          value:
            proposedLoss,

          source:
            "USER_EXPLICIT",

          confidence: 1,

          requiresConfirmation:
            false,

          originalPhrase:
            `User selected reviewed alternative ${alternative.alternativeId}`,
        };
      } else {
        const proposedHorizon =
          Number(
            alternative
              .proposedValue
          );

        const horizonValidation =
          validateHorizonTimestamp(
            proposedHorizon
          );

        if (
          !horizonValidation.isValid
        ) {
          return sendSafeError(
            res,
            409,
            "INVALID_ALTERNATIVE_VALUE",
            "The refreshed horizon alternative is no longer valid."
          );
        }

        draft.horizonTimestamp =
        {
          value:
            formatCustomHorizon(
              proposedHorizon
            ),

          source:
            "USER_EXPLICIT",

          confidence: 1,

          requiresConfirmation:
            false,

          originalPhrase:
            `User selected reviewed alternative ${alternative.alternativeId}`,
        };
      }

      await intentRepository.save(
        draft
      );

      return res
        .status(201)
        .json({
          intent:
            draft,

          reviewedChange: {
            dimension:
              alternative.dimension,

            currentValue:
              alternative
                .currentValue,

            proposedValue:
              alternative
                .proposedValue,
          },

          sourceAlternativeId:
            alternative
              .alternativeId,

          sourceAlternativeDigest:
            alternative
              .alternativeDigest,

          sourceIntentInvalidatedForThisFlow:
            true,

          requiresExplicitConfirmation:
            true,
        });
    } catch (err) {
      return sendSafeError(
        res,
        409,
        "ALTERNATIVE_APPLY_FAILED",
        sanitizeErrorMessage(
          err
        ),
        err
      );
    }
  }
);

/* ================================================================
 * API: EXACT UNSIGNED EXECUTION PREPARATION
 * ================================================================ */

app.post(
  "/api/v1/executions/prepare",
  solveLimiter,
  async (
    req,
    res
  ) => {
    const validation =
      PrepareExecutionRequestSchema.safeParse(
        req.body
      );

    if (
      !validation.success ||
      !ethers.isAddress(
        validation.data
          ?.expectedBeneficiary ||
        ""
      )
    ) {
      return sendSafeError(
        res,
        400,
        "INVALID_PREPARATION_REQUEST",
        "A confirmed intent and valid external beneficiary address are required."
      );
    }

    try {
      const stored =
        await intentRepository.findById(
          validation.data
            .intentId
        );

      if (
        !stored ||
        !stored.confirmedByUser
      ) {
        return sendSafeError(
          res,
          404,
          "CONFIRMED_INTENT_NOT_FOUND",
          "A confirmed Typed Risk Intent is required."
        );
      }

      const intent =
        stored as TypedRiskIntent;

      /*
       * Fresh snapshot for exact preparation.
       */
      const snapshot =
        await marketService.fetchMarketSnapshot(
          intent.asset.value
        );

      if (
        snapshot.status !==
        "LIVE_READ_AVAILABLE"
      ) {
        return res
          .status(503)
          .json({
            status:
              "LIVE_MARKET_UNAVAILABLE",

            marketState:
              snapshot.status,

            explanation:
              "Exact transaction preparation requires a fresh successful live Thetanuts OptionBook read.",
          });
      }

      /*
       * Solve only against this exact fresh snapshot.
       */
      const pipeline =
        await solverEngine.solveProtectionPipeline(
          intent,
          snapshot.quotes
        );

      const selectedStrategy =
        validation.data
          .strategyId
          ? pipeline.rankedStrategies.find(
            (item) =>
              item.strategyId ===
              validation.data
                .strategyId
          )
          : pipeline
            .rankedStrategies[0];

      if (
        !selectedStrategy ||
        selectedStrategy.status !==
        "TECHNICALLY_FEASIBLE"
      ) {
        return sendSafeError(
          res,
          409,
          "NO_CURRENT_EXECUTABLE_CANDIDATE",
          "The selected candidate did not pass fresh deterministic financial verification."
        );
      }

      const policyDecision =
        selectedStrategy
          .policyDecision;

      if (
        !policyDecision ||
        policyDecision
          .overallStatus !==
        "PASS" ||
        policyDecision
          .passedAllInvariants !==
        true ||
        policyDecision.checks.some(
          (check) =>
            check.status !==
            "PASS"
        )
      ) {
        return sendSafeError(
          res,
          409,
          "FINANCIAL_CONSTITUTION_NOT_PASS",
          "The selected candidate does not have complete PASS evidence from the Financial Constitution."
        );
      }

      const quote =
        selectedStrategy
          .quotes[0];

      const quantity =
        selectedStrategy
          .legs[0]
          ?.resolvedOptionQuantity;

      if (
        !quote ||
        !quantity
      ) {
        return sendSafeError(
          res,
          409,
          "INCOMPLETE_EXECUTION_EVIDENCE",
          "Required signed order or exact quantity evidence is incomplete."
        );
      }

      /*
       * Convert Advanced/Solver CandidateStrategy to the same
       * deterministic execution candidate used by Simple Mode.
       */
      const executionCandidate =
        buildExecutionCandidate(
          intent,
          selectedStrategy,
          snapshot
        );

      /*
       * CRITICAL:
       * Build the proposal specifically for THIS selected strategy.
       *
       * Never reuse pipeline.actionProposal, because that may belong
       * to another ranked candidate.
       */
      const selectedProposal =
        ActionProposalBuilder.buildOptionBookProposal(
          intent,
          selectedStrategy,
          marketService,
          {
            candidateDigest:
              executionCandidate
                .candidateDigest,

            marketSnapshotId:
              snapshot.snapshotId,

            marketSnapshotDigest:
              snapshot.snapshotDigest,
          }
        );

      /*
       * Exact unsigned transaction.
       */
      const preparationService =
        new ExactExecutionPreparationService(
          marketService
        );

      const preparation =
        await preparationService.prepare({
          intent,

          proposal:
            selectedProposal,

          quote,

          candidate:
            executionCandidate,

          snapshot,

          expectedBeneficiary:
            validation.data
              .expectedBeneficiary,

          policyDecision,
        });

      /*
       * ==========================================================
       * PRE-SIGN / PRE-AUTHORIZATION REVALIDATION
       * ==========================================================
       *
       * This is a SECOND live read.
       *
       * It must succeed before HedgeOS returns an external wallet
       * handoff.
       */
      const quantity18 =
        tokenAmountToDecimals(
          executionCandidate
            .quantity,
          18
        );

      const expectedBuyerSpendUSDC6 =
        tokenAmountToDecimals(
          preparation.transaction
            .exactBuyerSpendUSDC,
          6
        );

      const maxSpendUSDC6 =
        tokenAmountToDecimals(
          intent
            .maxPremiumUSDC
            .value,
          6
        );

      const preSignRevalidation =
        await marketService.revalidateExactFill(
          {
            originalQuote:
              quote,

            requestedContracts18:
              quantity18,

            expectedBuyerSpendUSDC6,

            maxSpendUSDC6,

            expectedCalldataHash:
              preparation.transaction
                .calldataHash,

            expectedTarget:
              preparation.transaction
                .to,

            referrer:
              preparation.transaction
                .referrer,
          }
        );

      if (
        preSignRevalidation.status !==
        "REVALIDATED"
      ) {
        const statusCode =
          preSignRevalidation.status ===
            "MARKET_UNAVAILABLE"
            ? 503
            : 409;

        return res
          .status(statusCode)
          .json({
            status:
              "REVALIDATION_REQUIRED",

            preSignRevalidation,

            externalAuthorization:
            {
              status:
                "NOT_AVAILABLE",

              reason:
                "Fresh pre-authorization evidence did not match the reviewed exact action.",
            },

            explanation:
              "The old preparation was not handed to an external authorization step. Refresh market evidence and review the updated outcome.",
          });
      }

      /*
       * Build review/authorization evidence for the exact selected
       * proposal, not a different ranked strategy.
       */
      const simulationService =
        new ThetanutsSimulationService();

      let spotForDisplay =
        0;

      if (
        snapshot.spotPrice
      ) {
        try {
          spotForDisplay =
            Number(
              tokenAmountToDecimals(
                snapshot.spotPrice,
                8
              )
            ) /
            100_000_000;
        } catch {
          spotForDisplay =
            0;
        }
      }

      const simulationResult =
        await simulationService.simulateProposal(
          selectedProposal,
          intent,
          selectedStrategy,
          spotForDisplay
        );

      const effectiveDownsidePercent =
        Number(
          (
            selectedStrategy
              .payoffSummary as any
          )
            ?.effectiveDownsidePercent
        );

      const humanReviewRecord =
        HumanReviewService.createReviewRecord(
          intent,
          selectedProposal,
          simulationResult,
          Number.isFinite(
            effectiveDownsidePercent
          )
            ? effectiveDownsidePercent
            : undefined
        );

      const attestation =
        BoundedAuthorizationAttestationService.createScopeAttestation(
          intent,
          selectedProposal,
          simulationResult,
          humanReviewRecord
        );

      const previewCommitment =
        ExecutionCommitmentService.createCommitment(
          intent,
          selectedProposal,
          simulationResult,
          attestation
        );

      const exactCommitment =
        ExecutionCommitmentService.bindExactPreparedAction(
          previewCommitment,
          preparation
        );

      /*
       * Handoff exists ONLY after fresh pre-sign revalidation.
       */
      const handoff =
        ExternalHumanAuthorizationHandoffService.createHandoff(
          intent,
          attestation,
          exactCommitment
        );

      evidenceRepository.savePreparation(
        preparation
      );

      await authorizationHandoffRepository.save(
        handoff
      );

      return res
        .status(201)
        .json({
          preparation,

          preSignRevalidation,

          actionProposal:
            selectedProposal,

          simulationResult,

          humanReviewRecord,

          authorizationAttestation:
            attestation,

          executionCommitment:
            exactCommitment,

          externalHumanAuthorizationHandoff:
            handoff,

          externalAuthorization: {
            status:
              "AWAITING_EXTERNAL_HUMAN",

            preSignStatus:
              "REVALIDATED",

            custody:
              "NONE",

            signingSystem:
              "EXTERNAL_USER_CONTROLLED_WALLET_OR_EXECUTOR",

            transactionRequest: {
              chainId:
                preparation
                  .transaction
                  .chainId,

              to:
                preparation
                  .transaction
                  .to,

              data:
                preparation
                  .transaction
                  .data,

              value:
                preparation
                  .transaction
                  .value,
            },

            disclosure:
              "HedgeOS prepared and freshly revalidated this exact unsigned Thetanuts transaction. HedgeOS does not sign or broadcast it.",
          },
        });
    } catch (err) {
      return sendSafeError(
        res,
        409,
        "EXECUTION_PREPARATION_FAILED",
        sanitizeErrorMessage(
          err
        ),
        err
      );
    }
  }
);

/* ================================================================
 * API: PREPARATION EVIDENCE
 * ================================================================ */

app.get(
  "/api/v1/executions/preparations/:id",
  (
    req,
    res
  ) => {
    try {
      const preparation =
        evidenceRepository.getPreparation(
          req.params.id
        );

      if (!preparation) {
        return sendSafeError(
          res,
          404,
          "PREPARATION_NOT_FOUND",
          "Execution preparation was not found."
        );
      }

      return res.json(
        preparation
      );
    } catch (err) {
      return sendSafeError(
        res,
        409,
        "PREPARATION_EVIDENCE_INVALID",
        "Stored preparation failed digest validation.",
        err
      );
    }
  }
);

/* ================================================================
 * API: READ-ONLY EXECUTION VERIFICATION
 * ================================================================ */

app.post(
  "/api/v1/executions/verify",
  simulateLimiter,
  async (
    req,
    res
  ) => {
    const validation =
      VerifyExecutionRequestSchema.safeParse(
        req.body
      );

    if (
      !validation.success
    ) {
      return sendSafeError(
        res,
        400,
        "INVALID_VERIFICATION_REQUEST",
        "A preparationId and Base transaction hash are required."
      );
    }

    try {
      const preparation =
        evidenceRepository.getPreparation(
          validation.data
            .preparationId
        );

      if (!preparation) {
        return sendSafeError(
          res,
          404,
          "PREPARATION_NOT_FOUND",
          "Execution preparation was not found."
        );
      }

      const currentIntent =
        await intentRepository.findById(
          preparation.intentId
        );

      if (
        !currentIntent ||
        currentIntent.version !==
        preparation
          .intentVersion ||
        !currentIntent
          .confirmedByUser
      ) {
        return sendSafeError(
          res,
          409,
          "STALE_PREPARATION",
          "The bound intent version is no longer current and confirmed."
        );
      }

      if (
        !process.env
          .BASE_RPC_URL
      ) {
        return sendSafeError(
          res,
          503,
          "BASE_RPC_NOT_CONFIGURED",
          "A Base Mainnet RPC is required for independent verification."
        );
      }

      const provider =
        new ethers.JsonRpcProvider(
          process.env
            .BASE_RPC_URL
        );

      const verifier =
        new OnChainExecutionVerifier(
          provider as any,
          undefined,
          marketService.getOptionFactoryAddress()
        );

      const verification =
        await verifier.verify(
          preparation,
          validation.data
            .transactionHash
        );

      evidenceRepository.saveVerification(
        verification
      );

      const priorReceipts =
        await auditReceiptRepository.findByIntentId(
          preparation.intentId
        );

      const priorReceipt =
        priorReceipts[0] ||
        AuditReceiptService.createReceipt(
          {
            intent:
              currentIntent as TypedRiskIntent,
          }
        );

      const executionAuditReceipt =
        AuditReceiptService.appendExecutionEvidence(
          priorReceipt,
          preparation,
          verification
        );

      await auditReceiptRepository.save(
        executionAuditReceipt
      );

      const statusCode =
        verification.status ===
          "MISMATCH" ||
          verification.status ===
          "REVERTED"
          ? 409
          : 200;

      return res
        .status(statusCode)
        .json({
          verification,

          protectionStatus:
            verification.status ===
              "POSITION_CONFIRMED"
              ? "PROTECTION_CONFIRMED_ON_CHAIN"
              : "NOT_CONFIRMED",

          auditReceipt:
            executionAuditReceipt,
        });
    } catch (err) {
      return sendSafeError(
        res,
        503,
        "EXECUTION_VERIFICATION_FAILED",
        sanitizeErrorMessage(
          err
        ),
        err
      );
    }
  }
);

app.get(
  "/api/v1/executions/verifications/:id",
  (
    req,
    res
  ) => {
    try {
      const verification =
        evidenceRepository.getVerification(
          req.params.id
        );

      if (!verification) {
        return sendSafeError(
          res,
          404,
          "VERIFICATION_NOT_FOUND",
          "Execution verification was not found."
        );
      }

      return res.json(
        verification
      );
    } catch (err) {
      return sendSafeError(
        res,
        409,
        "VERIFICATION_EVIDENCE_INVALID",
        "Stored verification evidence failed digest validation.",
        err
      );
    }
  }
);

/* ================================================================
 * API: AUDIT
 * ================================================================ */

app.get(
  "/api/v1/audit/:receiptId",
  async (
    req,
    res
  ) => {
    try {
      const receipt =
        await auditReceiptRepository.findById(
          req.params
            .receiptId
        );

      if (!receipt) {
        return sendSafeError(
          res,
          404,
          "AUDIT_RECEIPT_NOT_FOUND",
          `Audit receipt with ID '${req.params.receiptId}' not found.`
        );
      }

      return res.json(
        receipt
      );
    } catch (err: any) {
      return sendSafeError(
        res,
        500,
        "AUDIT_FETCH_FAILED",
        "Failed to retrieve audit receipt.",
        err
      );
    }
  }
);

app.get(
  "/api/v1/intents/:intentId/audit",
  async (
    req,
    res
  ) => {
    try {
      const receipts =
        await auditReceiptRepository.findByIntentId(
          req.params
            .intentId
        );

      return res.json(
        receipts
      );
    } catch (err: any) {
      return sendSafeError(
        res,
        500,
        "AUDIT_FETCH_FAILED",
        "Failed to retrieve audit receipts for intent.",
        err
      );
    }
  }
);

/* ================================================================
 * API: READ-ONLY SIMULATION
 * ================================================================ */

app.post(
  "/api/v1/intents/:id/simulate",
  simulateLimiter,
  async (
    req,
    res
  ) => {
    try {
      const intent =
        await intentRepository.findById(
          String(
            req.params.id
          )
        );

      if (
        !intent ||
        !intent.confirmedByUser
      ) {
        return sendSafeError(
          res,
          400,
          "CANNOT_SIMULATE_UNCONFIRMED",
          "Confirmed intent required for simulation."
        );
      }

      const parseValidation =
        SimulateProposalRequestSchema.safeParse(
          req.body
        );

      if (
        !parseValidation.success
      ) {
        return sendSafeError(
          res,
          400,
          "INVALID_SIMULATION_REQUEST",
          "Valid ActionProposal required for simulation."
        );
      }

      const proposal =
        req.body
          .proposal as ActionProposal;

      const typedIntent =
        intent as TypedRiskIntent;

      /*
       * Proposal must belong to the current confirmed intent.
       */
      if (
        proposal.intentId !==
        typedIntent.intentId ||
        proposal.intentVersion !==
        typedIntent.version
      ) {
        return sendSafeError(
          res,
          409,
          "STALE_PROPOSAL",
          "Simulation proposal is not bound to the current confirmed intent version."
        );
      }

      const simulationService =
        new ThetanutsSimulationService(
          marketService
        );

      const assetSymbol =
        typedIntent.asset.value;

      const spot =
        await marketService
          .getSpotPrice(
            assetSymbol
          )
          .catch(
            () => 0
          );

      const simulationResult =
        await simulationService.simulateProposal(
          proposal,
          typedIntent,
          undefined,
          spot
        );

      /*
       * This legacy display calculation is not used for execution
       * authority. Exact payoff evidence from the deterministic
       * solver remains authoritative.
       */
      let effectiveDownsidePercent:
        number | undefined;

      if (
        spot > 0 &&
        proposal.expectedTotalCost
      ) {
        const exposureQuantity =
          Number(
            BigInt(
              typedIntent
                .exposureAmount
                .value
                .amountBaseUnits
            )
          ) /
          10 **
          typedIntent
            .exposureAmount
            .value.decimals;

        const strike =
          Number(
            BigInt(
              proposal
                .expectedStrike
                .amountBaseUnits
            )
          ) /
          10 **
          proposal
            .expectedStrike
            .decimals;

        const costUSD =
          Number(
            BigInt(
              proposal
                .expectedTotalCost
                .amountBaseUnits
            )
          ) /
          1_000_000;

        const payoff =
          ExposurePayoffEngine.calculate(
            {
              spotQuantity:
                exposureQuantity,

              optionQuantity:
                exposureQuantity,

              strikePriceUSD:
                strike,

              spotReferencePriceUSD:
                spot,

              totalProtectionCostUSD:
                costUSD,

              assetSymbol,
            }
          );

        effectiveDownsidePercent =
          payoff
            .effectiveDownsidePercent;
      }

      const reviewRecord =
        HumanReviewService.createReviewRecord(
          typedIntent,
          proposal,
          simulationResult,
          effectiveDownsidePercent
        );

      return res.json({
        simulationResult,
        humanReviewRecord:
          reviewRecord,
      });
    } catch (err: any) {
      return sendSafeError(
        res,
        500,
        "SIMULATION_FAILED",
        "Failed to execute read-only simulation.",
        err
      );
    }
  }
);

/* ================================================================
 * API: EXISTING RFQS — READ ONLY
 * ================================================================ */

app.get(
  "/api/v1/rfq/existing",
  async (
    _req,
    res
  ) => {
    try {
      const quotationCount =
        await marketService.getQuotationCount();

      const existingRfqs =
        await marketService.fetchExistingRFQs();

      const factoryAddress =
        marketService.getOptionFactoryAddress();

      return res.json({
        quotationCount:
          quotationCount.toString(),

        factoryAddress,

        chainId:
          8453,

        rfqs:
          existingRfqs.slice(
            0,
            10
          ),

        status:
          "READ_ONLY",
      });
    } catch (err: any) {
      return sendSafeError(
        res,
        500,
        "RFQ_READ_FAILED",
        "Failed to fetch existing RFQs.",
        err
      );
    }
  }
);

/* ================================================================
 * START SERVER
 * ================================================================ */

const PORT =
  process.env.PORT ||
  3001;

export const serverInstance =
  app.listen(
    PORT,
    () => {
      console.log(
        `HedgeOS REST API running on port ${PORT}`
      );
    }
  );

export {
  app,
  intentRepository,
};
