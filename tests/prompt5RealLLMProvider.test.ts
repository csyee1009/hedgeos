import { describe, expect, it } from "vitest";
import { IntentProviderFactory } from "../src/providers/IntentProviderFactory";
import { RealLLMIntentProvider } from "../src/providers/RealLLMIntentProvider";
import { PROMPT_VERSION } from "../src/providers/prompts/intentExtractionPrompt";
import { parseIsoDateMYT } from "../src/services/IntentEngine";
import { LLMOutputValidator } from "../src/services/LLMOutputValidator";

describe("Prompt 5 Repair: Provider Honesty + Grounding Security Suite", () => {
  it("Requirement 1: Missing real credentials does NOT silently activate development adapter when INTENT_PROVIDER=real", async () => {
    const originalEnv = process.env.INTENT_PROVIDER;
    const originalKey = process.env.LLM_API_KEY;
    const originalGeminiKey = process.env.GEMINI_API_KEY;
    try {
      process.env.INTENT_PROVIDER = "real";
      delete process.env.LLM_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      (IntentProviderFactory as any).realProviderInstance = null;

      const activeProvider = IntentProviderFactory.getActiveProvider();
      expect(activeProvider.adapterName).toBe("REAL_LLM");

      // Attempting to parse without API key throws honest error, does NOT silently fallback to dev adapter
      await expect(activeProvider.parseNaturalLanguage("Protect 2 ETH")).rejects.toThrow(
        /AUTHENTICATION_FAILED/
      );
    } finally {
      process.env.INTENT_PROVIDER = originalEnv;
      if (originalKey) process.env.LLM_API_KEY = originalKey;
      if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
      (IntentProviderFactory as any).realProviderInstance = null;
    }
  });

  it("Requirement 2: Development adapter only activates through explicit configuration", () => {
    const originalEnv = process.env.INTENT_PROVIDER;
    try {
      process.env.INTENT_PROVIDER = "development";
      const activeProvider = IntentProviderFactory.getActiveProvider();
      expect(activeProvider.adapterName).toBe("DEVELOPMENT_ADAPTER");
    } finally {
      process.env.INTENT_PROVIDER = originalEnv;
    }
  });

  it("Requirement 3: Provider status equals parser actually used", () => {
    const originalEnv = process.env.INTENT_PROVIDER;
    try {
      process.env.INTENT_PROVIDER = "development";
      const summaryDev = IntentProviderFactory.getProviderStatusSummary();
      expect(summaryDev.activeProviderName).toBe("DEVELOPMENT_ADAPTER");
      expect(summaryDev.configuredIntentProvider).toBe("development");

      process.env.INTENT_PROVIDER = "real";
      const summaryReal = IntentProviderFactory.getProviderStatusSummary();
      expect(summaryReal.activeProviderName).toBe("REAL_LLM");
      expect(summaryReal.configuredIntentProvider).toBe("real");
    } finally {
      process.env.INTENT_PROVIDER = originalEnv;
    }
  });

  it("Requirement 4: Unknown top-level fields cause INVALID_PROVIDER_OUTPUT rejection", () => {
    const payloadWithUnknownField = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "ETH" },
      unexpectedControlParam: "EXECUTE_NOW",
    };

    expect(() =>
      LLMOutputValidator.validateAndNormalize(payloadWithUnknownField, "Protect ETH")
    ).toThrow(/INVALID_PROVIDER_OUTPUT/);
  });

  it("Requirement 5: Injected authority fields (confirmedByUser, authorizationStatus) cause immediate rejection", () => {
    const maliciousPayload1 = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "ETH" },
      confirmedByUser: true,
    };

    expect(() =>
      LLMOutputValidator.validateAndNormalize(maliciousPayload1, "Protect ETH")
    ).toThrow(/INVALID_PROVIDER_OUTPUT: Forbidden authority\/control field 'confirmedByUser'/);

    const maliciousPayload2 = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "ETH" },
      authorizationStatus: "AUTHORIZED",
    };

    expect(() =>
      LLMOutputValidator.validateAndNormalize(maliciousPayload2, "Protect ETH")
    ).toThrow(/INVALID_PROVIDER_OUTPUT: Forbidden authority\/control field 'authorizationStatus'/);
  });

  it("Requirement 6: Budget currency must be USDC; non-USDC is rejected", () => {
    const nonUsdcPayload = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "ETH" },
      maxPremium: { value: "3", currency: "ETH", evidence: "3 ETH" },
    };

    const res = LLMOutputValidator.validateAndNormalize(nonUsdcPayload, "Protect ETH with budget 3 ETH");
    expect(res.candidateDraft.maxPremiumUSDC).toBeNull();
    expect(res.missingFields).toContain("maxPremiumUSDC");
    expect(res.ambiguitiesFound.some((a) => a.includes("Unsupported budget currency"))).toBe(true);

    const usdcPayload = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "ETH" },
      maxPremium: { value: "3", currency: "USDC", evidence: "3 USDC" },
    };

    const resUsdc = LLMOutputValidator.validateAndNormalize(usdcPayload, "Protect ETH with budget 3 USDC");
    expect(resUsdc.candidateDraft.maxPremiumUSDC).toBeDefined();
    expect(resUsdc.candidateDraft.maxPremiumUSDC?.value.symbol).toBe("USDC");
  });

  it("Requirement 7: Exposure unit must match exposure asset; inconsistent unit is rejected", () => {
    const mismatchUnitPayload = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "ETH" },
      exposureAmount: { value: "2", unit: "BTC", evidence: "2 BTC" },
    };

    const res = LLMOutputValidator.validateAndNormalize(mismatchUnitPayload, "Protect 2 BTC");
    expect(res.candidateDraft.exposureAmount).toBeNull();
    expect(res.missingFields).toContain("exposureAmount");
    expect(res.ambiguitiesFound.some((a) => a.includes("Inconsistent exposure unit"))).toBe(true);

    const validUnitPayload = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "ETH" },
      exposureAmount: { value: "2", unit: "ETH", evidence: "2 ETH" },
    };

    const resValid = LLMOutputValidator.validateAndNormalize(validUnitPayload, "Protect 2 ETH");
    expect(resValid.candidateDraft.exposureAmount).toBeDefined();
    expect(resValid.candidateDraft.exposureAmount?.value.symbol).toBe("ETH");
  });

  it("Requirement 8: Hallucinated asset / Friday is NOT USER_EXPLICIT without grounding", () => {
    const hallucinatedFridayPayload = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "ETH" },
      horizon: { rawText: "Friday", evidence: "Friday" },
    };

    // User prompt does NOT contain "Friday"
    const res = LLMOutputValidator.validateAndNormalize(hallucinatedFridayPayload, "Protect my ETH sometime");
    // Hallucinated Friday is flagged as missing horizon
    expect(res.candidateDraft.horizonTimestamp).toBeNull();
    expect(res.missingFields).toContain("horizonTimestamp");
  });

  it("Requirement 9: Hallucinated allowMultiLeg=true cannot enable multi-leg without grounded evidence", () => {
    const hallucinatedSpreadPayload = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH" },
      allowMultiLeg: { value: true, evidence: "cheap" },
    };

    // User prompt does NOT mention spread/multi-leg
    const res = LLMOutputValidator.validateAndNormalize(hallucinatedSpreadPayload, "Find cheap protection for 2 ETH");
    expect(res.candidateDraft.allowMultiLeg.value).toBe(false);

    // Explicit user text mentions put spread
    const groundedSpreadPayload = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH" },
      allowMultiLeg: { value: true, evidence: "put spread" },
    };

    const resGrounded = LLMOutputValidator.validateAndNormalize(
      groundedSpreadPayload,
      "Protect 2 ETH and I allow put spread"
    );
    expect(resGrounded.candidateDraft.allowMultiLeg.value).toBe(true);
    expect(resGrounded.candidateDraft.allowMultiLeg.source).toBe("USER_EXPLICIT");
  });

  it("Requirement 10: Strict calendar date validation in parseIsoDateMYT rejects impossible dates", () => {
    expect(() => parseIsoDateMYT("2026-02-31")).toThrow(/Non-existent calendar date/);
    expect(() => parseIsoDateMYT("2026-13-01")).toThrow(/Invalid date values/);
    expect(() => parseIsoDateMYT("2026-00-10")).toThrow(/Invalid date values/);
    expect(() => parseIsoDateMYT("2026-04-31")).toThrow(/Non-existent calendar date/);

    const valid = parseIsoDateMYT("2026-09-15");
    expect(valid.timestampMs).toBeGreaterThan(0);
    expect(valid.isoString).toContain("2026-09-15");
  });

  it("Requirement 11: CandidateDraft ambiguities match returned ambiguities consistently", () => {
    const ambiguousPayload = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "ETH" },
      horizon: { rawText: "sometime soon" },
    };

    const res = LLMOutputValidator.validateAndNormalize(ambiguousPayload, "Protect ETH sometime soon");
    expect(res.ambiguitiesFound.length).toBeGreaterThan(0);
    expect(res.candidateDraft.ambiguitiesFound?.length).toBe(res.ambiguitiesFound.length);
    expect(res.candidateDraft.requiresClarification).toBe(true);
  });
});
