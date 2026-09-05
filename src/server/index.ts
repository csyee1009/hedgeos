import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
import "dotenv/config";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { IntentConfirmationDTO, IntentParseResponseDTO, IntentReviewDTO } from "../dtos/intentDTOs";
import { MOCK_OPTION_BOOK_QUOTES, MOCK_RFQ_QUOTES } from "../fixtures/mockQuotes";
import { IntentProviderFactory } from "../providers/IntentProviderFactory";
import { DevelopmentIntentRepository } from "../repositories/IntentRepository";
import { ExposurePayoffEngine } from "../services/ExposurePayoffEngine";
import { formatCustomHorizon } from "../services/IntentEngine";
import { HumanReviewService } from "../services/HumanReviewService";
import { ProtectionSolverEngine } from "../services/ProtectionSolverEngine";
import { ThetanutsMarketService } from "../services/ThetanutsMarketService";
import { ThetanutsSimulationService } from "../services/ThetanutsSimulationService";
import { BoundedAuthorizationAttestationService } from "../services/BoundedAuthorizationAttestationService";
import { ExecutionCommitmentService } from "../services/ExecutionCommitmentService";
import { ExternalHumanAuthorizationHandoffService } from "../services/ExternalHumanAuthorizationHandoffService";
import { AuditReceiptService } from "../services/AuditReceiptService";
import { ReadOnlyPortfolioService } from "../services/ReadOnlyPortfolioService";
import { SqliteDatabase } from "../repositories/SqliteDatabase";
import { SqliteIntentRepository } from "../repositories/SqliteIntentRepository";
import { AuditReceiptRepository } from "../repositories/AuditReceiptRepository";
import { AuthorizationHandoffRepository } from "../repositories/AuthorizationHandoffRepository";
import { IntentRepository } from "../repositories/IntentRepository";
import { ActionProposal, StoredIntent, TypedRiskIntent } from "../types";
import { parseExactDecimal, validateBudgetAmount, validateExposureAmount, validateHorizonTimestamp, validateLossPercent } from "../utils/decimalParser";

import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { requestIdMiddleware } from "./middleware/requestId";
import { requestLoggerMiddleware, redactSensitiveText } from "./middleware/requestLogger";

const app = express();

app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);
app.use(helmet({ contentSecurityPolicy: false }));

const allowedOriginsEnv = process.env.HEDGEOS_ALLOWED_ORIGINS;
const isProd = process.env.NODE_ENV === "production";

let allowedOrigins: string[] = [];
if (allowedOriginsEnv) {
  allowedOrigins = allowedOriginsEnv.split(",").map((s) => s.trim()).filter(Boolean);
} else if (!isProd) {
  allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
}

if (isProd && allowedOrigins.length === 0) {
  console.error("FATAL: HEDGEOS_ALLOWED_ORIGINS must be configured in production.");
  process.exit(1);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
  })
);

// JSON replacer to serialize BigInt fields as string
app.set("json replacer", (_key: string, value: any) => (typeof value === "bigint" ? value.toString() : value));
// Middleware: Request body size limit (64KB)
app.use(express.json({ limit: "64kb" }));

// Handle JSON body limit / syntax errors gracefully
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === "entity.too.large" || err.status === 413)) {
    return res.status(413).json({
      error: "Request payload too large. Maximum permitted body size is 64KB.",
      code: "PAYLOAD_TOO_LARGE",
      errorCode: "PAYLOAD_TOO_LARGE",
    });
  }
  if (err && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "Malformed JSON payload in request.",
      code: "MALFORMED_JSON",
      errorCode: "MALFORMED_JSON",
    });
  }
  next(err);
});

// Centralized Rate Limiters
const rateLimitHandler = (req: express.Request, res: express.Response) => {
  return sendSafeError(res, 429, "RATE_LIMITED", "Too many requests. Please try again shortly.");
};

export const generalLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 300, handler: rateLimitHandler });
export const parseLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, handler: rateLimitHandler });
export const portfolioLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60, handler: rateLimitHandler });
export const solveLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, handler: rateLimitHandler });
export const simulateLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, handler: rateLimitHandler });

app.use("/api/", generalLimiter);

