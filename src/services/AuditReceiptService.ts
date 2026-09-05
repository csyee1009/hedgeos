import { createHash } from "crypto";
import {
  ActionProposal,
  AuditReceipt,
  BoundedAuthorizationAttestation,
  CandidateStrategy,
  ExecutionCommitment,
  ExecutionPreparation,
  ExecutionVerificationRecord,
  ExternalHumanAuthorizationHandoff,
  HumanReviewRecord,
  PolicyDecisionRecord,
  SimulationResult,
  TypedRiskIntent,
} from "../types";

export function canonicalizeValue(val: any): any {
  if (val === undefined || val === null) {
    return null;
  }
  if (typeof val === "bigint") {
    return val.toString();
  }
  if (typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }
  const keys = Object.keys(val).sort();
  const res: Record<string, any> = {};
  for (const k of keys) {
    const v = val[k];
    if (v !== undefined) {
      res[k] = canonicalizeValue(v);
    }
  }
  return res;
}

export function computeIntentDigest(intent: TypedRiskIntent): string {
  const payload = {
    intentId: intent.intentId,
    version: intent.version,
    confirmedByUser: intent.confirmedByUser,
    asset: intent.asset,
    exposureAmount: intent.exposureAmount,
    targetMaxLossPercent: intent.targetMaxLossPercent,
    maxPremiumUSDC: intent.maxPremiumUSDC,
    horizonTimestamp: intent.horizonTimestamp,
    allowedProtocols: intent.allowedProtocols,
    allowMultiLeg: intent.allowMultiLeg,
  };
  const canonical = JSON.stringify(canonicalizeValue(payload));
  return createHash("sha256").update(canonical).digest("hex");
}

export class AuditReceiptService {
  public static createReceipt(options: {
    intent: TypedRiskIntent;
    selectedStrategy?: CandidateStrategy;
    policyDecisions?: Record<string, PolicyDecisionRecord>;
    actionProposal?: ActionProposal;
    simulationResult?: SimulationResult;
    humanReviewRecord?: HumanReviewRecord;
    authorizationAttestation?: BoundedAuthorizationAttestation;
    executionCommitment?: ExecutionCommitment;
    externalHumanAuthorizationHandoff?: ExternalHumanAuthorizationHandoff;
    createdAtMs?: number;
  }): AuditReceipt {
    const {
      intent,
      selectedStrategy,
      policyDecisions = {},
      actionProposal,
      simulationResult,
      humanReviewRecord,
      authorizationAttestation,
      executionCommitment,
      externalHumanAuthorizationHandoff,
      createdAtMs = Date.now(),
    } = options;
    const intentDigest = computeIntentDigest(intent);

    const decisionList = Object.values(policyDecisions);
    const policyDecisionIds = decisionList
      .map((d) => d.decisionId || (d as any).policyId || "")
      .filter(Boolean);

    let financialConstitutionStatus: AuditReceipt["financialConstitutionStatus"] =
      "NOT_AVAILABLE";

    if (decisionList.length > 0) {
      const hasFail = decisionList.some(
        (d) =>
          d.overallStatus === "FAIL" ||
          (d as any).overallStatus === "REJECTED" ||
          (d as any).status === "FAIL" ||
          (d as any).status === "REJECTED"
      );
      const hasIncomplete = decisionList.some(
        (d) =>
          d.overallStatus === "INCOMPLETE" ||
          (d as any).status === "INCOMPLETE" ||
          (d as any).status === "NOT_EVALUATED"
      );

      if (hasFail) {
        financialConstitutionStatus = "FAIL";
      } else if (hasIncomplete) {
        financialConstitutionStatus = "INCOMPLETE";
      } else {
        financialConstitutionStatus = "PASS";
      }
    }

    const receiptWithoutDigest = {
      receiptId: "",
      receiptDigest: "",
      intentId: intent.intentId,
      intentVersion: intent.version,
      confirmedAtMs: intent.confirmedAtMs,
      intentDigest,
      marketEvidenceTimestampMs: simulationResult?.marketEvidenceTimestampMs,
      marketEvidenceStatus: simulationResult?.marketEvidenceStatus,
      selectedStrategyId: selectedStrategy?.strategyId,
      policyDecisionIds,
      financialConstitutionStatus,
      proposalId: actionProposal?.proposalId,
      proposalDigest: actionProposal?.proposalDigest,
      simulationId: simulationResult?.simulationId,
      simulationStatus: simulationResult?.status,
      humanReviewId: humanReviewRecord?.reviewId,
      authorizationAttestationId: authorizationAttestation?.attestationId,
      authorizationAttestationDigest: attestationDigestSanitize(
        authorizationAttestation?.attestationDigest
      ),
      executionCommitmentId: executionCommitment?.commitmentId,
      executionCommitmentDigest: executionCommitment?.commitmentDigest,
      externalAuthorizationHandoffId: externalHumanAuthorizationHandoff?.requestId,
      externalAuthorizationHandoffStatus:
        externalHumanAuthorizationHandoff?.status,
      finalExecutionStatus: "NOT_AUTHORIZED" as const,
      createdAtMs,
    };

    const digestPayload = { ...receiptWithoutDigest };
    delete (digestPayload as any).receiptId;
    delete (digestPayload as any).receiptDigest;

    const canonicalPayload = JSON.stringify(canonicalizeValue(digestPayload));
    const receiptDigest = createHash("sha256").update(canonicalPayload).digest("hex");

    const receiptId = `receipt-${receiptDigest.slice(0, 16)}`;

    return {
      ...receiptWithoutDigest,
      receiptId,
      receiptDigest,
    };
  }

