import {
  AIIntentProvider,
  ParseResult,
} from "../providers/interfaces/AIIntentProvider";
import { PROMPT_VERSION } from "../providers/prompts/intentExtractionPrompt";
import {
  HorizonTarget,
  LLMProviderMetadata,
  ParsedRiskIntentDraft,
} from "../types";
import { parseExactDecimal } from "../utils/decimalParser";

const MYT_OFFSET_MS =
  8 * 60 * 60 * 1000;

const ONE_DAY_MS =
  24 * 60 * 60 * 1000;

/* ================================================================
 * TIME HELPERS
 * ================================================================ */

function formatMYTHorizon(
  timestampMs: number
): HorizonTarget {
  if (
    !Number.isFinite(
      timestampMs
    ) ||
    timestampMs <= 0
  ) {
    throw new Error(
      "Invalid horizon timestamp"
    );
  }

  const date =
    new Date(timestampMs);

  const options:
    Intl.DateTimeFormatOptions =
  {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    timeZone:
      "Asia/Kuala_Lumpur",
    hour12: true,
  };

  return {
    timestampMs,

    isoString:
      date.toISOString(),

    formattedDisplay:
      `${new Intl.DateTimeFormat(
        "en-US",
        options
      ).format(date)} MYT`,

    timezone:
      "Asia/Kuala_Lumpur (MYT, UTC+8)",
  };
}

/**
 * Resolves the next Friday at 23:59:59.999 MYT.
 *
 * IMPORTANT:
 * The returned timestamp is deterministic parser output.
 * Whether it requires confirmation is decided by the caller.
 */
export function getNextFridayMYT(
  nowMs: number = Date.now()
): HorizonTarget {
  const nowMYT =
    new Date(
      nowMs + MYT_OFFSET_MS
    );

  const year =
    nowMYT.getUTCFullYear();

  const month =
    nowMYT.getUTCMonth();

  const date =
    nowMYT.getUTCDate();

  const day =
    nowMYT.getUTCDay();

  const daysUntilFriday =
    (5 - day + 7) % 7;

  let targetUtcMs =
    Date.UTC(
      year,
      month,
      date + daysUntilFriday,
      23,
      59,
      59,
      999
    ) - MYT_OFFSET_MS;

  /*
   * If it is already after Friday end-of-day MYT,
   * move to the following Friday.
   */
  if (targetUtcMs <= nowMs) {
    targetUtcMs +=
      7 * ONE_DAY_MS;
  }

  return formatMYTHorizon(
    targetUtcMs
  );
}

function getFollowingFridayMYT(
  nowMs: number = Date.now()
): HorizonTarget {
  const nextFriday =
    getNextFridayMYT(
      nowMs
    );

  return formatMYTHorizon(
    nextFriday.timestampMs +
    7 * ONE_DAY_MS
  );
}

/**
 * Explicit YYYY-MM-DD dates resolve to end-of-day MYT.
 */
export function parseIsoDateMYT(
  dateStr: string
): HorizonTarget {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      dateStr
    );

  if (!match) {
    throw new Error(
      `Invalid date format '${dateStr}': expected YYYY-MM-DD`
    );
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error(
      `Invalid date values in '${dateStr}'`
    );
  }

  /*
   * Reject impossible dates such as 2026-02-31.
   */
  const calendarCheck =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  if (
    calendarCheck.getUTCFullYear() !==
    year ||
    calendarCheck.getUTCMonth() !==
    month - 1 ||
    calendarCheck.getUTCDate() !==
    day
  ) {
    throw new Error(
      `Non-existent calendar date '${dateStr}'`
    );
  }

  const targetUtcMs =
    Date.UTC(
      year,
      month - 1,
      day,
      23,
      59,
      59,
      999
    ) - MYT_OFFSET_MS;

  return formatMYTHorizon(
    targetUtcMs
  );
}

export function formatCustomHorizon(
  timestampMs: number
): HorizonTarget {
  return formatMYTHorizon(
    timestampMs
  );
}

/* ================================================================
 * DETERMINISTIC DEVELOPMENT ADAPTER
 * ================================================================ */

