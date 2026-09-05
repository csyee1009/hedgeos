import {
  AIIntentProvider,
  ParseResult,
} from "./interfaces/AIIntentProvider";
import {
  PROMPT_VERSION,
} from "./prompts/intentExtractionPrompt";
import {
  LLMProviderMetadata,
} from "../types";
import {
  LLMOutputValidator,
} from "../services/LLMOutputValidator";

export type AIProviderErrorCode =
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "AUTHENTICATION_FAILED"
  | "MODEL_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "INVALID_PROVIDER_OUTPUT"
  | "PROVIDER_UNAVAILABLE";

export interface RealLLMIntentProviderConfig {
  provider?: string;
  apiKey?: string;
  model?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  maxRetryDelayMs?: number;
  requestTimeoutMs?: number;
}

export class AIProviderError extends Error {
  public readonly code: AIProviderErrorCode;
  public readonly statusCode?: number;
  public readonly retryable: boolean;

  constructor(
    code: AIProviderErrorCode,
    message: string,
    statusCode?: number,
    retryable?: boolean
  ) {
    super(`${code}: ${message}`);
    this.name = "AIProviderError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable =
      retryable ??
      (
        code === "RATE_LIMITED" ||
        code === "TIMEOUT" ||
        code === "PROVIDER_UNAVAILABLE"
      );
  }
}

