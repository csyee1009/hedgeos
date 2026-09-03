import { AIIntentProvider, ParseResult } from "../providers/interfaces/AIIntentProvider";
import { PROMPT_VERSION } from "../providers/prompts/intentExtractionPrompt";
import { HorizonTarget, LLMProviderMetadata, ParsedRiskIntentDraft } from "../types";
import { parseExactDecimal } from "../utils/decimalParser";

export function getNextFridayMYT(nowMs: number = Date.now()): HorizonTarget {
  const MYT_OFFSET_MS = 8 * 3600 * 1000;
  const nowMYT = new Date(nowMs + MYT_OFFSET_MS);

  const year = nowMYT.getUTCFullYear();
  const month = nowMYT.getUTCMonth();
  const date = nowMYT.getUTCDate();
  const day = nowMYT.getUTCDay();

  let daysUntilFriday = (5 - day + 7) % 7;
  if (day === 5) {
    const isPastDeadline =
      nowMYT.getUTCHours() > 23 ||
      (nowMYT.getUTCHours() === 23 && nowMYT.getUTCMinutes() === 59 && nowMYT.getUTCSeconds() === 59);
    if (isPastDeadline) {
      daysUntilFriday = 7;
    }
  }

  const targetMYT = new Date(Date.UTC(year, month, date + daysUntilFriday, 23, 59, 59, 999));
  const targetUtcMs = targetMYT.getTime() - MYT_OFFSET_MS;
  const isoString = new Date(targetUtcMs).toISOString();

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
  const formattedDisplay = `${new Intl.DateTimeFormat("en-US", options).format(new Date(targetUtcMs))} MYT`;

  return {
    timestampMs: targetUtcMs,
    isoString,
    formattedDisplay,
    timezone: "Asia/Kuala_Lumpur (MYT, UTC+8)",
  };
}