let sqliteDb: SqliteDatabase;
try {
  sqliteDb = new SqliteDatabase();
} catch (err: any) {
  if (process.env.NODE_ENV === "production") {
    console.error("FATAL: Failed to initialize SQLite database in production environment.", err);
    process.exit(1);
  }
  throw err;
}

const intentRepository: IntentRepository = new SqliteIntentRepository(sqliteDb);
const auditReceiptRepository = new AuditReceiptRepository(sqliteDb);
const authorizationHandoffRepository = new AuthorizationHandoffRepository(sqliteDb);
const marketService = new ThetanutsMarketService();
const solverEngine = new ProtectionSolverEngine(marketService);

export function sanitizeErrorMessage(err: any): string {
  const msg = typeof err === "string" ? err : err?.message || "Internal server error";
  return redactSensitiveText(msg);
}

export function sendSafeError(
  res: express.Response,
  statusCode: number,
  code: string,
  userMessage: string,
  _internalErr?: any
) {
  (res as any).locals = (res as any).locals || {};
  (res as any).locals.errorCode = code;

  const requestId = (res.req as any)?.requestId;
  const sanitized = redactSensitiveText(userMessage);

  return res.status(statusCode).json({
    error: sanitized,
    code,
    errorCode: code,
    ...(requestId ? { requestId } : {}),
  });
}

// Liveness endpoint
app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    service: "hedgeos",
    timestampMs: Date.now(),
  });
});

// Readiness endpoint
app.get("/readyz", (_req, res) => {
  const dbAlive = sqliteDb.ping();
  const llmConfigured = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const baseRpcConfigured = Boolean(process.env.BASE_RPC_URL);
  const thetanutsConfigured = true;

  const isReady = dbAlive;
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    status: isReady ? "ready" : "not_ready",
    checks: {
      database: dbAlive ? "READY" : "FAILED",
      llm: llmConfigured ? "CONFIGURED" : "NOT_CONFIGURED",
      baseRpc: baseRpcConfigured ? "CONFIGURED" : "NOT_CONFIGURED",
      thetanuts: thetanutsConfigured ? "CONFIGURED" : "NOT_CONFIGURED",
    },
  });
});

// Helper to compute missing fields on a draft/intent
export function computeMissingFields(intent: StoredIntent): string[] {
  const missing: string[] = [];
  if (!intent.asset || !intent.asset.value) missing.push("asset");
  if (!intent.exposureAmount || !intent.exposureAmount.value || intent.exposureAmount.value.amountBaseUnits === "0") {
    missing.push("exposureAmount");
  }
  if (!intent.targetMaxLossPercent || intent.targetMaxLossPercent.value === undefined || intent.targetMaxLossPercent.value === null) {
    missing.push("targetMaxLossPercent");
  }
  if (!intent.maxPremiumUSDC || !intent.maxPremiumUSDC.value) {
    missing.push("maxPremiumUSDC");
  }
  if (!intent.horizonTimestamp || !intent.horizonTimestamp.value || !intent.horizonTimestamp.value.timestampMs) {
    missing.push("horizonTimestamp");
  }
  return missing;
}

// Rate limiting & abuse guard: in-memory sliding window with memory hygiene
interface RateLimitRecord {
  count: number;
  windowStartMs: number;
}
const ipRateLimits = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute
const MAX_PROMPT_LENGTH = 2000; // 2000 characters maximum
const MAX_RATE_LIMIT_ENTRIES = 5000; // Bounded map capacity

export function cleanExpiredRateLimits() {
  const now = Date.now();
  for (const [ip, record] of ipRateLimits.entries()) {
    if (now - record.windowStartMs > RATE_LIMIT_WINDOW_MS) {
      ipRateLimits.delete(ip);
    }
  }
}

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  if (ipRateLimits.size > MAX_RATE_LIMIT_ENTRIES) {
    cleanExpiredRateLimits();
  }

  const record = ipRateLimits.get(ip);
  if (!record || now - record.windowStartMs > RATE_LIMIT_WINDOW_MS) {
    ipRateLimits.set(ip, { count: 1, windowStartMs: now });
    return true;
  }
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  record.count++;
  return true;
}

