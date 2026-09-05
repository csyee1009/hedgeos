import { ParsedRiskIntentDraft, StoredIntent, TypedRiskIntent } from "../types";

export type OptionCategory = "LONG_PUT" | "SHORT_PUT" | "LONG_CALL" | "SHORT_CALL";

export interface ResolvedOrderCategory {
  optionRight: "PUT" | "CALL";
  takerSide: "BUY" | "SELL";
  category: OptionCategory;
}

/**
 * Server-authoritative deterministic resolution of user confirmed option category.
 * Do NOT infer category from market availability.
 * Do NOT guess if ambiguous.
 */
export function resolveOptionCategory(intent: StoredIntent | TypedRiskIntent | ParsedRiskIntentDraft | null | undefined): OptionCategory {
  if (!intent) {
    return "LONG_PUT";
  }

  const rawIntent = intent as any;

  // 1. Explicit optionCategory on intent if present
  if (rawIntent.optionCategory?.value) {
    const categoryVal = String(rawIntent.optionCategory.value).toUpperCase();
    if (categoryVal === "LONG_PUT" || categoryVal === "SHORT_PUT" || categoryVal === "LONG_CALL" || categoryVal === "SHORT_CALL") {
      return categoryVal as OptionCategory;
    }
  }

  // 2. Explicit optionRight + positionSide / takerSide / intendedAction
  const optionRight = rawIntent.optionRight?.value ?? rawIntent.optionRight;
  const side = rawIntent.positionSide?.value ?? rawIntent.takerSide?.value ?? rawIntent.intendedAction?.value ?? rawIntent.positionSide;

  if (typeof optionRight === "string" && typeof side === "string") {
    const rightUpper = optionRight.toUpperCase();
    const sideUpper = side.toUpperCase();
    if (rightUpper === "PUT" && sideUpper === "BUY") return "LONG_PUT";
    if (rightUpper === "PUT" && sideUpper === "SELL") return "SHORT_PUT";
    if (rightUpper === "CALL" && sideUpper === "BUY") return "LONG_CALL";
    if (rightUpper === "CALL" && sideUpper === "SELL") return "SHORT_CALL";
  }

  // 3. Fallback based on objective / default:
  const objective = String(intent.objective?.value ?? "").toUpperCase();
  if (objective === "YIELD_GENERATION" || objective === "COVERED_CALL") {
    return "SHORT_CALL";
  }
  if (objective === "CASH_SECURED_PUT") {
    return "SHORT_PUT";
  }

  // Default for downside protection / standard protection intent
  return "LONG_PUT";
}

/**
 * Deterministically resolve optionRight, takerSide, and category from raw Thetanuts OptionBook order.
 * Uses verified Thetanuts order semantics:
 * - rawApiData.isLong === true => maker is long option => taker BUYS option (takerSide = "BUY")
 * - rawApiData.isLong === false => maker is short option => taker SELLS option (takerSide = "SELL")
 * - isCall === true => CALL, optionType === 1 or isCall === false => PUT
 */
export function resolveOrderOptionCategory(orderWithSignature: any): ResolvedOrderCategory {
  const raw = orderWithSignature?.rawApiData || {};
  const normalized = orderWithSignature?.order || {};

  // Taker side resolution
  let takerSide: "BUY" | "SELL" = "BUY";
  if (raw.isLong === false || normalized.isLong === false || raw.isBuyer === true) {
    takerSide = "SELL";
  } else if (raw.isLong === true || normalized.isLong === true || raw.isBuyer === false) {
    takerSide = "BUY";
  }

  // Option right resolution
  let optionRight: "PUT" | "CALL" = "PUT";
  if (raw.isCall === true || normalized.isCall === true || raw.optionType === 0) {
    optionRight = "CALL";
  } else if (raw.isCall === false || normalized.isCall === false || raw.optionType === 1) {
    optionRight = "PUT";
  }

  let category: OptionCategory;
  if (optionRight === "PUT" && takerSide === "BUY") category = "LONG_PUT";
  else if (optionRight === "PUT" && takerSide === "SELL") category = "SHORT_PUT";
  else if (optionRight === "CALL" && takerSide === "BUY") category = "LONG_CALL";
  else category = "SHORT_CALL";

  return { optionRight, takerSide, category };
}
