import {
  AIIntentProvider,
} from "./interfaces/AIIntentProvider";
import {
  IntentEngine,
} from "../services/IntentEngine";
import {
  AIProviderError,
  RealLLMIntentProvider,
} from "./RealLLMIntentProvider";

const DEFAULT_OPENAI_MODEL =
  "gpt-5.6-luna";

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
    "openai"
  )
    .trim()
    .toLowerCase();
}

function configuredOpenAIModel():
  string {
  return (
    process.env.LLM_MODEL ||
    DEFAULT_OPENAI_MODEL
  ).trim() ||
    DEFAULT_OPENAI_MODEL;
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
      "openai"
    ) {
      throw new AIProviderError(
        "INVALID_REQUEST",
        `Unsupported LLM_PROVIDER '${llmProvider}'. Set LLM_PROVIDER=openai.`,
        undefined,
        false
      );
    }

    const apiKey =
      (
        process.env
          .OPENAI_API_KEY ||
        ""
      ).trim();

    if (!apiKey) {
      throw new AIProviderError(
        "AUTHENTICATION_FAILED",
        "OPENAI_API_KEY is not configured.",
        undefined,
        false
      );
    }

    return new RealLLMIntentProvider({
      provider:
        "openai",
      apiKey,
      model:
        configuredOpenAIModel(),
    });
  }

  public static getProviderStatusSummary() {
    const mode =
      normalizedIntentMode();

    const llmProvider =
      normalizedLLMProvider();

    const model =
      configuredOpenAIModel();

    const openAIConfigured =
      Boolean(
        process.env
          .OPENAI_API_KEY
          ?.trim()
      );

    const providerSupported =
      llmProvider ===
      "openai";

    return {
      configuredIntentProvider:
        mode,

      activeProviderName:
        mode === "real"
          ? "REAL_LLM"
          : "DEVELOPMENT_ADAPTER",

      realProviderStatus:
        providerSupported &&
          openAIConfigured
          ? "READY"
          : "NOT_CONFIGURED",

      realModel:
        providerSupported
          ? `openai:${model}`
          : `${llmProvider}:${model}`,
    };
  }
}
