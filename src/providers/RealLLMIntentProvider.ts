import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
import "dotenv/config";
import { LLMOutputValidator } from "../services/LLMOutputValidator";
import { LLMProviderMetadata, LLMProviderStatus, LLMProviderType } from "../types";
import { AIIntentProvider, ParseResult } from "./interfaces/AIIntentProvider";
import {
  buildIntentExtractionUserPrompt,
  INTENT_EXTRACTION_SYSTEM_PROMPT,
  PROMPT_VERSION,
} from "./prompts/intentExtractionPrompt";

export interface RealLLMConfig {
  provider?: "gemini" | "openai" | "openrouter" | "generic";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
  retryBaseDelayMs?: number;
  maxRetryDelayMs?: number;
}

export type AIProviderErrorCode =
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "AUTHENTICATION_FAILED"
  | "MODEL_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "INVALID_PROVIDER_OUTPUT"
  | "PROVIDER_UNAVAILABLE";

export class AIProviderError extends Error {
  constructor(
    public readonly code: AIProviderErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(`${code}: ${message}`);
    this.name = "AIProviderError";
  }
}

export class RealLLMIntentProvider implements AIIntentProvider {
  public readonly adapterName = "REAL_LLM" as const;
  public readonly providerType: LLMProviderType = "REAL_LLM";

  private providerVendor: "gemini" | "openai" | "openrouter" | "generic";
  private apiKey: string;
  private model: string;
  private baseUrl?: string;
  private maxRetries: number;
  private timeoutMs: number;
  private retryBaseDelayMs: number;
  private maxRetryDelayMs: number;

  constructor(config?: RealLLMConfig) {
    const envApiKey = (
      process.env.LLM_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      ""
    ).trim();
    const envProvider = (
      process.env.LLM_PROVIDER ||
      (process.env.GEMINI_API_KEY ? "gemini" : process.env.OPENAI_API_KEY ? "openai" : "gemini")
    )
      .toLowerCase()
      .trim() as RealLLMConfig["provider"];

    this.providerVendor = config?.provider || envProvider || "gemini";
    this.apiKey = (config?.apiKey || envApiKey).trim();
    this.model = (
      config?.model ||
      process.env.LLM_MODEL?.trim() ||
      (this.providerVendor === "gemini" ? "gemini-3.7-flash" : "gpt-4o-mini")
    ).trim();
    this.baseUrl = config?.baseUrl?.trim();
    this.maxRetries = config?.maxRetries ?? 2;
    this.timeoutMs = config?.timeoutMs ?? 15_000;
    this.retryBaseDelayMs = config?.retryBaseDelayMs ?? 1_000;
    this.maxRetryDelayMs = config?.maxRetryDelayMs ?? 8_000;
  }

  public getStatus(): LLMProviderStatus {
    return this.apiKey.trim() === "" ? "NOT_CONFIGURED" : "READY";
  }

  public getModelIdentifier(): string {
    return `${this.providerVendor}:${this.model}`;
  }

