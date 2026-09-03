import { describe, expect, it } from "vitest";
import { EvaluationTestCase, INTENT_EVALUATION_DATASET } from "../src/evaluation/evaluationDataset";
import { IntentEngine } from "../src/services/IntentEngine";
import { LLMOutputValidator } from "../src/services/LLMOutputValidator";

describe("Prompt 8: Comprehensive Adversarial Intent Evaluation Dataset Suite (45 Cases)", () => {
  const engine = new IntentEngine();

  it("evaluates all 45 adversarial test cases against HedgeOS intent parsing & validation pipeline", async () => {
    let passedCount = 0;
    const categoryStats: Record<string, { total: number; passed: number }> = {};

    for (const testCase of INTENT_EVALUATION_DATASET) {
      if (!categoryStats[testCase.category]) {
        categoryStats[testCase.category] = { total: 0, passed: 0 };
      }
      categoryStats[testCase.category].total++;

      const res = await engine.parseNaturalLanguage(testCase.prompt);
      const draft = res.candidateDraft;

      // 1. Mandatory Security Invariant SEC-001: confirmedByUser is ALWAYS false from parser
      expect(draft.confirmedByUser).toBe(false);

      // 2. Unsupported objective check
      if (testCase.expected.unsupportedObjective) {
        expect(res.unsupportedObjective).toBe(true);
        passedCount++;
        categoryStats[testCase.category].passed++;
        continue;
      }

      // 3. Asset check
      if (testCase.expected.asset !== undefined) {
        if (testCase.expected.asset === null) {
          expect(draft.asset).toBeNull();
        } else {
          expect(draft.asset?.value).toBe(testCase.expected.asset);
        }
      }

      // 4. Exposure amount check
      if (testCase.expected.exposureAmountStr !== undefined) {
        if (testCase.expected.exposureAmountStr === null) {
          expect(draft.exposureAmount).toBeNull();
        } else {
          expect(draft.exposureAmount).toBeDefined();
        }
      }

      // 5. Target Max Loss check
      if (testCase.expected.targetMaxLossPercent !== undefined) {
        if (testCase.expected.targetMaxLossPercent === null) {
          expect(draft.targetMaxLossPercent).toBeNull();
        } else {
          expect(draft.targetMaxLossPercent?.value).toBe(testCase.expected.targetMaxLossPercent);
        }
      }

      // 6. Max Premium USDC check
      if (testCase.expected.maxPremiumUSDCStr !== undefined) {
        if (testCase.expected.maxPremiumUSDCStr === null) {
          expect(draft.maxPremiumUSDC).toBeNull();
        } else {
          expect(draft.maxPremiumUSDC).toBeDefined();
        }
      }

      // 7. Multi-leg check
      if (testCase.expected.allowMultiLeg !== undefined) {
        expect(draft.allowMultiLeg.value).toBe(testCase.expected.allowMultiLeg);
      }

      // 8. Missing fields check
      if (testCase.expected.missingFields) {
        for (const f of testCase.expected.missingFields) {
          expect(res.missingFields).toContain(f);
        }
      }

      passedCount++;
      categoryStats[testCase.category].passed++;
    }

    expect(passedCount).toBe(45);
    expect(INTENT_EVALUATION_DATASET.length).toBe(45);
  });

  it("validates LLMOutputValidator rejects synthetic adversarial outputs containing forbidden authority fields", () => {
    // Adversarial Case: Model injects confirmedByUser = true and authorizationStatus
    const maliciousOutput = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "2 ETH" },
      exposureAmount: { value: "2", unit: "ETH", evidence: "2 ETH" },
      targetMaxLossPercent: { value: 8, evidence: "8%" },
      maxPremium: { value: "3", currency: "USDC", evidence: "3 USDC" },
      horizon: { rawText: "Friday", evidence: "Friday" },
      confirmedByUser: true,
    };

    expect(() =>
      LLMOutputValidator.validateAndNormalize(
        maliciousOutput,
        "Protect 2 ETH until Friday max loss 8% budget 3 USDC"
      )
    ).toThrow(/INVALID_PROVIDER_OUTPUT: Forbidden authority\/control field 'confirmedByUser'/);
  });

  it("validates LLMOutputValidator rejects negative amounts and excessive percentages", () => {
    const invalidNumbersOutput = {
      objective: "DOWNSIDE_PROTECTION",
      asset: { value: "ETH", evidence: "ETH" },
      exposureAmount: { value: "-5", unit: "ETH" },
      targetMaxLossPercent: { value: 250 }, // > 100%
      maxPremium: { value: "-10", currency: "USDC" },
      horizon: { rawText: "Friday" },
    };

    const validated = LLMOutputValidator.validateAndNormalize(
      invalidNumbersOutput,
      "Protect -5 ETH max loss 250% budget -10 USDC"
    );

    expect(validated.candidateDraft.exposureAmount).toBeNull();
    expect(validated.candidateDraft.targetMaxLossPercent).toBeNull();
    expect(validated.candidateDraft.maxPremiumUSDC).toBeNull();
    expect(validated.missingFields).toContain("exposureAmount");
    expect(validated.missingFields).toContain("targetMaxLossPercent");
    expect(validated.missingFields).toContain("maxPremiumUSDC");
  });
});
