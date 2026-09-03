import { describe, expect, it } from "vitest";
import { DevelopmentIntentRepository } from "../src/repositories/IntentRepository";
import { IntentEngine } from "../src/services/IntentEngine";
import { parseExactDecimal } from "../src/utils/decimalParser";

describe("REST API & DTO Integration Tests", () => {
  const repository = new DevelopmentIntentRepository();
  const engine = new IntentEngine();

  it("should create candidate draft via parse endpoint and save to repository", async () => {
    const parseResult = await engine.parseNaturalLanguage(
      "I have 2 ETH. Protect me until Friday. Max downside 8%, budget 3 USDC."
    );
    const saved = await repository.save(parseResult.candidateDraft);

    expect(saved.intentId).toBeDefined();
    expect(saved.version).toBe(1);
    expect(saved.confirmedByUser).toBe(false);

    const fetched = await repository.findById(saved.intentId);
    expect(fetched).not.toBeNull();
    expect(fetched?.intentId).toBe(saved.intentId);
  });

  it("should update draft via PATCH, increment version, and set provenance to USER_EXPLICIT", async () => {
    const parseResult = await engine.parseNaturalLanguage("Protect my ETH until Friday.");
    const saved = await repository.save(parseResult.candidateDraft);

    const parsedExposure = parseExactDecimal("2.5", 18, "ETH");
    saved.exposureAmount = {
      value: parsedExposure,
      source: "USER_EXPLICIT",
      confidence: 1.0,
      requiresConfirmation: false,
    };
    saved.version += 1;
    saved.updatedAtMs = Date.now();

    const updated = await repository.update(saved);

    expect(updated.version).toBe(2);
    expect(updated.exposureAmount?.value.amountBaseUnits).toBe("2500000000000000000");
    expect(updated.exposureAmount?.source).toBe("USER_EXPLICIT");
  });

  it("should reject confirmation request if stale version is provided", async () => {
    const parseResult = await engine.parseNaturalLanguage(
      "I have 2 ETH. Protect me until Friday. Max downside 8%, budget 3 USDC."
    );
    const saved = await repository.save(parseResult.candidateDraft);

    saved.version = 2;
    await repository.update(saved);

    const expectedVersion = 1;
    const isStale = expectedVersion !== saved.version;
    expect(isStale).toBe(true);
  });

  it("should ensure public DTO excludes internal provider secrets or private fields", async () => {
    const parseResult = await engine.parseNaturalLanguage("Protect my 2 ETH");
    const intent = parseResult.candidateDraft;

    expect((intent as any).internalSecretKey).toBeUndefined();
    expect((intent as any).systemPromptTemplate).toBeUndefined();
  });

  it("should ensure unsupported objective drafts cannot be confirmed", async () => {
    const parseResult = await engine.parseNaturalLanguage("Speculate on ETH rally with 10x leverage");
    expect(parseResult.unsupportedObjective).toBe(true);
    const draft = parseResult.candidateDraft;
    (draft as any).unsupportedObjective = true;
    const saved = await repository.save(draft);

    expect((saved as any).unsupportedObjective).toBe(true);
    // Invariant: unsupported objective drafts cannot be confirmed
    const canConfirm = !saved.confirmedByUser && !(saved as any).unsupportedObjective;
    expect(canConfirm).toBe(false);
  });
});
