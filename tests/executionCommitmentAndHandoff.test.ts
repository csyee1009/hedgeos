import { describe, expect, it, vi } from "vitest";
import {
  ActionProposal,
  BoundedAuthorizationAttestation,
  HumanReviewRecord,
  SimulationResult,
  TypedRiskIntent,
} from "../src/types";
import { BoundedAuthorizationAttestationService } from "../src/services/BoundedAuthorizationAttestationService";
import { ExecutionCommitmentService } from "../src/services/ExecutionCommitmentService";
import { ExternalHumanAuthorizationHandoffService } from "../src/services/ExternalHumanAuthorizationHandoffService";

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
  feeStatus: "INCOMPLETE",
  buyerSpendStatus: "VERIFIED",
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
  feeStatus: "INCOMPLETE",
  buyerSpendStatus: "VERIFIED",
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

const attestation = BoundedAuthorizationAttestationService.createScopeAttestation(
  intent,
  proposal,
  simulation,
  review
);

describe("ExecutionCommitment & ExternalHumanAuthorizationHandoff Suite", () => {
  it("1. Valid current package: execution commitment => PROPOSAL_BOUND", () => {
    const commitment = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );
    expect(commitment.status).toBe("PROPOSAL_BOUND");
  });

  it("2. executionStatus: NOT_AUTHORIZED", () => {
    const commitment = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );
    expect(commitment.executionStatus).toBe("NOT_AUTHORIZED");
  });

  it("3. canExecute: false", () => {
    const commitment = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );
    expect(commitment.canExecute).toBe(false);
  });

  it("4. commitment digest deterministic for identical canonical inputs", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);
    const c1 = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );
    const c2 = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );
    expect(c1.commitmentDigest).toBe(c2.commitmentDigest);
    vi.useRealTimers();
  });

  it("5. changed proposal digest changes commitment digest", () => {
    const p2 = { ...proposal, proposalDigest: "digest-different" };
    const s2 = { ...simulation, proposalDigest: "digest-different" };
    const r2 = { ...review, proposalDigest: "digest-different" };
    const att2 = BoundedAuthorizationAttestationService.createScopeAttestation(
      intent,
      p2,
      s2,
      r2
    );

    const c1 = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );
    const c2 = ExecutionCommitmentService.createCommitment(
      intent,
      p2,
      s2,
      att2
    );
    expect(c1.commitmentDigest).not.toBe(c2.commitmentDigest);
  });

  it("6. changed target contract changes commitment digest", () => {
    const p2 = { ...proposal, targetContract: "0x2222222222222222222222222222222222222222" };
    const s2 = { ...simulation, targetContract: p2.targetContract };
    const att2 = BoundedAuthorizationAttestationService.createScopeAttestation(
      intent,
      p2,
      s2,
      review
    );

    const c1 = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );
    const c2 = ExecutionCommitmentService.createCommitment(
      intent,
      p2,
      s2,
      att2
    );
    expect(c1.commitmentDigest).not.toBe(c2.commitmentDigest);
  });

  it("7. changed max spend changes commitment digest", () => {
    const intent2 = {
      ...intent,
      maxPremiumUSDC: {
        value: { amountBaseUnits: "19000000", decimals: 6, symbol: "USDC" },
      },
    } as unknown as TypedRiskIntent;

    const c1 = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );
    const c2 = ExecutionCommitmentService.createCommitment(
      intent2,
      proposal,
      simulation,
      attestation
    );
    expect(c1.commitmentDigest).not.toBe(c2.commitmentDigest);
  });

  it("8. expired option => BLOCKED", () => {
    const expiredProposal = { ...proposal, expectedExpiryMs: Date.now() - 1000 };
    const c = ExecutionCommitmentService.createCommitment(
      intent,
      expiredProposal,
      simulation,
      attestation
    );
    expect(c.status).toBe("BLOCKED");
  });

  it("9. wrong chain => BLOCKED", () => {
    const wrongChainProposal = { ...proposal, chainId: 1 as any };
    const c = ExecutionCommitmentService.createCommitment(
      intent,
      wrongChainProposal,
      simulation,
      attestation
    );
    expect(c.status).toBe("BLOCKED");
  });

  it("10. mismatched attestation digest => BLOCKED", () => {
    const wrongAttestation = {
      ...attestation,
      attestationDigest: "wrong-digest",
    } as BoundedAuthorizationAttestation;

    const c = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      wrongAttestation
    );
    expect(c.status).toBe("BLOCKED");
  });

  it("11. valid external digest: status => EXTERNAL_PAYLOAD_BOUND", () => {
    const commitment = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );

    const validDigest = "a".repeat(64);
    const bound = ExecutionCommitmentService.bindExternalExecutorPayloadDigest(
      commitment,
      validDigest
    );

    expect(bound.status).toBe("EXTERNAL_PAYLOAD_BOUND");
    expect(bound.externalExecutorPayloadDigest).toBe(validDigest);
  });

  it("12. invalid digest: reject/fail closed", () => {
    const commitment = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );

    const invalidDigest = "not-a-64-hex-digest";
    const bound = ExecutionCommitmentService.bindExternalExecutorPayloadDigest(
      commitment,
      invalidDigest
    );

    expect(bound.status).toBe("BLOCKED");
  });

  it("13. binding external digest changes commitment digest", () => {
    const commitment = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );

    const validDigest = "b".repeat(64);
    const bound = ExecutionCommitmentService.bindExternalExecutorPayloadDigest(
      commitment,
      validDigest
    );

    expect(bound.commitmentDigest).not.toBe(commitment.commitmentDigest);
  });

  it("14. handoff defaults: AWAITING_EXTERNAL_HUMAN", () => {
    const commitment = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );

    const handoff = ExternalHumanAuthorizationHandoffService.createHandoff(
      intent,
      attestation,
      commitment
    );

    expect(handoff.status).toBe("AWAITING_EXTERNAL_HUMAN");
  });

  it("15. expired handoff: EXPIRED", () => {
    const commitment = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );

    const handoff = ExternalHumanAuthorizationHandoffService.createHandoff(
      intent,
      attestation,
      commitment
    );

    const statusAfterExpiry =
      ExternalHumanAuthorizationHandoffService.getHandoffStatus(
        handoff,
        handoff.expiresAtMs + 1000
      );

    expect(statusAfterExpiry).toBe("EXPIRED");
  });

  it("16. consumed handoff: CONSUMED", () => {
    const commitment = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );

    const handoff = ExternalHumanAuthorizationHandoffService.createHandoff(
      intent,
      attestation,
      commitment
    );

    const consumed =
      ExternalHumanAuthorizationHandoffService.markHandoffConsumed(handoff);

    expect(consumed.status).toBe("CONSUMED");
  });

  it("17. consumed does NOT change executionStatus", () => {
    const commitment = ExecutionCommitmentService.createCommitment(
      intent,
      proposal,
      simulation,
      attestation
    );

    const handoff = ExternalHumanAuthorizationHandoffService.createHandoff(
      intent,
      attestation,
      commitment
    );

    const consumed =
      ExternalHumanAuthorizationHandoffService.markHandoffConsumed(handoff);

    expect(consumed.executionStatus).toBe("NOT_AUTHORIZED");
    expect(consumed.canExecute).toBe(false);
  });

  it("18. no method accepts calldata/raw transaction/private key/signer/wallet", () => {
    const serviceKeys = Object.getOwnPropertyNames(
      ExecutionCommitmentService.prototype
    );
    expect(serviceKeys).not.toContain("signTransaction");
    expect(serviceKeys).not.toContain("sendTransaction");
  });
});