export function clearRateLimitCache() {
  ipRateLimits.clear();
}

// Strict Zod Request Schemas
const ParseIntentRequestSchema = z
  .object({
    prompt: z.string().min(1, "Prompt cannot be empty").max(MAX_PROMPT_LENGTH, `Prompt exceeds maximum of ${MAX_PROMPT_LENGTH} characters`),
  })
  .strict();

const AnalyzePortfolioRequestSchema = z
  .object({
    address: z.string().min(1, "Address cannot be empty"),
  })
  .strict();

const PatchIntentRequestSchema = z
  .object({
    asset: z.string().optional(),
    exposureAmount: z.object({ amount: z.string().min(1) }).strict().optional(),
    targetMaxLossPercent: z.number().positive().max(100).optional(),
    maxPremiumUSDC: z.object({ amount: z.string().min(1) }).strict().optional(),
    horizonTimestampMs: z.number().int().positive().optional(),
    allowMultiLeg: z.boolean().optional(), // Strictly boolean; strings rejected
  })
  .strict();

const ConfirmIntentRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive("expectedVersion must be an integer"),
  })
  .strict();

const SimulateProposalRequestSchema = z
  .object({
    proposal: z
      .object({
        proposalId: z.string().min(1),
        proposalDigest: z.string().min(1),
      })
      .passthrough(),
  })
  .strict();

// -------------------------------------------------------------
// API Endpoints (/api/v1)
// -------------------------------------------------------------

// Health check endpoint (Truthful, Backend-Driven)
app.get("/api/v1/health", async (_req, res) => {
  try {
    const mState = await marketService.getMarketState();
    const isLiveRead = mState.status === "LIVE_READ_AVAILABLE";

    res.json({
      status: "ok",
      system: "HedgeOS Intent Execution Pipeline",
      thetanutsStatus: mState.status,
      optionBookStatus: isLiveRead ? "SDK_CONFIRMED, LIVE_READ_AVAILABLE" : "MARKET_UNAVAILABLE",
      rfqStatus: "SDK_CONFIRMED, LIVE_RFQ_AVAILABLE",
      baseChainId: 8453,
      marketState: mState,
      repositoryStorage: intentRepository.storageType,
      executionMode: "PREVIEW_UNAUTHORIZED",
    });
  } catch (err: any) {
    return sendSafeError(res, 500, "HEALTH_CHECK_FAILED", "Failed to query system health.", err);
  }
});

// Endpoint: GET /api/v1/market/status
app.get("/api/v1/market/status", async (_req, res) => {
  try {
    const state = await marketService.getMarketState();
    res.json(state);
  } catch (err: any) {
    return sendSafeError(res, 500, "MARKET_UNAVAILABLE", "Failed to query market state.", err);
  }
});

// Endpoint: GET /api/v1/ai/status
app.get("/api/v1/ai/status", (_req, res) => {
  const summary = IntentProviderFactory.getProviderStatusSummary();
  res.json(summary);
});

// Endpoint: POST /api/v1/portfolio/analyze
app.post("/api/v1/portfolio/analyze", async (req, res) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
    if (!checkRateLimit(clientIp)) {
      return sendSafeError(res, 429, "RATE_LIMIT_EXCEEDED", "Rate limit exceeded. Please wait a moment before sending additional requests.");
    }

    const validation = AnalyzePortfolioRequestSchema.safeParse(req.body);
    if (!validation.success) {
      const errMsg = validation.error.issues.map((i) => i.message).join("; ");
      return sendSafeError(res, 400, "INVALID_ADDRESS", errMsg);
    }

    const { address } = validation.data;
    const portfolioService = new ReadOnlyPortfolioService();

    if (!portfolioService.validateAddress(address)) {
      return sendSafeError(
        res,
        400,
        "INVALID_ADDRESS",
        "Invalid EVM address format. Must be 0x followed by 40 hexadecimal characters."
      );
    }

    const snapshot = await portfolioService.analyzePortfolio(address);

    if (snapshot.status === "UNAVAILABLE") {
      return sendSafeError(
        res,
        503,
        "PORTFOLIO_UNAVAILABLE",
        "Base Mainnet portfolio reads are currently unavailable."
      );
    }

    res.json(snapshot);
  } catch (err: any) {
    return sendSafeError(
      res,
      503,
      "PORTFOLIO_ANALYSIS_FAILED",
      "Failed to read balances from Base Mainnet.",
      err
    );
  }
});

