import { describe, expect, it } from "vitest";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";

describe("Read-Only Premium Preview Dry-Run Tests", () => {
  const service = new ThetanutsMarketService();

  it("should normalize read-only preview dry-run into PremiumPreview domain model", async () => {
    const rawOrder = {
      pricePerContract: "455690356", // $4.5569 USD per contract (8 decimals)
      collateral: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      expiry: 1788249600,
      maker: "0xEcda1D002FBC55F2Fd3386bB4B9B95F859f3C39E",
    };

    // 2.0 ETH option contracts (2 * 10^18)
    const preview = await service.previewFill(rawOrder, 2000000000000000000n);

    expect(preview.previewStatus).toBe("PREVIEW_AVAILABLE");
    expect(preview.pricePerContract.symbol).toBe("USD");
    expect(preview.pricePerContract.decimals).toBe(8);
    expect(preview.premiumAmount.symbol).toBe("USDC");
    expect(preview.premiumAmount.decimals).toBe(6);
    expect(preview.totalExpectedCost.symbol).toBe("USDC");
    expect(preview.previewSource).toBe("THETANUTS_OPTIONBOOK_PREVIEW");

    // 2 contracts * $4.5569 = ~$9.11 USDC (9113807 base units in 6 dec)
    const costBigInt = BigInt(preview.totalExpectedCost.amountBaseUnits);
    expect(costBigInt).toBeGreaterThan(9000000n);
    expect(costBigInt).toBeLessThan(9300000n);
  });

  it("should capture errors cleanly when preview dry-run encounters failure", async () => {
    const invalidService = new ThetanutsMarketService("");
    const preview = await invalidService.previewFill({});
    expect(preview.previewStatus).toBe("PREVIEW_FAILED");
  });
});
