import { describe, expect, it } from "vitest";
import { getNextFridayMYT, IntentEngine } from "../src/services/IntentEngine";

describe("IntentEngine Natural Language Parsing & Horizon Tests", () => {
  const engine = new IntentEngine();

  it("should parse natural language prompt into ParsedRiskIntentDraft", async () => {
    const prompt = "Protect my 2 ETH until Friday. Max downside 8%, budget 3 USDC.";
    const result = await engine.parseNaturalLanguage(prompt);

    expect(result.adapterName).toBe("DEVELOPMENT_ADAPTER");
    expect(result.candidateDraft.asset?.value).toBe("ETH");
    expect(result.candidateDraft.exposureAmount?.value.amountBaseUnits).toBe("2000000000000000000");
    expect(result.candidateDraft.exposureAmount?.value.decimals).toBe(18);
    expect(result.candidateDraft.exposureAmount?.value.symbol).toBe("ETH");

    expect(result.candidateDraft.maxPremiumUSDC?.value.amountBaseUnits).toBe("3000000");
    expect(result.candidateDraft.maxPremiumUSDC?.value.decimals).toBe(6);
    expect(result.candidateDraft.maxPremiumUSDC?.value.symbol).toBe("USDC");

    expect(result.candidateDraft.targetMaxLossPercent?.value).toBe(8);
    expect(result.candidateDraft.confirmedByUser).toBe(false);
  });

  it("should mark missing fields explicitly as null/unresolved and add to missingFields", async () => {
    const prompt = "Protect ETH";
    const result = await engine.parseNaturalLanguage(prompt);

    expect(result.candidateDraft.exposureAmount).toBeNull();
    expect(result.candidateDraft.targetMaxLossPercent).toBeNull();
    expect(result.candidateDraft.maxPremiumUSDC).toBeNull();
    expect(result.candidateDraft.horizonTimestamp).toBeNull();
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it("should resolve 'Friday' to an actual next Friday 11:59 PM MYT using timestampMs", () => {
    const fixedMondayMs = Date.parse("2026-08-31T10:00:00.000Z");
    const result = getNextFridayMYT(fixedMondayMs);

    expect(result.timezone).toContain("MYT");
    expect(result.isoString).toContain("2026-09-04T15:59:59");
    expect(result.timestampMs).toBeGreaterThan(fixedMondayMs);
    expect(typeof result.timestampMs).toBe("number");
  });
});