// Endpoint 1: POST /api/v1/intents/parse
app.post("/api/v1/intents/parse", async (req, res) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
    if (!checkRateLimit(clientIp)) {
      return sendSafeError(res, 429, "RATE_LIMIT_EXCEEDED", "Rate limit exceeded. Please wait a moment before sending additional requests.");
    }

    const parseValidation = ParseIntentRequestSchema.safeParse(req.body);
    if (!parseValidation.success) {
      const errMsg = parseValidation.error.issues.map((i) => i.message).join("; ");
      const isLength = parseValidation.error.issues.some((i) => i.code === "too_big");
      return sendSafeError(res, 400, isLength ? "PROMPT_TOO_LONG" : "INVALID_PROMPT", errMsg);
    }

    const { prompt } = parseValidation.data;
    const provider = IntentProviderFactory.getActiveProvider();
    const parseResult = await provider.parseNaturalLanguage(prompt);

    if (parseResult.unsupportedObjective) {
      (parseResult.candidateDraft as any).unsupportedObjective = true;
      (parseResult.candidateDraft as any).unsupportedObjectiveReason = parseResult.unsupportedObjectiveReason;
    }
    await intentRepository.save(parseResult.candidateDraft);

    const dto: IntentParseResponseDTO = {
      intentId: parseResult.candidateDraft.intentId,
      adapterName: parseResult.adapterName,
      candidateDraft: parseResult.candidateDraft,
      ambiguitiesFound: parseResult.ambiguitiesFound,
      missingFields: parseResult.missingFields,
      requiresClarification: parseResult.requiresClarification || parseResult.missingFields.length > 0,
      unsupportedObjective: parseResult.unsupportedObjective,
      unsupportedObjectiveReason: parseResult.unsupportedObjectiveReason,
      providerMetadata: parseResult.providerMetadata,
    };

    res.json(dto);
  } catch (err: any) {
    return sendSafeError(res, 500, "PARSE_ERROR", "Failed to parse natural language intent.", err);
  }
});

// Endpoint 2: GET /api/v1/intents/:id
app.get("/api/v1/intents/:id", async (req, res) => {
  try {
    const intent = await intentRepository.findById(req.params.id);
    if (!intent) {
      return sendSafeError(res, 404, "INTENT_NOT_FOUND", `Intent with ID '${req.params.id}' not found.`);
    }

    const missing = computeMissingFields(intent);
    const dto: IntentReviewDTO = {
      candidateIntent: intent,
      missingFields: missing,
      ambiguitiesFound: [],
      canConfirm: !intent.confirmedByUser && missing.length === 0,
    };

    res.json(dto);
  } catch (err: any) {
    return sendSafeError(res, 500, "INTERNAL_ERROR", "Failed to retrieve intent.", err);
  }
});