interface OpenAIResponsePayload {
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

interface GeminiResponsePayload {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

const OPENAI_RESPONSES_URL =
  "https://api.openai.com/v1/responses";

const DEFAULT_OPENAI_MODEL =
  "gpt-5.6-luna";

const DEFAULT_TIMEOUT_MS =
  15_000;

const DEFAULT_MAX_RETRIES =
  2;

const DEFAULT_RETRY_BASE_DELAY_MS =
  250;

const DEFAULT_MAX_RETRY_DELAY_MS =
  2_000;

const SYSTEM_INSTRUCTIONS = `
You are the untrusted natural-language extraction layer for HedgeOS.

Your ONLY job is to extract factual risk-intent fields from the user's text.
You do NOT recommend a financial product.
You do NOT choose a strike, expiry, premium, option side, order, or protocol action.
You do NOT authorize, sign, submit, broadcast, or approve any transaction.
You do NOT invent missing financial limits.
You do NOT convert inferred values into user-stated facts.

Return exactly one JSON object and nothing else.
Do not use markdown fences.

Allowed top-level keys only:
- objective
- unsupportedObjectiveReason
- asset
- exposureAmount
- targetMaxLossPercent
- maxPremium
- horizon
- allowMultiLeg
- ambiguities
- clarificationQuestions

Expected shape:
{
  "objective": "DOWNSIDE_PROTECTION" | "UNSUPPORTED_OBJECTIVE" | null,
  "unsupportedObjectiveReason": string | null,
  "asset": {
    "value": string | null,
    "evidence": string | null
  } | null,
  "exposureAmount": {
    "value": string | null,
    "unit": string | null,
    "evidence": string | null
  } | null,
  "targetMaxLossPercent": {
    "value": string | number | null,
    "evidence": string | null
  } | null,
  "maxPremium": {
    "value": string | null,
    "currency": string | null,
    "evidence": string | null
  } | null,
  "horizon": {
    "rawText": string | null,
    "evidence": string | null
  } | null,
  "allowMultiLeg": {
    "value": boolean | null,
    "evidence": string | null
  } | null,
  "ambiguities": string[],
  "clarificationQuestions": string[]
}

Grounding rules:
1. Evidence must be copied from the user's own text. Never fabricate evidence.
2. If a value was not stated clearly enough, use null and add an ambiguity or clarification question.
3. Never invent targetMaxLossPercent or maxPremium.
4. Only set allowMultiLeg=true when the user explicitly permits a spread or multi-leg structure.
5. If the user's objective is speculation, leverage, yield generation, arbitrage, or an autonomous trading bot rather than downside protection, set objective to "UNSUPPORTED_OBJECTIVE" and explain briefly.
6. Preserve the user's horizon wording in horizon.rawText instead of inventing a calendar date.
7. Never output any authority/control fields such as confirmedByUser, confirmedAtMs, authorizationStatus, submissionStatus, walletAddress, approvalAmount, calldata, signature, signedData, privateKey, targetContract, policyDecision, version, or allowedProtocols.
`.trim();

function sleep(
  ms: number
): Promise<void> {
  if (
    !Number.isFinite(ms) ||
    ms <= 0
  ) {
    return Promise.resolve();
  }

  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

function extractJsonObject(
  text: string
): unknown {
  let cleaned =
    text.trim();

  if (
    cleaned.startsWith("```") &&
    cleaned.endsWith("```")
  ) {
    cleaned =
      cleaned
        .replace(
          /^```(?:json)?\s*/i,
          ""
        )
        .replace(
          /\s*```$/,
          ""
        )
        .trim();
  }

  try {
    return JSON.parse(
      cleaned
    );
  } catch {
    const start =
      cleaned.indexOf(
        "{"
      );

    const end =
      cleaned.lastIndexOf(
        "}"
      );

    if (
      start >= 0 &&
      end > start
    ) {
      try {
        return JSON.parse(
          cleaned.slice(
            start,
            end + 1
          )
        );
      } catch {
        throw new AIProviderError(
          "INVALID_PROVIDER_OUTPUT",
          "The AI provider returned text that was not valid JSON.",
          undefined,
          false
        );
      }
    }

    throw new AIProviderError(
      "INVALID_PROVIDER_OUTPUT",
      "The AI provider returned text that was not valid JSON.",
      undefined,
      false
    );
  }
}

function extractOpenAIText(
  payload: OpenAIResponsePayload
): string {
  if (
    typeof payload.output_text ===
    "string" &&
    payload.output_text.trim()
  ) {
    return payload
      .output_text
      .trim();
  }

  const pieces:
    string[] = [];

  for (
    const item of
    payload.output || []
  ) {
    for (
      const content of
      item.content || []
    ) {
      if (
        content.type ===
        "output_text" &&
        typeof content.text ===
        "string"
      ) {
        pieces.push(
          content.text
        );
      }
    }
  }

  return pieces
    .join("\n")
    .trim();
}

function extractGeminiText(
  payload: GeminiResponsePayload
): string {
  return (
    payload
      .candidates?.[0]
      ?.content
      ?.parts?.[0]
      ?.text ||
    ""
  ).trim();
}

function sanitizeProviderMessage(
  message: unknown
): string {
  if (
    typeof message !==
    "string" ||
    !message.trim()
  ) {
    return "AI provider request failed.";
  }

  return message
    .replace(
      /sk-[A-Za-z0-9_-]+/g,
      "[REDACTED_OPENAI_KEY]"
    )
    .replace(
      /AIza[0-9A-Za-z-_]{20,}/g,
      "[REDACTED_API_KEY]"
    )
    .slice(
      0,
      300
    );
}

function classifyHttpFailure(
  status: number,
  message: string
): AIProviderError {
  if (
    status === 401 ||
    status === 403
  ) {
    return new AIProviderError(
      "AUTHENTICATION_FAILED",
      message,
      status,
      false
    );
  }

  if (
    status === 429
  ) {
    return new AIProviderError(
      "RATE_LIMITED",
      message,
      status,
      true
    );
  }

  if (
    status === 404
  ) {
    return new AIProviderError(
      "MODEL_UNAVAILABLE",
      message,
      status,
      false
    );
  }

  if (
    status === 400
  ) {
    return new AIProviderError(
      "INVALID_REQUEST",
      message,
      status,
      false
    );
  }

  if (
    status === 408
  ) {
    return new AIProviderError(
      "TIMEOUT",
      message,
      status,
      true
    );
  }

  if (
    status >= 500
  ) {
    return new AIProviderError(
      "PROVIDER_UNAVAILABLE",
      message,
      status,
      true
    );
  }

  return new AIProviderError(
    "PROVIDER_UNAVAILABLE",
    message,
    status,
    false
  );
}

export class RealLLMIntentProvider
  implements AIIntentProvider {
  public readonly adapterName =
    "REAL_LLM" as const;

  public readonly providerType =
    "REAL_LLM" as const;

  private readonly provider:
    string;

  private readonly apiKey:
    string;

  private readonly model:
    string;

  private readonly maxRetries:
    number;

  private readonly retryBaseDelayMs:
    number;

  private readonly maxRetryDelayMs:
    number;

  private readonly requestTimeoutMs:
    number;

  constructor(
    configOrApiKey:
      RealLLMIntentProviderConfig |
      string =
      {
        provider:
          "openai",
        apiKey:
          process.env
            .OPENAI_API_KEY ||
          "",
        model:
          process.env
            .LLM_MODEL ||
          DEFAULT_OPENAI_MODEL,
      },
    legacyModel?:
      string
  ) {
    const config:
      RealLLMIntentProviderConfig =
      typeof configOrApiKey ===
        "string"
        ? {
          provider:
            "openai",
          apiKey:
            configOrApiKey,
          model:
            legacyModel ||
            process.env
              .LLM_MODEL ||
            DEFAULT_OPENAI_MODEL,
        }
        : configOrApiKey;

    this.provider =
      (
        config.provider ||
        "openai"
      )
        .trim()
        .toLowerCase();

    this.apiKey =
      (
        config.apiKey ||
        (
          this.provider ===
            "openai"
            ? process.env
              .OPENAI_API_KEY
            : process.env
              .GEMINI_API_KEY ||
            process.env
              .GOOGLE_API_KEY
        ) ||
        ""
      ).trim();

    this.model =
      (
        config.model ||
        (
          this.provider ===
            "openai"
            ? process.env
              .LLM_MODEL ||
            DEFAULT_OPENAI_MODEL
            : process.env
              .GEMINI_MODEL ||
            "gemini-3.6-flash"
        )
      ).trim();

    this.maxRetries =
      Number.isInteger(
        config.maxRetries
      ) &&
        (
          config.maxRetries as
          number
        ) >= 0
        ? config.maxRetries as
        number
        : DEFAULT_MAX_RETRIES;

    this.retryBaseDelayMs =
      Number.isFinite(
        config.retryBaseDelayMs
      ) &&
        (
          config.retryBaseDelayMs as
          number
        ) >= 0
        ? config.retryBaseDelayMs as
        number
        :
        DEFAULT_RETRY_BASE_DELAY_MS;

    this.maxRetryDelayMs =
      Number.isFinite(
        config.maxRetryDelayMs
      ) &&
        (
          config.maxRetryDelayMs as
          number
        ) >= 0
        ? config.maxRetryDelayMs as
        number
        :
        DEFAULT_MAX_RETRY_DELAY_MS;

    this.requestTimeoutMs =
      Number.isFinite(
        config.requestTimeoutMs
      ) &&
        (
          config.requestTimeoutMs as
          number
        ) > 0
        ? config.requestTimeoutMs as
        number
        :
        DEFAULT_TIMEOUT_MS;
  }

  public async parseNaturalLanguage(
    prompt: string
  ): Promise<ParseResult> {
    const safePrompt =
      typeof prompt ===
        "string"
        ? prompt.trim()
        : "";

    if (!safePrompt) {
      throw new AIProviderError(
        "INVALID_REQUEST",
        "Natural-language prompt is required.",
        undefined,
        false
      );
    }

    if (!this.apiKey) {
      throw new AIProviderError(
        "AUTHENTICATION_FAILED",
        this.provider ===
          "openai"
          ? "OPENAI_API_KEY is not configured."
          : "Gemini API key is not configured.",
        undefined,
        false
      );
    }

    if (
      this.provider !==
      "openai" &&
      this.provider !==
      "gemini"
    ) {
      throw new AIProviderError(
        "INVALID_REQUEST",
        `Unsupported AI provider '${this.provider}'.`,
        undefined,
        false
      );
    }

    const requestTimestampMs =
      Date.now();

    let retryCount =
      0;

    let responseText =
      "";

    let actualModel =
      this.model;

    while (true) {
      try {
        const result =
          this.provider ===
            "openai"
            ? await this.callOpenAI(
              safePrompt
            )
            : await this.callGemini(
              safePrompt
            );

        responseText =
          result.text;

        actualModel =
          result.actualModel ||
          this.model;

        break;
      } catch (error) {
        const providerError =
          error instanceof
            AIProviderError
            ? error
            :
            new AIProviderError(
              "PROVIDER_UNAVAILABLE",
              error instanceof
                Error
                ? error.message
                : "AI provider request failed.",
              undefined,
              true
            );

        if (
          !providerError
            .retryable ||
          retryCount >=
          this.maxRetries
        ) {
          throw providerError;
        }

        const delayMs =
          Math.min(
            this
              .maxRetryDelayMs,
            this
              .retryBaseDelayMs *
            2 ** retryCount
          );

        retryCount +=
          1;

        await sleep(
          delayMs
        );
      }
    }

    const responseTimestampMs =
      Date.now();

    const providerMetadata:
      LLMProviderMetadata = {
      providerType:
        "REAL_LLM",
      status:
        "AVAILABLE",
      modelIdentifier:
        `${this.provider}:${actualModel}`,
      promptVersion:
        PROMPT_VERSION,
      latencyMs:
        responseTimestampMs -
        requestTimestampMs,
      requestTimestampMs,
      responseTimestampMs,
      retryCount,
    };

    let rawOutput:
      unknown;

    try {
      rawOutput =
        extractJsonObject(
          responseText
        );
    } catch (error) {
      if (
        error instanceof
        AIProviderError
      ) {
        throw error;
      }

      throw new AIProviderError(
        "INVALID_PROVIDER_OUTPUT",
        "AI provider response could not be parsed as JSON.",
        undefined,
        false
      );
    }

    try {
      const normalized =
        LLMOutputValidator
          .validateAndNormalize(
            rawOutput,
            safePrompt,
            providerMetadata
          );

      return {
        adapterName:
          this.adapterName,
        candidateDraft:
          normalized
            .candidateDraft,
        ambiguitiesFound:
          normalized
            .ambiguitiesFound,
        missingFields:
          normalized
            .missingFields,
        requiresClarification:
          normalized
            .requiresClarification,
        unsupportedObjective:
          normalized
            .unsupportedObjective,
        unsupportedObjectiveReason:
          normalized
            .unsupportedObjectiveReason,
        providerMetadata,
      };
    } catch (error) {
      if (
        error instanceof
        AIProviderError
      ) {
        throw error;
      }

      const message =
        error instanceof
          Error
          ? error.message
          :
          "AI provider response validation failed.";

      throw new AIProviderError(
        "INVALID_PROVIDER_OUTPUT",
        message.replace(
          /^INVALID_PROVIDER_OUTPUT:\s*/i,
          ""
        ),
        undefined,
        false
      );
    }
  }

  private async callOpenAI(
    prompt: string
  ): Promise<{
    text: string;
    actualModel: string;
  }> {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        this.requestTimeoutMs
      );

    try {
      const response =
        await fetch(
          OPENAI_RESPONSES_URL,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${this.apiKey}`,
            },
            body:
              JSON.stringify({
                model:
                  this.model,
                instructions:
                  SYSTEM_INSTRUCTIONS,
                input:
                  prompt,
                max_output_tokens:
                  1200,
                store:
                  false,
              }),
            signal:
              controller.signal,
          }
        );

      let payload:
        OpenAIResponsePayload |
        undefined;

      try {
        payload =
          await response
            .json() as
          OpenAIResponsePayload;
      } catch {
        payload =
          undefined;
      }

      if (!response.ok) {
        throw classifyHttpFailure(
          response.status,
          sanitizeProviderMessage(
            payload?.error
              ?.message
          )
        );
      }

      if (!payload) {
        throw new AIProviderError(
          "INVALID_PROVIDER_OUTPUT",
          "OpenAI returned an unreadable response.",
          undefined,
          false
        );
      }

      const text =
        extractOpenAIText(
          payload
        );

      if (!text) {
        throw new AIProviderError(
          "INVALID_PROVIDER_OUTPUT",
          "OpenAI returned no output text.",
          undefined,
          false
        );
      }

      return {
        text,
        actualModel:
          payload.model ||
          this.model,
      };
    } catch (error) {
      if (
        error instanceof
        AIProviderError
      ) {
        throw error;
      }

      if (
        error instanceof
        Error &&
        error.name ===
        "AbortError"
      ) {
        throw new AIProviderError(
          "TIMEOUT",
          "OpenAI API request timed out.",
          undefined,
          true
        );
      }

      throw new AIProviderError(
        "PROVIDER_UNAVAILABLE",
        error instanceof
          Error
          ? error.message
          :
          "OpenAI API request failed.",
        undefined,
        true
      );
    } finally {
      clearTimeout(
        timeout
      );
    }
  }

  private async callGemini(
    prompt: string
  ): Promise<{
    text: string;
    actualModel: string;
  }> {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        this.requestTimeoutMs
      );

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        this.model
      )}:generateContent?key=${encodeURIComponent(
        this.apiKey
      )}`;

    try {
      const response =
        await fetch(
          url,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                contents: [
                  {
                    role:
                      "user",
                    parts: [
                      {
                        text:
                          `${SYSTEM_INSTRUCTIONS}\n\nUser input:\n${prompt}`,
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature:
                    0,
                  responseMimeType:
                    "application/json",
                },
              }),
            signal:
              controller.signal,
          }
        );

      let payload:
        GeminiResponsePayload |
        undefined;

      try {
        payload =
          await response
            .json() as
          GeminiResponsePayload;
      } catch {
        payload =
          undefined;
      }

      if (!response.ok) {
        throw classifyHttpFailure(
          response.status,
          sanitizeProviderMessage(
            payload?.error
              ?.message
          )
        );
      }

      if (!payload) {
        throw new AIProviderError(
          "INVALID_PROVIDER_OUTPUT",
          "Gemini returned an unreadable response.",
          undefined,
          false
        );
      }

      const text =
        extractGeminiText(
          payload
        );

      if (!text) {
        throw new AIProviderError(
          "INVALID_PROVIDER_OUTPUT",
          "Gemini returned no output text.",
          undefined,
          false
        );
      }

      return {
        text,
        actualModel:
          this.model,
      };
    } catch (error) {
      if (
        error instanceof
        AIProviderError
      ) {
        throw error;
      }

      if (
        error instanceof
        Error &&
        error.name ===
        "AbortError"
      ) {
        throw new AIProviderError(
          "TIMEOUT",
          "Gemini API request timed out.",
          undefined,
          true
        );
      }

      throw new AIProviderError(
        "PROVIDER_UNAVAILABLE",
        error instanceof
          Error
          ? error.message
          :
          "Gemini API request failed.",
        undefined,
        true
      );
    } finally {
      clearTimeout(
        timeout
      );
    }
  }
}
