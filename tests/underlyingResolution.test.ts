import { describe, expect, it } from "vitest";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";

describe("Deterministic Underlying Identification Tests", () => {
  const service = new ThetanutsMarketService();

  it("should deterministically map ETH price feed to ETH asset without strike heuristics", () => {
    const rawOrder = {
      priceFeed: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
      strikes: ["226000000000"],
    };
    const resolved = service.resolveUnderlying(rawOrder);
    expect(resolved).toBe("ETH");
  });

  it("should deterministically map BTC price feed to BTC asset without strike heuristics", () => {
    const rawOrder = {
      priceFeed: "0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F",
      strikes: ["8000000000000"],
    };
    const resolved = service.resolveUnderlying(rawOrder);
    expect(resolved).toBe("BTC");
  });

  it("should deterministically map rawApiData nested priceFeed", () => {
    const rawOrder = {
      rawApiData: {
        priceFeed: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
      },
    };
    const resolved = service.resolveUnderlying(rawOrder);
    expect(resolved).toBe("ETH");
  });

  it("should deterministically map token collateral address for wrapped assets", () => {
    const rawOrder = {
      collateral: "0xD4a0e0b9149BCee3C920d2E00b5dE09138fd8bb7", // aBasWETH on Base
    };
    const resolved = service.resolveUnderlying(rawOrder);
    expect(resolved).toBe("ETH");
  });

  it("should return UNDERLYING_NOT_RESOLVED for unknown or empty feeds rather than guessing from strikes", () => {
    const rawOrder = {
      priceFeed: "0x0000000000000000000000000000000000000000",
      strikes: ["240000000000"], // Strike looks like ETH, but protocol mapping is missing
    };
    const resolved = service.resolveUnderlying(rawOrder);
    expect(resolved).toBe("UNDERLYING_NOT_RESOLVED");
  });
});
