import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildResetSolverState } from "../src/client/App";
import { formatRequestedProtectionQuantity } from "../src/client/components/CandidateList";
import { getHoldingsSourceCopy } from "../src/client/components/IntentReview";
import { RFQSpecificationBuilder } from "../src/services/RFQSpecificationBuilder";
import { IntentEngine } from "../src/services/IntentEngine";
import { ThetanutsMarketService } from "../src/services/ThetanutsMarketService";
import { app, intentRepository } from "../src/server/index";
import { StoredIntent, TypedRiskIntent } from "../src/types";

async function createTwoEthDraft(): Promise<StoredIntent> {
  const parsed = await new IntentEngine().parseNaturalLanguage("I have 2 ETH and want downside protection.");
  return intentRepository.save(parsed.candidateDraft);
}

async function patchIntent(intentId: string, update: object) {
  return request(app).patch(`/api/v1/intents/${intentId}`).send(update);
}

async function createResolvedTwoEthIntent() {
  const draft = await createTwoEthDraft();
  await patchIntent(draft.intentId, { maxPremiumUSDC: { amount: "100" } });
  await patchIntent(draft.intentId, { targetMaxLossPercent: 20 });
  return patchIntent(draft.intentId, {
    horizonTimestampMs: Date.now() + 7 * 24 * 60 * 60 * 1_000,
  });
}

describe("final submission blockers", () => {
  it("keeps 2 ETH as the RFQ requested protection quantity with a 100 USDC budget", async () => {
    const resolved = await createResolvedTwoEthIntent();
    expect(resolved.status).toBe(200);

    const confirmation = await request(app)
      .post(`/api/v1/intents/${resolved.body.candidateIntent.intentId}/confirm`)
      .send({ expectedVersion: resolved.body.candidateIntent.version });
    expect(confirmation.status).toBe(200);

    const built = RFQSpecificationBuilder.buildSpecification(
      confirmation.body.confirmedIntent as TypedRiskIntent,
      2_500,
      ["NO_QUALIFYING_OPTIONBOOK_ORDERS"],
      new ThetanutsMarketService("https://mainnet.base.org"),
    );

    expect(built.specification.requestedContracts.amountBaseUnits).toBe("2000000000000000000");
    expect(built.specification.requestedContracts.amountBaseUnits).not.toBe("100000000000000000000");
    expect(formatRequestedProtectionQuantity(
      built.specification.requestedContracts,
      built.specification.underlying,
    )).toBe("2 ETH");
  });

  it("does not alter exposure when budget is updated", async () => {
    const draft = await createTwoEthDraft();
    const response = await patchIntent(draft.intentId, { maxPremiumUSDC: { amount: "100" } });

    expect(response.status).toBe(200);
    expect(response.body.candidateIntent.exposureAmount.value.amountBaseUnits).toBe("2000000000000000000");
    expect(response.body.candidateIntent.maxPremiumUSDC.value.amountBaseUnits).toBe("100000000");
  });

  it("does not alter budget when exposure is updated", async () => {
    const draft = await createTwoEthDraft();
    const budgetResponse = await patchIntent(draft.intentId, { maxPremiumUSDC: { amount: "100" } });
    const exposureResponse = await patchIntent(draft.intentId, { exposureAmount: { amount: "2" } });

    expect(budgetResponse.status).toBe(200);
    expect(exposureResponse.status).toBe(200);
    expect(exposureResponse.body.candidateIntent.maxPremiumUSDC.value.amountBaseUnits).toBe("100000000");
    expect(exposureResponse.body.candidateIntent.exposureAmount.value.amountBaseUnits).toBe("2000000000000000000");
  });

  it("persists resolved intent metadata without stale missing fields or ambiguities", async () => {
    const resolved = await createResolvedTwoEthIntent();
    expect(resolved.status).toBe(200);
    expect(resolved.body.missingFields).toEqual([]);
    expect(resolved.body.candidateIntent.missingFields).toEqual([]);
    expect(resolved.body.candidateIntent.ambiguitiesFound).toEqual([]);
    expect(resolved.body.candidateIntent.requiresClarification).toBe(false);

    const stored = await intentRepository.findById(resolved.body.candidateIntent.intentId) as any;
    expect(stored.missingFields).toEqual([]);
    expect(stored.ambiguitiesFound).toEqual([]);
    expect(stored.requiresClarification).toBe(false);
  });

  it("confirmation preserves exposure, budget, and consistent review metadata", async () => {
    const resolved = await createResolvedTwoEthIntent();
    const confirmation = await request(app)
      .post(`/api/v1/intents/${resolved.body.candidateIntent.intentId}/confirm`)
      .send({ expectedVersion: resolved.body.candidateIntent.version });

    expect(confirmation.status).toBe(200);
    expect(confirmation.body.confirmedIntent.exposureAmount.value.amountBaseUnits).toBe("2000000000000000000");
    expect(confirmation.body.confirmedIntent.maxPremiumUSDC.value.amountBaseUnits).toBe("100000000");
    expect(confirmation.body.confirmedIntent.missingFields).toEqual([]);
    expect(confirmation.body.confirmedIntent.ambiguitiesFound).toEqual([]);
    expect(confirmation.body.confirmedIntent.requiresClarification).toBe(false);
  });

  it("Start New Plan reset state clears solver, RFQ, and error results", () => {
    expect(buildResetSolverState()).toEqual({
      candidates: [],
      rejectedCandidates: [],
      rfqRequirement: undefined,
      rfqSpecification: undefined,
      errorMessage: undefined,
      solverMode: "OPTIONBOOK_AVAILABLE",
    });
  });

  it("labels recorded demo holdings as synthetic and keeps manual provenance distinct", () => {
    expect(getHoldingsSourceCopy("RECORDED_DEMO_PORTFOLIO")).toEqual({
      label: "Recorded demo portfolio",
      detail: "Selected from a user-controlled demo address. Displayed balance is synthetic demo data and is not wallet-verified.",
    });
    expect(getHoldingsSourceCopy("MANUAL").label).toBe("Manual");
  });
});
