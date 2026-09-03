import { IntentEngine } from "../services/IntentEngine";
import { LLMProviderStatus } from "../types";
import { AIIntentProvider } from "./interfaces/AIIntentProvider";
import { RealLLMIntentProvider } from "./RealLLMIntentProvider";

export class IntentProviderFactory {
  private static realProviderInstance: RealLLMIntentProvider | null = null;
  private static devProviderInstance: IntentEngine | null = null;

  public static getRealProvider(): RealLLMIntentProvider {
    if (!this.realProviderInstance) {
      this.realProviderInstance = new RealLLMIntentProvider();
    }
    return this.realProviderInstance;
  }

  public static getDevelopmentProvider(): IntentEngine {
    if (!this.devProviderInstance) {
      this.devProviderInstance = new IntentEngine();
    }
    return this.devProviderInstance;
  }

  /**
   * Returns the active AIIntentProvider based on EXPLICIT configuration.
   * STRICT HONESTY INVARIANT:
   * - If INTENT_PROVIDER=real, returns RealLLMIntentProvider. Never silently falls back to development adapter.
   * - If INTENT_PROVIDER=development (or default), returns IntentEngine (Development Adapter).
   */
  public static getActiveProvider(): AIIntentProvider {
    const configuredProvider = (process.env.INTENT_PROVIDER || "development").toLowerCase();

    if (configuredProvider === "real") {
      return this.getRealProvider();
    }

    return this.getDevelopmentProvider();
  }

  public static getProviderStatusSummary(): {
    activeProviderName: string;
    configuredIntentProvider: string;
    realProviderStatus: LLMProviderStatus;
    realModel: string;
  } {
    const realProvider = this.getRealProvider();
    const active = this.getActiveProvider();
    const configured = (process.env.INTENT_PROVIDER || "development").toLowerCase();

    return {
      activeProviderName: active.adapterName,
      configuredIntentProvider: configured,
      realProviderStatus: realProvider.getStatus(),
      realModel: realProvider.getModelIdentifier(),
    };
  }
}
