import { createHash } from "crypto";
import {
  ActionProposal,
  AuthorizationAttestationStatus,
  BoundedAuthorizationAttestation,
  BoundedAuthorizationScope,
  HumanReviewRecord,
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

const isSameAsset = (left: string, right: string): boolean => {
  const normalize = (value: string) => {
    const upper = value.toUpperCase();

    if (upper === "WETH") {
      return "ETH";
    }

    if (upper === "CBBTC") {
      return "BTC";
    }

    return upper;
  };

  return normalize(left) === normalize(right);
};

export class BoundedAuthorizationAttestationService {
  public static createScopeAttestation(
    intent: TypedRiskIntent,
    proposal: ActionProposal,
    simulation: SimulationResult,
    review: HumanReviewRecord
  ): BoundedAuthorizationAttestation {
    const createdAtMs = Date.now();
    const checks: BoundedAuthorizationAttestation["checks"] = [];
    const blockers: string[] = [];

    const addCheck = (
      check: string,
      passed: boolean,
      details: string,
      blocker?: string
    ) => {
      checks.push({ check, passed, details });

      if (!passed && blocker) {
        blockers.push(blocker);
      }
    };

    addCheck(
      "INTENT_CONFIRMED",
      intent.confirmedByUser === true,
      intent.confirmedByUser
        ? "Typed Risk Intent is explicitly human-confirmed."
        : "Typed Risk Intent is not confirmed.",
      "Confirmed intent is required."
    );

    const proposalIntentBound =
      proposal.intentId === intent.intentId &&
      proposal.intentVersion === intent.version;

    addCheck(
      "PROPOSAL_INTENT_BINDING",
      proposalIntentBound,
      proposalIntentBound
        ? "Proposal is bound to the current confirmed intent ID and version."
        : "Proposal intent ID/version does not match the current intent.",
      "Proposal does not match the confirmed intent."
    );

    const simulationBound =
      simulation.proposalId === proposal.proposalId &&
      simulation.proposalDigest === proposal.proposalDigest &&
      simulation.intentId === intent.intentId &&
      simulation.intentVersion === intent.version;

    addCheck(
      "SIMULATION_BINDING",
      simulationBound,
      simulationBound
        ? "Simulation matches the proposal digest and confirmed intent version."
        : "Simulation is not bound to the current proposal and intent.",
      "Simulation binding mismatch."
    );

    const reviewBound =
      review.proposalId === proposal.proposalId &&
      review.proposalDigest === proposal.proposalDigest &&
      review.intentId === intent.intentId &&
      review.intentVersion === intent.version &&
      review.simulationId === simulation.simulationId;

    addCheck(
      "HUMAN_REVIEW_BINDING",
      reviewBound,
      reviewBound
        ? "Human review record is bound to the same proposal, intent and simulation."
        : "Human review record is not bound to the current proposal package.",
      "Human review binding mismatch."
    );

    const reviewReady =
      review.reviewStatus === "READY_FOR_REVIEW" ||
      review.reviewStatus === "REVIEWED" ||
      review.reviewStatus === "ELIGIBLE_HUMAN_AUTHORIZATION_REQUIRED";

    addCheck(
      "HUMAN_REVIEW_READY",
      reviewReady,
      reviewReady
        ? `Human review state is ${review.reviewStatus}.`
        : `Human review state is ${review.reviewStatus}.`,
      "Proposal is not ready for human review."
    );

    addCheck(
      "EXECUTION_BOUNDARY",
      review.executionStatus === "NOT_AUTHORIZED" &&
        proposal.authorizationStatus === "UNAUTHORIZED" &&
        simulation.authorizedByHuman === false,
      "Execution remains NOT_AUTHORIZED across proposal, simulation and review.",
      "Authorization boundary is inconsistent."
    );

    const acceptableSimulation =
      simulation.status === "PREVIEW_ONLY" ||
      simulation.status === "DETERMINISTIC_VERIFIED" ||
      simulation.status === "PROVIDER_SIMULATED" ||
      simulation.status === "CHAIN_SIMULATED";

    addCheck(
      "SIMULATION_STATUS",
      acceptableSimulation,
      acceptableSimulation
        ? `Simulation state ${simulation.status} is acceptable for attestation analysis.`
        : `Simulation state ${simulation.status} is not acceptable.`,
      "Successful simulation or preview verification is required."
    );

    addCheck(
      "FRESH_MARKET_EVIDENCE",
      simulation.marketEvidenceStatus === "FRESH",
      `Market evidence status is ${simulation.marketEvidenceStatus}.`,
      "Fresh market evidence is required."
    );

    const allSimulationChecksPassed =
      simulation.verificationChecks.length > 0 &&
      simulation.verificationChecks.every((check) => check.passed);

    addCheck(
      "SIMULATION_CHECKS",
      allSimulationChecksPassed,
      allSimulationChecksPassed
        ? "All simulation verification checks passed."
        : "One or more simulation verification checks failed.",
      "Simulation verification checks must all pass."
    );

    addCheck(
      "BASE_CHAIN_ONLY",
      proposal.chainId === 8453 && simulation.chainId === 8453,
      proposal.chainId === 8453 && simulation.chainId === 8453
        ? "Scope is restricted to Base Mainnet chain ID 8453."
        : "Proposal or simulation is not restricted to Base Mainnet.",
      "Authorization scope is Base Mainnet only."
    );

    addCheck(
      "THETANUTS_ONLY",
      proposal.protocol === "THETANUTS",
      `Allowed protocol is ${proposal.protocol}.`,
      "Authorization scope is restricted to Thetanuts."
    );

    addCheck(
      "OPTIONBOOK_FILL_ONLY",
      proposal.actionType === "OPTIONBOOK_FILL_ORDER",
      proposal.actionType === "OPTIONBOOK_FILL_ORDER"
        ? "Scope is restricted to an existing OptionBook fill proposal."
        : `Action type ${proposal.actionType} is not eligible for bounded authorization.`,
      "RFQ submission and other actions are not authorized by this attestation."
    );

    addCheck(
      "TARGET_CONTRACT_BOUND",
      Boolean(proposal.targetContract),
      proposal.targetContract
        ? "Target contract is explicitly bound in the proposal."
        : "Target contract is unresolved.",
      "An explicit target contract is required."
    );

    addCheck(
      "PROTECTIVE_PUT_ONLY",
      proposal.expectedOptionRight === "PUT",
      `Expected option right is ${proposal.expectedOptionRight}.`,
      "Only protective PUT proposals are eligible."
    );

    const assetBound = isSameAsset(
      proposal.expectedAsset,
      intent.asset.value
    );

    addCheck(
      "ASSET_BOUND",
      assetBound,
      assetBound
        ? `Proposal asset ${proposal.expectedAsset} matches confirmed risk asset ${intent.asset.value}.`
        : `Proposal asset ${proposal.expectedAsset} does not match confirmed risk asset ${intent.asset.value}.`,
      "Proposal asset must match the confirmed risk asset."
    );

    const expectedTotalCost =
      simulation.expectedTotalCost ?? proposal.expectedTotalCost;

    const costAvailable =
      Boolean(expectedTotalCost) &&
      (simulation.feeStatus === "AVAILABLE" ||
        simulation.feeStatus === "ZERO_VERIFIED" ||
        proposal.feeStatus === "AVAILABLE" ||
        proposal.feeStatus === "ZERO_VERIFIED");

    addCheck(
      "VERIFIED_TOTAL_COST",
      costAvailable,
      costAvailable
        ? "Expected total cost is available with verified fee status."
        : "Expected total cost or verified fee status is unavailable.",
      "Verified total cost is required before any authorization eligibility."
    );

    let budgetSatisfied = false;

    if (expectedTotalCost) {
      const budget = intent.maxPremiumUSDC.value;
      const costSymbol = expectedTotalCost.symbol.toUpperCase();
      const budgetSymbol = budget.symbol.toUpperCase();

      if (costSymbol === "USDC" && budgetSymbol === "USDC") {
        const commonDecimals = Math.max(
          expectedTotalCost.decimals,
          budget.decimals
        );

        const normalizedCost = normalizeAmount(
          expectedTotalCost.amountBaseUnits,
          expectedTotalCost.decimals,
          commonDecimals
        );

        const normalizedBudget = normalizeAmount(
          budget.amountBaseUnits,
          budget.decimals,
          commonDecimals
        );

        budgetSatisfied = normalizedCost <= normalizedBudget;
      }
    }

    addCheck(
      "BOUNDED_SPEND",
      budgetSatisfied,
      budgetSatisfied
        ? "Expected total cost is within the human-confirmed USDC protection budget."
        : "Expected total cost is unavailable, mismatched, or exceeds the confirmed USDC budget.",
      "Maximum spend must remain within the confirmed USDC risk budget."
    );

    const exactTransactionBound =
      proposal.bindingStatus === "EXACT_TRANSACTION_BOUND" &&
      simulation.bindingStatus === "EXACT_TRANSACTION_BOUND";

    addCheck(
      "EXACT_TRANSACTION_BINDING",
      exactTransactionBound,
      exactTransactionBound
        ? "Proposal and simulation are bound to the exact transaction payload."
        : "Current package is preview-bound rather than exact-transaction-bound.",
      "Exact transaction binding is required before external authorization eligibility."
    );

    const allChecksExceptExactBindingPass = checks
      .filter((check) => check.check !== "EXACT_TRANSACTION_BINDING")
      .every((check) => check.passed);

    const maxSpendUSDC = intent.maxPremiumUSDC.value;

    const scope: BoundedAuthorizationScope | undefined =
      allChecksExceptExactBindingPass && expectedTotalCost
        ? {
            chainId: 8453,
            protocol: "THETANUTS",
            actionType: "OPTIONBOOK_FILL_ORDER",
            targetContract: proposal.targetContract,
            asset: proposal.expectedAsset,
            optionRight: "PUT",
            proposalId: proposal.proposalId,
            proposalDigest: proposal.proposalDigest,
            intentId: intent.intentId,
            intentVersion: intent.version,
            simulationId: simulation.simulationId,
            boundQuoteId: proposal.boundQuoteId,
            maxSpendUSDC,
            expectedTotalCostUSDC: expectedTotalCost,
            expectedQuantity: proposal.expectedQuantity,
            expectedExpiryMs: proposal.expectedExpiryMs,
          }
        : undefined;

    let status: AuthorizationAttestationStatus = "REJECTED";

    if (allChecksExceptExactBindingPass && scope) {
      status = exactTransactionBound
        ? "EXTERNAL_AUTHORIZATION_ELIGIBLE"
        : "SCOPE_ATTESTED_PREVIEW_ONLY";
    }

    const digestPayload = JSON.stringify({
      status,
      scope: scope
        ? {
            chainId: scope.chainId,
            protocol: scope.protocol,
            actionType: scope.actionType,
            targetContract: scope.targetContract.toLowerCase(),
            asset: scope.asset.toUpperCase(),
            optionRight: scope.optionRight,
            proposalId: scope.proposalId,
            proposalDigest: scope.proposalDigest,
            intentId: scope.intentId,
            intentVersion: scope.intentVersion,
            simulationId: scope.simulationId,
            boundQuoteId: scope.boundQuoteId ?? null,
            maxSpendUSDC: scope.maxSpendUSDC,
            expectedTotalCostUSDC: scope.expectedTotalCostUSDC,
            expectedQuantity: scope.expectedQuantity,
            expectedExpiryMs: scope.expectedExpiryMs,
          }
        : null,
      checks: checks.map((check) => ({
        check: check.check,
        passed: check.passed,
      })),
    });

    const attestationDigest = createHash("sha256")
      .update(digestPayload)
      .digest("hex");

    return {
      attestationId: `auth-att-${attestationDigest.slice(0, 16)}`,
      attestationDigest,
      createdAtMs,
      status,
      executionStatus: "NOT_AUTHORIZED",
      canExecute: false,
      scope,
      checks,
      blockers: Array.from(new Set(blockers)),
      disclosure:
        status === "SCOPE_ATTESTED_PREVIEW_ONLY"
          ? "The bounded scope is attested for review, but execution remains blocked because the current HedgeOS proposal is preview-bound rather than exact-transaction-bound. No wallet permission, signature, approval, RFQ submission, or transaction has been created."
          : status === "EXTERNAL_AUTHORIZATION_ELIGIBLE"
            ? "The package satisfies the bounded authorization eligibility checks, but this attestation is not an authorization and cannot execute a transaction. A separate eligible human authorization system would still be required."
            : "The package failed one or more bounded authorization checks. No authorization or execution is permitted.",
    };
  }
}
