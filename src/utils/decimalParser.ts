import { TokenAmount } from "../types";

export class DecimalParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecimalParseError";
  }
}

/**
 * Parses a decimal string representation of a financial amount into exact BigInt base units.
 * Performs zero floating-point conversions (avoids parseFloat multiplication).
 *
 * @param input The raw string input (e.g. "3", "3.25", "0.000001", "0")
 * @param maxDecimals Maximum allowed token decimals (e.g. 6 for USDC, 18 for ETH)
 * @param symbol Token symbol (e.g. "USDC", "ETH")
 */
export function parseExactDecimal(input: string, maxDecimals: number, symbol: string): TokenAmount {
  if (!input || typeof input !== "string") {
    throw new DecimalParseError("Enter a valid financial amount.");
  }

  const trimmed = input.trim();
  if (trimmed === "") {
    throw new DecimalParseError("Enter a valid financial amount.");
  }

  // Reject negative amounts
  if (trimmed.startsWith("-")) {
    throw new DecimalParseError("Financial amount cannot be negative.");
  }

  // Reject invalid characters (only digits and a single decimal point allowed)
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new DecimalParseError("Enter a valid numeric amount (e.g. 3 or 3.25).");
  }

  const parts = trimmed.split(".");
  const integerPart = parts[0];
  const fractionalPart = parts[1] || "";

  if (fractionalPart.length > maxDecimals) {
    throw new DecimalParseError(
      `Amount precision (${fractionalPart.length} decimals) exceeds maximum supported token precision (${maxDecimals} decimals for ${symbol}).`
    );
  }

  // Pad fractional part to maxDecimals
  const paddedFractional = fractionalPart.padEnd(maxDecimals, "0");

  // Remove leading zeros from integer part unless it's just "0"
  const cleanInteger = integerPart.replace(/^0+/, "") || "0";

  // Combine integer and padded fractional parts into base units string
  let baseUnitsStr = cleanInteger === "0" ? paddedFractional.replace(/^0+/, "") : cleanInteger + paddedFractional;
  if (!baseUnitsStr) {
    baseUnitsStr = "0";
  }

  return {
    amountBaseUnits: baseUnitsStr,
    decimals: maxDecimals,
    symbol: symbol.toUpperCase(),
  };
}

/**
 * Field-specific validation for exposure amount (must be > 0).
 */
export function validateExposureAmount(tokenAmount: TokenAmount): { isValid: boolean; error?: string } {
  const baseBigInt = BigInt(tokenAmount.amountBaseUnits);
  if (baseBigInt <= 0n) {
    return { isValid: false, error: "Exposure amount must be greater than 0." };
  }
  return { isValid: true };
}

/**
 * Field-specific validation for protection budget (must be >= 0).
 */
export function validateBudgetAmount(tokenAmount: TokenAmount): { isValid: boolean; error?: string } {
  const baseBigInt = BigInt(tokenAmount.amountBaseUnits);
  if (baseBigInt < 0n) {
    return { isValid: false, error: "Protection budget cannot be negative." };
  }
  return { isValid: true };
}

/**
 * Field-specific validation for downside loss percentage (must be between 0 and 100).
 */
export function validateLossPercent(percent: number): { isValid: boolean; error?: string } {
  if (typeof percent !== "number" || isNaN(percent) || percent < 0 || percent > 100) {
    return { isValid: false, error: "Downside loss percentage must be between 0% and 100%." };
  }
  return { isValid: true };
}

/**
 * Field-specific validation for protection horizon timestamp (must be strictly in the future).
 */
export function validateHorizonTimestamp(timestampMs: number, nowMs: number = Date.now()): { isValid: boolean; error?: string } {
  if (!timestampMs || isNaN(timestampMs) || timestampMs <= nowMs) {
    return { isValid: false, error: "Protection horizon must be a future date and time." };
  }
  return { isValid: true };
}
