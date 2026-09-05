import { AIIntentProvider, ParseResult } from "../providers/interfaces/AIIntentProvider";
import { PROMPT_VERSION } from "../providers/prompts/intentExtractionPrompt";
import {
  HorizonTarget,
  LLMProviderMetadata,
  ParsedRiskIntentDraft,
} from "../types";
import { parseExactDecimal } from "../utils/decimalParser";

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function formatMYTHorizon(timestampMs: number): HorizonTarget {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    throw new Error("Invalid horizon timestamp");
  }

  const date = new Date(timestampMs);

  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
    hour12: true,
  };

  return {
    timestampMs,
    isoString: date.toISOString(),
    formattedDisplay: `${new Intl.DateTimeFormat(
      "en-US",
      options
    ).format(date)} MYT`,
    timezone: "Asia/Kuala_Lumpur (MYT, UTC+8)",
  };
}

export function getNextFridayMYT(
  nowMs: number = Date.now()
): HorizonTarget {
  const nowMYT = new Date(nowMs + MYT_OFFSET_MS);

  const year = nowMYT.getUTCFullYear();
  const month = nowMYT.getUTCMonth();
  const date = nowMYT.getUTCDate();
  const day = nowMYT.getUTCDay();

  let daysUntilFriday = (5 - day + 7) % 7;

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

  if (targetUtcMs <= nowMs) {
    targetUtcMs += 7 * ONE_DAY_MS;
  }

  return formatMYTHorizon(targetUtcMs);
}

function getFollowingFridayMYT(
  nowMs: number = Date.now()
): HorizonTarget {
  const nextFriday = getNextFridayMYT(nowMs);

  return formatMYTHorizon(
    nextFriday.timestampMs + 7 * ONE_DAY_MS
  );
}

