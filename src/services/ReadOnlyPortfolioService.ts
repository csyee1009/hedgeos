import { ThetanutsClient } from "@thetanuts-finance/thetanuts-client";
import { ethers } from "ethers";
import { PortfolioTokenBalance, ReadOnlyPortfolioSnapshot } from "../types";

const ERC20_BALANCE_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];

export class ReadOnlyPortfolioService {
  private rpcUrl: string;

  constructor(customRpcUrl?: string) {
    if (customRpcUrl !== undefined) {
      this.rpcUrl = customRpcUrl;
    } else if (process.env.BASE_RPC_URL) {
      this.rpcUrl = process.env.BASE_RPC_URL;
    } else {
      this.rpcUrl = "";
    }
  }

  public validateAddress(address: string): boolean {
    if (!address || typeof address !== "string") {
      return false;
    }
    return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
  }

  public async analyzePortfolio(
    rawAddress: string
  ): Promise<ReadOnlyPortfolioSnapshot> {
    if (!rawAddress || !this.validateAddress(rawAddress)) {
      throw new Error(
        "Invalid EVM address format. Must be 0x followed by 40 hexadecimal characters."
      );
    }

    const address = rawAddress.trim().toLowerCase();

    if (!this.rpcUrl) {
      return {
        address,
        chainId: 8453,
        capturedAtMs: Date.now(),
        balances: [],
        status: "UNAVAILABLE",
        warnings: [
          "BASE_RPC_URL not configured. Live Base Mainnet balance reads require a valid RPC endpoint.",
        ],
      };
    }

    const provider = new ethers.JsonRpcProvider(this.rpcUrl);

    try {
      const network = await provider.getNetwork();
      if (network.chainId !== 8453n) {
        throw new Error("Configured RPC is not Base Mainnet.");
      }
    } catch {
      throw new Error(
        "Configured RPC could not be verified as Base Mainnet (chainId 8453)."
      );
    }

    const client = new ThetanutsClient({ chainId: 8453, provider });
    const chainConfig = (client as any).chainConfig;

    if (!chainConfig || !chainConfig.collateralTokens) {
      throw new Error(
        "SDK chain configuration unavailable for Base Mainnet (chainId 8453)."
      );
    }

    const balances: PortfolioTokenBalance[] = [];
    const warnings: string[] = [];
    let hasFailure = false;

    // 1. Native ETH Read
    try {
      const ethBalance = await provider.getBalance(address);
      const amountBaseUnits = ethBalance.toString();
      const formattedAmount = ethers.formatUnits(ethBalance, 18);

      balances.push({
        asset: "ETH",
        displaySymbol: "ETH",
        amountBaseUnits,
        decimals: 18,
        formattedAmount,
        source: "BASE_MAINNET_READ",
      });
    } catch {
      hasFailure = true;
      warnings.push(
        "Native ETH balance could not be read from the configured Base Mainnet RPC."
      );
    }

    // 2. Token Definitions from SDK Verified Config
    const tokenConfigs: Array<{
      asset: "WETH" | "CBBTC" | "USDC";
      displaySymbol: string;
      decimals: number;
      tokenAddress: string | undefined;
    }> = [
        {
          asset: "WETH",
          displaySymbol: "WETH",
          decimals: 18,
          tokenAddress: chainConfig.collateralTokens?.WETH?.address,
        },
        {
          asset: "CBBTC",
          displaySymbol: "cbBTC",
          decimals: 8,
          tokenAddress:
            chainConfig.collateralTokens?.cbBTC?.address ||
            chainConfig.collateralTokens?.aBascbBTC?.address,
        },
        {
          asset: "USDC",
          displaySymbol: "USDC",
          decimals: 6,
          tokenAddress: chainConfig.collateralTokens?.USDC?.address,
        },
      ];

    // 3. Read ERC-20 Balances
    for (const t of tokenConfigs) {
      if (!t.tokenAddress) {
        hasFailure = true;
        warnings.push(
          `Verified token contract address for ${t.displaySymbol} was not found in SDK chainConfig.`
        );
        continue;
      }

      if (!ethers.isAddress(t.tokenAddress)) {
        hasFailure = true;
        warnings.push(
          `Verified token configuration for ${t.displaySymbol} is invalid.`
        );
        continue;
      }

      try {
        const contract = new ethers.Contract(
          t.tokenAddress,
          ERC20_BALANCE_ABI,
          provider
        );
        const tokenBalance: bigint = await contract.balanceOf(address);
        const amountBaseUnits = tokenBalance.toString();
        const formattedAmount = ethers.formatUnits(tokenBalance, t.decimals);

        balances.push({
          asset: t.asset,
          displaySymbol: t.displaySymbol,
          amountBaseUnits,
          decimals: t.decimals,
          formattedAmount,
          tokenAddress: t.tokenAddress,
          source: "BASE_MAINNET_READ",
        });
      } catch {
        hasFailure = true;
        warnings.push(
          `${t.displaySymbol} balance could not be read from the verified Base token contract.`
        );
      }
    }

    let status: ReadOnlyPortfolioSnapshot["status"] = "AVAILABLE";
    if (balances.length === 0) {
      status = "UNAVAILABLE";
    } else if (hasFailure) {
      status = "PARTIAL";
    }

    return {
      address,
      chainId: 8453,
      capturedAtMs: Date.now(),
      balances,
      status,
      warnings,
    };
  }
}