  public async parseNaturalLanguage(prompt: string): Promise<ParseResult> {
    const requestTimestampMs = Date.now();
    if (this.getStatus() === "NOT_CONFIGURED") {
      throw new AIProviderError("AUTHENTICATION_FAILED", "AI intent parsing is not configured.", false);
    }

    let lastError: AIProviderError | undefined;
    for (let retryCount = 0; retryCount <= this.maxRetries; retryCount += 1) {
      try {
        const rawJsonText = await this.callLLMWithTimeout(prompt);
        const responseTimestampMs = Date.now();
        let parsedJson: unknown;
        try {
          let cleanJsonStr = rawJsonText.trim();
          if (cleanJsonStr.startsWith("```")) {
            cleanJsonStr = cleanJsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }
          parsedJson = JSON.parse(cleanJsonStr);
        } catch {
          throw new AIProviderError("INVALID_PROVIDER_OUTPUT", "The model response was not valid JSON.", false);
        }

        const metadata: LLMProviderMetadata = {
          providerType: "REAL_LLM",
          status: "AVAILABLE",
          modelIdentifier: this.getModelIdentifier(),
          promptVersion: PROMPT_VERSION,
          latencyMs: responseTimestampMs - requestTimestampMs,
          requestTimestampMs,
          responseTimestampMs,
          retryCount,
        };

        let validated: ReturnType<typeof LLMOutputValidator.validateAndNormalize>;
        try {
          validated = LLMOutputValidator.validateAndNormalize(parsedJson, prompt, metadata);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Schema validation failed.";
          throw new AIProviderError(
            "INVALID_PROVIDER_OUTPUT",
            message.replace(/^INVALID_PROVIDER_OUTPUT:\s*/, ""),
            false,
          );
        }

        return {
          adapterName: this.adapterName,
          candidateDraft: validated.candidateDraft,
          ambiguitiesFound: validated.ambiguitiesFound,
          missingFields: validated.missingFields,
          requiresClarification: validated.requiresClarification,
          unsupportedObjective: validated.unsupportedObjective,
          unsupportedObjectiveReason: validated.unsupportedObjectiveReason,
          providerMetadata: metadata,
        };
      } catch (error) {
        lastError = this.normalizeProviderError(error);
        if (!lastError.retryable || retryCount >= this.maxRetries) break;
        if (lastError.retryAfterMs !== undefined && lastError.retryAfterMs > this.maxRetryDelayMs) break;
        const waitMs = Math.min(
          this.maxRetryDelayMs,
          Math.max(this.retryBaseDelayMs * 2 ** retryCount, lastError.retryAfterMs ?? 0),
        );
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    throw lastError ?? new AIProviderError("PROVIDER_UNAVAILABLE", "The AI intent provider request failed.", true);
  }

  private async callLLMWithTimeout(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return this.providerVendor === "gemini"
        ? await this.callGemini(prompt, controller.signal)
        : await this.callOpenAICompatible(prompt, controller.signal);
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new AIProviderError("TIMEOUT", "The AI intent provider request timed out.", true);
      }
      if (error instanceof AIProviderError) throw error;
      if (error instanceof TypeError) {
        throw new AIProviderError("PROVIDER_UNAVAILABLE", "The AI intent provider could not be reached.", true);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callGemini(prompt: string, signal: AbortSignal): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: INTENT_EXTRACTION_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: buildIntentExtractionUserPrompt(prompt) }] }],
        generationConfig: { response_mime_type: "application/json" },
      }),
      signal,
    });
    if (!response.ok) throw await this.classifyHttpFailure(response, "Gemini");

    const data = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string" || text.trim() === "") {
      throw new AIProviderError("INVALID_PROVIDER_OUTPUT", "Gemini returned no text content.", false);
    }
    return text;
  }

  private async callOpenAICompatible(prompt: string, signal: AbortSignal): Promise<string> {
    const endpoint = this.baseUrl || (this.providerVendor === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: INTENT_EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: buildIntentExtractionUserPrompt(prompt) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
      signal,
    });
    if (!response.ok) throw await this.classifyHttpFailure(response, "AI provider");

    const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim() === "") {
      throw new AIProviderError("INVALID_PROVIDER_OUTPUT", "The AI provider returned no response content.", false);
    }
    return text;
  }

  private normalizeProviderError(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const knownCodes: AIProviderErrorCode[] = [
      "RATE_LIMITED", "TIMEOUT", "AUTHENTICATION_FAILED", "MODEL_UNAVAILABLE",
      "INVALID_REQUEST", "INVALID_PROVIDER_OUTPUT", "PROVIDER_UNAVAILABLE",
    ];
    const code = knownCodes.find((candidate) => message.startsWith(`${candidate}:`));
    if (code) {
      return new AIProviderError(
        code,
        message.slice(code.length + 1).trim() || "The provider request failed.",
        code === "RATE_LIMITED" || code === "TIMEOUT" || code === "PROVIDER_UNAVAILABLE",
      );
    }
    return new AIProviderError("PROVIDER_UNAVAILABLE", "The AI intent provider request failed.", true);
  }

  private async classifyHttpFailure(response: Response, providerName: string): Promise<AIProviderError> {
    const retryAfterMs = await this.readRetryAfterMs(response);
    let providerStatus: string | undefined;
    try {
      const body = await response.clone().json() as { error?: { status?: unknown } };
      providerStatus = typeof body.error?.status === "string" ? body.error.status : undefined;
    } catch {
      // Raw provider response bodies are intentionally ignored.
    }

    if (response.status === 429 || providerStatus === "RESOURCE_EXHAUSTED") {
      return new AIProviderError("RATE_LIMITED", `${providerName} quota is temporarily exhausted.`, true, retryAfterMs);
    }
    if (response.status === 401 || response.status === 403) {
      return new AIProviderError("AUTHENTICATION_FAILED", `${providerName} rejected the configured credentials.`, false);
    }
    if (response.status === 404) {
      return new AIProviderError("MODEL_UNAVAILABLE", `${providerName} could not find the configured model.`, false);
    }
    if (response.status === 400) {
      return new AIProviderError("INVALID_REQUEST", `${providerName} rejected the configured request.`, false);
    }
    if (response.status === 408) {
      return new AIProviderError("TIMEOUT", `${providerName} timed out while processing the request.`, true, retryAfterMs);
    }
    if (response.status >= 500) {
      return new AIProviderError("PROVIDER_UNAVAILABLE", `${providerName} is temporarily unavailable.`, true, retryAfterMs);
    }
    return new AIProviderError("INVALID_REQUEST", `${providerName} rejected the request.`, false);
  }

  private async readRetryAfterMs(response: Response): Promise<number | undefined> {
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
      const retryAt = Date.parse(retryAfter);
      if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
    }
    try {
      const body = await response.clone().json() as {
        error?: { details?: Array<{ retryDelay?: unknown }> };
      };
      const retryDelay = body.error?.details?.find((detail) => typeof detail.retryDelay === "string")?.retryDelay;
      if (typeof retryDelay === "string") {
        const match = retryDelay.match(/^(\d+(?:\.\d+)?)s$/);
        if (match) return Math.round(Number(match[1]) * 1_000);
      }
    } catch {
      // Retry metadata is optional.
    }
    return undefined;
  }
}
