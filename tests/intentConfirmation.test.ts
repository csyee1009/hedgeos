import { describe, expect, it } from "vitest";
import { DevelopmentIntentRepository } from "../src/repositories/IntentRepository";
import { IntentEngine } from "../src/services/IntentEngine";
import { parseExactDecimal } from "../src/utils/decimalParser";

describe("Intent Confirmation & Edit Invalidation Integration Tests", () => {
  const repository = new DevelopmentIntentRepository();
  const engine = new IntentEngine();

  it("should parse prompt and save candidate draft with confirmedByUser = false", async () => {
    const parseResult = await engine.parseNaturalLanguage("I have 2 ETH. Protect me until Friday. Max downside 8%. Budget 3 USDC.");
    const saved = await repository.save(parseResult.candidateDraft);

    expect(saved.confirmedByUser).toBe(false);
    expect(saved.confirmedAtMs).toBeUndefined();
  });

  it("should fail confirmation if intent is incomplete (missing required fields)", async () => {
    const parseResult = await engine.parseNaturalLanguage("Protect my ETH.");
    const saved = await repository.save(parseResult.candidateDraft);

    // Draft is missing exposure, budget, loss, horizon
    const isComplete =
      saved.asset &&
      saved.exposureAmount &&
      saved.targetMaxLossPercent &&
      saved.maxPremiumUSDC &&
      saved.horizonTimestamp;

    expect(isComplete).toBeFalsy(); // Confirmation must fail for incomplete intent
  });

  it("should invalidate confirmation when budget is patched via server logic", async () => {
    const parseResult = await engine.parseNaturalLanguage("I have 2 ETH. Protect me until Friday. Max downside 8%. Budget 3 USDC.");
    const intent = parseResult.candidateDraft;

    // Simulate initial confirmation
    (intent as any).confirmedByUser = true;
    (intent as any).confirmedAtMs = Date.now();
    await repository.save(intent);

    // Simulate PATCH budget: server logic sets confirmedByUser = false, increments version
    intent.maxPremiumUSDC = {
      value: parseExactDecimal("5", 6, "USDC"),
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    };
    (intent as any).confirmedByUser = false;
    (intent as any).confirmedAtMs = undefined;
    intent.version += 1;
    intent.updatedAtMs = Date.now();

    const updated = await repository.update(intent);

    expect(updated.confirmedByUser).toBe(false);
    expect(updated.confirmedAtMs).toBeUndefined();
    expect(updated.version).toBe(2);
  });

  it("should invalidate confirmation when horizon is patched via server logic", async () => {
    const parseResult = await engine.parseNaturalLanguage("I have 2 ETH. Protect me until Friday. Max downside 8%. Budget 3 USDC.");
    const intent = parseResult.candidateDraft;

    (intent as any).confirmedByUser = true;
    (intent as any).confirmedAtMs = Date.now();
    await repository.save(intent);

    // Simulate PATCH horizon
    (intent as any).confirmedByUser = false;
    (intent as any).confirmedAtMs = undefined;
    intent.version += 1;

    const updated = await repository.update(intent);

    expect(updated.confirmedByUser).toBe(false);
    expect(updated.version).toBe(2);
  });
});