// Endpoint 3: PATCH /api/v1/intents/:id
app.patch("/api/v1/intents/:id", async (req, res) => {
  try {
    const intent = await intentRepository.findById(req.params.id);
    if (!intent) {
      return sendSafeError(res, 404, "INTENT_NOT_FOUND", `Intent with ID '${req.params.id}' not found.`);
    }

    // Strict schema validation (rejects strings for boolean, unauthorized fields, etc.)
    const parseValidation = PatchIntentRequestSchema.safeParse(req.body);
    if (!parseValidation.success) {
      const errMsg = parseValidation.error.issues.map((i) => i.message).join("; ");
      return sendSafeError(res, 400, "INVALID_REQUEST", errMsg);
    }

    const updates = parseValidation.data;
    let materialChange = false;

    // Asset correction
    if (updates.asset && typeof updates.asset === "string") {
      const newAsset = updates.asset.toUpperCase();
      if (newAsset !== "ETH" && newAsset !== "BTC") {
        return sendSafeError(res, 400, "UNSUPPORTED_ASSET", `Unsupported asset '${newAsset}'. Supported assets are ETH or BTC.`);
      }
      intent.asset = {
        value: newAsset,
        source: "USER_EXPLICIT",
        confidence: 1.0,
        requiresConfirmation: false,
      };
      materialChange = true;
    }

    // Exposure Amount correction (Verified Decimals: ETH=18, BTC/cbBTC=8, SOL=9)
    if (updates.exposureAmount && updates.exposureAmount.amount) {
      if (!intent.asset || !intent.asset.value) {
        return sendSafeError(res, 400, "MISSING_ASSET", "Please specify target asset before setting exposure amount.");
      }
      const assetSymbol = intent.asset.value.toUpperCase();
      const decimals = assetSymbol === "BTC" || assetSymbol === "CBBTC" ? 8 : assetSymbol === "SOL" ? 9 : 18;
      const parsedAmount = parseExactDecimal(updates.exposureAmount.amount, decimals, assetSymbol);

      const val = validateExposureAmount(parsedAmount);
      if (!val.isValid) {
        return sendSafeError(res, 400, "INVALID_EXPOSURE", val.error || "Invalid exposure amount.");
      }

      intent.exposureAmount = {
        value: parsedAmount,
        source: "USER_EXPLICIT",
        confidence: 1.0,
        requiresConfirmation: false,
      };
      materialChange = true;
    }

    // Target Max Loss Percent correction
    if (updates.targetMaxLossPercent !== undefined) {
      const val = validateLossPercent(updates.targetMaxLossPercent);
      if (!val.isValid) {
        return sendSafeError(res, 400, "INVALID_LOSS_TARGET", val.error || "Invalid max loss percentage.");
      }

      intent.targetMaxLossPercent = {
        value: updates.targetMaxLossPercent,
        source: "USER_EXPLICIT",
        confidence: 1.0,
        requiresConfirmation: false,
      };
      materialChange = true;
    }

    // Max Premium USDC correction
    if (updates.maxPremiumUSDC && updates.maxPremiumUSDC.amount) {
      const parsedBudget = parseExactDecimal(updates.maxPremiumUSDC.amount, 6, "USDC");

      const val = validateBudgetAmount(parsedBudget);
      if (!val.isValid) {
        return sendSafeError(res, 400, "INVALID_BUDGET", val.error || "Invalid budget amount.");
      }

      intent.maxPremiumUSDC = {
        value: parsedBudget,
        source: "USER_EXPLICIT",
        confidence: 1.0,
        requiresConfirmation: false,
      };
      materialChange = true;
    }

    // Horizon Timestamp correction
    if (updates.horizonTimestampMs !== undefined) {
      const val = validateHorizonTimestamp(updates.horizonTimestampMs);
      if (!val.isValid) {
        return sendSafeError(res, 400, "INVALID_HORIZON", val.error || "Invalid horizon timestamp.");
      }

      const horizonTarget = formatCustomHorizon(updates.horizonTimestampMs);
      intent.horizonTimestamp = {
        value: horizonTarget,
        source: "USER_EXPLICIT",
        confidence: 1.0,
        requiresConfirmation: false,
      };
      materialChange = true;
    }

    // Multi-leg permission correction (Strict boolean)
    if (updates.allowMultiLeg !== undefined) {
      intent.allowMultiLeg = {
        value: updates.allowMultiLeg,
        source: "USER_EXPLICIT",
        confidence: 1.0,
        requiresConfirmation: false,
      };
      materialChange = true;
    }

    // Editing invalidates previous confirmation & increments version
    if (materialChange) {
      intent.confirmedByUser = false;
      intent.confirmedAtMs = undefined;
      intent.version += 1;
      intent.updatedAtMs = Date.now();
    }

    await intentRepository.update(intent);

    const missing = computeMissingFields(intent);
    const dto: IntentReviewDTO = {
      candidateIntent: intent,
      missingFields: missing,
      ambiguitiesFound: [],
      canConfirm: missing.length === 0,
    };

    res.json(dto);
  } catch (err: any) {
    return sendSafeError(res, 400, "INVALID_UPDATE", "Invalid update request.", err);
  }
});

