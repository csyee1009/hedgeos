import { describe, expect, it } from "vitest";
import {
  ActionProposal,
  HumanReviewRecord,
  SimulationResult,
  TypedRiskIntent,
} from "../src/types";
import { BoundedAuthorizationAttestationService } from "../src/services/BoundedAuthorizationAttestationService";

const intent = {
  intentId: "intent-1",
  version: 3,
  confirmedByUser: true,
  asset: { value: "ETH" },
  maxPremiumUSDC: {
    value: {
      amountBaseUnits: "20000000",
      decimals: 6,
      symbol: "USDC",
    },
  },
} as unknown as TypedRiskIntent;

const proposal = {
  proposalId: "proposal-1",
  proposalDigest: "digest-1",
  intentId: "intent-1",
  intentVersion: 3,
  strategyId: "strategy-1",
  protocol: "THETANUTS",
  chainId: 8453,
  actionType: "OPTIONBOOK_FILL_ORDER",
  targetContract: "0x1111111111111111111111111111111111111111",
  normalizedParameters: {},
  expectedAsset: "ETH",
  expectedOptionRight: "PUT",
  expectedStrike: {
    amountBaseUnits: "300000000000",
    decimals: 8,
    symbol: "USD",
  },
  expectedQuantity: {
    amountBaseUnits: "1000000000000000000",
    decimals: 18,
    symbol: "ETH",
  },
  expectedTotalCost: {
    amountBaseUnits: "12000000",
    decimals: 6,
    symbol: "USDC",
  },
  feeStatus: "ZERO_VERIFIED",
  expectedExpiryMs: Date.now() + 86_400_000,
  proposalCreatedAtMs: Date.now(),
  proposalStatus: "PREPARED",
  bindingStatus: "PREVIEW_BOUND",
  authorizationStatus: "UNAUTHORIZED",
} as ActionProposal;

const simulation = {
  simulationId: "simulation-1",
  proposalId: "proposal-1",
  proposalDigest: "digest-1",
  intentId: "intent-1",
  intentVersion: 3,
  strategyId: "strategy-1",
  status: "PROVIDER_SIMULATED",
  simulationMethod: "THETANUTS_OPTIONBOOK_PREVIEW",
  chainId: 8453,
  targetContract: proposal.targetContract,
  bindingStatus: "PREVIEW_BOUND",
  simulatedAtMs: Date.now(),
  marketEvidenceTimestampMs: Date.now(),
  marketEvidenceStatus: "FRESH",
  expectedTotalCost: proposal.expectedTotalCost,
  feeStatus: "ZERO_VERIFIED",
  expectedExpiryMs: proposal.expectedExpiryMs,
  expectedOptionQuantity: proposal.expectedQuantity,
  expectedUnderlying: "ETH",
  providerResultSummary: "Read-only preview verified.",
  verificationChecks: [
    {
      checkName: "BUDGET",
      passed: true,
      details: "Within budget.",
    },
    {
      checkName: "PROTECTION_TARGET",
      passed: true,
      details: "Target satisfied.",
    },
  ],
  authorizedByHuman: false,
} as SimulationResult;

const review = {
  reviewId: "review-1",
  proposalId: "proposal-1",
  proposalDigest: "digest-1",
  intentId: "intent-1",
  intentVersion: 3,
  simulationId: "simulation-1",
  presentedAtMs: Date.now(),
  reviewStatus: "READY_FOR_REVIEW",
  executionStatus: "NOT_AUTHORIZED",
  warnings: [],
  summary: {} as HumanReviewRecord["summary"],
  toctouDisclosure: "Market may move.",
} as HumanReviewRecord;

