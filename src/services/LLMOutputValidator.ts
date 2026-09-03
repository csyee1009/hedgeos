import { z } from "zod";
import {
  AmbiguityResolution,
  FieldProvenance,
  FieldProvenanceSource,
  HorizonTarget,
  LLMIntentExtractionDTO,
  LLMProviderMetadata,
  ParsedRiskIntentDraft,
  RiskObjective,
  TokenAmount,
} from "../types";
import { parseExactDecimal } from "../utils/decimalParser";
import { getNextFridayMYT, parseIsoDateMYT } from "./IntentEngine";

export const FORBIDDEN_AUTHORITY_FIELDS = [
  "confirmedByUser",
  "confirmedAtMs",
  "version",
  "allowedProtocols",
  "authorizationStatus",
  "submissionStatus",
  "policyDecision",
  "targetContract",
  "walletAddress",
  "approvalAmount",
  "calldata",
  "signedData",
  "privateKey",
  "signature",
] as const;

// Strict Zod schema for untrusted LLM extraction DTO — STRICT TOP-LEVEL AND SUB-OBJECT SCHEMAS
export const LLMIntentExtractionDTOSchema = z
  .object({
    objective: z.string().optional().nullable(),
    unsupportedObjectiveReason: z.string().optional().nullable(),
    asset: z
      .object({
        value: z.string().optional().nullable(),
        evidence: z.string().optional().nullable(),
      })
      .strict()
      .optional()
      .nullable(),
    exposureAmount: z
      .object({
        value: z.string().optional().nullable(),
        unit: z.string().optional().nullable(),
        evidence: z.string().optional().nullable(),
      })
      .strict()
      .optional()
      .nullable(),
    targetMaxLossPercent: z
      .object({
        value: z.union([z.string(), z.number()]).optional().nullable(),
        evidence: z.string().optional().nullable(),
      })
      .strict()
      .optional()
      .nullable(),
    maxPremium: z
      .object({
        value: z.string().optional().nullable(),
        currency: z.string().optional().nullable(),
        evidence: z.string().optional().nullable(),
      })
      .strict()
      .optional()
      .nullable(),
    horizon: z
      .object({
        rawText: z.string().optional().nullable(),
        evidence: z.string().optional().nullable(),
      })
      .strict()
      .optional()
      .nullable(),
    allowMultiLeg: z
      .object({
        value: z.boolean().optional().nullable(),
        evidence: z.string().optional().nullable(),
      })
      .strict()
      .optional()
      .nullable(),
    ambiguities: z.array(z.string()).optional().nullable(),
    clarificationQuestions: z.array(z.string()).optional().nullable(),
  })
  .strict();

export interface ValidationAndNormalizationResult {
  candidateDraft: ParsedRiskIntentDraft;
  missingFields: string[];
  ambiguitiesFound: string[];
  requiresClarification: boolean;
  unsupportedObjective: boolean;
  unsupportedObjectiveReason?: string;
}