// Endpoint 4: POST /api/v1/intents/:id/confirm
app.post("/api/v1/intents/:id/confirm", async (req, res) => {
  try {
    const intent = await intentRepository.findById(req.params.id);
    if (!intent) {
      return sendSafeError(res, 404, "INTENT_NOT_FOUND", `Intent with ID '${req.params.id}' not found.`);
    }

    // Strict schema check for expectedVersion
    const parseValidation = ConfirmIntentRequestSchema.safeParse(req.body);
    if (!parseValidation.success) {
      return sendSafeError(
        res,
        400,
        "INVALID_CONFIRMATION_VERSION",
        "Confirmation requires an integer 'expectedVersion' matching the reviewed intent version."
      );
    }

    const { expectedVersion } = parseValidation.data;

    // Stale version protection
    if (expectedVersion !== intent.version) {
      return sendSafeError(
        res,
        409,
        "STALE_INTENT_VERSION",
        `Stale intent confirmation request. Expected version ${expectedVersion}, but current intent is at version ${intent.version}. Please review updated details before confirming.`
      );
    }

    // Check unsupported objective
    if ((intent as any).unsupportedObjective === true) {
      return sendSafeError(
        res,
        400,
        "UNSUPPORTED_OBJECTIVE",
        "Cannot confirm intent with unsupported objective. HedgeOS currently supports Downside Protection intents only."
      );
    }

    // Validate that ALL required financial fields are present before confirmation
    const missing = computeMissingFields(intent);
    if (missing.length > 0) {
      return sendSafeError(
        res,
        400,
        "INCOMPLETE_INTENT",
        `Cannot confirm incomplete intent. Missing required fields: ${missing.join(", ")}.`
      );
    }

    // Server-side business validation before confirmation
    const exposureVal = validateExposureAmount(intent.exposureAmount!.value);
    if (!exposureVal.isValid) {
      return sendSafeError(res, 400, "INVALID_EXPOSURE", `Cannot confirm intent: ${exposureVal.error}`);
    }

    const budgetVal = validateBudgetAmount(intent.maxPremiumUSDC!.value);
    if (!budgetVal.isValid) {
      return sendSafeError(res, 400, "INVALID_BUDGET", `Cannot confirm intent: ${budgetVal.error}`);
    }

    const lossVal = validateLossPercent(intent.targetMaxLossPercent!.value);
    if (!lossVal.isValid) {
      return sendSafeError(res, 400, "INVALID_LOSS_TARGET", `Cannot confirm intent: ${lossVal.error}`);
    }

    const horizonVal = validateHorizonTimestamp(intent.horizonTimestamp!.value.timestampMs);
    if (!horizonVal.isValid) {
      return sendSafeError(res, 400, "INVALID_HORIZON", `Cannot confirm intent: ${horizonVal.error}`);
    }

    // Transition to confirmed TypedRiskIntent
    const nowMs = Date.now();
    intent.confirmedByUser = true;
    intent.confirmedAtMs = nowMs;
    intent.updatedAtMs = nowMs;

    await intentRepository.update(intent);

    const confirmedTypedIntent = intent as TypedRiskIntent;

    const dto: IntentConfirmationDTO = {
      intentId: confirmedTypedIntent.intentId,
      version: confirmedTypedIntent.version,
      confirmedByUser: true,
      confirmedAtMs: nowMs,
      confirmedIntent: confirmedTypedIntent,
      message: "Your protection goal is confirmed.",
      nextStage: "Ready to check live Thetanuts market protection options.",
    };

    res.json(dto);
  } catch (err: any) {
    return sendSafeError(res, 500, "CONFIRMATION_FAILED", "Failed to confirm risk intent.", err);
  }
});

