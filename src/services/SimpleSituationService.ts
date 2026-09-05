import { AIIntentProvider } from "../providers/interfaces/AIIntentProvider";
import {
  FactualGroundingCheck,
  FieldProvenance,
  HorizonTarget,
  ProtectionSituation,
  TokenAmount,
} from "../types";

/**
 * Simple Mode extracts factual context only.
 *
 * IMPORTANT:
 * - AI output is an untrusted draft.
 * - This service never accepts model-selected budget or downside targets.
 * - Asset, exposure and horizon must be grounded in the user's text.
 * - Relative horizon phrases may be resolved deterministically, but the
 *   resolved timestamp remains an interpretation and requires confirmation.
 */
export class SimpleSituationService {
  constructor(
    private provider: AIIntentProvider
  ) { }

  public async parse(
    prompt: string
  ): Promise<ProtectionSituation> {
    const safePrompt =
      typeof prompt === "string"
        ? prompt.trim()
        : "";

    if (!safePrompt) {
      throw new Error(
        "A protection situation description is required"
      );
    }

    const parsed =
      await this.provider.parseNaturalLanguage(
        safePrompt
      );

    if (parsed.unsupportedObjective) {
      throw new Error(
        parsed.unsupportedObjectiveReason ||
        "Unsupported objective"
      );
    }

    const draft = parsed.candidateDraft;

    /*
     * Simple Mode deliberately ignores:
     *
     * - targetMaxLossPercent
     * - maxPremiumUSDC
     * - allowMultiLeg
     *
     * Those are financial preferences. They must not be invented
     * by the AI when the user only describes their situation.
     */

    const groundingChecks:
      FactualGroundingCheck[] = [];

    const asset =
      this.validateAssetGrounding(
        draft.asset,
        safePrompt,
        groundingChecks
      );

    const exposureAmount =
      this.validateExposureGrounding(
        draft.exposureAmount,
        safePrompt,
        asset?.value || null,
        groundingChecks
      );

    const horizonTimestamp =
      this.validateHorizonGrounding(
        draft.horizonTimestamp,
        safePrompt,
        groundingChecks
      );

    const concernGrounded =
      this.hasExplicitDownsideConcern(
        safePrompt
      );

    const concern:
      ProtectionSituation["concern"] =
    {
      value: "PRICE_FALL",

      source: concernGrounded
        ? "USER_EXPLICIT"
        : "SYSTEM_DEFAULT",

      confidence: concernGrounded
        ? 1
        : 0.5,

      requiresConfirmation:
        !concernGrounded,

      originalPhrase:
        concernGrounded
          ? this.findConcernPhrase(
            safePrompt
          )
          : undefined,

      rawUserInput:
        concernGrounded
          ? safePrompt
          : undefined,
    };

    groundingChecks.push({
      field: "CONCERN",

      value: "PRICE_FALL",

      evidenceText:
        concern.originalPhrase,

      grounded: concernGrounded,

      source: concern.source,

      requiresConfirmation:
        concern.requiresConfirmation,

      details: concernGrounded
        ? "The user's text explicitly expresses downside-protection concern."
        : "The user did not explicitly express a price-fall concern. PRICE_FALL is therefore only a product-context default and requires confirmation.",
    });

    const missingFactualFields:
      string[] = [];

    if (!asset) {
      missingFactualFields.push(
        "asset"
      );
    }

    if (!exposureAmount) {
      missingFactualFields.push(
        "exposureAmount"
      );
    }

    if (!horizonTimestamp) {
      missingFactualFields.push(
        "horizonTimestamp"
      );
    }

    if (
      concern.requiresConfirmation
    ) {
      missingFactualFields.push(
        "concern"
      );
    }

    return {
      asset,
      exposureAmount,
      horizonTimestamp,
      concern,
      missingFactualFields,
      groundingChecks,
      providerMetadata:
        parsed.providerMetadata,
      originalPromptText:
        safePrompt,
    };
  }

