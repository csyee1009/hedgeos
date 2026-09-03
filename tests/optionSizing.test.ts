import { describe, expect, it } from "vitest";
import { OptionSizingAdapter } from "../src/services/OptionSizingAdapter";
import { TokenAmount } from "../src/types";

describe("OptionSizingAdapter Tests", () => {
  it("should resolve 2.0 ETH spot exposure to 2.0 18-decimal option contracts", () => {
    const ethExposure: TokenAmount = {
      amountBaseUnits: "2000000000000000000",
      decimals: 18,
      symbol: "ETH",
    };

    const res = OptionSizingAdapter.resolveSizing(ethExposure, "ETH");
    expect(res.sizingStatus).toBe("RESOLVED");
    expect(res.resolvedOptionQuantity?.amountBaseUnits).toBe("2000000000000000000");
    expect(res.resolvedOptionQuantity?.decimals).toBe(18);
    expect(res.underlyingUnitsPerContract).toBe(1.0);
  });

  it("should resolve 0.5 BTC (8 decimals) to 0.5 18-decimal option contracts", () => {
    const btcExposure: TokenAmount = {
      amountBaseUnits: "50000000", // 0.5 BTC in 8 decimals
      decimals: 8,
      symbol: "BTC",
    };

    const res = OptionSizingAdapter.resolveSizing(btcExposure, "BTC");
    expect(res.sizingStatus).toBe("RESOLVED");
    expect(res.resolvedOptionQuantity?.amountBaseUnits).toBe("500000000000000000"); // 0.5 * 10^18
    expect(res.resolvedOptionQuantity?.decimals).toBe(18);
  });

  it("should return NOT_RESOLVED for unsupported assets rather than guessing", () => {
    const randomExposure: TokenAmount = {
      amountBaseUnits: "1000000000000000000",
      decimals: 18,
      symbol: "RANDOM_MEME",
    };

    const res = OptionSizingAdapter.resolveSizing(randomExposure, "RANDOM_MEME");
    expect(res.sizingStatus).toBe("NOT_RESOLVED");
    expect(res.resolvedOptionQuantity).toBeUndefined();
    expect(res.error).toContain("not currently verified");
  });

  it("should return NOT_RESOLVED for non-positive exposure amounts", () => {
    const zeroExposure: TokenAmount = {
      amountBaseUnits: "0",
      decimals: 18,
      symbol: "ETH",
    };

    const res = OptionSizingAdapter.resolveSizing(zeroExposure, "ETH");
    expect(res.sizingStatus).toBe("NOT_RESOLVED");
  });
});