// Endpoint 5: POST /api/v1/intents/:id/solve
app.post("/api/v1/intents/:id/solve", async (req, res) => {
  try {
    const intent = await intentRepository.findById(req.params.id);
    if (!intent) {
      return sendSafeError(res, 404, "INTENT_NOT_FOUND", `Intent with ID '${req.params.id}' not found.`);
    }

    if (!intent.confirmedByUser) {
      return sendSafeError(
        res,
        400,
        "CANNOT_SOLVE_UNCONFIRMED",
        "Cannot solve protection for unconfirmed intent. Please confirm risk intent first."
      );
    }

    const confirmedIntent = intent as TypedRiskIntent;

    // Server-side Demo Snapshot configuration only (Client query/body mock overrides are strictly rejected/ignored)
    const isServerDemoSnapshotMode = process.env.DEMO_SNAPSHOT_MODE === "true";

    const quotes = isServerDemoSnapshotMode
      ? [...MOCK_OPTION_BOOK_QUOTES, ...MOCK_RFQ_QUOTES]
      : await marketService.fetchMarketQuotes(confirmedIntent).catch(() => []);

    // Run complete pipeline (OptionBook -> RFQ fallback)
    const pipelineResult = await solverEngine.solveProtectionPipeline(confirmedIntent, quotes);
    const marketState = await marketService.getMarketState();

    const responseMode = isServerDemoSnapshotMode ? "RECORDED_DEMO_SNAPSHOT" : pipelineResult.mode;

    const authorizationAttestation =
      pipelineResult.actionProposal &&
      pipelineResult.simulationResult &&
      pipelineResult.humanReviewRecord
        ? BoundedAuthorizationAttestationService.createScopeAttestation(
            confirmedIntent,
            pipelineResult.actionProposal,
            pipelineResult.simulationResult,
            pipelineResult.humanReviewRecord
          )
        : undefined;

    const executionCommitment =
      authorizationAttestation &&
      pipelineResult.actionProposal &&
      pipelineResult.simulationResult
        ? ExecutionCommitmentService.createCommitment(
            confirmedIntent,
            pipelineResult.actionProposal,
            pipelineResult.simulationResult,
            authorizationAttestation
          )
        : undefined;

    const externalHumanAuthorizationHandoff =
      authorizationAttestation && executionCommitment
        ? ExternalHumanAuthorizationHandoffService.createHandoff(
            confirmedIntent,
            authorizationAttestation,
            executionCommitment
          )
        : undefined;

    if (externalHumanAuthorizationHandoff) {
      await authorizationHandoffRepository.save(externalHumanAuthorizationHandoff);
    }

    const auditReceipt = AuditReceiptService.createReceipt({
      intent: confirmedIntent,
      selectedStrategy: pipelineResult.rankedStrategies[0],
      policyDecisions: pipelineResult.policyDecisions,
      actionProposal: pipelineResult.actionProposal,
      simulationResult: pipelineResult.simulationResult,
      humanReviewRecord: pipelineResult.humanReviewRecord,
      authorizationAttestation,
      executionCommitment,
      externalHumanAuthorizationHandoff,
    });

    await auditReceiptRepository.save(auditReceipt);

    res.json({
      intentId: confirmedIntent.intentId,
      mode: responseMode,
      rankedStrategies: pipelineResult.rankedStrategies,
      rejectedCandidates: pipelineResult.rejectedCandidates,
      rfqRequirement: pipelineResult.rfqRequirement,
      rfqSpecification: pipelineResult.rfqSpecification,
      actionProposal: pipelineResult.actionProposal,
      simulationResult: pipelineResult.simulationResult,
      humanReviewRecord: pipelineResult.humanReviewRecord,
      authorizationAttestation,
      executionCommitment,
      externalHumanAuthorizationHandoff,
      auditReceipt,
      policyDecisions: pipelineResult.policyDecisions,
      marketState: isServerDemoSnapshotMode
        ? { ...marketState, status: "DEMO_SNAPSHOT" }
        : marketState,
      isMockData: isServerDemoSnapshotMode,
      snapshotTimestampMs: isServerDemoSnapshotMode ? 1725408000000 : undefined,
    });
  } catch (err: any) {
    return sendSafeError(res, 500, "SOLVER_FAILED", "Failed to solve protection options.", err);
  }
});

// Endpoint: GET /api/v1/audit/:receiptId
app.get("/api/v1/audit/:receiptId", async (req, res) => {
  try {
    const receipt = await auditReceiptRepository.findById(req.params.receiptId);
    if (!receipt) {
      return sendSafeError(
        res,
        404,
        "AUDIT_RECEIPT_NOT_FOUND",
        `Audit receipt with ID '${req.params.receiptId}' not found.`
      );
    }
    res.json(receipt);
  } catch (err: any) {
    return sendSafeError(
      res,
      500,
      "AUDIT_FETCH_FAILED",
      "Failed to retrieve audit receipt.",
      err
    );
  }
});