  private validateAssetGrounding(
    field:
      | FieldProvenance<string>
      | null,
    prompt: string,
    checks: FactualGroundingCheck[]
  ): FieldProvenance<string> | null {
    if (!field?.value) {
      checks.push({
        field: "ASSET",
        value: "",
        grounded: false,
        source: "AI_INFERRED",
        requiresConfirmation: true,
        details:
          "No asset was extracted from the user's text.",
      });

      return null;
    }

    const normalizedAsset =
      field.value
        .trim()
        .toUpperCase();

    const grounded =
      this.assetAppearsInPrompt(
        normalizedAsset,
        prompt
      );

    checks.push({
      field: "ASSET",

      value: normalizedAsset,

      evidenceText:
        field.originalPhrase ||
        field.rawUserInput,

      grounded,

      source: grounded
        ? "USER_EXPLICIT"
        : field.source,

      requiresConfirmation:
        !grounded ||
        field.requiresConfirmation,

      details: grounded
        ? `Asset ${normalizedAsset} is explicitly grounded in the user's text.`
        : `Extracted asset ${normalizedAsset} is not grounded in the user's text and will not be used for financial discovery.`,
    });

    /*
     * Fail closed.
     * An AI-invented asset never reaches deterministic discovery.
     */
    if (!grounded) {
      return null;
    }

    return {
      ...field,

      value: normalizedAsset,

      source: "USER_EXPLICIT",

      confidence: 1,

      requiresConfirmation: false,

      rawUserInput: prompt,
    };
  }

  private validateExposureGrounding(
    field:
      | FieldProvenance<TokenAmount>
      | null,
    prompt: string,
    asset: string | null,
    checks: FactualGroundingCheck[]
  ): FieldProvenance<TokenAmount> | null {
    if (!field?.value || !asset) {
      checks.push({
        field:
          "EXPOSURE_AMOUNT",

        value: "",

        grounded: false,

        source:
          field?.source ||
          "AI_INFERRED",

        requiresConfirmation:
          true,

        details:
          "No usable exposure amount was grounded together with an explicit asset.",
      });

      return null;
    }

    let positive = false;

    try {
      positive =
        BigInt(
          field.value.amountBaseUnits
        ) > 0n;
    } catch {
      positive = false;
    }

    const amountGrounded =
      this.exposureAppearsInPrompt(
        field,
        asset,
        prompt
      );

    const grounded =
      positive &&
      amountGrounded;

    checks.push({
      field:
        "EXPOSURE_AMOUNT",

      value:
        `${field.value.amountBaseUnits}:${field.value.decimals}:${field.value.symbol}`,

      evidenceText:
        field.originalPhrase ||
        field.rawUserInput,

      grounded,

      source: grounded
        ? "USER_EXPLICIT"
        : field.source,

      requiresConfirmation:
        !grounded ||
        field.requiresConfirmation,

      details: grounded
        ? "Exposure quantity and asset are explicitly grounded in the user's text."
        : "The extracted exposure quantity is not sufficiently grounded in the user's text and will not be used for financial discovery.",
    });

    if (!grounded) {
      return null;
    }

    return {
      ...field,

      source:
        "USER_EXPLICIT",

      confidence: 1,

      requiresConfirmation:
        false,

      rawUserInput:
        prompt,
    };
  }

  private validateHorizonGrounding(
    field:
      | FieldProvenance<HorizonTarget>
      | null,
    prompt: string,
    checks: FactualGroundingCheck[]
  ): FieldProvenance<HorizonTarget> | null {
    if (!field?.value) {
      checks.push({
        field: "HORIZON",

        value: "",

        grounded: false,

        source:
          "AI_INFERRED",

        requiresConfirmation:
          true,

        details:
          "No protection horizon was extracted.",
      });

      return null;
    }

    const groundedPhrase =
      this.findHorizonPhrase(
        prompt
      );

    const grounded =
      Boolean(groundedPhrase);

    const future =
      Number.isFinite(
        field.value.timestampMs
      ) &&
      field.value.timestampMs >
      Date.now();

    if (
      !grounded ||
      !future
    ) {
      checks.push({
        field: "HORIZON",

        value:
          String(
            field.value.timestampMs
          ),

        evidenceText:
          groundedPhrase ||
          field.originalPhrase,

        grounded: false,

        source: field.source,

        requiresConfirmation:
          true,

        details: !future
          ? "Resolved horizon is not a valid future timestamp."
          : "The resolved horizon is not grounded in a horizon phrase from the user's text.",
      });

      return null;
    }

    /*
     * Explicit calendar dates are exact enough to remain
     * USER_EXPLICIT.
     *
     * Relative phrases such as:
     * - this week
     * - Friday
     * - next week
     * - 7 days
     *
     * require deterministic timestamp resolution. The phrase itself
     * is user-explicit, but the exact timestamp is parser-derived.
     */
    const exactDate =
      groundedPhrase !== undefined &&
      /\b\d{4}-\d{2}-\d{2}\b/.test(
        groundedPhrase
      );

    const relativeResolution =
      !exactDate;

    checks.push({
      field: "HORIZON",

      value:
        String(
          field.value.timestampMs
        ),

      evidenceText:
        groundedPhrase,

      grounded: true,

      source:
        relativeResolution
          ? "PARSER_INFERRED"
          : "USER_EXPLICIT",

      requiresConfirmation:
        relativeResolution ||
        field.requiresConfirmation,

      details:
        relativeResolution
          ? `The user explicitly stated '${groundedPhrase}', but its exact timestamp was deterministically resolved and must be confirmed before it becomes authoritative.`
          : "The user supplied an explicit calendar horizon.",
    });

    return {
      ...field,

      source:
        relativeResolution
          ? "PARSER_INFERRED"
          : "USER_EXPLICIT",

      confidence:
        exactDate
          ? 1
          : 0.95,

      requiresConfirmation:
        relativeResolution ||
        field.requiresConfirmation,

      originalPhrase:
        groundedPhrase,

      rawUserInput:
        prompt,
    };
  }