export class LLMOutputValidator {
  /**
   * Sanitizes, validates, and normalizes untrusted LLM extraction output into a safe ParsedRiskIntentDraft.
   * STRICT SECURITY BOUNDARIES:
   * 1. REJECTS any output containing forbidden authority/control fields.
   * 2. REJECTS unknown top-level schema fields.
   * 3. Validates exposure units and budget currencies.
   * 4. Enforces grounded evidence provenance.
   * 5. Enforces immutable server-owned confirmedByUser = false.
   */
  public static validateAndNormalize(
    rawOutput: unknown,
    originalPromptText: string,
    providerMetadata?: LLMProviderMetadata
  ): ValidationAndNormalizationResult {
    const nowMs = Date.now();
    const missingFields: string[] = [];
    const ambiguitiesFound: string[] = [];
    let requiresClarification = false;
    let unsupportedObjective = false;
    let unsupportedObjectiveReason: string | undefined = undefined;

    // 1. Structural parse and strict authority check
    if (!rawOutput || typeof rawOutput !== "object") {
      throw new Error("INVALID_PROVIDER_OUTPUT: response must be a JSON object.");
    }

    const rawObj = rawOutput as Record<string, any>;

    // Security Check: Explicitly REJECT output if authority fields are present
    for (const field of FORBIDDEN_AUTHORITY_FIELDS) {
      if (field in rawObj) {
        throw new Error(
          `INVALID_PROVIDER_OUTPUT: Forbidden authority/control field '${field}' detected in model output.`
        );
      }
    }

    const parseResult = LLMIntentExtractionDTOSchema.safeParse(rawObj);
    if (!parseResult.success) {
      throw new Error(`INVALID_PROVIDER_OUTPUT: Schema validation failed: ${parseResult.error.message}`);
    }

    const dto = parseResult.data;

    // 2. Check Objective Scope
    const rawObjective = (dto.objective || "").trim().toUpperCase();
    const isSpeculationOrYield =
      rawObjective === "UNSUPPORTED_OBJECTIVE" ||
      rawObjective === "SPECULATION" ||
      rawObjective === "VOLATILITY_YIELD" ||
      rawObjective === "YIELD" ||
      rawObjective === "LEVERAGE" ||
      rawObjective === "ARBITRAGE" ||
      Boolean(dto.unsupportedObjectiveReason) ||
      /\b(speculate|speculation|yield|rally|moon|long call|arbitrage|leverage|trading bot)\b/i.test(originalPromptText);

    if (isSpeculationOrYield && rawObjective !== "DOWNSIDE_PROTECTION") {
      unsupportedObjective = true;
      unsupportedObjectiveReason =
        dto.unsupportedObjectiveReason ||
        "HedgeOS currently supports Downside Protection intents only. Speculation, yield generation, and trading bot strategies are not supported in this MVP.";
      requiresClarification = true;
    }

    const objectiveField: FieldProvenance<RiskObjective> = {
      value: "DOWNSIDE_PROTECTION",
      source: "SYSTEM_DEFAULT",
      confidence: 1.0,
      requiresConfirmation: false,
    };

    // 3. Asset Extraction & Evidence Grounding
    let assetField: FieldProvenance<string> | null = null;
    const rawAsset = dto.asset?.value?.trim().toUpperCase();

    if (rawAsset && (rawAsset === "ETH" || rawAsset === "WETH" || rawAsset === "BTC" || rawAsset === "CBBTC" || rawAsset === "SOL")) {
      const evidence = dto.asset?.evidence || "";
      // Strong evidence grounding: check word boundaries in user text
      const isGrounded = evidence
        ? originalPromptText.toLowerCase().includes(evidence.toLowerCase())
        : new RegExp(`\\b${rawAsset}\\b`, "i").test(originalPromptText);

      assetField = {
        value: rawAsset,
        source: isGrounded ? "USER_EXPLICIT" : "AI_INFERRED",
        confidence: isGrounded ? 1.0 : 0.7,
        requiresConfirmation: !isGrounded,
        originalPhrase: isGrounded ? (evidence || rawAsset) : undefined,
      };
      if (!isGrounded) {
        requiresClarification = true;
      }
    } else {
      missingFields.push("asset");
      requiresClarification = true;
    }

    // 4. Exposure Amount & Unit Validation
    let exposureAmountField: FieldProvenance<TokenAmount> | null = null;
    const rawExposureStr = dto.exposureAmount?.value ? String(dto.exposureAmount.value).trim() : null;
    const rawUnit = dto.exposureAmount?.unit ? String(dto.exposureAmount.unit).trim().toUpperCase() : null;

    if (rawExposureStr && assetField?.value) {
      const numVal = parseFloat(rawExposureStr);
      if (isNaN(numVal) || numVal <= 0 || !Number.isFinite(numVal)) {
        ambiguitiesFound.push(`Invalid exposure amount '${rawExposureStr}': must be a positive number.`);
        missingFields.push("exposureAmount");
        requiresClarification = true;
      } else {
        // Unit check: unit must match normalized exposure asset
        const normalizedAsset = assetField.value;
        const isValidUnit =
          !rawUnit ||
          (normalizedAsset === "ETH" && (rawUnit === "ETH" || rawUnit === "WETH")) ||
          (normalizedAsset === "WETH" && (rawUnit === "ETH" || rawUnit === "WETH")) ||
          (normalizedAsset === "BTC" && (rawUnit === "BTC" || rawUnit === "CBBTC")) ||
          (normalizedAsset === "CBBTC" && (rawUnit === "BTC" || rawUnit === "CBBTC")) ||
          (normalizedAsset === "SOL" && rawUnit === "SOL");

        if (!isValidUnit) {
          ambiguitiesFound.push(
            `Inconsistent exposure unit: asset is ${normalizedAsset} but exposure unit was specified as ${rawUnit}.`
          );
          missingFields.push("exposureAmount");
          requiresClarification = true;
        } else {
          const decimals = normalizedAsset === "ETH" || normalizedAsset === "WETH" ? 18 : normalizedAsset === "BTC" || normalizedAsset === "CBBTC" ? 8 : 18;
          try {
            const parsedAmount = parseExactDecimal(rawExposureStr, decimals, normalizedAsset);
            const evidence = dto.exposureAmount?.evidence || "";
            const isGrounded = evidence
              ? originalPromptText.toLowerCase().includes(evidence.toLowerCase())
              : originalPromptText.includes(rawExposureStr);

            exposureAmountField = {
              value: parsedAmount,
              source: isGrounded ? "USER_EXPLICIT" : "AI_INFERRED",
              confidence: isGrounded ? 1.0 : 0.7,
              requiresConfirmation: !isGrounded,
              originalPhrase: isGrounded ? (evidence || rawExposureStr) : undefined,
            };
            if (!isGrounded) {
              requiresClarification = true;
            }
          } catch {
            missingFields.push("exposureAmount");
            requiresClarification = true;
          }
        }
      }
    } else {
      missingFields.push("exposureAmount");
      requiresClarification = true;
    }

    // 5. Target Max Loss Percent Validation
    let targetMaxLossField: FieldProvenance<number> | null = null;
    const rawLoss = dto.targetMaxLossPercent?.value;

    if (rawLoss !== undefined && rawLoss !== null && String(rawLoss).trim() !== "") {
      const parsedLoss = typeof rawLoss === "number" ? rawLoss : parseFloat(String(rawLoss).replace("%", "").trim());
      if (isNaN(parsedLoss) || parsedLoss <= 0 || parsedLoss > 100 || !Number.isFinite(parsedLoss)) {
        ambiguitiesFound.push(`Invalid max loss percentage '${rawLoss}': must be between 0.1% and 100%.`);
        missingFields.push("targetMaxLossPercent");
        requiresClarification = true;
      } else {
        const evidence = dto.targetMaxLossPercent?.evidence || "";
        const isGrounded = evidence
          ? originalPromptText.toLowerCase().includes(evidence.toLowerCase())
          : originalPromptText.includes(String(rawLoss));

        targetMaxLossField = {
          value: parsedLoss,
          source: isGrounded ? "USER_EXPLICIT" : "AI_INFERRED",
          confidence: isGrounded ? 1.0 : 0.7,
          requiresConfirmation: !isGrounded,
          originalPhrase: isGrounded ? (evidence || `${parsedLoss}%`) : undefined,
        };
        if (!isGrounded) {
          requiresClarification = true;
        }
      }
    } else {
      missingFields.push("targetMaxLossPercent");
      requiresClarification = true;
    }

    // 6. Max Premium Budget & Currency Validation
    let maxPremiumField: FieldProvenance<TokenAmount> | null = null;
    const rawBudgetStr = dto.maxPremium?.value ? String(dto.maxPremium.value).trim() : null;
    const rawCurrency = dto.maxPremium?.currency ? String(dto.maxPremium.currency).trim().toUpperCase() : null;

    if (rawBudgetStr !== null && rawBudgetStr !== "") {
      const numBudget = parseFloat(rawBudgetStr);
      if (isNaN(numBudget) || numBudget < 0 || !Number.isFinite(numBudget)) {
        ambiguitiesFound.push(`Invalid premium budget '${rawBudgetStr}': must be zero or a positive amount.`);
        missingFields.push("maxPremiumUSDC");
        requiresClarification = true;
      } else {
        // Currency validation: Must be USDC for current HedgeOS MVP
        const isUsdcCurrency = rawCurrency === "USDC" || (!rawCurrency && /\bUSDC\b/i.test(originalPromptText));
        if (rawCurrency && rawCurrency !== "USDC") {
          ambiguitiesFound.push(
            `Unsupported budget currency '${rawCurrency}': HedgeOS requires protection budget in USDC.`
          );
          missingFields.push("maxPremiumUSDC");
          requiresClarification = true;
        } else if (!isUsdcCurrency) {
          ambiguitiesFound.push("Budget currency is unspecified. Please confirm budget amount in USDC.");
          missingFields.push("maxPremiumUSDC");
          requiresClarification = true;
        } else {
          try {
            const parsedBudget = parseExactDecimal(rawBudgetStr, 6, "USDC");
            const evidence = dto.maxPremium?.evidence || "";
            const isGrounded = evidence
              ? originalPromptText.toLowerCase().includes(evidence.toLowerCase())
              : originalPromptText.includes(rawBudgetStr);

            maxPremiumField = {
              value: parsedBudget,
              source: isGrounded ? "USER_EXPLICIT" : "AI_INFERRED",
              confidence: isGrounded ? 1.0 : 0.7,
              requiresConfirmation: !isGrounded,
              originalPhrase: isGrounded ? (evidence || `${rawBudgetStr} USDC`) : undefined,
            };
            if (!isGrounded) {
              requiresClarification = true;
            }
          } catch {
            missingFields.push("maxPremiumUSDC");
            requiresClarification = true;
          }
        }
      }
    } else {
      missingFields.push("maxPremiumUSDC");
      requiresClarification = true;
    }

    // 7. Deterministic Protection Horizon Resolution & Grounding
    let horizonField: FieldProvenance<HorizonTarget> | null = null;
    const rawHorizonText = dto.horizon?.rawText ? String(dto.horizon.rawText).trim() : null;

    if (rawHorizonText) {
      const isoMatch = rawHorizonText.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      const isFriday = rawHorizonText.toLowerCase().includes("friday");

      if (isoMatch) {
        try {
          const parsedHorizon = parseIsoDateMYT(isoMatch[1]);
          if (parsedHorizon.timestampMs <= nowMs) {
            ambiguitiesFound.push(`Requested horizon date (${isoMatch[1]}) is in the past. Future horizon date required.`);
            missingFields.push("horizonTimestamp");
            requiresClarification = true;
          } else {
            const isGrounded = originalPromptText.includes(isoMatch[1]);
            horizonField = {
              value: parsedHorizon,
              source: isGrounded ? "USER_EXPLICIT" : "AI_INFERRED",
              confidence: isGrounded ? 1.0 : 0.7,
              requiresConfirmation: !isGrounded,
              originalPhrase: isGrounded ? isoMatch[0] : undefined,
            };
          }
        } catch (dateErr: any) {
          ambiguitiesFound.push(`Invalid calendar date '${isoMatch[1]}': ${dateErr.message}`);
          missingFields.push("horizonTimestamp");
          requiresClarification = true;
        }
      } else if (isFriday) {
        const isGrounded = /\bfriday\b/i.test(originalPromptText);
        if (!isGrounded) {
          ambiguitiesFound.push("Protection horizon is unspecified. Please confirm your protection horizon.");
          missingFields.push("horizonTimestamp");
          requiresClarification = true;
        } else {
          const fridayHorizon = getNextFridayMYT(nowMs);
          horizonField = {
            value: fridayHorizon,
            source: "USER_EXPLICIT",
            confidence: 0.95,
            requiresConfirmation: false,
            originalPhrase: "until Friday",
          };
        }
      } else if (/\b(soon|later|next month|someday|eventually|in the future)\b/i.test(rawHorizonText)) {
        ambiguitiesFound.push(`Protection horizon '${rawHorizonText}' is ambiguous. Please select an exact calendar date or Friday.`);
        missingFields.push("horizonTimestamp");
        requiresClarification = true;
      } else {
        ambiguitiesFound.push(`Unrecognized horizon expression '${rawHorizonText}'. Please specify an explicit calendar date (YYYY-MM-DD) or Friday.`);
        missingFields.push("horizonTimestamp");
        requiresClarification = true;
      }
    } else {
      missingFields.push("horizonTimestamp");
      requiresClarification = true;
    }

    // 8. Multi-Leg Permission Grounding (Strictly require grounded phrase in original text)
    const hasGroundedSpreadPhrase = /\b(spread|put spread|multi-leg|vertical spread)\b/i.test(originalPromptText);
    const modelClaimedMultiLeg = dto.allowMultiLeg?.value === true;
    const isMultiLegGranted = modelClaimedMultiLeg && hasGroundedSpreadPhrase;

    const multiLegField: FieldProvenance<boolean> = {
      value: isMultiLegGranted,
      source: isMultiLegGranted ? "USER_EXPLICIT" : "SYSTEM_DEFAULT",
      confidence: 1.0,
      requiresConfirmation: false,
      originalPhrase: isMultiLegGranted ? (dto.allowMultiLeg?.evidence || "spread") : undefined,
    };

    // 9. Additional Ambiguities from DTO
    if (dto.ambiguities && Array.isArray(dto.ambiguities)) {
      for (const amb of dto.ambiguities) {
        if (amb && !ambiguitiesFound.includes(amb)) {
          ambiguitiesFound.push(amb);
          requiresClarification = true;
        }
      }
    }

    // Map string ambiguities to AmbiguityResolution objects for consistent draft storage
    const ambiguitiesList: AmbiguityResolution[] = ambiguitiesFound.map((amb, idx) => ({
      field: missingFields[idx] || "general",
      detectedText: amb,
      reason: amb,
      suggestedValue: undefined,
    }));

    // Build immutable candidate draft
    const candidateDraft: ParsedRiskIntentDraft = {
      intentId: `intent-${Math.random().toString(36).substring(2, 9)}`,
      version: 1,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      confirmedByUser: false, // IMMUTABLE SERVER-OWNED INVARIANT
      objective: objectiveField,
      asset: assetField,
      exposureAmount: exposureAmountField,
      targetMaxLossPercent: targetMaxLossField,
      maxPremiumUSDC: maxPremiumField,
      horizonTimestamp: horizonField,
      allowedProtocols: {
        value: ["THETANUTS"],
        source: "SYSTEM_DEFAULT",
        confidence: 1.0,
        requiresConfirmation: false,
      },
      allowMultiLeg: multiLegField,
      missingFields,
      ambiguitiesFound: ambiguitiesList,
      requiresClarification: requiresClarification || missingFields.length > 0 || ambiguitiesFound.length > 0,
      originalPromptText,
      providerMetadata,
    };

    return {
      candidateDraft,
      missingFields,
      ambiguitiesFound,
      requiresClarification: candidateDraft.requiresClarification || false,
      unsupportedObjective,
      unsupportedObjectiveReason,
    };
  }
}
