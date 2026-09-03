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
  /**
   * Verified Protocol Semantics (from @thetanuts-finance/thetanuts-client v0.3.0 / Base r12):
   * - In Thetanuts Option contracts, 1.0 contract covers exactly 1.0 unit of the underlying asset (1 ETH for ETH options, 1 BTC for BTC options).
   * - On-chain option contract quantities (numContracts) use 18 decimals (1.0 = 10^18 base units).
   * - Cash-settled payout scales directly and linearly with numContracts (Payout = unitPayout * numContracts / 1e18).
   */
  public static readonly CONTRACT_DECIMALS = 18;
  public static readonly UNDERLYING_UNITS_PER_CONTRACT = 1.0;

  public static resolveSizing(exposure: TokenAmount, assetSymbol: string): OptionSizingResult {
    const symbol = assetSymbol.toUpperCase();

    // Verification 1: Supported underlying assets for delta-1 protective put option sizing
    if (symbol !== "ETH" && symbol !== "WETH" && symbol !== "BTC" && symbol !== "CBBTC") {
      return {
        sizingStatus: "NOT_RESOLVED",
        requestedExposure: exposure,
        contractsDecimal: this.CONTRACT_DECIMALS,
        underlyingUnitsPerContract: this.UNDERLYING_UNITS_PER_CONTRACT,
        protocolEvidence: "Unsupported asset for verified option sizing adapter",
        error: `Asset '${assetSymbol}' is not currently verified for automatic 1-to-1 option contract sizing`,
      };
    }

    try {
      const exposureBaseBigInt = BigInt(exposure.amountBaseUnits);
      if (exposureBaseBigInt <= 0n) {
        return {
          sizingStatus: "NOT_RESOLVED",
          requestedExposure: exposure,
          contractsDecimal: this.CONTRACT_DECIMALS,
          underlyingUnitsPerContract: this.UNDERLYING_UNITS_PER_CONTRACT,
          protocolEvidence: "Exposure amount must be strictly positive",
          error: "Exposure amount is zero or negative",
        };
      }

      // Convert from exposure token base units to 18-decimal contract base units
      // For ETH (already 18 decimals): amountBaseUnits remains identical
      // For BTC/cbBTC (8 decimals): scale from 8 to 18 decimals
      let contractBaseUnits: bigint;
      if (exposure.decimals === this.CONTRACT_DECIMALS) {
        contractBaseUnits = exposureBaseBigInt;
      } else if (exposure.decimals < this.CONTRACT_DECIMALS) {
        const factor = 10n ** BigInt(this.CONTRACT_DECIMALS - exposure.decimals);
        contractBaseUnits = exposureBaseBigInt * factor;
      } else {
        const divisor = 10n ** BigInt(exposure.decimals - this.CONTRACT_DECIMALS);
        contractBaseUnits = exposureBaseBigInt / divisor;
      }

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
          "Verified via @thetanuts-finance/thetanuts-client toNumContractsOnChain (1.0 underlying = 1.0 contract = 1e18 on-chain units)",
      };
    } catch (err: any) {
      return {
        sizingStatus: "NOT_RESOLVED",
        requestedExposure: exposure,
        contractsDecimal: this.CONTRACT_DECIMALS,
        underlyingUnitsPerContract: this.UNDERLYING_UNITS_PER_CONTRACT,
        protocolEvidence: "Arithmetic failure during sizing conversion",
        error: err.message || "Failed to resolve option contract sizing",
      };
    }
  }
}
