import { describe, expect, it } from "vitest";
import {
  DecimalParseError,
  parseExactDecimal,
  validateBudgetAmount,
  validateExposureAmount,
  validateHorizonTimestamp,
  validateLossPercent,
} from "../src/utils/decimalParser";

describe("Exact Decimal Parser & Field Validation Tests", () => {
  it("should parse exact integer strings into base units without parseFloat", () => {
    const parsed = parseExactDecimal("3", 6, "USDC");
    expect(parsed.amountBaseUnits).toBe("3000000");
    expect(parsed.decimals).toBe(6);
    expect(parsed.symbol).toBe("USDC");
  });

  it("should parse exact decimal strings like '3.25' into base units cleanly", () => {
    const parsed = parseExactDecimal("3.25", 6, "USDC");
    expect(parsed.amountBaseUnits).toBe("3250000");
  });

  it("should parse small decimals like '0.000001' into exact base unit '1'", () => {
    const parsed = parseExactDecimal("0.000001", 6, "USDC");
    expect(parsed.amountBaseUnits).toBe("1");
  });

  it("should parse exact '0' budget value without throwing decimal parse error", () => {
    const parsed = parseExactDecimal("0", 6, "USDC");
    expect(parsed.amountBaseUnits).toBe("0");
    const val = validateBudgetAmount(parsed);
    expect(val.isValid).toBe(true); // Budget value 0 is allowed syntactically and by business rules
  });

  it("should reject exposure value 0 in field-specific business validation", () => {
    const parsed = parseExactDecimal("0", 18, "ETH");
    expect(parsed.amountBaseUnits).toBe("0");
    const val = validateExposureAmount(parsed);
    expect(val.isValid).toBe(false); // Exposure amount 0 is rejected by business rules
    expect(val.error).toContain("must be greater than 0");
  });

  it("should reject negative decimal strings", () => {
    expect(() => parseExactDecimal("-5", 6, "USDC")).toThrow(DecimalParseError);
  });

  it("should reject malformed decimal strings with invalid characters", () => {
    expect(() => parseExactDecimal("3.2.1", 6, "USDC")).toThrow(DecimalParseError);
    expect(() => parseExactDecimal("abc", 6, "USDC")).toThrow(DecimalParseError);
  });

  it("should reject precision exceeding maximum token decimals", () => {
    // 7 decimal places for a 6-decimal token
    expect(() => parseExactDecimal("3.1234567", 6, "USDC")).toThrow(DecimalParseError);
  });

  it("should validate loss percentage bounds (0 to 100)", () => {
    expect(validateLossPercent(8).isValid).toBe(true);
    expect(validateLossPercent(-1).isValid).toBe(false);
    expect(validateLossPercent(101).isValid).toBe(false);
  });

  it("should reject past or equal horizon timestamp", () => {
    const now = Date.now();
    expect(validateHorizonTimestamp(now + 10000, now).isValid).toBe(true);
    expect(validateHorizonTimestamp(now - 10000, now).isValid).toBe(false);
  });
});
