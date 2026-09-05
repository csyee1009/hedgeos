import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildParseFailureState } from "../src/client/App";
import { IntentProviderFactory } from "../src/providers/IntentProviderFactory";
import {
  AIProviderError,
  RealLLMIntentProvider,
} from "../src/providers/RealLLMIntentProvider";
import { app } from "../src/server/index";

const prompt =
  "I have 2 ETH. Protect me until 2030-09-12. Max downside 20%, budget 100 USDC.";

const validGeminiBody = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              objective: "DOWNSIDE_PROTECTION",
              unsupportedObjectiveReason: null,
              asset: { value: "ETH", evidence: "ETH" },
              exposureAmount: { value: "2", unit: "ETH", evidence: "2 ETH" },
              targetMaxLossPercent: { value: "20", evidence: "20%" },
              maxPremium: { value: "100", currency: "USDC", evidence: "100 USDC" },
              horizon: { rawText: "2030-09-12", evidence: "2030-09-12" },
              allowMultiLeg: { value: false, evidence: null },
              ambiguities: [],
              clarificationQuestions: [],
            }),
          },
        ],
      },
    },
  ],
};

function provider(): RealLLMIntentProvider {
  return new RealLLMIntentProvider({
    provider: "gemini",
    apiKey: "test-key",
    model: "configured-test-model",
    maxRetries: 2,
    retryBaseDelayMs: 0,
    maxRetryDelayMs: 10,
  });
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Gemini intent parsing resilience", () => {
  it("returns 200 through the parse route when Gemini succeeds", async () => {
    const activeProvider = provider();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(validGeminiBody));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(IntentProviderFactory, "getActiveProvider").mockReturnValue(activeProvider);

    const response = await request(app).post("/api/v1/intents/parse").send({ prompt });

    expect(response.status).toBe(200);
    expect(response.body.adapterName).toBe("REAL_LLM");
    expect(response.body.providerMetadata.modelIdentifier).toBe("gemini:configured-test-model");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds Gemini 429 retries and returns a safe non-500 response", async () => {
    const activeProvider = provider();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { error: { status: "RESOURCE_EXHAUSTED", message: "provider detail" } },
        429,
        { "retry-after": "0" },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(IntentProviderFactory, "getActiveProvider").mockReturnValue(activeProvider);

    const response = await request(app).post("/api/v1/intents/parse").send({ prompt });

    expect(response.status).toBe(429);
    expect(response.body.code).toBe("AI_PROVIDER_RATE_LIMITED");
    expect(response.body.error).toBe(
      "AI intent interpretation is temporarily unavailable. Please try again shortly.",
    );
    expect(JSON.stringify(response.body)).not.toContain("provider detail");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("bounds temporary Gemini 5xx retries and returns safe HTTP 503", async () => {
    const activeProvider = provider();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: "internal detail" } }, 503));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(IntentProviderFactory, "getActiveProvider").mockReturnValue(activeProvider);

    const response = await request(app).post("/api/v1/intents/parse").send({ prompt });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("AI_PROVIDER_TEMPORARILY_UNAVAILABLE");
    expect(response.body.error).toBe(
      "AI intent interpretation is temporarily unavailable. Please try again shortly.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry invalid credentials or switch to an arbitrary model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: "bad key" } }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider().parseNaturalLanguage(prompt)).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("configured-test-model");
  });

  it("rejects malformed Gemini output without retrying or trusting it", async () => {
    const activeProvider = provider();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ candidates: [{ content: { parts: [{ text: "not-json" }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(IntentProviderFactory, "getActiveProvider").mockReturnValue(activeProvider);

    const response = await request(app).post("/api/v1/intents/parse").send({ prompt });

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("AI_PROVIDER_INVALID_RESPONSE");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exits PARSING, preserves a safe server message, and permits retry", () => {
    const failure = buildParseFailureState(
      new Error("AI intent interpretation is temporarily unavailable. Please try again shortly."),
    );

    expect(failure).toEqual({
      uiState: "ERROR",
      errorMessage: "AI intent interpretation is temporarily unavailable. Please try again shortly.",
    });
    expect(failure.uiState).not.toBe("PARSING");
  });

  it("keeps valid Gemini extraction validated and unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(validGeminiBody)));

    const result = await provider().parseNaturalLanguage(prompt);

    expect(result.requiresClarification).toBe(false);
    expect(result.candidateDraft.asset?.value).toBe("ETH");
    expect(result.candidateDraft.exposureAmount?.value.amountBaseUnits).toBe("2000000000000000000");
    expect(result.candidateDraft.maxPremiumUSDC?.value.amountBaseUnits).toBe("100000000");
    expect(result.providerMetadata?.retryCount).toBe(0);
  });

  it("does not retry a configured model that is unavailable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: "unknown model" } }, 404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider().parseNaturalLanguage(prompt)).rejects.toEqual(
      expect.objectContaining<Partial<AIProviderError>>({
        code: "MODEL_UNAVAILABLE",
        retryable: false,
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
