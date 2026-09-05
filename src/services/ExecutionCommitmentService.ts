import { createHash } from "crypto";
import {
  ActionProposal,
  BoundedAuthorizationAttestation,
  ExecutionCommitment,
  ExecutionPreparation,
  ExecutionCommitmentStatus,
  SimulationResult,
  TokenAmount,
  TypedRiskIntent,
} from "../types";

const normalizeAmount = (
  amountBaseUnits: string,
  fromDecimals: number,
  toDecimals: number
): bigint => {
  const value = BigInt(amountBaseUnits);
  if (fromDecimals === toDecimals) {
    return value;
  }
  if (fromDecimals < toDecimals) {
    return value * 10n ** BigInt(toDecimals - fromDecimals);
  }
  return value / 10n ** BigInt(fromDecimals - toDecimals);
};

export class ExecutionCommitmentService {
  public static bindExactPreparedAction(
    commitment: ExecutionCommitment,
    preparation: ExecutionPreparation
  ): ExecutionCommitment {
    const tx = preparation.transaction;
    const valid = commitment.status !== "BLOCKED"
      && commitment.status !== "EXPIRED"
      && preparation.status === "EXACT_TRANSACTION_PREPARED"
      && preparation.intentId === commitment.intentId
      && preparation.intentVersion === commitment.intentVersion
      && preparation.proposalId === commitment.proposalId
      && preparation.proposalDigest === commitment.proposalDigest
      && tx.chainId === commitment.chainId
      && tx.to.toLowerCase() === commitment.targetContract.toLowerCase()
      && tx.action === commitment.actionType
      && tx.validUntilMs > Date.now();
    if (!valid) return { ...commitment, status: "BLOCKED", canExecute: false, executionStatus: "NOT_AUTHORIZED" };
    const payload = JSON.stringify({
      priorCommitmentDigest: commitment.commitmentDigest,
      exactPreparationId: preparation.preparationId,
      exactPreparationDigest: preparation.preparationDigest,
      calldataHash: tx.calldataHash,
      semanticDigest: tx.semanticDigest,
      expectedBeneficiary: tx.expectedBeneficiary.toLowerCase(),
      exactBuyerSpendUSDC: tx.exactBuyerSpendUSDC,
      maxTotalSpendUSDC: tx.maxTotalSpendUSDC,
      validUntilMs: tx.validUntilMs,
    });
    const digest = createHash("sha256").update(payload).digest("hex");
    return {
      ...commitment,
      commitmentId: `commit-exact-${digest.slice(0, 16)}`,
      commitmentDigest: digest,
      exactPreparationId: preparation.preparationId,
      exactPreparationDigest: preparation.preparationDigest,
      calldataHash: tx.calldataHash,
      semanticDigest: tx.semanticDigest,
      expectedBeneficiary: tx.expectedBeneficiary,
      expiresAtMs: Math.min(commitment.expiresAtMs, tx.validUntilMs),
      status: "EXACT_TRANSACTION_BOUND",
      executionStatus: "NOT_AUTHORIZED",
      canExecute: false,
    };
  }

