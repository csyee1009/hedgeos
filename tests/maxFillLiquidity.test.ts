import { describe, expect, it } from "vitest";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";

describe("OptionBook Max Fill & Available Collateral Tests", () => {
  const service = new ThetanutsMarketService();

  it("should NOT treat availableAmount directly as option contracts", () => {
    // 10,000 USDC collateral (6 decimals) at $2,500 strike
    const order = {
      availableAmount: "10000000000", // 10,000 USDC
      strikes: ["250000000000"], // $2,500 strike (8 decimals)
    };

    const maxContracts = service.calculateMaxContracts(order);
    // (10,000 * 1e6 * 1e8) / (2500 * 1e8) = 4,000,000 (4.0 contracts scaled)
    expect(maxContracts).toBe(4000000n);
    expect(maxContracts).not.toBe(BigInt(order.availableAmount));
  });

  it("should correctly compute max fillable contracts across different strikes", () => {
    // 10,000 USDC collateral at $2,000 strike -> 5.0 contracts
    const order2000 = {
      availableAmount: "10000000000",
      strikes: ["200000000000"],
    };
    expect(service.calculateMaxContracts(order2000)).toBe(5000000n);

    // 10,000 USDC collateral at $5,000 strike -> 2.0 contracts
    const order5000 = {
      availableAmount: "10000000000",
      strikes: ["500000000000"],
    };
    expect(service.calculateMaxContracts(order5000)).toBe(2000000n);
  });

  it("should return 0 contracts when availableAmount is 0", () => {
    const zeroOrder = {
      availableAmount: "0",
      strikes: ["250000000000"],
    };
    expect(service.calculateMaxContracts(zeroOrder)).toBe(0n);
  });
});
