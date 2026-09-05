import { createHash } from "crypto";
import {
  BoundedAuthorizationAttestation,
  ExecutionCommitment,
  ExternalHumanAuthorizationHandoff,
  ExternalHumanAuthorizationStatus,
  TypedRiskIntent,
} from "../types";

export class ExternalHumanAuthorizationHandoffService {
  public static createHandoff(
    intent: TypedRiskIntent,
    attestation: BoundedAuthorizationAttestation,
    commitment: ExecutionCommitment
  ): ExternalHumanAuthorizationHandoff {
    const createdAtMs = Date.now();
    const expiresAtMs = Math.min(
      commitment.expiresAtMs,
      commitment.expectedExpiryMs,
      createdAtMs + 15 * 60 * 1000
    );

    const isValid =
      intent.confirmedByUser === true &&
      (attestation.status === "SCOPE_ATTESTED_PREVIEW_ONLY" ||
        attestation.status === "EXTERNAL_AUTHORIZATION_ELIGIBLE") &&
      (commitment.status === "PROPOSAL_BOUND" ||
        commitment.status === "EXACT_TRANSACTION_BOUND" ||
        commitment.status === "EXTERNAL_PAYLOAD_BOUND") &&
      commitment.expiresAtMs > createdAtMs &&
      commitment.intentId === intent.intentId &&
      commitment.intentVersion === intent.version &&
      commitment.authorizationAttestationId === attestation.attestationId &&
      commitment.authorizationAttestationDigest === attestation.attestationDigest &&
      commitment.chainId === 8453 &&
      commitment.protocol === "THETANUTS" &&
      commitment.executionStatus === "NOT_AUTHORIZED" &&
      commitment.canExecute === false;

    let status: ExternalHumanAuthorizationStatus = "BLOCKED";
    if (isValid) {
      if (createdAtMs >= expiresAtMs) {
        status = "EXPIRED";
      } else {
        status = "AWAITING_EXTERNAL_HUMAN";
      }
    }

    const payload = JSON.stringify({
      intentId: intent.intentId,
      intentVersion: intent.version,
      proposalId: commitment.proposalId,
      proposalDigest: commitment.proposalDigest,
      authorizationAttestationId: attestation.attestationId,
      authorizationAttestationDigest: attestation.attestationDigest,
      executionCommitmentId: commitment.commitmentId,
      executionCommitmentDigest: commitment.commitmentDigest,
      chainId: commitment.chainId,
      protocol: commitment.protocol,
      maximumSpendUSDC: intent.maxPremiumUSDC.value,
      expectedExpiryMs: commitment.expectedExpiryMs,
      exactPreparationId: commitment.exactPreparationId,
      calldataHash: commitment.calldataHash,
      expectedBeneficiary: commitment.expectedBeneficiary?.toLowerCase(),
      createdAtMs,
      expiresAtMs,
    });

    const requestDigest = createHash("sha256").update(payload).digest("hex");

    return {
      requestId: `handoff-${requestDigest.slice(0, 16)}`,
      intentId: intent.intentId,
      intentVersion: intent.version,
      proposalId: commitment.proposalId,
      proposalDigest: commitment.proposalDigest,
      authorizationAttestationId: attestation.attestationId,
      authorizationAttestationDigest: attestation.attestationDigest,
      executionCommitmentId: commitment.commitmentId,
      executionCommitmentDigest: commitment.commitmentDigest,
      chainId: 8453,
      protocol: "THETANUTS",
      maximumSpendUSDC: intent.maxPremiumUSDC.value,
      expectedExpiryMs: commitment.expectedExpiryMs,
      exactPreparationId: commitment.exactPreparationId,
      calldataHash: commitment.calldataHash,
      expectedBeneficiary: commitment.expectedBeneficiary,
      createdAtMs,
      expiresAtMs,
      status,
      executionStatus: "NOT_AUTHORIZED",
      canExecute: false,
      disclosure:
        "HedgeOS has committed and verified the permitted financial action, but this request is not an authorization. A separate eligible human-controlled execution system must independently review and authorize any real transaction.",
    };
  }

  public static getHandoffStatus(
    handoff: ExternalHumanAuthorizationHandoff,
    nowMs: number = Date.now()
  ): ExternalHumanAuthorizationStatus {
    if (nowMs >= handoff.expiresAtMs && handoff.status !== "BLOCKED") {
      return "EXPIRED";
    }
    return handoff.status;
  }

  public static markHandoffConsumed(
    handoff: ExternalHumanAuthorizationHandoff
  ): ExternalHumanAuthorizationHandoff {
    return {
      ...handoff,
      status: "CONSUMED",
      executionStatus: "NOT_AUTHORIZED",
      canExecute: false,
    };
  }
}