  private assetAppearsInPrompt(
    asset: string,
    prompt: string
  ): boolean {
    if (
      asset === "ETH" ||
      asset === "WETH"
    ) {
      return /\b(?:ETH|WETH)\b/i.test(
        prompt
      );
    }

    if (
      asset === "BTC" ||
      asset === "CBBTC"
    ) {
      return /\b(?:BTC|CBBTC)\b/i.test(
        prompt
      );
    }

    if (asset === "SOL") {
      return /\bSOL\b/i.test(prompt);
    }

    return new RegExp(
      `\\b${this.escapeRegex(
        asset
      )}\\b`,
      "i"
    ).test(prompt);
  }

  private exposureAppearsInPrompt(
    field: FieldProvenance<TokenAmount>,
    asset: string,
    prompt: string
  ): boolean {
    /*
     * Prefer the original extracted phrase when available.
     */
    if (
      field.originalPhrase &&
      this.containsPhrase(
        prompt,
        field.originalPhrase
      )
    ) {
      return true;
    }

    /*
     * Otherwise require an actual numeric amount adjacent to the
     * asset symbol. This prevents the model from inventing a
     * quantity merely because the asset itself appears.
     */
    const aliases =
      asset === "ETH" ||
        asset === "WETH"
        ? "(?:ETH|WETH)"
        : asset === "BTC" ||
          asset === "CBBTC"
          ? "(?:BTC|CBBTC)"
          : this.escapeRegex(
            asset
          );

    const regex =
      new RegExp(
        `\\b\\d+(?:\\.\\d+)?\\s*${aliases}\\b`,
        "i"
      );

    return regex.test(prompt);
  }

  private findHorizonPhrase(
    prompt: string
  ): string | undefined {
    const patterns: RegExp[] = [
      /\b\d{4}-\d{2}-\d{2}\b/i,

      /\b(?:until|through|by)?\s*friday\b/i,

      /\bthis\s+week\b/i,

      /\bnext\s+week\b/i,

      /\b(?:this\s+)?weekend\b/i,

      /\b(?:for|in)\s+\d+\s+days?\b/i,
    ];

    for (const pattern of patterns) {
      const match =
        prompt.match(pattern);

      if (match?.[0]) {
        return match[0].trim();
      }
    }

    return undefined;
  }

  private hasExplicitDownsideConcern(
    prompt: string
  ): boolean {
    return /\b(?:protect|protection|hedge|hedging|worried|worry|fall|falling|drop|dropping|decline|declining|downside|loss|lose|losing|crash|fall in price|price fall)\b/i.test(
      prompt
    );
  }

  private findConcernPhrase(
    prompt: string
  ): string | undefined {
    const match =
      prompt.match(
        /\b(?:protect(?:ion)?|hedg(?:e|ing)|worried|worry|fall(?:ing)?|drop(?:ping)?|declin(?:e|ing)|downside|loss|lose|losing|crash)\b/i
      );

    return match?.[0];
  }

  private containsPhrase(
    prompt: string,
    phrase: string
  ): boolean {
    const normalizedPrompt =
      prompt
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    const normalizedPhrase =
      phrase
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

    return (
      normalizedPhrase.length > 0 &&
      normalizedPrompt.includes(
        normalizedPhrase
      )
    );
  }

  private escapeRegex(
    value: string
  ): string {
    return value.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
  }
}