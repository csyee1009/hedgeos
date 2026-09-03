import { LLMProviderMetadata, ParsedRiskIntentDraft } from "../../types";

export interface ParseResult {
  adapterName: "DEVELOPMENT_ADAPTER" | "REAL_LLM" | string;
  candidateDraft: ParsedRiskIntentDraft;
  ambiguitiesFound: string[];
  missingFields: string[];
  requiresClarification: boolean;
  unsupportedObjective?: boolean;
  unsupportedObjectiveReason?: string;
  providerMetadata?: LLMProviderMetadata;
}

export interface AIIntentProvider {
  readonly adapterName: "DEVELOPMENT_ADAPTER" | "REAL_LLM" | string;
  readonly providerType: "REAL_LLM" | "DEVELOPMENT_ADAPTER" | "MOCK_EVALUATION";
  parseNaturalLanguage(prompt: string): Promise<ParseResult>;
}