  public static verifyReceipt(receipt: AuditReceipt): boolean {
    const { receiptId: _id, receiptDigest, ...payload } = receipt;
    const canonicalPayload = JSON.stringify(canonicalizeValue(payload));
    return createHash("sha256").update(canonicalPayload).digest("hex") === receiptDigest;
  }

  public static appendExecutionEvidence(
    prior: AuditReceipt,
    preparation: ExecutionPreparation,
    verification: ExecutionVerificationRecord,
    createdAtMs = Date.now()
  ): AuditReceipt {
    if (!this.verifyReceipt(prior)) throw new Error("Prior audit receipt digest mismatch");
    const finalExecutionStatus: AuditReceipt["finalExecutionStatus"] =
      verification.status === "POSITION_CONFIRMED" || verification.status === "EXECUTION_VERIFIED"
        ? "ON_CHAIN_VERIFIED"
        : verification.status === "MISMATCH"
          ? "MISMATCH"
          : verification.status === "REVERTED"
            ? "REVERTED"
            : verification.status === "EXECUTION_OBSERVED" || verification.status === "PENDING_CONFIRMATIONS"
              ? "EXTERNAL_EXECUTION_OBSERVED"
              : "INSUFFICIENT_EVIDENCE";
    const withoutDigest: any = {
      ...prior,
      marketSnapshotDigest: preparation.marketSnapshotDigest,
      candidateDigest: preparation.candidateDigest,
      exactPreparationId: preparation.preparationId,
      exactPreparationDigest: preparation.preparationDigest,
      calldataHash: preparation.transaction.calldataHash,
      transactionHash: verification.transactionHash,
      blockNumber: verification.protocolEvent?.blockNumber,
      blockHash: verification.protocolEvent?.blockHash,
      protocolLogIndex: verification.protocolEvent?.logIndex,
      executionVerificationId: verification.verificationId,
      executionVerificationStatus: verification.status,
      positionAddress: verification.position?.optionAddress,
      finalExecutionStatus,
      createdAtMs,
    };
    delete withoutDigest.receiptId;
    delete withoutDigest.receiptDigest;
    const receiptDigest = createHash("sha256")
      .update(JSON.stringify(canonicalizeValue(withoutDigest)))
      .digest("hex");
    return { ...withoutDigest, receiptId: `receipt-${receiptDigest.slice(0, 16)}`, receiptDigest } as AuditReceipt;
  }
}

function attestationDigestSanitize(digest?: string): string | undefined {
  return digest;
}