export class IntentEngine
  implements AIIntentProvider {
  public readonly adapterName =
    "DEVELOPMENT_ADAPTER" as const;

  public readonly providerType =
    "DEVELOPMENT_ADAPTER" as const;

  public async parseNaturalLanguage(
    prompt: string
  ): Promise<ParseResult> {
    const requestStartedAtMs =
      Date.now();

    const nowMs =
      requestStartedAtMs;

    const safePrompt =
      typeof prompt === "string"
        ? prompt.trim()
        : "";

    const ambiguities:
      string[] = [];

    const missingFields:
      string[] = [];

    const addMissingField = (
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
        !ambiguities.includes(
          message
        )
      ) {
        ambiguities.push(
          message
        );
      }
    };

    /* ============================================================
     * 1. OBJECTIVE SCOPE
     * ============================================================ */

    const isUnsupported =
      /\b(leverage|leveraged|speculate|speculation|arbitrage|staking|stake|flash loan|trading bot|yield farming|yield generation|naked call|short call|10x)\b/i.test(
        safePrompt
      );

    const unsupportedObjective =
      isUnsupported;

    const unsupportedObjectiveReason =
      unsupportedObjective
        ? "HedgeOS currently supports Downside Protection intents only. Speculation, yield generation, leverage, arbitrage, and autonomous trading strategies are not supported in this MVP."
        : undefined;

    /* ============================================================
     * 2. ASSET
     *
     * Only explicit ETH/WETH or BTC/cbBTC text is accepted.
     * ============================================================ */

    const unsupportedAssetMatch =
      safePrompt.match(
        /\bSOL\b/i
      );

    if (
      unsupportedAssetMatch
    ) {
      addAmbiguity(
        "SOL is not currently supported by HedgeOS's verified protective-option sizing path. Current verified assets are ETH/WETH and BTC/cbBTC."
      );
    }

    const explicitAssetMatch =
      safePrompt.match(
        /\b(ETH|WETH|BTC|CBBTC)\b/i
      );

    let assetValue:
      "ETH" | "BTC" | null =
      null;

    let assetPhrase:
      string | undefined;

    if (
      explicitAssetMatch?.[1]
    ) {
      const rawAsset =
        explicitAssetMatch[1]
          .toUpperCase();

      assetValue =
        rawAsset === "ETH" ||
          rawAsset === "WETH"
          ? "ETH"
          : "BTC";

      assetPhrase =
        explicitAssetMatch[0];
    } else {
      addMissingField(
        "asset"
      );
    }

    /* ============================================================
     * 3. EXPOSURE
     *
     * Quantity must be directly adjacent to a supported asset.
     * Example:
     *   2 ETH
     *   0.5 BTC
     *
     * The parser never invents exposure from the asset alone.
     * ============================================================ */

    const amountMatch =
      safePrompt.match(
        /(-?\d+(?:\.\d+)?)\s*(ETH|WETH|BTC|CBBTC)\b/i
      );

    let exposureAmountValue:
      ParsedRiskIntentDraft["exposureAmount"] =
      null;

    if (
      amountMatch &&
      assetValue
    ) {
      const rawAmount =
        amountMatch[1];

      const amountAsset =
        amountMatch[2]
          .toUpperCase();

      const canonicalAmountAsset:
        "ETH" | "BTC" =
        amountAsset === "ETH" ||
          amountAsset === "WETH"
          ? "ETH"
          : "BTC";

      if (
        canonicalAmountAsset !==
        assetValue
      ) {
        addMissingField(
          "exposureAmount"
        );

        addAmbiguity(
          `Exposure quantity refers to ${canonicalAmountAsset}, while the resolved asset is ${assetValue}.`
        );
      } else {
        try {
          const decimals =
            assetValue === "BTC"
              ? 8
              : 18;

          const parsedAmount =
            parseExactDecimal(
              rawAmount,
              decimals,
              assetValue
            );

          if (
            BigInt(
              parsedAmount
                .amountBaseUnits
            ) <= 0n
          ) {
            throw new Error(
              "Exposure must be positive"
            );
          }

          exposureAmountValue =
          {
            value:
              parsedAmount,

            source:
              "USER_EXPLICIT",

            confidence: 1,

            requiresConfirmation:
              false,

            originalPhrase:
              amountMatch[0],

            rawUserInput:
              safePrompt,
          };
        } catch {
          addMissingField(
            "exposureAmount"
          );

          addAmbiguity(
            `Exposure amount '${rawAmount}' is invalid or cannot be represented exactly for ${assetValue}.`
          );
        }
      }
    } else {
      addMissingField(
        "exposureAmount"
      );
    }

    /* ============================================================
     * 4. TARGET MAX LOSS
     *
     * Financial thresholds require an explicit percent marker.
     *
     * Accepted:
     *   8%
     *   8 percent
     *   8 pct
     *
     * We deliberately DO NOT convert "max loss 8" into 8%.
     * ============================================================ */

    const lossMatch =
      safePrompt.match(
        /(-?\d+(?:\.\d+)?)\s*(?:%|percent\b|pct\b)/i
      );

    let lossValue:
      ParsedRiskIntentDraft["targetMaxLossPercent"] =
      null;

    if (lossMatch) {
      const rawPercent =
        Number(
          lossMatch[1]
        );

      if (
        !Number.isFinite(
          rawPercent
        ) ||
        rawPercent <= 0 ||
        rawPercent > 100
      ) {
        addMissingField(
          "targetMaxLossPercent"
        );

        addAmbiguity(
          `Invalid maximum loss percentage '${lossMatch[1]}%'. Enter a value greater than 0% and no more than 100%.`
        );
      } else {
        lossValue = {
          value:
            rawPercent,

          source:
            "USER_EXPLICIT",

          confidence: 1,

          requiresConfirmation:
            false,

          originalPhrase:
            lossMatch[0],

          rawUserInput:
            safePrompt,
        };
      }
    } else {
      addMissingField(
        "targetMaxLossPercent"
      );
    }

    /* ============================================================
     * 5. PROTECTION BUDGET
     *
     * Current execution path requires explicit USDC.
     * ============================================================ */

    const budgetMatch =
      safePrompt.match(
        /(-?\d+(?:\.\d+)?)\s*USDC\b/i
      );

    let budgetValue:
      ParsedRiskIntentDraft["maxPremiumUSDC"] =
      null;

    if (budgetMatch) {
      const rawBudget =
        budgetMatch[1];

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

        budgetValue = {
          value:
            parsedBudget,

          source:
            "USER_EXPLICIT",

          confidence: 1,

          requiresConfirmation:
            false,

          originalPhrase:
            budgetMatch[0],

          rawUserInput:
            safePrompt,
        };
      } catch {
        addMissingField(
          "maxPremiumUSDC"
        );

        addAmbiguity(
          `Protection budget '${rawBudget} USDC' is invalid or cannot be represented exactly.`
        );
      }
    } else {
      addMissingField(
        "maxPremiumUSDC"
      );
    }

    /* ============================================================
     * 6. HORIZON
     *
     * CRITICAL PROVENANCE RULE:
     *
     * Explicit YYYY-MM-DD:
     *   USER_EXPLICIT
     *   requiresConfirmation = false
     *
     * Relative phrases:
     *   PARSER_INFERRED
     *   requiresConfirmation = true
     *
     * This is intentionally aligned with LLMOutputValidator and
     * SimpleSituationService.
     * ============================================================ */

    let horizonValue:
      ParsedRiskIntentDraft["horizonTimestamp"] =
      null;

    const isoDateMatch =
      safePrompt.match(
        /\b(\d{4}-\d{2}-\d{2})\b/
      );

    const daysMatch =
      safePrompt.match(
        /\b(?:for|in)\s+(\d+)\s+days?\b/i
      );

    const nextWeekMatch =
      safePrompt.match(
        /\bnext\s+week\b/i
      );

    const thisWeekMatch =
      safePrompt.match(
        /\bthis\s+week\b/i
      );

    const weekendMatch =
      safePrompt.match(
        /\b(?:this\s+)?weekend\b/i
      );

    const fridayMatch =
      safePrompt.match(
        /\b(?:until|through|by)?\s*friday\b/i
      );

    if (isoDateMatch) {
      try {
        const parsedHorizon =
          parseIsoDateMYT(
            isoDateMatch[1]
          );

        if (
          parsedHorizon.timestampMs <=
          nowMs
        ) {
          addMissingField(
            "horizonTimestamp"
          );

          addAmbiguity(
            `Requested horizon date (${isoDateMatch[1]}) is in the past. A future date is required.`
          );
        } else {
          horizonValue = {
            value:
              parsedHorizon,

            source:
              "USER_EXPLICIT",

            confidence: 1,

            requiresConfirmation:
              false,

            originalPhrase:
              isoDateMatch[0],

            rawUserInput:
              safePrompt,
          };
        }
      } catch {
        addMissingField(
          "horizonTimestamp"
        );

        addAmbiguity(
          `Invalid calendar date '${isoDateMatch[1]}'.`
        );
      }
    } else if (daysMatch) {
      const days =
        Number(
          daysMatch[1]
        );

      if (
        !Number.isInteger(days) ||
        days <= 0
      ) {
        addMissingField(
          "horizonTimestamp"
        );

        addAmbiguity(
          "Protection duration must be at least one day."
        );
      } else {
        horizonValue = {
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
            safePrompt,
        };
      }
    } else if (
      nextWeekMatch
    ) {
      horizonValue = {
        value:
          getFollowingFridayMYT(
            nowMs
          ),

        source:
          "PARSER_INFERRED",

        confidence: 0.9,

        requiresConfirmation:
          true,

        originalPhrase:
          nextWeekMatch[0],

        rawUserInput:
          safePrompt,
      };
    } else if (
      thisWeekMatch
    ) {
      horizonValue = {
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
          safePrompt,
      };
    } else if (
      weekendMatch
    ) {
      horizonValue = {
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
          safePrompt,
      };
    } else if (
      fridayMatch
    ) {
      horizonValue = {
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
          safePrompt,
      };
    } else if (
      /\b(soon|later|someday|eventually|next month|in the future)\b/i.test(
        safePrompt
      )
    ) {
      addMissingField(
        "horizonTimestamp"
      );

      addAmbiguity(
        "Protection horizon is ambiguous. Please select an exact future date or a supported relative horizon."
      );
    } else {
      addMissingField(
        "horizonTimestamp"
      );
    }

    /* ============================================================
     * 7. MULTI-LEG PERMISSION
     *
     * The presence of the words "put spread" alone is NOT authority.
     * The user must explicitly permit it.
     * ============================================================ */

    const spreadPermissionMatch =
      safePrompt.match(
        /\b(?:allow\s+(?:a\s+)?put\s+spread|allow\s+put\s+spreads?|allow\s+multi-leg|use\s+(?:a\s+)?put\s+spread|put\s+spread\s+is\s+(?:okay|ok)|multi-leg\s+is\s+(?:okay|ok))\b/i
      );

    const hasSpreadPermission =
      Boolean(
        spreadPermissionMatch
      );

    /* ============================================================
     * 8. PROVIDER METADATA
     * ============================================================ */

    const responseTimestampMs =
      Date.now();

    const providerMetadata:
      LLMProviderMetadata = {
      providerType:
        "DEVELOPMENT_ADAPTER",

      status:
        "AVAILABLE",

      modelIdentifier:
        "deterministic-development-adapter",

      promptVersion:
        PROMPT_VERSION,

      latencyMs:
        Math.max(
          0,
          responseTimestampMs -
          requestStartedAtMs
        ),

      requestTimestampMs:
        requestStartedAtMs,

      responseTimestampMs,
    };

    /* ============================================================
     * 9. DRAFT
     * ============================================================ */

    const requiresClarification =
      missingFields.length > 0 ||
      ambiguities.length > 0 ||
      unsupportedObjective ||
      Boolean(
        horizonValue
          ?.requiresConfirmation
      );

    const candidateDraft:
      ParsedRiskIntentDraft = {
      intentId:
        `intent-${Math.random()
          .toString(36)
          .substring(2, 9)}`,

      version: 1,

      createdAtMs:
        nowMs,

      updatedAtMs:
        nowMs,

      /*
       * Server-owned invariant.
       * Parsing can NEVER confirm a financial intent.
       */
      confirmedByUser:
        false,

      objective: {
        value:
          "DOWNSIDE_PROTECTION",

        source:
          "SYSTEM_DEFAULT",

        confidence: 1,

        requiresConfirmation:
          false,
      },

      asset:
        assetValue
          ? {
            value:
              assetValue,

            source:
              "USER_EXPLICIT",

            confidence: 1,

            requiresConfirmation:
              false,

            originalPhrase:
              assetPhrase,

            rawUserInput:
              safePrompt,
          }
          : null,

      exposureAmount:
        exposureAmountValue,

      targetMaxLossPercent:
        lossValue,

      maxPremiumUSDC:
        budgetValue,

      horizonTimestamp:
        horizonValue,

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

      allowMultiLeg: {
        value:
          hasSpreadPermission,

        source:
          hasSpreadPermission
            ? "USER_EXPLICIT"
            : "SYSTEM_DEFAULT",

        confidence: 1,

        requiresConfirmation:
          false,

        originalPhrase:
          spreadPermissionMatch?.[0],

        rawUserInput:
          hasSpreadPermission
            ? safePrompt
            : undefined,
      },

      missingFields,

      ambiguitiesFound:
        ambiguities.map(
          (reason) => ({
            field:
              this.inferAmbiguityField(
                reason
              ),

            detectedText:
              "",

            reason,

            suggestedValue:
              undefined,
          })
        ),

      requiresClarification,

      originalPromptText:
        safePrompt,

      providerMetadata,
    };

    return {
      adapterName:
        this.adapterName,

      candidateDraft,

      ambiguitiesFound:
        ambiguities,

      missingFields,

      requiresClarification,

      unsupportedObjective,

      unsupportedObjectiveReason,

      providerMetadata,
    };
  }

  private inferAmbiguityField(
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
      lower.includes(
        "percentage"
      ) ||
      lower.includes("loss")
    ) {
      return "targetMaxLossPercent";
    }

    if (
      lower.includes(
        "budget"
      ) ||
      lower.includes(
        "usdc"
      )
    ) {
      return "maxPremiumUSDC";
    }

    if (
      lower.includes(
        "horizon"
      ) ||
      lower.includes("date") ||
      lower.includes(
        "duration"
      )
    ) {
      return "horizonTimestamp";
    }

    return "intent";
  }
}