export function parseIsoDateMYT(
  dateStr: string
): HorizonTarget {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    dateStr
  );

  if (!match) {
    throw new Error(
      `Invalid date format '${dateStr}': expected YYYY-MM-DD`
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

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

  const calendarCheck = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
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

  return formatMYTHorizon(targetUtcMs);
}

export function formatCustomHorizon(
  timestampMs: number
): HorizonTarget {
  return formatMYTHorizon(timestampMs);
}

export class IntentEngine implements AIIntentProvider {
  public readonly adapterName =
    "DEVELOPMENT_ADAPTER" as const;

  public readonly providerType =
    "DEVELOPMENT_ADAPTER" as const;

  public async parseNaturalLanguage(
    prompt: string
  ): Promise<ParseResult> {
    const nowMs = Date.now();
    const ambiguities: string[] = [];
    const missingFields: string[] = [];
    const safePrompt =
      typeof prompt === "string" ? prompt.trim() : "";

    const addMissingField = (field: string) => {
      if (!missingFields.includes(field)) {
        missingFields.push(field);
      }
    };

    const isUnsupported =
      /\b(leverage|speculate|speculation|arbitrage|staking|stake|flash loan|trading bot|yield farming|yield|naked call|short call|10x)\b/i.test(
        safePrompt
      );

    let unsupportedObjective = false;
    let unsupportedObjectiveReason:
      | string
      | undefined;

    if (isUnsupported) {
      unsupportedObjective = true;
      unsupportedObjectiveReason =
        "HedgeOS currently supports Downside Protection intents only. Speculation, yield generation, and trading bot strategies are not supported in this MVP.";
    }

    const unsupportedAssetMatch =
      safePrompt.match(/\b(SOL)\b/i);

    if (unsupportedAssetMatch) {
      ambiguities.push(
        `${unsupportedAssetMatch[1].toUpperCase()} is not currently supported by HedgeOS's verified protective-option sizing path. Please use a supported asset such as ETH or BTC.`
      );
    }

    const exposureAssetMatch = safePrompt.match(
      /(?:protect|have|hold|holding|my)?\s*(\d+(?:\.\d+)?)?\s*\b(ETH|WETH|BTC|CBBTC)\b/i
    );

    const budgetMatch = safePrompt.match(
      /(-?\d+(?:\.\d+)?)\s*USDC\b/i
    );

    let assetValue: string | null = null;
    let assetPhrase: string | undefined;

    if (
      exposureAssetMatch &&
      exposureAssetMatch[2]
    ) {
      const parsedAsset =
        exposureAssetMatch[2].toUpperCase();

      assetValue =
        parsedAsset === "WETH"
          ? "ETH"
          : parsedAsset === "CBBTC"
            ? "BTC"
            : parsedAsset;

      assetPhrase =
        exposureAssetMatch[0].trim();
    } else {
      addMissingField("asset");
    }

    const amountMatch = safePrompt.match(
      /(-?\d+(?:\.\d+)?)\s*(ETH|WETH|BTC|CBBTC)\b/i
    );

    let exposureAmountValue:
      | ParsedRiskIntentDraft["exposureAmount"]
      | null = null;

    if (amountMatch && assetValue) {
      const rawAmountStr = amountMatch[1];

      const numericAmount =
        Number(rawAmountStr);

      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {
        ambiguities.push(
          `Invalid non-positive exposure amount '${rawAmountStr}'. A positive amount is required.`
        );

        addMissingField(
          "exposureAmount"
        );
      } else {
        try {
          const decimals =
            assetValue === "BTC"
              ? 8
              : 18;

          const parsedAmount =
            parseExactDecimal(
              rawAmountStr,
              decimals,
              assetValue
            );

          exposureAmountValue = {
            value: parsedAmount,
            source: "USER_EXPLICIT",
            confidence: 1,
            requiresConfirmation: false,
            originalPhrase:
              amountMatch[0],
          };
        } catch {
          ambiguities.push(
            `Exposure amount '${rawAmountStr}' could not be represented safely for ${assetValue}. Please enter a valid amount.`
          );

          addMissingField(
            "exposureAmount"
          );
        }
      }
    } else {
      addMissingField(
        "exposureAmount"
      );
    }

    const lossMatch =
      safePrompt.match(
        /(-?\d+(?:\.\d+)?)\s*(?:%|percent\b|pct\b)/i
      ) ||
      safePrompt.match(
        /(?:max|maximum|cap|drop|down|downside|loss|lose|down more than|greater than)\s*(?:of|at|around)?\s*(-?\d+(?:\.\d+)?)(?:\s*(?:%|percent|pct))?/i
      );

    let lossValue:
      | ParsedRiskIntentDraft["targetMaxLossPercent"]
      | null = null;

    if (lossMatch) {
      const rawPercent =
        Number(lossMatch[1]);

      if (
        !Number.isFinite(rawPercent) ||
        rawPercent <= 0 ||
        rawPercent > 100
      ) {
        ambiguities.push(
          `Invalid maximum loss percentage '${lossMatch[1]}%'. Enter a value greater than 0% and no more than 100%.`
        );

        addMissingField(
          "targetMaxLossPercent"
        );
      } else {
        lossValue = {
          value: rawPercent,
          source: "USER_EXPLICIT",
          confidence: 1,
          requiresConfirmation: false,
          originalPhrase:
            lossMatch[0],
        };
      }
    } else {
      addMissingField(
        "targetMaxLossPercent"
      );
    }

    let budgetValue:
      | ParsedRiskIntentDraft["maxPremiumUSDC"]
      | null = null;

    if (budgetMatch) {
      const rawBudgetStr =
        budgetMatch[1];

      const numericBudget =
        Number(rawBudgetStr);

      if (
        !Number.isFinite(numericBudget) ||
        numericBudget < 0
      ) {
        ambiguities.push(
          `Invalid negative protection budget '${rawBudgetStr} USDC'.`
        );

        addMissingField(
          "maxPremiumUSDC"
        );
      } else {
        try {
          const parsedBudget =
            parseExactDecimal(
              rawBudgetStr,
              6,
              "USDC"
            );

          budgetValue = {
            value: parsedBudget,
            source: "USER_EXPLICIT",
            confidence: 1,
            requiresConfirmation: false,
            originalPhrase:
              budgetMatch[0],
          };
        } catch {
          ambiguities.push(
            `Protection budget '${rawBudgetStr} USDC' could not be represented safely. Please enter a valid USDC amount.`
          );

          addMissingField(
            "maxPremiumUSDC"
          );
        }
      }
    } else {
      addMissingField(
        "maxPremiumUSDC"
      );
    }

    let horizonValue:
      | ParsedRiskIntentDraft["horizonTimestamp"]
      | null = null;

    const isoDateMatch =
      safePrompt.match(
        /\b(\d{4}-\d{2}-\d{2})\b/
      );

    const daysMatch =
      safePrompt.match(
        /(?:for|in)\s*(\d+)\s*days?\b/i
      );

    const hasFriday =
      /\b(?:until|through|by)?\s*friday\b/i.test(
        safePrompt
      );

    const hasWeekend =
      /\b(?:this\s+)?weekend\b/i.test(
        safePrompt
      );

    const hasNextWeek =
      /\bnext\s+week\b/i.test(
        safePrompt
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
          ambiguities.push(
            `Requested horizon date (${isoDateMatch[1]}) is in the past. A future date is required.`
          );

          addMissingField(
            "horizonTimestamp"
          );
        } else {
          horizonValue = {
            value: parsedHorizon,
            source: "USER_EXPLICIT",
            confidence: 1,
            requiresConfirmation: false,
            originalPhrase:
              isoDateMatch[0],
          };
        }
      } catch {
        ambiguities.push(
          `Invalid calendar date '${isoDateMatch[1]}'.`
        );

        addMissingField(
          "horizonTimestamp"
        );
      }
    } else if (daysMatch) {
      const daysCount =
        Number(daysMatch[1]);

      if (
        !Number.isInteger(daysCount) ||
        daysCount <= 0
      ) {
        ambiguities.push(
          "Protection duration must be at least 1 day."
        );

        addMissingField(
          "horizonTimestamp"
        );
      } else {
        const targetUtcMs =
          nowMs +
          daysCount * ONE_DAY_MS;

        horizonValue = {
          value:
            formatCustomHorizon(
              targetUtcMs
            ),
          source: "USER_EXPLICIT",
          confidence: 0.95,
          requiresConfirmation: false,
          originalPhrase:
            daysMatch[0],
        };
      }
    } else if (hasNextWeek) {
      horizonValue = {
        value:
          getFollowingFridayMYT(
            nowMs
          ),
        source: "USER_EXPLICIT",
        confidence: 0.9,
        requiresConfirmation: false,
        originalPhrase:
          "next week",
      };
    } else if (
      hasFriday ||
      hasWeekend
    ) {
      horizonValue = {
        value:
          getNextFridayMYT(
            nowMs
          ),
        source: "USER_EXPLICIT",
        confidence:
          hasFriday ? 0.95 : 0.9,
        requiresConfirmation: false,
        originalPhrase: hasFriday
          ? "until Friday"
          : "through this weekend",
      };
    } else if (
      /\b(soon|later|next month)\b/i.test(
        safePrompt
      )
    ) {
      ambiguities.push(
        "Protection horizon is ambiguous. Please select an exact future date."
      );

      addMissingField(
        "horizonTimestamp"
      );
    } else {
      addMissingField(
        "horizonTimestamp"
      );
    }

    const hasSpreadPermission =
      /\b(okay using a put spread|allow put spreads?|allow multi-leg|explicitly allow put spread|put spread if appropriate)\b/i.test(
        safePrompt
      );

    const providerMetadata: LLMProviderMetadata =
    {
      providerType:
        "DEVELOPMENT_ADAPTER",
      status: "AVAILABLE",
      modelIdentifier:
        "deterministic-development-adapter",
      promptVersion:
        PROMPT_VERSION,
      latencyMs: 1,
      requestTimestampMs:
        nowMs,
      responseTimestampMs:
        Date.now(),
    };

    const candidateDraft: ParsedRiskIntentDraft =
    {
      intentId: `intent-${Math.random()
        .toString(36)
        .substring(2, 9)}`,

      version: 1,

      createdAtMs: nowMs,

      updatedAtMs: nowMs,

      confirmedByUser: false,

      objective: {
        value:
          "DOWNSIDE_PROTECTION",
        source:
          "SYSTEM_DEFAULT",
        confidence: 1,
        requiresConfirmation:
          false,
      },

      asset: assetValue
        ? {
          value: assetValue,
          source:
            "USER_EXPLICIT",
          confidence: 1,
          requiresConfirmation:
            false,
          originalPhrase:
            assetPhrase,
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
        value: ["THETANUTS"],
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
          hasSpreadPermission
            ? "spread"
            : undefined,
      },

      missingFields,

      ambiguitiesFound:
        ambiguities.map(
          (reason) => ({
            field: "intent",
            detectedText: "",
            reason,
            suggestedValue:
              null,
          })
        ),

      requiresClarification:
        missingFields.length > 0 ||
        ambiguities.length > 0 ||
        unsupportedObjective,

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

      requiresClarification:
        candidateDraft.requiresClarification ||
        false,

      unsupportedObjective,

      unsupportedObjectiveReason,

      providerMetadata,
    };
  }
}