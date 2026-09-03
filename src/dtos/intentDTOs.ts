import { LLMProviderMetadata, ParsedRiskIntentDraft, StoredIntent, TypedRiskIntent } from "../types";

export interface IntentParseResponseDTO {
  intentId: string;
  adapterName: string;
  candidateDraft: ParsedRiskIntentDraft;
  ambiguitiesFound: string[];
  missingFields: string[];
  requiresClarification: boolean;
  unsupportedObjective?: boolean;
  unsupportedObjectiveReason?: string;
  providerMetadata?: LLMProviderMetadata;
}

export interface IntentReviewDTO {
  candidateIntent: StoredIntent;
  missingFields: string[];
  ambiguitiesFound: string[];
  canConfirm: boolean;
}

export interface IntentConfirmationDTO {
  intentId: string;
  version: number;
  confirmedByUser: boolean;
  confirmedAtMs: number;
  confirmedIntent: TypedRiskIntent;
  message: string;
  nextStage: string;
}

export interface UpdateIntentRequestDTO {
  asset?: string;
  exposureAmount?: { amount: string; decimals?: number; symbol?: string };
  targetMaxLossPercent?: number;
  maxPremiumUSDC?: { amount: string; decimals?: number; symbol?: string };
  horizonTimestampMs?: number;
  allowMultiLeg?: boolean;
  confirmedByUser?: boolean; // Attempting to pass confirmedByUser in PATCH will be rejected/ignored
}
