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

  constructor(config?: RealLLMConfig) {
    const envApiKey =
      process.env.LLM_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      "";

    const envProvider = (
      process.env.LLM_PROVIDER ||
      (process.env.GEMINI_API_KEY ? "gemini" : process.env.OPENAI_API_KEY ? "openai" : "gemini")
    ).toLowerCase() as any;

    this.providerVendor = config?.provider || envProvider;
    this.apiKey = config?.apiKey || envApiKey;
    this.model = config?.model || process.env.LLM_MODEL || (this.providerVendor === "gemini" ? "gemini-3.7-flash" : "gpt-4o-mini");
    this.baseUrl = config?.baseUrl;
    this.maxRetries = config?.maxRetries ?? 2; // Bounded retries
    this.timeoutMs = config?.timeoutMs ?? 15000;
  }

  public getStatus(): LLMProviderStatus {
    if (!this.apiKey || this.apiKey.trim() === "") {
      return "NOT_CONFIGURED";
    }
    return "READY";
  }

  public getModelIdentifier(): string {
    return `${this.providerVendor}:${this.model}`;
  }

  public async parseNaturalLanguage(prompt: string): Promise<ParseResult> {
    const status = this.getStatus();
    const requestTimestampMs = Date.now();

    if (status === "NOT_CONFIGURED") {
      throw new Error(
        "AUTHENTICATION_FAILED: AI intent parsing is not configured. Missing LLM_API_KEY."
      );
    }

    let retryCount = 0;
    let lastError: any = null;

    while (retryCount <= this.maxRetries) {
      try {
        const rawJsonText = await this.callLLMWithTimeout(prompt);
        const responseTimestampMs = Date.now();
        const latencyMs = responseTimestampMs - requestTimestampMs;

        let parsedJson: unknown;
        try {
          // Remove Markdown code block wrappers if model wrapped JSON in ```json ... ```
          let cleanJsonStr = rawJsonText.trim();
          if (cleanJsonStr.startsWith("```")) {
            cleanJsonStr = cleanJsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }
          parsedJson = JSON.parse(cleanJsonStr);
        } catch (jsonErr: any) {
          throw new Error("INVALID_PROVIDER_OUTPUT: Model response was not valid JSON.");
        }

        const metadata: LLMProviderMetadata = {
          providerType: "REAL_LLM",
          status: "AVAILABLE",
          modelIdentifier: this.getModelIdentifier(),
          promptVersion: PROMPT_VERSION,
          latencyMs,
          requestTimestampMs,
          responseTimestampMs,
          retryCount,
        };

        const validated = LLMOutputValidator.validateAndNormalize(parsedJson, prompt, metadata);

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
      } catch (err: any) {
        lastError = err;

        // Never retry schema validation errors or invalid outputs
        if (err.message?.startsWith("INVALID_PROVIDER_OUTPUT")) {
          break;
        }

        // Only retry on rate limit (429) or transient 5xx/timeout/temporary unavailability
        const isTimeout = err.name === "AbortError" || err.message?.includes("aborted") || err.message?.includes("TIMEOUT");
        const isTransient =
          err.message?.includes("RATE_LIMITED") ||
          err.message?.includes("429") ||
          err.message?.includes("500") ||
          err.message?.includes("503") ||
          err.message?.includes("PROVIDER_UNAVAILABLE") ||
          isTimeout;

        if (isTransient && retryCount < this.maxRetries) {
          retryCount++;
          await new Promise((r) => setTimeout(r, 1500 * retryCount)); // Exponential backoff
          continue;
        }
        break;
      }
    }

    // Classify error cleanly without leaking raw response bodies or secret headers
    const isTimeout = lastError?.name === "AbortError" || lastError?.message?.includes("aborted") || lastError?.message?.includes("TIMEOUT");
    const isRateLimited = lastError?.message?.includes("RATE_LIMITED") || lastError?.message?.includes("429");
    const isAuthFailed = lastError?.message?.includes("AUTHENTICATION_FAILED") || lastError?.message?.includes("401") || lastError?.message?.includes("403");
    const isInvalidOutput = lastError?.message?.startsWith("INVALID_PROVIDER_OUTPUT");

    if (isTimeout) {
      throw new Error("TIMEOUT: AI intent provider request timed out.");
    } else if (isRateLimited) {
      throw new Error("RATE_LIMITED: AI intent provider rate limit exceeded.");
    } else if (isAuthFailed) {
      throw new Error("AUTHENTICATION_FAILED: AI intent provider authentication failed.");
    } else if (isInvalidOutput) {
      throw new Error(lastError.message);
    } else {
      throw new Error("PROVIDER_UNAVAILABLE: AI intent provider is currently unavailable.");
    }
  }

  private async callLLMWithTimeout(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      if (this.providerVendor === "gemini") {
        return await this.callGemini(prompt, controller.signal);
      } else {
        return await this.callOpenAICompatible(prompt, controller.signal);
      }
    } catch (err: any) {
      if (err.name === "AbortError" || err.message?.includes("aborted")) {
        throw new Error("TIMEOUT: Provider request aborted after timeout.");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callGemini(prompt: string, signal: AbortSignal): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const payload = {
      system_instruction: {
        parts: [{ text: INTENT_EXTRACTION_SYSTEM_PROMPT }],
      },
      contents: [
        {
          parts: [{ text: buildIntentExtractionUserPrompt(prompt) }],
        },
      ],
      generationConfig: {
        response_mime_type: "application/json",
        // Deprecated sampling params (temperature, top_p, top_k) omitted for Gemini 3.7+ compatibility
      },
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (netErr: any) {
      if (netErr.name === "AbortError" || signal.aborted) {
        throw new Error("TIMEOUT: Gemini API connection timed out.");
      }
      throw new Error("PROVIDER_UNAVAILABLE: Network connection to Gemini API failed.");
    }

    if (!res.ok && (res.status === 429 || res.status === 404) && this.model !== "gemini-3.6-flash") {
      try {
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${this.apiKey}`;
        const fallbackRes = await fetch(fallbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal,
        });
        if (fallbackRes.ok) {
          res = fallbackRes;
        }
      } catch {
        // preserve original response error
      }
    }

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error("RATE_LIMITED: Gemini API rate limit exceeded (429).");
      } else if (res.status === 401 || res.status === 403) {
        throw new Error("AUTHENTICATION_FAILED: Invalid Gemini API credentials.");
      }
      throw new Error(`PROVIDER_UNAVAILABLE: Gemini API returned status ${res.status}.`);
    }

    const data: any = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("INVALID_PROVIDER_OUTPUT: Gemini API returned empty text content.");
    }
    return text;
  }

  private async callOpenAICompatible(prompt: string, signal: AbortSignal): Promise<string> {
    const endpoint = this.baseUrl || (this.providerVendor === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/chat/completions");
    const payload = {
      model: this.model,
      messages: [
        { role: "system", content: INTENT_EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: buildIntentExtractionUserPrompt(prompt) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    };

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (netErr: any) {
      if (netErr.name === "AbortError" || signal.aborted) {
        throw new Error("TIMEOUT: OpenAI-compatible API connection timed out.");
      }
      throw new Error("PROVIDER_UNAVAILABLE: Network connection to API endpoint failed.");
    }

    if (!res.ok) {
      if (res.status === 429) {
        throw new Error("RATE_LIMITED: API rate limit exceeded (429).");
      } else if (res.status === 401 || res.status === 403) {
        throw new Error("AUTHENTICATION_FAILED: Invalid API credentials.");
      }
      throw new Error(`PROVIDER_UNAVAILABLE: API returned status ${res.status}.`);
    }

    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("INVALID_PROVIDER_OUTPUT: API returned empty response content.");
    }
    return text;
  }
}