describe("BoundedAuthorizationAttestationService", () => {
  it("1. attests valid current PREVIEW_BOUND package => SCOPE_ATTESTED_PREVIEW_ONLY", () => {
    const result =
      BoundedAuthorizationAttestationService.createScopeAttestation(
        intent,
        proposal,
        simulation,
        review
      );

    expect(result.status).toBe("SCOPE_ATTESTED_PREVIEW_ONLY");
  });

  it("2. executionStatus => NOT_AUTHORIZED", () => {
    const result =
      BoundedAuthorizationAttestationService.createScopeAttestation(
        intent,
        proposal,
        simulation,
        review
      );

    expect(result.executionStatus).toBe("NOT_AUTHORIZED");
  });

  it("3. canExecute => false", () => {
    const result =
      BoundedAuthorizationAttestationService.createScopeAttestation(
        intent,
        proposal,
        simulation,
        review
      );

    expect(result.canExecute).toBe(false);
  });

  it("4. over-budget => REJECTED", () => {
    const overBudgetProposal = {
      ...proposal,
      expectedTotalCost: {
        amountBaseUnits: "25000000",
        decimals: 6,
        symbol: "USDC",
      },
    } as ActionProposal;

    const overBudgetSimulation = {
      ...simulation,
      expectedTotalCost: overBudgetProposal.expectedTotalCost,
    } as SimulationResult;

    const result =
      BoundedAuthorizationAttestationService.createScopeAttestation(
        intent,
        overBudgetProposal,
        overBudgetSimulation,
        review
      );

    expect(result.status).toBe("REJECTED");
    expect(result.canExecute).toBe(false);
    expect(
      result.checks.find(
        (check) => check.check === "BOUNDED_SPEND"
      )?.passed
    ).toBe(false);
  });

  it("5. proposal digest mismatch => REJECTED", () => {
    const mismatchedSimulation = {
      ...simulation,
      proposalDigest: "wrong-digest",
    } as SimulationResult;

    const result =
      BoundedAuthorizationAttestationService.createScopeAttestation(
        intent,
        proposal,
        mismatchedSimulation,
        review
      );

    expect(result.status).toBe("REJECTED");
    expect(
      result.checks.find(
        (check) => check.check === "SIMULATION_BINDING"
      )?.passed
    ).toBe(false);
  });

  it("6. stale market evidence => REJECTED", () => {
    const staleSimulation = {
      ...simulation,
      marketEvidenceStatus: "STALE",
    } as SimulationResult;

    const result =
      BoundedAuthorizationAttestationService.createScopeAttestation(
        intent,
        proposal,
        staleSimulation,
        review
      );

    expect(result.status).toBe("REJECTED");
    expect(
      result.checks.find(
        (check) => check.check === "FRESH_MARKET_EVIDENCE"
      )?.passed
    ).toBe(false);
  });

  it("7. RFQ action proposal => REJECTED", () => {
    const rfqProposal = {
      ...proposal,
      actionType: "REQUEST_FOR_QUOTATION",
    } as ActionProposal;

    const result =
      BoundedAuthorizationAttestationService.createScopeAttestation(
        intent,
        rfqProposal,
        simulation,
        review
      );

    expect(result.status).toBe("REJECTED");
    expect(
      result.checks.find(
        (check) => check.check === "OPTIONBOOK_FILL_ONLY"
      )?.passed
    ).toBe(false);
  });

  it("8. wrong chain => REJECTED", () => {
    const wrongChainProposal = {
      ...proposal,
      chainId: 1,
    } as ActionProposal;

    const result =
      BoundedAuthorizationAttestationService.createScopeAttestation(
        intent,
        wrongChainProposal,
        simulation,
        review
      );

    expect(result.status).toBe("REJECTED");
    expect(
      result.checks.find(
        (check) => check.check === "BASE_CHAIN_ONLY"
      )?.passed
    ).toBe(false);
  });

  it("9. wrong asset => REJECTED", () => {
    const wrongAssetProposal = {
      ...proposal,
      expectedAsset: "BTC",
    } as ActionProposal;

    const result =
      BoundedAuthorizationAttestationService.createScopeAttestation(
        intent,
        wrongAssetProposal,
        simulation,
        review
      );

    expect(result.status).toBe("REJECTED");
    expect(
      result.checks.find(
        (check) => check.check === "ASSET_BOUND"
      )?.passed
    ).toBe(false);
  });

  it("10. authorization attestation digest changes when proposal digest changes", () => {
    const res1 = BoundedAuthorizationAttestationService.createScopeAttestation(
      intent,
      proposal,
      simulation,
      review
    );

    const prop2 = {
      ...proposal,
      proposalDigest: "digest-2",
    } as ActionProposal;

    const sim2 = {
      ...simulation,
      proposalDigest: "digest-2",
    } as SimulationResult;

    const rev2 = {
      ...review,
      proposalDigest: "digest-2",
    } as HumanReviewRecord;

    const res2 = BoundedAuthorizationAttestationService.createScopeAttestation(
      intent,
      prop2,
      sim2,
      rev2
    );

    expect(res1.attestationDigest).not.toBe(res2.attestationDigest);
  });
});
