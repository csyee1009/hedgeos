import { z } from "zod";
import {
  AmbiguityResolution,
  FieldProvenance,
  HorizonTarget,
  LLMProviderMetadata,
  ParsedRiskIntentDraft,
  RiskObjective,
  TokenAmount,
} from "../types";
import { parseExactDecimal } from "../utils/decimalParser";
import {
  formatCustomHorizon,
  getNextFridayMYT,
  parseIsoDateMYT,
} from "./IntentEngine";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

export const LLMIntentExtractionDTOSchema = z
  .object({
    objective: z
      .string()
      .optional()
      .nullable(),

    unsupportedObjectiveReason: z
      .string()
      .optional()
      .nullable(),

    asset: z
      .object({
        value: z
          .string()
          .optional()
          .nullable(),

        evidence: z
          .string()
          .optional()
          .nullable(),
      })
      .strict()
      .optional()
      .nullable(),

    exposureAmount: z
      .object({
        value: z
          .string()
          .optional()
          .nullable(),

        unit: z
          .string()
          .optional()
          .nullable(),

        evidence: z
          .string()
          .optional()
          .nullable(),
      })
      .strict()
      .optional()
      .nullable(),

    targetMaxLossPercent: z
      .object({
        value: z
          .union([
            z.string(),
            z.number(),
          ])
          .optional()
          .nullable(),

        evidence: z
          .string()
          .optional()
          .nullable(),
      })
      .strict()
      .optional()
      .nullable(),

    maxPremium: z
      .object({
        value: z
          .string()
          .optional()
          .nullable(),

        currency: z
          .string()
          .optional()
          .nullable(),

        evidence: z
          .string()
          .optional()
          .nullable(),
      })
      .strict()
      .optional()
      .nullable(),

    horizon: z
      .object({
        rawText: z
          .string()
          .optional()
          .nullable(),

        evidence: z
          .string()
          .optional()
          .nullable(),
      })
      .strict()
      .optional()
      .nullable(),

    allowMultiLeg: z
      .object({
        value: z
          .boolean()
          .optional()
          .nullable(),

        evidence: z
          .string()
          .optional()
          .nullable(),
      })
      .strict()
      .optional()
      .nullable(),

    ambiguities: z
      .array(z.string())
      .optional()
      .nullable(),

    clarificationQuestions: z
      .array(z.string())
      .optional()
      .nullable(),
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
  public static validateAndNormalize(
    rawOutput: unknown,
    originalPromptText: string,
    providerMetadata?: LLMProviderMetadata
  ): ValidationAndNormalizationResult {
    const nowMs = Date.now();

    const prompt =
      typeof originalPromptText ===
        "string"
        ? originalPromptText.trim()
        : "";

    const missingFields: string[] = [];
    const ambiguitiesFound: string[] = [];

    const addMissing = (
      field: string
    ): void => {
      if (
        !missingFields.includes(
          field
        )
      ) {
        missingFields.push(
          field
        );
      }
    };

    const addAmbiguity = (
      message: string
    ): void => {
      if (
        !ambiguitiesFound.includes(
          message
        )
      ) {
        ambiguitiesFound.push(
          message
        );
      }
    };

    if (
      !rawOutput ||
      typeof rawOutput !==
      "object"
    ) {
      throw new Error(
        "INVALID_PROVIDER_OUTPUT: response must be a JSON object."
      );
    }

    const rawObj =
      rawOutput as Record<
        string,
        any
      >;

    for (
      const field of
      FORBIDDEN_AUTHORITY_FIELDS
    ) {
      if (field in rawObj) {
        throw new Error(
          `INVALID_PROVIDER_OUTPUT: Forbidden authority/control field '${field}' detected in model output.`
        );
      }
    }

    const parseResult =
      LLMIntentExtractionDTOSchema.safeParse(
        rawObj
      );

    if (!parseResult.success) {
      throw new Error(
        `INVALID_PROVIDER_OUTPUT: Schema validation failed: ${parseResult.error.message}`
      );
    }

    const dto =
      parseResult.data;

    const rawObjective =
      String(
        dto.objective || ""
      )
        .trim()
        .toUpperCase();

    const promptShowsUnsupportedIntent =
      /\b(speculate|speculation|yield farming|yield generation|arbitrage|leverage|leveraged|trading bot|naked call|short call|10x)\b/i.test(
        prompt
      );

    const modelExplicitlyUnsupported =
      rawObjective ===
      "UNSUPPORTED_OBJECTIVE" ||
      rawObjective ===
      "SPECULATION" ||
      rawObjective ===
      "VOLATILITY_YIELD" ||
      rawObjective ===
      "YIELD" ||
      rawObjective ===
      "LEVERAGE" ||
      rawObjective ===
      "ARBITRAGE";

    const unsupportedObjective =
      promptShowsUnsupportedIntent ||
      modelExplicitlyUnsupported;

    const unsupportedObjectiveReason =
      unsupportedObjective
        ? dto
          .unsupportedObjectiveReason ||
        "HedgeOS currently supports Downside Protection only. Speculation, yield generation, leverage, arbitrage, and autonomous trading strategies are outside this MVP."
        : undefined;

    const objectiveField:
      FieldProvenance<RiskObjective> =
    {
      value:
        "DOWNSIDE_PROTECTION",

      source:
        "SYSTEM_DEFAULT",

      confidence: 1,

      requiresConfirmation:
        false,
    };

    let assetField:
      FieldProvenance<string> | null =
      null;

    const modelAsset =
      dto.asset?.value
        ?.trim()
        .toUpperCase();

    if (modelAsset) {
      const canonicalAsset =
        this.canonicalAsset(
          modelAsset
        );

      if (!canonicalAsset) {
        addMissing("asset");

        addAmbiguity(
          `Unsupported or unrecognized asset '${modelAsset}'. Current verified HedgeOS protection path supports ETH/WETH and BTC/cbBTC.`
        );
      } else {
        const groundedPhrase =
          this.findAssetPhrase(
            prompt,
            canonicalAsset
          );

        if (!groundedPhrase) {
          addMissing("asset");

          addAmbiguity(
            `The model suggested ${canonicalAsset}, but that asset is not explicitly grounded in the user's text.`
          );
        } else {
          assetField = {
            value:
              canonicalAsset,

            source:
              "USER_EXPLICIT",

            confidence: 1,

            requiresConfirmation:
              false,

            originalPhrase:
              groundedPhrase,

            rawUserInput:
              prompt,
          };
        }
      }
    } else {
      addMissing("asset");
    }

    let exposureAmountField:
      FieldProvenance<TokenAmount> | null =
      null;

    const rawExposure =
      dto.exposureAmount?.value !==
        undefined &&
        dto.exposureAmount?.value !==
        null
        ? String(
          dto.exposureAmount.value
        ).trim()
        : "";

    const modelExposureUnit =
      dto.exposureAmount?.unit
        ? this.canonicalAsset(
          dto.exposureAmount.unit
        )
        : null;

    const modelDeclaredAsset =
      dto.asset?.value
        ? this.canonicalAsset(
          dto.asset.value
        )
        : null;

    if (
      dto.exposureAmount?.unit &&
      modelDeclaredAsset &&
      modelExposureUnit !== modelDeclaredAsset
    ) {
      addAmbiguity(
        `Inconsistent exposure unit '${dto.exposureAmount.unit}' for asset '${dto.asset?.value}'.`
      );
    }

    if (
      rawExposure &&
      assetField
    ) {
      const groundedAsset =
        this.canonicalAsset(
          assetField.value
        );

      if (!groundedAsset) {
        addMissing(
          "exposureAmount"
        );

        addAmbiguity(
          "Exposure asset could not be normalized to a supported asset."
        );
      } else {
        const declaredUnit =
          dto.exposureAmount?.unit
            ? this.canonicalAsset(
              dto.exposureAmount.unit
            )
            : null;

        if (
          dto.exposureAmount?.unit &&
          declaredUnit !== groundedAsset
        ) {
          addMissing(
            "exposureAmount"
          );

          addAmbiguity(
            `Inconsistent exposure unit '${dto.exposureAmount.unit}' for asset '${groundedAsset}'.`
          );
        } else {
        const decimals =
          groundedAsset === "BTC"
            ? 8
            : 18;

        try {
          const parsedExposure =
            parseExactDecimal(
              rawExposure,
              decimals,
              groundedAsset
            );

          if (
            BigInt(
              parsedExposure
                .amountBaseUnits
            ) <= 0n
          ) {
            throw new Error(
              "Exposure must be positive"
            );
          }

          const groundedPhrase =
            this.findExactExposurePhrase(
              prompt,
              parsedExposure,
              groundedAsset
            );

          if (!groundedPhrase) {
            addMissing(
              "exposureAmount"
            );

            addAmbiguity(
              `The model suggested exposure '${rawExposure} ${groundedAsset}', but that exact quantity is not grounded in the user's text.`
            );
          } else {
            exposureAmountField = {
              value:
                parsedExposure,

              source:
                "USER_EXPLICIT",

              confidence: 1,

              requiresConfirmation:
                false,

              originalPhrase:
                groundedPhrase,

              rawUserInput:
                prompt,
            };
          }
        } catch {
          addMissing(
            "exposureAmount"
          );

          addAmbiguity(
            `Invalid exposure amount '${rawExposure}'. A positive exactly representable quantity is required.`
          );
        }
        }
      }
    } else {
      addMissing(
        "exposureAmount"
      );
    }

    let targetMaxLossField:
      FieldProvenance<number> | null =
      null;

    const rawLoss =
      dto.targetMaxLossPercent
        ?.value;

    if (
      rawLoss !==
      undefined &&
      rawLoss !== null &&
      String(rawLoss).trim() !==
      ""
    ) {
      const normalizedLoss =
        String(rawLoss)
          .replace("%", "")
          .trim();

      const parsedLoss =
        Number(
          normalizedLoss
        );

      if (
        !Number.isFinite(
          parsedLoss
        ) ||
        parsedLoss <= 0 ||
        parsedLoss > 100
      ) {
        addMissing(
          "targetMaxLossPercent"
        );

        addAmbiguity(
          `Invalid maximum loss percentage '${String(
            rawLoss
          )}'. Enter a value greater than 0% and no more than 100%.`
        );
      } else {
        const groundedPhrase =
          this.findExactLossPhrase(
            prompt,
            parsedLoss
          );

        if (!groundedPhrase) {
          addMissing(
            "targetMaxLossPercent"
          );

          addAmbiguity(
            `The model suggested a ${parsedLoss}% maximum loss, but that exact percentage is not explicitly grounded in the user's text.`
          );
        } else {
          targetMaxLossField = {
            value:
              parsedLoss,

            source:
              "USER_EXPLICIT",

            confidence: 1,

            requiresConfirmation:
              false,

            originalPhrase:
              groundedPhrase,

            rawUserInput:
              prompt,
          };
        }
      }
    } else {
      addMissing(
        "targetMaxLossPercent"
      );
    }

    let maxPremiumField:
      FieldProvenance<TokenAmount> | null =
      null;

    const rawBudget =
      dto.maxPremium?.value !==
        undefined &&
        dto.maxPremium?.value !==
        null
        ? String(
          dto.maxPremium.value
        ).trim()
        : "";

    const rawCurrency =
      dto.maxPremium?.currency
        ?.trim()
        .toUpperCase();

    if (rawBudget) {
      if (
        rawCurrency &&
        rawCurrency !==
        "USDC"
      ) {
        addMissing(
          "maxPremiumUSDC"
        );

        addAmbiguity(
          `Unsupported budget currency '${rawCurrency}'. The current HedgeOS execution path requires a USDC protection budget.`
        );
      } else {
        try {
          const parsedBudget =
            parseExactDecimal(
              rawBudget,
              6,
              "USDC"
            );

          if (
            BigInt(
              parsedBudget
                .amountBaseUnits
            ) < 0n
          ) {
            throw new Error(
              "Negative budget"
            );
          }

          const groundedPhrase =
            this.findExactBudgetPhrase(
              prompt,
              parsedBudget
            );

          if (!groundedPhrase) {
            addMissing(
              "maxPremiumUSDC"
            );

            addAmbiguity(
              `The model suggested a ${rawBudget} USDC protection budget, but that exact budget is not explicitly grounded in the user's text.`
            );
          } else {
            maxPremiumField = {
              value:
                parsedBudget,

              source:
                "USER_EXPLICIT",

              confidence: 1,

              requiresConfirmation:
                false,

              originalPhrase:
                groundedPhrase,

              rawUserInput:
                prompt,
            };
          }
        } catch {
          addMissing(
            "maxPremiumUSDC"
          );

          addAmbiguity(
            `Invalid premium budget '${rawBudget}'. The budget must be a non-negative USDC amount.`
          );
        }
      }
    } else {
      addMissing(
        "maxPremiumUSDC"
      );
    }

    let horizonField:
      FieldProvenance<HorizonTarget> | null =
      null;

    const horizonResult =
      this.resolveGroundedHorizon(
        prompt,
        nowMs
      );

    if (horizonResult) {
      if (
        horizonResult.value
          .timestampMs <= nowMs
      ) {
        addMissing(
          "horizonTimestamp"
        );

        addAmbiguity(
          "Protection horizon must resolve to a future timestamp."
        );
      } else {
        horizonField =
          horizonResult;
      }
    } else {
      addMissing(
        "horizonTimestamp"
      );

      if (
        dto.horizon?.rawText
      ) {
        addAmbiguity(
          `The model suggested horizon '${dto.horizon.rawText}', but HedgeOS could not independently ground and resolve that horizon from the user's text.`
        );
      }
    }

    const groundedSpreadPhrase =
      prompt.match(
        /\b(?:allow\s+(?:a\s+)?put\s+spread|allow\s+put\s+spreads?|allow\s+multi-leg|use\s+(?:a\s+)?put\s+spread|put\s+spread\s+is\s+(?:okay|ok)|multi-leg\s+is\s+(?:okay|ok))\b/i
      );

    const multiLegGranted =
      Boolean(
        groundedSpreadPhrase
      );

    const multiLegField:
      FieldProvenance<boolean> =
    {
      value:
        multiLegGranted,

      source:
        multiLegGranted
          ? "USER_EXPLICIT"
          : "SYSTEM_DEFAULT",

      confidence: 1,

      requiresConfirmation:
        false,

      originalPhrase:
        groundedSpreadPhrase?.[0],

      rawUserInput:
        multiLegGranted
          ? prompt
          : undefined,
    };

    if (
      Array.isArray(
        dto.ambiguities
      )
    ) {
      for (
        const ambiguity of
        dto.ambiguities
      ) {
        if (
          typeof ambiguity ===
          "string" &&
          ambiguity.trim()
        ) {
          addAmbiguity(
            ambiguity.trim()
          );
        }
      }
    }

    const ambiguitiesList:
      AmbiguityResolution[] =
      ambiguitiesFound.map(
        (reason) => ({
          field:
            this.inferAmbiguityField(
              reason
            ),

          detectedText: "",

          reason,

          suggestedValue:
            undefined,
        })
      );

    const requiresClarification =
      unsupportedObjective ||
      missingFields.length > 0 ||
      ambiguitiesFound.length > 0 ||
      Boolean(
        horizonField
          ?.requiresConfirmation
      );

    const candidateDraft:
      ParsedRiskIntentDraft =
    {
      intentId:
        `intent-${Math.random()
          .toString(36)
          .substring(2, 9)}`,

      version: 1,

      createdAtMs:
        nowMs,

      updatedAtMs:
        nowMs,

      confirmedByUser:
        false,

      objective:
        objectiveField,

      asset:
        assetField,

      exposureAmount:
        exposureAmountField,

      targetMaxLossPercent:
        targetMaxLossField,

      maxPremiumUSDC:
        maxPremiumField,

      horizonTimestamp:
        horizonField,

      allowedProtocols: {
        value: [
          "THETANUTS",
        ],

        source:
          "SYSTEM_DEFAULT",

        confidence: 1,

        requiresConfirmation:
          false,
      },

      allowMultiLeg:
        multiLegField,

      missingFields,

      ambiguitiesFound:
        ambiguitiesList,

      requiresClarification,

      originalPromptText:
        prompt,

      providerMetadata,
    };

    return {
      candidateDraft,

      missingFields,

      ambiguitiesFound,

      requiresClarification,

      unsupportedObjective,

      unsupportedObjectiveReason,
    };
  }

  private static canonicalAsset(
    rawAsset: string
  ): "ETH" | "BTC" | null {
    const value =
      rawAsset
        .trim()
        .toUpperCase();

    if (
      value === "ETH" ||
      value === "WETH"
    ) {
      return "ETH";
    }

    if (
      value === "BTC" ||
      value === "CBBTC"
    ) {
      return "BTC";
    }

    return null;
  }

  private static findAssetPhrase(
    prompt: string,
    asset: "ETH" | "BTC"
  ): string | undefined {
    const regex =
      asset === "ETH"
        ? /\b(?:ETH|WETH)\b/i
        : /\b(?:BTC|CBBTC)\b/i;

    return prompt.match(
      regex
    )?.[0];
  }

  private static findExactExposurePhrase(
    prompt: string,
    expected: TokenAmount,
    asset: "ETH" | "BTC"
  ): string | undefined {
    const regex =
      asset === "ETH"
        ? /(-?\d+(?:\.\d+)?)\s*(ETH|WETH)\b/gi
        : /(-?\d+(?:\.\d+)?)\s*(BTC|CBBTC)\b/gi;

    for (
      const match of
      prompt.matchAll(regex)
    ) {
      try {
        const parsed =
          parseExactDecimal(
            match[1],
            expected.decimals,
            expected.symbol
          );

        if (
          BigInt(
            parsed.amountBaseUnits
          ) ===
          BigInt(
            expected.amountBaseUnits
          )
        ) {
          return match[0];
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private static findExactLossPhrase(
    prompt: string,
    expectedPercent: number
  ): string | undefined {
    const regex =
      /(-?\d+(?:\.\d+)?)\s*(%|percent\b|pct\b)/gi;

    for (
      const match of
      prompt.matchAll(regex)
    ) {
      const value =
        Number(match[1]);

      if (
        Number.isFinite(value) &&
        value === expectedPercent
      ) {
        return match[0];
      }
    }

    return undefined;
  }

  private static findExactBudgetPhrase(
    prompt: string,
    expected: TokenAmount
  ): string | undefined {
    const regex =
      /(-?\d+(?:\.\d+)?)\s*USDC\b/gi;

    for (
      const match of
      prompt.matchAll(regex)
    ) {
      try {
        const parsed =
          parseExactDecimal(
            match[1],
            6,
            "USDC"
          );

        if (
          BigInt(
            parsed.amountBaseUnits
          ) ===
          BigInt(
            expected.amountBaseUnits
          )
        ) {
          return match[0];
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private static resolveGroundedHorizon(
    prompt: string,
    nowMs: number
  ):
    | FieldProvenance<HorizonTarget>
    | null {
    const isoMatch =
      prompt.match(
        /\b(\d{4}-\d{2}-\d{2})\b/
      );

    if (isoMatch) {
      try {
        const value =
          parseIsoDateMYT(
            isoMatch[1]
          );

        return {
          value,

          source:
            "USER_EXPLICIT",

          confidence: 1,

          requiresConfirmation:
            false,

          originalPhrase:
            isoMatch[0],

          rawUserInput:
            prompt,
        };
      } catch {
        return null;
      }
    }

    const daysMatch =
      prompt.match(
        /\b(?:for|in)\s+(\d+)\s+days?\b/i
      );

    if (daysMatch) {
      const days =
        Number(
          daysMatch[1]
        );

      if (
        Number.isInteger(days) &&
        days > 0
      ) {
        return {
          value:
            formatCustomHorizon(
              nowMs +
              days *
              ONE_DAY_MS
            ),

          source:
            "PARSER_INFERRED",

          confidence: 0.95,

          requiresConfirmation:
            true,

          originalPhrase:
            daysMatch[0],

          rawUserInput:
            prompt,
        };
      }
    }

    const nextWeekMatch =
      prompt.match(
        /\bnext\s+week\b/i
      );

    if (nextWeekMatch) {
      const nextFriday =
        getNextFridayMYT(
          nowMs
        );

      return {
        value:
          formatCustomHorizon(
            nextFriday
              .timestampMs +
            7 *
            ONE_DAY_MS
          ),

        source:
          "PARSER_INFERRED",

        confidence: 0.9,

        requiresConfirmation:
          true,

        originalPhrase:
          nextWeekMatch[0],

        rawUserInput:
          prompt,
      };
    }

    const thisWeekMatch =
      prompt.match(
        /\bthis\s+week\b/i
      );

    if (thisWeekMatch) {
      return {
        value:
          getNextFridayMYT(
            nowMs
          ),

        source:
          "PARSER_INFERRED",

        confidence: 0.9,

        requiresConfirmation:
          true,

        originalPhrase:
          thisWeekMatch[0],

        rawUserInput:
          prompt,
      };
    }

    const weekendMatch =
      prompt.match(
        /\b(?:this\s+)?weekend\b/i
      );

    if (weekendMatch) {
      return {
        value:
          getNextFridayMYT(
            nowMs
          ),

        source:
          "PARSER_INFERRED",

        confidence: 0.9,

        requiresConfirmation:
          true,

        originalPhrase:
          weekendMatch[0],

        rawUserInput:
          prompt,
      };
    }

    const fridayMatch =
      prompt.match(
        /\b(?:until|through|by)?\s*friday\b/i
      );

    if (fridayMatch) {
      return {
        value:
          getNextFridayMYT(
            nowMs
          ),

        source:
          "PARSER_INFERRED",

        confidence: 0.95,

        requiresConfirmation:
          true,

        originalPhrase:
          fridayMatch[0].trim(),

        rawUserInput:
          prompt,
      };
    }

    return null;
  }

  private static inferAmbiguityField(
    reason: string
  ): string {
    const lower =
      reason.toLowerCase();

    if (
      lower.includes("asset")
    ) {
      return "asset";
    }

    if (
      lower.includes(
        "exposure"
      )
    ) {
      return "exposureAmount";
    }

    if (
      lower.includes("loss") ||
      lower.includes(
        "percentage"
      )
    ) {
      return "targetMaxLossPercent";
    }

    if (
      lower.includes(
        "budget"
      ) ||
      lower.includes(
        "premium"
      ) ||
      lower.includes("usdc")
    ) {
      return "maxPremiumUSDC";
    }

    if (
      lower.includes(
        "horizon"
      ) ||
      lower.includes("date")
    ) {
      return "horizonTimestamp";
    }

    return "intent";
  }
}