  public static createCommitment(
    intent: TypedRiskIntent,
    proposal: ActionProposal,
    simulation: SimulationResult,
    attestation: BoundedAuthorizationAttestation
  ): ExecutionCommitment {
    const createdAtMs = Date.now();
    const expiresAtMs = Math.min(
      createdAtMs + 15 * 60 * 1000,
      proposal.expectedExpiryMs
    );

    const expectedTotalCost =
      simulation.expectedTotalCost ?? proposal.expectedTotalCost;

    let isAttestationDigestValid = false;
    if (attestation.attestationDigest) {
      const digestPayload = JSON.stringify({
        status: attestation.status,
        scope: attestation.scope
          ? {
              chainId: attestation.scope.chainId,
              protocol: attestation.scope.protocol,
              actionType: attestation.scope.actionType,
              targetContract: attestation.scope.targetContract.toLowerCase(),
              asset: attestation.scope.asset.toUpperCase(),
              optionRight: attestation.scope.optionRight,
              proposalId: attestation.scope.proposalId,
              proposalDigest: attestation.scope.proposalDigest,
              intentId: attestation.scope.intentId,
              intentVersion: attestation.scope.intentVersion,
              simulationId: attestation.scope.simulationId,
              boundQuoteId: attestation.scope.boundQuoteId ?? null,
              maxSpendUSDC: attestation.scope.maxSpendUSDC,
              expectedTotalCostUSDC: attestation.scope.expectedTotalCostUSDC,
              expectedQuantity: attestation.scope.expectedQuantity,
              expectedExpiryMs: attestation.scope.expectedExpiryMs,
            }
          : null,
        checks: (attestation.checks || []).map((check) => ({
          check: check.check,
          passed: check.passed,
        })),
      });

      const recomputedDigest = createHash("sha256")
        .update(digestPayload)
        .digest("hex");

      isAttestationDigestValid = attestation.attestationDigest === recomputedDigest;
    }

    let isBudgetValid = false;
    if (expectedTotalCost && intent.maxPremiumUSDC?.value) {
      const budget = intent.maxPremiumUSDC.value;
      if (
        expectedTotalCost.symbol.toUpperCase() === "USDC" &&
        budget.symbol.toUpperCase() === "USDC"
      ) {
        const commonDecimals = Math.max(expectedTotalCost.decimals, budget.decimals);
        const normCost = normalizeAmount(expectedTotalCost.amountBaseUnits, expectedTotalCost.decimals, commonDecimals);
        const normBudget = normalizeAmount(budget.amountBaseUnits, budget.decimals, commonDecimals);
        isBudgetValid = normCost <= normBudget;
      }
    }

    const isValid =
      intent.confirmedByUser === true &&
      (attestation.status === "SCOPE_ATTESTED_PREVIEW_ONLY" ||
        attestation.status === "EXTERNAL_AUTHORIZATION_ELIGIBLE") &&
      attestation.executionStatus === "NOT_AUTHORIZED" &&
      attestation.canExecute === false &&
      isAttestationDigestValid &&
      proposal.intentId === intent.intentId &&
      proposal.intentVersion === intent.version &&
      attestation.scope !== undefined &&
      proposal.proposalId === attestation.scope.proposalId &&
      proposal.proposalDigest === attestation.scope.proposalDigest &&
      simulation.proposalId === proposal.proposalId &&
      simulation.proposalDigest === proposal.proposalDigest &&
      proposal.chainId === 8453 &&
      proposal.protocol === "THETANUTS" &&
      Boolean(proposal.targetContract) &&
      proposal.expectedOptionRight === "PUT" &&
      Boolean(expectedTotalCost) &&
      isBudgetValid &&
      proposal.expectedExpiryMs > createdAtMs;

    let status: ExecutionCommitmentStatus = "BLOCKED";
    if (isValid) {
      if (createdAtMs >= expiresAtMs) {
        status = "EXPIRED";
      } else {
        status = "PROPOSAL_BOUND";
      }
    }

    const payload = JSON.stringify({
      intentId: intent.intentId,
      intentVersion: intent.version,
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      authorizationAttestationId: attestation.attestationId,
      authorizationAttestationDigest: attestation.attestationDigest,
      chainId: proposal.chainId,
      protocol: proposal.protocol,
      actionType: proposal.actionType,
      targetContract: proposal.targetContract.toLowerCase(),
      expectedAsset: proposal.expectedAsset.toUpperCase(),
      expectedOptionRight: proposal.expectedOptionRight,
      expectedQuantity: proposal.expectedQuantity,
      maxSpendUSDC: intent.maxPremiumUSDC?.value,
      expectedTotalCostUSDC: expectedTotalCost,
      expectedExpiryMs: proposal.expectedExpiryMs,
      createdAtMs,
      expiresAtMs,
    });

    const commitmentDigest = createHash("sha256").update(payload).digest("hex");

    return {
      commitmentId: `commit-${commitmentDigest.slice(0, 16)}`,
      commitmentDigest,
      intentId: intent.intentId,
      intentVersion: intent.version,
      proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest,
      authorizationAttestationId: attestation.attestationId,
      authorizationAttestationDigest: attestation.attestationDigest,
      chainId: 8453,
      protocol: "THETANUTS",
      actionType: proposal.actionType,
      targetContract: proposal.targetContract,
      expectedAsset: proposal.expectedAsset,
      expectedOptionRight: "PUT",
      expectedQuantity: proposal.expectedQuantity,
      expectedTotalCostUSDC: expectedTotalCost,
      expectedExpiryMs: proposal.expectedExpiryMs,
      createdAtMs,
      expiresAtMs,
      status,
      executionStatus: "NOT_AUTHORIZED",
      canExecute: false,
    };
  }

  public static bindExternalExecutorPayloadDigest(
    commitment: ExecutionCommitment,
    executorPayloadDigest: string
  ): ExecutionCommitment {
    const isHex64 = /^[0-9a-f]{64}$/.test(executorPayloadDigest);
    if (!isHex64 || commitment.status === "BLOCKED" || commitment.status === "EXPIRED") {
      return {
        ...commitment,
        status: "BLOCKED",
      };
    }

    const combinedPayload = `${commitment.commitmentDigest}:${executorPayloadDigest}`;
    const newDigest = createHash("sha256").update(combinedPayload).digest("hex");

    return {
      ...commitment,
      commitmentId: `commit-ext-${newDigest.slice(0, 16)}`,
      commitmentDigest: newDigest,
      externalExecutorPayloadDigest: executorPayloadDigest,
      status: "EXTERNAL_PAYLOAD_BOUND",
      executionStatus: "NOT_AUTHORIZED",
      canExecute: false,
    };
  }
}
