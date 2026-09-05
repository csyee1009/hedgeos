import { AtExpiryPayoffSummary, TokenAmount } from "../types";

const POW10 = (decimals: number) => 10n ** BigInt(decimals);

export function scaleExact(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
  if (fromDecimals === toDecimals) return amount;
  if (fromDecimals < toDecimals) return amount * POW10(toDecimals - fromDecimals);
  const divisor = POW10(fromDecimals - toDecimals);
  if (amount % divisor !== 0n) {
    throw new Error(`Amount cannot be represented exactly at ${toDecimals} decimals`);
  }
  return amount / divisor;
}

export function parseDecimalFraction(value: string | number): { numerator: bigint; denominator: bigint } {
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error("Invalid non-negative decimal");
  const [whole, fraction = ""] = raw.split(".");
  const denominator = POW10(fraction.length);
  return { numerator: BigInt(`${whole}${fraction}`), denominator };
}

export function ratioLessThanOrEqualPercent(
  numerator: bigint,
  denominator: bigint,
  percent: string | number
): boolean {
  if (numerator < 0n || denominator <= 0n) return false;
  const target = parseDecimalFraction(percent);
  return numerator * 100n * target.denominator <= denominator * target.numerator;
}

export function compareRatios(
  aNumerator: bigint,
  aDenominator: bigint,
  bNumerator: bigint,
  bDenominator: bigint
): number {
  const left = aNumerator * bDenominator;
  const right = bNumerator * aDenominator;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function tokenAmountLessThanOrEqual(a: TokenAmount, b: TokenAmount): boolean {
  if (a.symbol.toUpperCase() !== b.symbol.toUpperCase()) return false;
  const decimals = Math.max(a.decimals, b.decimals);
  return BigInt(a.amountBaseUnits) * POW10(decimals - a.decimals)
    <= BigInt(b.amountBaseUnits) * POW10(decimals - b.decimals);
}

export interface ExactLongPutPayoffInput {
  quantity18: bigint;
  strikePrice8: bigint;
  spotPrice8: bigint;
  totalCostUSDC6: bigint;
  assetSymbol: string;
  calculatedAtMs?: number;
}

/**
 * Authoritative policy math for a fully covered long put at expiry.
 * Values stay integral: spot and strike use USD 8 decimals, cost uses USDC 6.
 */
export function calculateExactLongPutPayoff(input: ExactLongPutPayoffInput): AtExpiryPayoffSummary {
  const { quantity18, strikePrice8, spotPrice8, totalCostUSDC6, assetSymbol } = input;
  if (quantity18 <= 0n || strikePrice8 <= 0n || spotPrice8 <= 0n || totalCostUSDC6 < 0n) {
    throw new Error("Invalid exact payoff inputs");
  }

  const exposureValuePrice8 = spotPrice8 * quantity18 / POW10(18);
  const strikeValuePrice8 = strikePrice8 * quantity18 / POW10(18);
  const totalCostPrice8 = totalCostUSDC6 * 100n;
  const protectedFloorValuePrice8 = strikeValuePrice8 > totalCostPrice8
    ? strikeValuePrice8 - totalCostPrice8
    : 0n;
  const maxLossValuePrice8 = exposureValuePrice8 > protectedFloorValuePrice8
    ? exposureValuePrice8 - protectedFloorValuePrice8
    : 0n;

  const toNumber = (amount: bigint, decimals: number) => Number(amount) / 10 ** decimals;
  const downside = Number(maxLossValuePrice8 * 1_000_000n / exposureValuePrice8) / 10_000;
  const costImpact = Number(totalCostPrice8 * 1_000_000n / exposureValuePrice8) / 10_000;
  const spotQuantity = toNumber(quantity18, 18);
  const spot = toNumber(spotPrice8, 8);
  const strike = toNumber(strikePrice8, 8);
  const cost = toNumber(totalCostUSDC6, 6);
  const exposure = toNumber(exposureValuePrice8, 8);
  const floor = toNumber(protectedFloorValuePrice8, 8);
  const scenarioBps = [11_000n, 10_000n, 9_500n, 9_200n, 8_500n, 7_000n, 5_000n];
  const labels = ["+10% Spot Rally", "Unchanged (0%)", "-5% Market Dip", "-8% Reference", "-15% Correction", "-30% Severe Fall", "-50% Extreme Fall"];
  const scenarios = scenarioBps.map((factor, index) => {
    const scenarioSpot8 = spotPrice8 * factor / 10_000n;
    const spotValue8 = scenarioSpot8 * quantity18 / POW10(18);
    const intrinsic8 = strikePrice8 > scenarioSpot8
      ? (strikePrice8 - scenarioSpot8) * quantity18 / POW10(18)
      : 0n;
    const value8 = spotValue8 + intrinsic8 > totalCostPrice8
      ? spotValue8 + intrinsic8 - totalCostPrice8
      : 0n;
    const pnl8 = value8 - exposureValuePrice8;
    return {
      spotPriceScenarioUSD: toNumber(scenarioSpot8, 8),
      scenarioLabel: labels[index],
      portfolioValueUSD: toNumber(value8, 8),
      pnlUSD: toNumber(pnl8, 8),
      pnlPercent: Number(pnl8 * 1_000_000n / exposureValuePrice8) / 10_000,
    };
  });

  return {
    status: "CALCULATED",
    spotExposureQuantity: `${spotQuantity} ${assetSymbol}`,
    spotReferencePriceUSD: spot,
    spotExposureValueUSD: exposure,
    strikePriceUSD: strike,
    protectedFloorValueUSD: floor,
    effectiveDownsidePercent: downside,
    totalProtectionCostUSD: cost,
    costImpactPercent: costImpact,
    isConstantFloorGuaranteed: true,
    scenarios,
    details: `MODELED AT EXPIRY: fully covered long-put floor ${floor.toFixed(2)} USD after ${cost.toFixed(2)} USDC buyer spend. This is a model under stated assumptions, not a guarantee.`,
    calculationTimestampMs: input.calculatedAtMs ?? Date.now(),
    exact: {
      exposureValuePrice8: exposureValuePrice8.toString(),
      protectedFloorValuePrice8: protectedFloorValuePrice8.toString(),
      maxLossValuePrice8: maxLossValuePrice8.toString(),
      totalCostUSDC6: totalCostUSDC6.toString(),
      quantity18: quantity18.toString(),
      strikePrice8: strikePrice8.toString(),
      spotPrice8: spotPrice8.toString(),
    },
  };
}

export function usdc6ForContracts6(contracts6: bigint, pricePerContract8: bigint): bigint {
  if (contracts6 <= 0n || pricePerContract8 <= 0n) throw new Error("Invalid contracts or price");
  return (contracts6 * pricePerContract8 + 100_000_000n - 1n) / 100_000_000n;
}
