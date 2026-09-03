import { describe, expect, it } from "vitest";
import { IntentEngine } from "../src/services/IntentEngine";

describe("IntentEngine Natural Language Parsing & Draft Unresolved Values Tests", () => {
  const engine = new IntentEngine();

  it("Test 1: 'Protect my ETH.' should extract asset ETH and keep exposure/loss/budget/horizon unresolved (null)", async () => {
    const prompt = "Protect my ETH.";
    const result = await engine.parseNaturalLanguage(prompt);

    expect(result.candidateDraft.asset?.value).toBe("ETH");
    expect(result.candidateDraft.exposureAmount).toBeNull();
    expect(result.candidateDraft.targetMaxLossPercent).toBeNull();
    expect(result.candidateDraft.maxPremiumUSDC).toBeNull();
    expect(result.candidateDraft.horizonTimestamp).toBeNull();
    expect(result.missingFields).toContain("exposureAmount");
    expect(result.missingFields).toContain("targetMaxLossPercent");
    expect(result.missingFields).toContain("maxPremiumUSDC");
    expect(result.missingFields).toContain("horizonTimestamp");
  });

  it("Test 2: 'Protect me until Friday. Max downside 8%. Budget 3 USDC.' should keep asset/exposure unresolved (USDC must NOT become exposure asset)", async () => {
    const prompt = "Protect me until Friday. Max downside 8%. Budget 3 USDC.";
    const result = await engine.parseNaturalLanguage(prompt);

    expect(result.candidateDraft.asset).toBeNull();
    expect(result.candidateDraft.exposureAmount).toBeNull();
    expect(result.candidateDraft.maxPremiumUSDC?.value.amountBaseUnits).toBe("3000000");
    expect(result.missingFields).toContain("asset");
    expect(result.missingFields).toContain("exposureAmount");
  });

  it("Test 3: 'I have 2 ETH. Budget 3 USDC.' should extract asset ETH, exposure 2 ETH, budget 3 USDC, leaving loss/horizon unresolved", async () => {
    const prompt = "I have 2 ETH. Budget 3 USDC.";
    const result = await engine.parseNaturalLanguage(prompt);

    expect(result.candidateDraft.asset?.value).toBe("ETH");
    expect(result.candidateDraft.exposureAmount?.value.amountBaseUnits).toBe("2000000000000000000");
    expect(result.candidateDraft.maxPremiumUSDC?.value.amountBaseUnits).toBe("3000000");
    expect(result.candidateDraft.targetMaxLossPercent).toBeNull();
    expect(result.candidateDraft.horizonTimestamp).toBeNull();
    expect(result.missingFields).toContain("targetMaxLossPercent");
    expect(result.missingFields).toContain("horizonTimestamp");
  });

  it("Test 4: 'I have 2 ETH until 2026-09-15. Max downside 8%. Budget 3 USDC.' should resolve horizon to 2026-09-15 EOD MYT, NOT upcoming Friday", async () => {
    const prompt = "I have 2 ETH until 2026-09-15. Max downside 8%. Budget 3 USDC.";
    const result = await engine.parseNaturalLanguage(prompt);

    expect(result.candidateDraft.horizonTimestamp?.value.formattedDisplay).toContain("September 15, 2026");
    expect(result.candidateDraft.horizonTimestamp?.value.formattedDisplay).not.toContain("Friday");
  });

  it("Test 5: Prompt with no horizon should leave horizon unresolved (null)", async () => {
    const prompt = "I have 2 ETH. Max downside 8%. Budget 3 USDC.";
    const result = await engine.parseNaturalLanguage(prompt);

    expect(result.candidateDraft.horizonTimestamp).toBeNull();
    expect(result.missingFields).toContain("horizonTimestamp");
  });

  it("Test 6: Prompt with past explicit date should flag past date ambiguity", async () => {
    const prompt = "I have 2 ETH until 2020-01-01. Max downside 8%. Budget 3 USDC.";
    const result = await engine.parseNaturalLanguage(prompt);

    expect(result.ambiguitiesFound.some((a) => a.toLowerCase().includes("past"))).toBe(true);
    expect(result.candidateDraft.horizonTimestamp).toBeNull();
  });

  it("should ensure parsed draft starts with confirmedByUser = false and no auto-confirmation", async () => {
    const prompt = "I have 2 ETH. Protect me until Friday. Max downside 8%. Budget 3 USDC.";
    const result = await engine.parseNaturalLanguage(prompt);

    expect(result.candidateDraft.confirmedByUser).toBe(false);
    expect(result.candidateDraft.confirmedAtMs).toBeUndefined();
  });
});
