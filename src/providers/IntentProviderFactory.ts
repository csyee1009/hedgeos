import {
  AIIntentProvider,
} from "./interfaces/AIIntentProvider";
import {
  IntentEngine,
} from "../services/IntentEngine";
import {
  RealLLMIntentProvider,
} from "./RealLLMIntentProvider";

const DEFAULT_GEMINI_MODEL =
  "gemini-3.6-flash";

function normalizedIntentMode():
  "real" | "development" {
  return (
    process.env.INTENT_PROVIDER ||
    "development"
  )
    .trim()
    .toLowerCase() ===
    "real"
    ? "real"
    : "development";
}

function normalizedLLMProvider():
  string {
  return (
    process.env.LLM_PROVIDER ||
    "gemini"
  )
    .trim()
    .toLowerCase();
}

function configuredGeminiModel():
  string {
  return (
    process.env.LLM_MODEL ||
    DEFAULT_GEMINI_MODEL
  ).trim() ||
    DEFAULT_GEMINI_MODEL;
}

function configuredGeminiKey():
  string {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ""
  ).trim();
}

export class IntentProviderFactory {
  public static getActiveProvider():
    AIIntentProvider {
    const mode =
      normalizedIntentMode();

    if (
      mode !==
      "real"
    ) {
      return new IntentEngine();
    }

    const llmProvider =
      normalizedLLMProvider();

    if (
      llmProvider !==
      "gemini"
    ) {
      return new RealLLMIntentProvider({
        provider:
          llmProvider,
        apiKey:
          "",
        model:
          configuredGeminiModel(),
      });
    }

    return new RealLLMIntentProvider({
      provider:
        "gemini",
      apiKey:
        configuredGeminiKey(),
      model:
        configuredGeminiModel(),
    });
  }

  public static getProviderStatusSummary() {
    const mode =
      normalizedIntentMode();

    const llmProvider =
      normalizedLLMProvider();

    const model =
      configuredGeminiModel();

    const geminiConfigured =
      Boolean(
        configuredGeminiKey()
      );

    const providerSupported =
      llmProvider ===
      "gemini";

    return {
      configuredIntentProvider:
        mode,

      activeProviderName:
        mode === "real"
          ? "REAL_LLM"
          : "DEVELOPMENT_ADAPTER",

      realProviderStatus:
        providerSupported &&
          geminiConfigured
          ? "READY"
          : "NOT_CONFIGURED",

      realModel:
        providerSupported
          ? `gemini:${model}`
          : `${llmProvider}:${model}`,
    };
  }
}