export function parseIsoDateMYT(dateStr: string): HorizonTarget {
  const parts = dateStr.split("-");
  if (parts.length !== 3) {
    throw new Error(`Invalid date format '${dateStr}': expected YYYY-MM-DD`);
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid date values in '${dateStr}'`);
  }

  // Validate round-trip calendar date (e.g. Feb 31 or Apr 31)
  const testDate = new Date(Date.UTC(year, month - 1, day));
  if (
    testDate.getUTCFullYear() !== year ||
    testDate.getUTCMonth() !== month - 1 ||
    testDate.getUTCDate() !== day
  ) {
    throw new Error(`Non-existent calendar date '${dateStr}'`);
  }

  const MYT_OFFSET_MS = 8 * 3600 * 1000;
  const targetUtcMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999) - MYT_OFFSET_MS;
  const isoString = new Date(targetUtcMs).toISOString();

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
  const formattedDisplay = `${new Intl.DateTimeFormat("en-US", options).format(new Date(targetUtcMs))} MYT`;

  return {
    timestampMs: targetUtcMs,
    isoString,
    formattedDisplay,
    timezone: "Asia/Kuala_Lumpur (MYT, UTC+8)",
  };
}

export function formatCustomHorizon(timestampMs: number): HorizonTarget {
  const isoString = new Date(timestampMs).toISOString();
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
  const formattedDisplay = `${new Intl.DateTimeFormat("en-US", options).format(new Date(timestampMs))} MYT`;

  return {
    timestampMs,
    isoString,
    formattedDisplay,
    timezone: "Asia/Kuala_Lumpur (MYT, UTC+8)",
  };
}

export class IntentEngine implements AIIntentProvider {
  public readonly adapterName = "DEVELOPMENT_ADAPTER" as const;
  public readonly providerType = "DEVELOPMENT_ADAPTER" as const;

  public async parseNaturalLanguage(prompt: string): Promise<ParseResult> {
    const nowMs = Date.now();
    const ambiguities: string[] = [];
    const missingFields: string[] = [];
    const safePrompt = prompt || "";

    // 0. Unsupported Objectives check (Speculation, Staking Yield, Flash Loan Arbitrage, Naked Options)
    const isUnsupported =
      /\b(leverage|speculate|speculation|arbitrage|staking|stake|flash loan|trading bot|yield farming|yield|naked call|short call|10x)\b/i.test(
        safePrompt
      );
    let unsupportedObjective = false;
    let unsupportedObjectiveReason: string | undefined = undefined;

    if (isUnsupported) {
      unsupportedObjective = true;
      unsupportedObjectiveReason =
        "HedgeOS currently supports Downside Protection intents only. Speculation, yield generation, and trading bot strategies are not supported in this MVP.";
    }

    // 1. Exposure Asset vs Budget Asset separation:
    const exposureAssetMatch = safePrompt.match(/(?:protect|have|hold|holding|my)?\s*(\d+(?:\.\d+)?)?\s*\b(ETH|BTC|SOL)\b/i);
    const budgetMatch = safePrompt.match(/(-?\d+(?:\.\d+)?)\s*USDC/i);

    let assetValue: string | null = null;
    let assetPhrase: string | undefined = undefined;

    if (exposureAssetMatch && exposureAssetMatch[2]) {
      assetValue = exposureAssetMatch[2].toUpperCase();
      assetPhrase = exposureAssetMatch[0].trim();
    } else {
      missingFields.push("asset");
    }

    // 2. Exposure Amount parsing
    const amountMatch = safePrompt.match(/(-?\d+(?:\.\d+)?)\s*(?:ETH|BTC|SOL)/i);
    let exposureAmountValue = null;

    if (amountMatch && assetValue) {
      const rawAmountStr = amountMatch[1];
      const parsedNum = parseFloat(rawAmountStr);
      if (parsedNum <= 0 || isNaN(parsedNum)) {
        ambiguities.push(`Invalid non-positive exposure amount '${rawAmountStr}'. Positive exposure amount required.`);
        missingFields.push("exposureAmount");
      } else {
        const decimals = assetValue === "ETH" ? 18 : assetValue === "BTC" ? 8 : 18;
        const parsedAmount = parseExactDecimal(rawAmountStr, decimals, assetValue);
        exposureAmountValue = {
          value: parsedAmount,
          source: "USER_EXPLICIT" as const,
          confidence: 1.0,
          requiresConfirmation: false,
          originalPhrase: amountMatch[0],
        };
      }
    } else {
      missingFields.push("exposureAmount");
    }

    // 3. Max Downside Loss % parsing
    const lossMatch =
      safePrompt.match(/(-?\d+(?:\.\d+)?)\s*(?:%|percent|pct)/i) ||
      safePrompt.match(/(?:max|maximum|cap|drop|down|downside|loss|lose|down more than|greater than)\s*(?:of|at|around)?\s*(-?\d+(?:\.\d+)?)(?:\s*(?:%|percent|pct))?/i);
    let lossValue = null;

    if (lossMatch) {
      const rawPercent = parseFloat(lossMatch[1]);
      if (rawPercent <= 0 || rawPercent > 100 || isNaN(rawPercent)) {
        ambiguities.push(`Invalid max loss percentage '${rawPercent}%'. Must be between 0.1% and 100%.`);
        missingFields.push("targetMaxLossPercent");
      } else {
        lossValue = {
          value: rawPercent,
          source: "USER_EXPLICIT" as const,
          confidence: 1.0,
          requiresConfirmation: false,
          originalPhrase: lossMatch[0],
        };
      }
    } else {
      missingFields.push("targetMaxLossPercent");
    }

    // 4. Max Premium Budget parsing
    let budgetValue = null;
    if (budgetMatch) {
      const rawBudgetStr = budgetMatch[1];
      const parsedNum = parseFloat(rawBudgetStr);
      if (parsedNum < 0 || isNaN(parsedNum)) {
        ambiguities.push(`Invalid negative budget amount '${rawBudgetStr} USDC'.`);
        missingFields.push("maxPremiumUSDC");
      } else {
        const parsedBudget = parseExactDecimal(rawBudgetStr, 6, "USDC");
        budgetValue = {
          value: parsedBudget,
          source: "USER_EXPLICIT" as const,
          confidence: 1.0,
          requiresConfirmation: false,
          originalPhrase: budgetMatch[0],
        };
      }
    } else {
      missingFields.push("maxPremiumUSDC");
    }

    // 5. Protection Horizon parsing
    let horizonValue = null;
    const hasFriday = safePrompt.toLowerCase().includes("friday");
    const isoDateMatch = safePrompt.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const daysMatch = safePrompt.match(/(?:for|in)\s*(\d+)\s*days?/i);
    const hasWeekend = /weekend/i.test(safePrompt);
    const hasWeek = /(?:next\s*week|for\s*the\s*next\s*week)/i.test(safePrompt);

    if (isoDateMatch) {
      try {
        const parsedHorizon = parseIsoDateMYT(isoDateMatch[1]);
        if (parsedHorizon.timestampMs <= nowMs) {
          ambiguities.push(`Requested horizon date (${isoDateMatch[1]}) is in the past. Future horizon date required.`);
          missingFields.push("horizonTimestamp");
        } else {
          horizonValue = {
            value: parsedHorizon,
            source: "USER_EXPLICIT" as const,
            confidence: 1.0,
            requiresConfirmation: false,
            originalPhrase: isoDateMatch[0],
          };
        }
      } catch (_err: any) {
        ambiguities.push(`Invalid calendar date '${isoDateMatch[1]}'.`);
        missingFields.push("horizonTimestamp");
      }
    } else if (hasFriday) {
      const fridayHorizon = getNextFridayMYT(nowMs);
      horizonValue = {
        value: fridayHorizon,
        source: "USER_EXPLICIT" as const,
        confidence: 0.95,
        requiresConfirmation: false,
        originalPhrase: "until Friday",
      };
    } else if (daysMatch) {
      const daysCount = parseInt(daysMatch[1], 10);
      const targetUtcMs = nowMs + daysCount * 86400 * 1000;
      horizonValue = {
        value: formatCustomHorizon(targetUtcMs),
        source: "USER_EXPLICIT" as const,
        confidence: 0.95,
        requiresConfirmation: false,
        originalPhrase: daysMatch[0],
      };
    } else if (hasWeekend || hasWeek) {
      const fridayHorizon = getNextFridayMYT(nowMs);
      horizonValue = {
        value: fridayHorizon,
        source: "USER_EXPLICIT" as const,
        confidence: 0.9,
        requiresConfirmation: false,
        originalPhrase: hasWeekend ? "through this weekend" : "for next week",
      };
    } else if (/\b(soon|later|next month)\b/i.test(safePrompt)) {
      ambiguities.push(`Protection horizon is ambiguous. Please select an exact calendar date.`);
      missingFields.push("horizonTimestamp");
    } else {
      missingFields.push("horizonTimestamp");
    }

    // 6. Multi-Leg Permission (Requires affirmative user permission, not just "cheap")
    const hasSpreadPermission =
      /\b(okay using a put spread|allow put spreads?|allow multi-leg|explicitly allow put spread|put spread if appropriate)\b/i.test(safePrompt);

    const providerMetadata: LLMProviderMetadata = {
      providerType: "DEVELOPMENT_ADAPTER",
      status: "AVAILABLE",
      modelIdentifier: "deterministic-development-adapter",
      promptVersion: PROMPT_VERSION,
      latencyMs: 1,
      requestTimestampMs: nowMs,
      responseTimestampMs: Date.now(),
    };

    const candidateDraft: ParsedRiskIntentDraft = {
      intentId: `intent-${Math.random().toString(36).substring(2, 9)}`,
      version: 1,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      confirmedByUser: false, // Server-owned authority invariant
      objective: {
        value: "DOWNSIDE_PROTECTION",
        source: "SYSTEM_DEFAULT",
        confidence: 1.0,
        requiresConfirmation: false,
      },
      asset: assetValue
        ? {
            value: assetValue,
            source: "USER_EXPLICIT",
            confidence: 1.0,
            requiresConfirmation: false,
            originalPhrase: assetPhrase,
          }
        : null,
      exposureAmount: exposureAmountValue,
      targetMaxLossPercent: lossValue,
      maxPremiumUSDC: budgetValue,
      horizonTimestamp: horizonValue,
      allowedProtocols: {
        value: ["THETANUTS"],
        source: "SYSTEM_DEFAULT",
        confidence: 1.0,
        requiresConfirmation: false,
      },
      allowMultiLeg: {
        value: hasSpreadPermission,
        source: hasSpreadPermission ? "USER_EXPLICIT" : "SYSTEM_DEFAULT",
        confidence: 1.0,
        requiresConfirmation: false,
        originalPhrase: hasSpreadPermission ? "spread" : undefined,
      },
      missingFields,
      requiresClarification: missingFields.length > 0 || ambiguities.length > 0 || unsupportedObjective,
      originalPromptText: safePrompt,
      providerMetadata,
    };

    return {
      adapterName: this.adapterName,
      candidateDraft,
      ambiguitiesFound: ambiguities,
      missingFields,
      requiresClarification: candidateDraft.requiresClarification || false,
      unsupportedObjective,
      unsupportedObjectiveReason,
      providerMetadata,
    };
  }
}