// Endpoint: GET /api/v1/intents/:intentId/audit
app.get("/api/v1/intents/:intentId/audit", async (req, res) => {
  try {
    const receipts = await auditReceiptRepository.findByIntentId(req.params.intentId);
    res.json(receipts);
  } catch (err: any) {
    return sendSafeError(
      res,
      500,
      "AUDIT_FETCH_FAILED",
      "Failed to retrieve audit receipts for intent.",
      err
    );
  }
});

// Endpoint 5B: POST /api/v1/intents/:id/simulate (Prompt 6 Read-Only Simulation Endpoint)
app.post("/api/v1/intents/:id/simulate", async (req, res) => {
  try {
    const intent = await intentRepository.findById(req.params.id);
    if (!intent || !intent.confirmedByUser) {
      return sendSafeError(res, 400, "CANNOT_SIMULATE_UNCONFIRMED", "Confirmed intent required for simulation.");
    }

    const parseValidation = SimulateProposalRequestSchema.safeParse(req.body);
    if (!parseValidation.success) {
      return sendSafeError(res, 400, "INVALID_SIMULATION_REQUEST", "Valid ActionProposal required for simulation.");
    }

    const proposal = req.body.proposal as ActionProposal;
    const typedIntent = intent as TypedRiskIntent;
    const simService = new ThetanutsSimulationService(marketService);
    const assetSymbol = typedIntent.asset?.value || "ETH";
    const spot = await marketService.getSpotPrice(assetSymbol).catch(() => 0);
    const simResult = await simService.simulateProposal(proposal, typedIntent, undefined, spot);

    let effectiveDownsidePercent: number | undefined = undefined;
    if (spot > 0 && proposal.expectedTotalCost) {
      const expQty = Number(BigInt(typedIntent.exposureAmount.value.amountBaseUnits)) / 10 ** typedIntent.exposureAmount.value.decimals;
      const strike = Number(BigInt(proposal.expectedStrike.amountBaseUnits)) / 10 ** proposal.expectedStrike.decimals;
      const costUSD = Number(BigInt(proposal.expectedTotalCost.amountBaseUnits)) / 1e6;
      const payoff = ExposurePayoffEngine.calculate({
        spotQuantity: expQty,
        optionQuantity: expQty,
        strikePriceUSD: strike,
        spotReferencePriceUSD: spot,
        totalProtectionCostUSD: costUSD,
        assetSymbol,
      });
      effectiveDownsidePercent = payoff.effectiveDownsidePercent;
    }

    const reviewRecord = HumanReviewService.createReviewRecord(
      typedIntent,
      proposal,
      simResult,
      effectiveDownsidePercent
    );

    res.json({
      simulationResult: simResult,
      humanReviewRecord: reviewRecord,
    });
  } catch (err: any) {
    return sendSafeError(res, 500, "SIMULATION_FAILED", "Failed to execute read-only simulation.", err);
  }
});

// Endpoint 6: GET /api/v1/rfq/existing (SDK-Resolved OptionFactory Address)
app.get("/api/v1/rfq/existing", async (_req, res) => {
  try {
    const quotationCount = await marketService.getQuotationCount();
    const existingRfqs = await marketService.fetchExistingRFQs();
    const factoryAddress = marketService.getOptionFactoryAddress();

    res.json({
      quotationCount: quotationCount.toString(),
      factoryAddress,
      chainId: 8453,
      rfqs: existingRfqs.slice(0, 10),
      status: "READ_ONLY",
    });
  } catch (err: any) {
    return sendSafeError(res, 500, "RFQ_READ_FAILED", "Failed to fetch existing RFQs.", err);
  }
});

const PORT = process.env.PORT || 3001;
export const serverInstance = app.listen(PORT, () => {
  console.log(`HedgeOS REST API running on port ${PORT}`);
});

export { app, intentRepository };