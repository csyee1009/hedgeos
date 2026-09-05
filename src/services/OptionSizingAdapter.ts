import { SizingStatus, TokenAmount } from "../types";

export interface OptionSizingResult {
  sizingStatus: SizingStatus;
  requestedExposure: TokenAmount;
  resolvedOptionQuantity?: TokenAmount;
  contractsDecimal: number;
  underlyingUnitsPerContract: number;
  protocolEvidence: string;
  error?: string;
}

export class OptionSizingAdapter {
  public static readonly CONTRACT_DECIMALS = 18;
  public static readonly UNDERLYING_UNITS_PER_CONTRACT = 1;

  private static readonly VERIFIED_ASSET_DECIMALS: Record<string, number> = {
    ETH: 18,
    WETH: 18,
    BTC: 8,
    CBBTC: 8,
  };

  public static resolveSizing(
    exposure: TokenAmount,
    assetSymbol: string
  ): OptionSizingResult {
    const symbol = assetSymbol.toUpperCase();
    const expectedDecimals = this.VERIFIED_ASSET_DECIMALS[symbol];

    if (expectedDecimals === undefined) {
      return {
        sizingStatus: "NOT_RESOLVED",
        requestedExposure: exposure,
        contractsDecimal: this.CONTRACT_DECIMALS,
        underlyingUnitsPerContract: this.UNDERLYING_UNITS_PER_CONTRACT,
        protocolEvidence:
          "Unsupported asset for verified protective-put option sizing",
        error: `Asset '${assetSymbol}' is not currently verified for automatic 1-to-1 option contract sizing`,
      };
    }

    if (exposure.decimals !== expectedDecimals) {
      return {
        sizingStatus: "NOT_RESOLVED",
        requestedExposure: exposure,
        contractsDecimal: this.CONTRACT_DECIMALS,
        underlyingUnitsPerContract: this.UNDERLYING_UNITS_PER_CONTRACT,
        protocolEvidence:
          "Exposure token decimals do not match the verified asset configuration",
        error: `${symbol} exposure must use ${expectedDecimals} decimals, received ${exposure.decimals}`,
      };
    }

    try {
      const exposureBaseUnits = BigInt(exposure.amountBaseUnits);

      if (exposureBaseUnits <= 0n) {
        return {
          sizingStatus: "NOT_RESOLVED",
          requestedExposure: exposure,
          contractsDecimal: this.CONTRACT_DECIMALS,
          underlyingUnitsPerContract: this.UNDERLYING_UNITS_PER_CONTRACT,
          protocolEvidence: "Exposure amount must be strictly positive",
          error: "Exposure amount is zero or negative",
        };
      }

      const decimalDifference =
        this.CONTRACT_DECIMALS - expectedDecimals;

      const contractBaseUnits =
        decimalDifference === 0
          ? exposureBaseUnits
          : exposureBaseUnits * 10n ** BigInt(decimalDifference);

      const resolvedQuantity: TokenAmount = {
        amountBaseUnits: contractBaseUnits.toString(),
        decimals: this.CONTRACT_DECIMALS,
        symbol: "CONTRACTS",
      };

      return {
        sizingStatus: "RESOLVED",
        requestedExposure: exposure,
        resolvedOptionQuantity: resolvedQuantity,
        contractsDecimal: this.CONTRACT_DECIMALS,
        underlyingUnitsPerContract: this.UNDERLYING_UNITS_PER_CONTRACT,
        protocolEvidence:
          "Verified 1-to-1 protective-put sizing: one option contract represents one unit of underlying exposure, normalized to 18-decimal contract units",
      };
    } catch {
      return {
        sizingStatus: "NOT_RESOLVED",
        requestedExposure: exposure,
        contractsDecimal: this.CONTRACT_DECIMALS,
        underlyingUnitsPerContract: this.UNDERLYING_UNITS_PER_CONTRACT,
        protocolEvidence: "Arithmetic failure during sizing conversion",
        error: "Failed to resolve option contract sizing",
      };
    }
  }
}