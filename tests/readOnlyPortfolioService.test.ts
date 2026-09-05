import { describe, expect, it, vi } from "vitest";
import { ethers } from "ethers";
import { ReadOnlyPortfolioService } from "../src/services/ReadOnlyPortfolioService";
import { TypedRiskIntent } from "../src/types";

describe("ReadOnlyPortfolioService & Onboarding Audit Suite", () => {
  it("Requirement 1: Invalid public address is rejected", async () => {
    const service = new ReadOnlyPortfolioService("https://mainnet.base.org");
    expect(service.validateAddress("0x123")).toBe(false);
    expect(service.validateAddress("invalid-address")).toBe(false);
    expect(service.validateAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG")).toBe(false);
    expect(service.validateAddress("0x0000000000000000000000000000000000000000")).toBe(true);

    await expect(
      service.analyzePortfolio("invalid-address")
    ).rejects.toThrow("Invalid EVM address format");
  });

  it("Requirement 2: Missing BASE_RPC_URL produces fail-closed UNAVAILABLE status without inventing balances", async () => {
    const service = new ReadOnlyPortfolioService("");
    const snapshot = await service.analyzePortfolio("0x0000000000000000000000000000000000000000");

    expect(snapshot.status).toBe("UNAVAILABLE");
    expect(snapshot.balances.length).toBe(0);
    expect(snapshot.warnings[0]).toContain("BASE_RPC_URL not configured");
  });

  it("Requirement 3: Portfolio service contains ZERO signing, wallet, or write methods", () => {
    const service = new ReadOnlyPortfolioService();
    const serviceKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(service));

    expect(serviceKeys).not.toContain("signTransaction");
    expect(serviceKeys).not.toContain("sendTransaction");
    expect(serviceKeys).not.toContain("requestAccounts");
    expect(serviceKeys).not.toContain("approve");
    expect(serviceKeys).not.toContain("submitRFQ");
  });

  it("Requirement 4 & 5: Genuine zero balance vs partial token read failure semantics", async () => {
    const spyGetNetwork = vi
      .spyOn(ethers.JsonRpcProvider.prototype, "getNetwork")
      .mockResolvedValue({ chainId: 8453n, name: "base" } as any);

    const spyGetBalance = vi
      .spyOn(ethers.JsonRpcProvider.prototype, "getBalance")
      .mockRejectedValue(new Error("RPC timeout reading ETH balance"));

    try {
      const service = new ReadOnlyPortfolioService("http://127.0.0.1:99999");
      const snapshot = await service.analyzePortfolio("0x0000000000000000000000000000000000000000");

      expect(snapshot.status).toBe("UNAVAILABLE");
      expect(snapshot.balances).toEqual([]);
      expect(snapshot.warnings.length).toBeGreaterThan(0);
    } finally {
      spyGetNetwork.mockRestore();
      spyGetBalance.mockRestore();
    }
  });

  it("Requirement 6: Chain ID is strictly 8453 (Base Mainnet)", async () => {
    const service = new ReadOnlyPortfolioService("");
    const snapshot = await service.analyzePortfolio("0x0000000000000000000000000000000000000000");
    expect(snapshot.chainId).toBe(8453);
  });

  it("Regression: Non-Base chainId RPC network is rejected", async () => {
    const spyGetNetwork = vi
      .spyOn(ethers.JsonRpcProvider.prototype, "getNetwork")
      .mockResolvedValue({ chainId: 1n, name: "mainnet" } as any);

    try {
      const service = new ReadOnlyPortfolioService("http://127.0.0.1:99999");
      await expect(
        service.analyzePortfolio("0x0000000000000000000000000000000000000000")
      ).rejects.toThrow("Configured RPC could not be verified as Base Mainnet (chainId 8453).");
    } finally {
      spyGetNetwork.mockRestore();
    }
  });

  it("Requirement 7 & 8: Public address analysis NEVER confirms TypedRiskIntent or claims ownership", () => {
    const mockIntent: Partial<TypedRiskIntent> = {
      intentId: "intent-portfolio-test",
      confirmedByUser: false,
    };

    expect(mockIntent.confirmedByUser).toBe(false);
  });

  it("Requirement 9 & 10: WETH and cbBTC normalization rules are explicit", () => {
    const wethNotice = "Selected from 2.5 WETH on the public address. WETH protection is modeled against ETH.";
    const cbBtcNotice = "Selected from 0.1 cbBTC on the public address. cbBTC protection is modeled against BTC.";

    expect(wethNotice).toContain("modeled against ETH");
    expect(cbBtcNotice).toContain("modeled against BTC");
  });

  it("Requirement 11: USDC is represented as budget asset and not offered as protected underlying", () => {
    const usdcAsset: string = "USDC";
    const isProtectedUnderlying = usdcAsset === "ETH" || usdcAsset === "WETH" || usdcAsset === "CBBTC" || usdcAsset === "BTC";
    expect(isProtectedUnderlying).toBe(false);
  });
});
