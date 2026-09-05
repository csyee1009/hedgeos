import React, { useMemo, useState } from "react";
import {
  ActionProposal,
  BoundedAuthorizationAttestation,
  CandidateStrategy,
  ExecutionCommitment,
  ExternalHumanAuthorizationHandoff,
  HumanReviewRecord,
  LiveMarketExplorer,
  LiveOptionBookOrderDTO,
  MarketStateRecord,
  PolicyDecisionRecord,
  RFQReasonCode,
  RFQRequirementStatus,
  RFQSpecification,
  SimulationResult,
  TokenAmount,
  TypedRiskIntent,
} from "../../types";
import { AdvancedJudgeDrawer } from "./AdvancedJudgeDrawer";
import { AuthorizationBoundaryCard } from "./AuthorizationBoundaryCard";
import { CandidateCard } from "./CandidateCard";
import { ExecutionBoundaryCard } from "./ExecutionBoundaryCard";
import { HumanReviewCard } from "./HumanReviewCard";
import { resolveOptionCategory } from "../../services/OptionCategoryResolver";
import { OptionSizingAdapter } from "../../services/OptionSizingAdapter";

export interface RevalidationFailureInfo {
  orderId: string;
  reasonCode: "ORDER_DISAPPEARED" | "ORDER_CHANGED" | "ORDER_EXPIRED" | "INSUFFICIENT_CAPACITY" | "REVALIDATION_FAILED";
  explanation: string;
  orderSummary?: {
    orderId: string;
    asset: string;
    strikeDisplay: string;
    expiryDisplay: string;
  };
}

interface CandidateListProps {
  intent: TypedRiskIntent;
  mode?: "OPTIONBOOK_AVAILABLE" | "RFQ_REQUIRED";
  candidates: CandidateStrategy[];
  rejectedCandidates?: CandidateStrategy[];
  rfqRequirement?: {
    status: RFQRequirementStatus;
    reasons: RFQReasonCode[];
    explanation: string;
  };
  rfqSpecification?: RFQSpecification;
  marketExplorer?: LiveMarketExplorer;
  actionProposal?: ActionProposal;
  simulationResult?: SimulationResult;
  humanReviewRecord?: HumanReviewRecord;
  authorizationAttestation?: BoundedAuthorizationAttestation;
  executionCommitment?: ExecutionCommitment;
  externalHumanAuthorizationHandoff?: ExternalHumanAuthorizationHandoff;
  policyDecisions: Record<string, PolicyDecisionRecord>;
  marketState?: MarketStateRecord;
  isSolving: boolean;
  revalidationFailure?: RevalidationFailureInfo | null;
  onReset: () => void;
  onRefresh: () => void;
  onEditGoal?: () => void;
  onChooseAnotherContract?: () => void;
  onAcceptContract?: (
    order: LiveOptionBookOrderDTO,
    updates: {
      maxPremiumUSDC?: { amount: string };
      horizonTimestampMs?: number;
      targetMaxLossPercent?: number;
    }
  ) => void;
}

export function formatRequestedProtectionQuantity(
  amount: TokenAmount,
  underlying: string,
): string {
  const base = BigInt(amount.amountBaseUnits);
  const padded = base.toString().padStart(amount.decimals + 1, "0");
  const integer = amount.decimals === 0 ? padded : padded.slice(0, -amount.decimals);
  const fraction = amount.decimals === 0
    ? ""
    : padded.slice(-amount.decimals).slice(0, 8).replace(/0+$/, "");
  return `${integer}${fraction ? `.${fraction}` : ""} ${underlying}`;
}

function formatExplorerAmount(amount?: TokenAmount): string {
  if (!amount) return "Not available";
  return formatRequestedProtectionQuantity(amount, amount.symbol);
}

const failureCategoriesForCandidate = (
  candidate: CandidateStrategy,
  policyDecision?: PolicyDecisionRecord
): string[] => {
  const categories = new Set<string>();

  if (
    candidate.status === "LIQUIDITY_INSUFFICIENT" ||
    candidate.status === "TECHNICALLY_REJECTED"
  ) {
    categories.add("LIQUIDITY");
  }

  if (candidate.status === "EXPIRY_MISMATCH") {
    categories.add("HORIZON");
  }

  if (candidate.status === "PREVIEW_FAILED") {
    categories.add("PREVIEW");
  }

  if (candidate.status === "SIZING_UNRESOLVED") {
    categories.add("SIZING");
  }

  if (candidate.status === "BUDGET_REJECTED") {
    categories.add("BUDGET");
  }

  if (candidate.status === "PROTECTION_TARGET_NOT_MET") {
    categories.add("PROTECTION");
  }

  for (const check of policyDecision?.checks || []) {
    if (check.status !== "FAIL") {
      continue;
    }

    if (check.ruleId === "POL-001") {
      categories.add("BUDGET");
    } else if (check.ruleId === "POL-009") {
      categories.add("PROTECTION");
    } else {
      categories.add("POLICY");
    }
  }

  if (categories.size === 0) {
    categories.add("OTHER");
  }

  return Array.from(categories);
};

const consumerReasonText: Record<string, string> = {
  BUDGET:
    "Some otherwise-evaluated options exceeded your confirmed protection budget.",
  PROTECTION:
    "Some options did not meet your confirmed modeled downside target.",
  HORIZON:
    "Some options expired before the end of your requested protection period.",
  LIQUIDITY:
    "Some orders did not have enough verified capacity for the amount you want to protect.",
  PREVIEW:
    "Some orders could not produce a verified read-only market preview.",
  SIZING:
    "Some orders could not be sized reliably for your requested exposure.",
  POLICY:
    "Some orders failed another Financial Constitution requirement.",
  OTHER:
    "Some market orders were evaluated but could not satisfy all required checks.",
};

const formatCandidateCost = (
  candidate: CandidateStrategy
): string => {
  const payoff =
    candidate.payoffSummary &&
      typeof candidate.payoffSummary === "object" &&
      "totalProtectionCostUSD" in candidate.payoffSummary
      ? candidate.payoffSummary
      : undefined;

  if (payoff) {
    return `${payoff.totalProtectionCostUSD.toFixed(2)} USDC`;
  }

  if (candidate.preview?.totalExpectedCost) {
    const amount = candidate.preview.totalExpectedCost;

    const base = BigInt(amount.amountBaseUnits);
    const decimals = amount.decimals;

    const padded = base
      .toString()
      .padStart(decimals + 1, "0");

    const integerPart =
      decimals === 0 ? padded : padded.slice(0, -decimals);

    const fraction =
      decimals === 0
        ? ""
        : padded
          .slice(-decimals)
          .slice(0, 6)
          .replace(/0+$/, "");

    return `${integerPart}${fraction ? `.${fraction}` : ""} USDC`;
  }

  return "Not evaluated";
};

const getCandidateDownside = (
  candidate: CandidateStrategy
): string => {
  const payoff =
    candidate.payoffSummary &&
      typeof candidate.payoffSummary === "object" &&
      "effectiveDownsidePercent" in candidate.payoffSummary
      ? candidate.payoffSummary
      : undefined;

  if (!payoff) {
    return "Not evaluated";
  }

  return `${payoff.effectiveDownsidePercent.toFixed(2)}%`;
};

export function computeOrderTotalPremiumBase(
  order: LiveOptionBookOrderDTO,
  intent: TypedRiskIntent
): bigint | undefined {
  if (!order.pricePerContract) return undefined;
  const pricePerContractBase = BigInt(order.pricePerContract.amountBaseUnits);
  const sizing = OptionSizingAdapter.resolveSizing(intent.exposureAmount.value, intent.asset.value);
  const contractBaseUnits = BigInt(
    sizing.resolvedOptionQuantity?.amountBaseUnits || intent.exposureAmount.value.amountBaseUnits
  );
  return (pricePerContractBase * contractBaseUnits) / 10n ** 18n;
}

export function sortAndFilterOrders(
  orders: LiveOptionBookOrderDTO[],
  intent: TypedRiskIntent,
  currentSortOrder: "ASC" | "DESC" | "CLOSEST_MATCH",
  onlyWithinBudget: boolean
): LiveOptionBookOrderDTO[] {
  const userMaxBudgetBase = BigInt(intent.maxPremiumUSDC.value.amountBaseUnits);

  let result = orders;

  if (onlyWithinBudget) {
    result = result.filter((order) => {
      const totalBase = computeOrderTotalPremiumBase(order, intent);
      return totalBase !== undefined && totalBase <= userMaxBudgetBase;
    });
  }

  if (currentSortOrder === "CLOSEST_MATCH") {
    return result;
  }

  return [...result].sort((a, b) => {
    const aTotal = computeOrderTotalPremiumBase(a, intent);
    const bTotal = computeOrderTotalPremiumBase(b, intent);

    if (aTotal === undefined && bTotal === undefined) return 0;
    if (aTotal === undefined) return 1;
    if (bTotal === undefined) return -1;

    if (currentSortOrder === "ASC") {
      return aTotal < bTotal ? -1 : aTotal > bTotal ? 1 : 0;
    } else {
      return aTotal > bTotal ? -1 : aTotal < bTotal ? 1 : 0;
    }
  });
}

const MarketOrderList: React.FC<{
  orders: LiveOptionBookOrderDTO[];
  emptyMessage: string;
  intent?: TypedRiskIntent;
  showReasons?: boolean;
  onViewAnalysis: (order: LiveOptionBookOrderDTO) => void;
  onSelectOrder?: (order: LiveOptionBookOrderDTO) => void;
  onAdjustGoal?: (order: LiveOptionBookOrderDTO) => void;
  onEditGoal?: () => void;
}> = ({ orders, emptyMessage, intent, showReasons = false, onViewAnalysis, onSelectOrder, onAdjustGoal, onEditGoal }) => {
  if (orders.length === 0) {
    return <div className="alert alert-info" style={{ marginTop: "1rem" }}>{emptyMessage}</div>;
  }

  return (
    <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
      {orders.map((order) => {
        const isEligible = order.eligibilityStatus === "ELIGIBLE";
        const isProceedable = order.proceedable;

        let budgetBadge: React.ReactNode = null;
        if (intent) {
          const userMaxBudgetBase = BigInt(intent.maxPremiumUSDC.value.amountBaseUnits);
          const totalRequiredPremiumBase = computeOrderTotalPremiumBase(order, intent);

          if (totalRequiredPremiumBase !== undefined) {
            if (totalRequiredPremiumBase <= userMaxBudgetBase) {
              budgetBadge = (
                <span className="badge badge-success" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                  ✓ WITHIN BUDGET
                </span>
              );
            } else {
              const diffBase = totalRequiredPremiumBase - userMaxBudgetBase;
              const diffUsdc = (Number(diffBase) / 1e6).toFixed(2);
              budgetBadge = (
                <span className="badge badge-warning" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                  ✕ OVER BUDGET BY {diffUsdc} USDC
                </span>
              );
            }
          } else {
            budgetBadge = (
              <span className="badge badge-neutral" style={{ fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                Premium: NOT_EVALUATED
              </span>
            );
          }
        }

        return (
          <article
            key={order.orderId}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "0.85rem",
              background: "var(--surface-secondary)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <strong>{order.asset} {order.optionRight}</strong>
                {budgetBadge}
              </div>
              <span className={
                isEligible
                  ? "badge badge-success"
                  : isProceedable
                    ? "badge badge-warning"
                    : "badge badge-neutral"
              }>
                {isEligible
                  ? "PROCEEDABLE — MATCHES GOAL"
                  : isProceedable
                    ? "PROCEEDABLE — GOAL MISMATCH"
                    : "READ-ONLY / NOT PROCEEDABLE"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: "0.5rem", marginTop: "0.65rem", fontSize: "0.84rem" }}>
              <span>Strike: {order.strikes[0] ? formatExplorerAmount(order.strikes[0]) : "Not available"}</span>
              <span>Expiry: {order.expiryTimestampMs ? new Date(order.expiryTimestampMs).toLocaleString() : "Not available"}</span>
              <span>Capacity: {formatExplorerAmount(order.availableCapacity)}</span>
              <span>Price indication: {formatExplorerAmount(order.pricePerContract)}</span>
              <span>Status: {order.activeStatus}</span>
              <span>Structure: {order.structureLabel}</span>
            </div>

            {!isProceedable && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-secondary)", fontStyle: "italic" }}>
                {order.optionRight === "CALL"
                  ? "READ-ONLY MARKET ORDER — Current HedgeOS protection workflow supports protective LONG PUT strategies."
                  : "READ-ONLY / NOT PROCEEDABLE — This order fails hard requirements for the HedgeOS protective PUT workflow."}
              </div>
            )}

            {(showReasons || !isEligible) && order.rejectionReasons.length > 0 && (
              <div style={{ marginTop: "0.65rem", fontSize: "0.82rem" }}>
                <strong>Analysis details:</strong>
                <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem" }}>
                  {order.rejectionReasons.slice(0, showReasons ? 8 : 2).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onViewAnalysis(order)}
              >
                📊 View Analysis
              </button>

              {isProceedable && isEligible && onSelectOrder && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onSelectOrder(order)}
                >
                  Continue With This Order →
                </button>
              )}

              {isProceedable && !isEligible && (
                <>
                  {onAdjustGoal && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => onAdjustGoal(order)}
                    >
                      ✓ Accept This Contract
                    </button>
                  )}
                  {onEditGoal && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={onEditGoal}
                    >
                      ✏️ Edit Protection Goal Manually
                    </button>
                  )}
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
};

const OrderAnalysisModal: React.FC<{
  order: LiveOptionBookOrderDTO;
  intent: TypedRiskIntent;
  onClose: () => void;
  onContinueOrder?: (order: LiveOptionBookOrderDTO) => void;
  onAdjustGoal?: (order: LiveOptionBookOrderDTO) => void;
  onEditGoal?: () => void;
}> = ({ order, intent, onClose, onContinueOrder, onAdjustGoal, onEditGoal }) => {
  const isEligible = order.eligibilityStatus === "ELIGIBLE";
  const isProceedable = order.proceedable;
  const userCategory = resolveOptionCategory(intent);
  const orderCategory = order.optionCategory || (order.optionRight === "CALL" ? "LONG_CALL" : "LONG_PUT");
  const categoryMatches = order.categoryMatchesIntent ?? (userCategory === orderCategory);

  return (
    <div className="modal-backdrop" style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "1rem"
    }}>
      <div className="modal-content card" style={{
        maxWidth: "650px", width: "100%", maxHeight: "90vh", overflowY: "auto",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "1.5rem"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
          <div>
            <span className="badge badge-info">DETERMINISTIC ANALYSIS</span>
            <h3 style={{ marginTop: "0.5rem" }}>Order Analysis — {order.asset} {order.optionRight}</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>ID: {order.orderId} • Structure: {order.structureLabel}</span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Change 12: Top Category Match Header */}
        <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--surface-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", fontSize: "0.85rem" }}>
            <div><strong>USER CATEGORY:</strong> {userCategory.replace("_", " ")}</div>
            <div><strong>ORDER CATEGORY:</strong> {orderCategory.replace("_", " ")}</div>
            <div>
              <strong>CATEGORY MATCH:</strong>{" "}
              {categoryMatches ? (
                <span style={{ color: "var(--color-success, #10b981)", fontWeight: "bold" }}>✓ YES</span>
              ) : (
                <span style={{ color: "var(--color-danger, #ef4444)", fontWeight: "bold" }}>✕ NO</span>
              )}
            </div>
          </div>
        </div>

        {!categoryMatches && (
          <div className="alert alert-warning" style={{ marginTop: "1rem" }}>
            Different category from your confirmed intent ({userCategory.replace("_", " ")} vs {orderCategory.replace("_", " ")}).
          </div>
        )}

        {!isProceedable && categoryMatches && (
          <div className="alert alert-warning" style={{ marginTop: "1rem" }}>
            READ-ONLY / NOT PROCEEDABLE — This order fails hard structural requirements.
          </div>
        )}

        <div style={{ marginTop: "1.25rem", display: "grid", gap: "1.25rem" }}>
          {isProceedable ? (
            <>
              <div>
                <strong style={{ color: "var(--color-success, #10b981)" }}>WHY IT FITS STRUCTURALLY</strong>
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem", fontSize: "0.875rem" }}>
                  <li>✓ same underlying asset ({order.asset})</li>
                  <li>✓ same option right ({order.optionRight})</li>
                  <li>✓ same direction ({order.takerSide ?? "BUY"})</li>
                  <li>✓ supported single-strike structure ({order.structureLabel})</li>
                  <li>✓ active signing deadline</li>
                  <li>✓ capacity available</li>
                </ul>
              </div>

              <div>
                <strong>CURRENT GOAL CHECKS</strong>
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem", fontSize: "0.875rem" }}>
                  {order.constraintChecks.map((check, idx) => (
                    <li key={idx} style={{ marginBottom: "0.25rem" }}>
                      {check.status === "PASS" ? (
                        <span style={{ color: "var(--color-success, #10b981)", fontWeight: "bold" }}>✓ </span>
                      ) : check.status === "FAIL" ? (
                        <span style={{ color: "var(--color-danger, #ef4444)", fontWeight: "bold" }}>✕ </span>
                      ) : (
                        <span>• </span>
                      )}
                      <strong>{check.code}:</strong> {check.details}
                    </li>
                  ))}
                </ul>
              </div>

              {order.requiredChanges && order.requiredChanges.length > 0 && (
                <div>
                  <strong>WHAT WOULD NEED TO CHANGE</strong>
                  <div style={{ marginTop: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                    <table style={{ width: "100%", fontSize: "0.84rem", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--surface-secondary)", borderBottom: "1px solid var(--border)" }}>
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "left" }}>Field</th>
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "left" }}>Current Goal</th>
                          <th style={{ padding: "0.5rem 0.75rem", textAlign: "left" }}>Candidate Requirement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.requiredChanges.map((change, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.5rem 0.75rem" }}><strong>{change.field}</strong></td>
                            <td style={{ padding: "0.5rem 0.75rem" }}>{change.currentValue}</td>
                            <td style={{ padding: "0.5rem 0.75rem" }}>{change.candidateRequirement}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <strong style={{ color: "var(--color-danger, #ef4444)" }}>HARD INCOMPATIBILITY REASONS</strong>
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem", fontSize: "0.875rem" }}>
                {order.hardFailureReasons.map((reason, idx) => (
                  <li key={idx} style={{ marginBottom: "0.25rem" }}>✕ {reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}>
          {isProceedable && isEligible && onContinueOrder && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { onClose(); onContinueOrder(order); }}
            >
              Continue With This Order →
            </button>
          )}

          {isProceedable && !isEligible && (
            <>
              {onAdjustGoal && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => { onClose(); onAdjustGoal(order); }}
                >
                  ✓ Accept This Contract
                </button>
              )}
              {onEditGoal && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { onClose(); onEditGoal(); }}
                >
                  ✏️ Edit Protection Goal Manually
                </button>
              )}
            </>
          )}

          {!categoryMatches && onEditGoal && (
            <button
              type="button"
              className="btn btn-warning"
              onClick={() => { onClose(); onEditGoal(); }}
            >
              ✏️ Change Strategy Category
            </button>
          )}

          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export function deriveContractTargetMaxLossPercent(
  order: LiveOptionBookOrderDTO,
  intent: TypedRiskIntent
): number {
  for (const check of order.constraintChecks || []) {
    if (check.details) {
      const match = check.details.match(/(?:display|modeled|downside)\s+([\d.]+)\%/i);
      if (match && match[1]) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val >= 0 && val <= 100) return val;
      }
    }
  }

  for (const reason of order.rejectionReasons || []) {
    const match = reason.match(/(?:display|modeled|downside|target)\s+([\d.]+)\%/i);
    if (match && match[1]) {
      const val = parseFloat(match[1]);
      if (!isNaN(val) && val >= 0 && val <= 100) return val;
    }
  }

  if (order.strikes && order.strikes[0]) {
    const strikeVal = Number(BigInt(order.strikes[0].amountBaseUnits)) / 10 ** order.strikes[0].decimals;
    if (strikeVal > 0) {
      const spotRef = intent.asset.value === "ETH" ? 2700 : intent.asset.value === "BTC" ? 60000 : 1;
      if (spotRef > strikeVal) {
        const calculatedDownside = Number((((spotRef - strikeVal) / spotRef) * 100).toFixed(4));
        if (calculatedDownside > 0 && calculatedDownside <= 100) {
          return calculatedDownside;
        }
      }
    }
  }

  return intent.targetMaxLossPercent?.value ?? 8;
}

const GoalAdjustmentModal: React.FC<{
  order: LiveOptionBookOrderDTO;
  intent: TypedRiskIntent;
  onClose: () => void;
  onEditGoal: () => void;
  onAcceptContract?: (
    order: LiveOptionBookOrderDTO,
    updates: {
      maxPremiumUSDC?: { amount: string };
      horizonTimestampMs?: number;
      targetMaxLossPercent?: number;
    }
  ) => void;
}> = ({ order, intent, onClose, onEditGoal, onAcceptContract }) => {
  const sizing = OptionSizingAdapter.resolveSizing(intent.exposureAmount.value, intent.asset.value);
  const contractBaseUnits = BigInt(sizing.resolvedOptionQuantity?.amountBaseUnits || intent.exposureAmount.value.amountBaseUnits);
  const candidatePriceBase = order.pricePerContract ? BigInt(order.pricePerContract.amountBaseUnits) : undefined;
  const currentBudgetBase = BigInt(intent.maxPremiumUSDC.value.amountBaseUnits);

  const totalRequiredPremiumBase = candidatePriceBase !== undefined
    ? (candidatePriceBase * contractBaseUnits) / 10n ** 18n
    : undefined;

  const budgetNeedsIncrease = totalRequiredPremiumBase !== undefined && totalRequiredPremiumBase > currentBudgetBase;
  const horizonNeedsAdjustment = Boolean(order.expiryTimestampMs && intent.horizonTimestamp.value.timestampMs > order.expiryTimestampMs);

  const derivedTargetLoss = deriveContractTargetMaxLossPercent(order, intent);
  const targetLossNeedsAdjustment = Math.abs(derivedTargetLoss - intent.targetMaxLossPercent.value) > 0.0001;

  const proposedUpdates: {
    maxPremiumUSDC?: { amount: string };
    horizonTimestampMs?: number;
    targetMaxLossPercent?: number;
  } = {};

  if (budgetNeedsIncrease && totalRequiredPremiumBase !== undefined) {
    proposedUpdates.maxPremiumUSDC = { amount: totalRequiredPremiumBase.toString() };
  }
  if (horizonNeedsAdjustment && order.expiryTimestampMs) {
    proposedUpdates.horizonTimestampMs = order.expiryTimestampMs;
  }
  if (targetLossNeedsAdjustment) {
    proposedUpdates.targetMaxLossPercent = derivedTargetLoss;
  }

  const handleConfirmAccept = () => {
    onClose();
    if (onAcceptContract) {
      onAcceptContract(order, proposedUpdates);
    }
  };

  const formattedCurrentBudget = formatExplorerAmount(intent.maxPremiumUSDC.value);
  const formattedRequiredTotalCost = totalRequiredPremiumBase !== undefined
    ? formatExplorerAmount({ amountBaseUnits: totalRequiredPremiumBase.toString(), decimals: 6, symbol: "USDC" })
    : order.pricePerContract
      ? formatExplorerAmount(order.pricePerContract)
      : "N/A";

  return (
    <div className="modal-backdrop" style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "1rem"
    }}>
      <div className="modal-content card" style={{
        maxWidth: "640px", width: "100%", maxHeight: "90vh", overflowY: "auto",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "1.5rem"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
          <div>
            <span className="badge badge-warning">ACCEPT LIVE CONTRACT</span>
            <h3 style={{ marginTop: "0.5rem" }}>Review Changes to Accept Contract</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Candidate: {order.orderId} • Strike: {order.strikes[0] ? formatExplorerAmount(order.strikes[0]) : "N/A"}</span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ marginTop: "1.25rem" }}>
          <p style={{ fontSize: "0.875rem" }}>
            This contract is proceedable under HedgeOS rules but differs from your current soft constraints. Review the exact changes below before accepting:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
            <div style={{ padding: "0.85rem", background: "var(--surface-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <strong style={{ fontSize: "0.9rem" }}>CURRENT CONFIRMED GOAL</strong>
              <div style={{ marginTop: "0.5rem", fontSize: "0.84rem", display: "grid", gap: "0.35rem" }}>
                <span>Asset: <strong>{intent.asset.value}</strong></span>
                <span>Exposure: <strong>{formatRequestedProtectionQuantity(intent.exposureAmount.value, intent.asset.value)}</strong></span>
                <span>Target Max Loss: <strong>{intent.targetMaxLossPercent.value}%</strong></span>
                <span>Max Budget: <strong>{formattedCurrentBudget}</strong></span>
                <span>Horizon: <strong>{intent.horizonTimestamp.value.formattedDisplay}</strong></span>
              </div>
            </div>

            <div style={{ padding: "0.85rem", background: "var(--surface-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <strong style={{ fontSize: "0.9rem" }}>CONTRACT-COMPATIBLE VALUES</strong>
              <div style={{ marginTop: "0.5rem", fontSize: "0.84rem", display: "grid", gap: "0.35rem" }}>
                <span>Asset: <strong>{order.asset}</strong></span>
                <span>Covered Quantity: <strong>{formatRequestedProtectionQuantity(intent.exposureAmount.value, intent.asset.value)}</strong></span>
                <span>Structure: <strong>{order.structureLabel}</strong></span>
                <span>Total Required Premium: <strong>{formattedRequiredTotalCost}</strong></span>
                <span>Expiry Horizon: <strong>{order.expiryTimestampMs ? new Date(order.expiryTimestampMs).toLocaleDateString() : "N/A"}</strong></span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: "1.25rem", padding: "0.85rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
            <strong style={{ fontSize: "0.88rem" }}>PROPOSED GOAL ADJUSTMENTS</strong>
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem", fontSize: "0.85rem" }}>
              {targetLossNeedsAdjustment ? (
                <li style={{ marginBottom: "0.35rem" }}>
                  <strong>Target Max Loss:</strong> {intent.targetMaxLossPercent.value}% → {derivedTargetLoss}% (contract modeled downside)
                </li>
              ) : (
                <li style={{ marginBottom: "0.35rem", color: "var(--color-success, #10b981)" }}>
                  ✓ <strong>Target Max Loss:</strong> Contract modeled downside ({derivedTargetLoss}%) satisfies target max loss ({intent.targetMaxLossPercent.value}%).
                </li>
              )}

              {horizonNeedsAdjustment ? (
                <li style={{ marginBottom: "0.35rem" }}>
                  <strong>Horizon:</strong> {intent.horizonTimestamp.value.formattedDisplay} → {new Date(order.expiryTimestampMs!).toLocaleDateString()} (candidate expiry)
                </li>
              ) : (
                <li style={{ marginBottom: "0.35rem", color: "var(--color-success, #10b981)" }}>
                  ✓ <strong>Horizon:</strong> Candidate expiry ({order.expiryTimestampMs ? new Date(order.expiryTimestampMs).toLocaleDateString() : "N/A"}) covers requested horizon.
                </li>
              )}

              {budgetNeedsIncrease ? (
                <li style={{ marginBottom: "0.35rem" }}>
                  <strong>Budget:</strong> {formattedCurrentBudget} → at least {formattedRequiredTotalCost}
                </li>
              ) : (
                <li style={{ marginBottom: "0.35rem", color: "var(--color-success, #10b981)" }}>
                  ✓ <strong>Budget:</strong> Total required cost ({formattedRequiredTotalCost}) is within current limit ({formattedCurrentBudget}).
                </li>
              )}
            </ul>
          </div>
        </div>

        <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirmAccept}
          >
            ✓ Confirm & Use This Contract
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { onClose(); onEditGoal(); }}
          >
            ✏️ Edit Protection Goal Manually
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export const CandidateList: React.FC<CandidateListProps> = ({
  intent,
  mode = "OPTIONBOOK_AVAILABLE",
  candidates,
  rejectedCandidates = [],
  rfqRequirement,
  rfqSpecification,
  marketExplorer,
  actionProposal,
  simulationResult,
  humanReviewRecord,
  authorizationAttestation,
  executionCommitment,
  externalHumanAuthorizationHandoff,
  policyDecisions,
  marketState,
  isSolving,
  revalidationFailure,
  onReset,
  onRefresh,
  onEditGoal,
  onChooseAnotherContract,
  onAcceptContract,
}) => {
  const [selectedCandidate, setSelectedCandidate] =
    useState<CandidateStrategy | null>(null);
  const [marketTab, setMarketTab] = useState<"MATCHING" | "CLOSEST" | "MY_CATEGORY" | "ALL_LIVE" | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"MY_CATEGORY" | "LONG_PUT" | "SHORT_PUT" | "LONG_CALL" | "SHORT_CALL" | "ALL">("MY_CATEGORY");
  const [sortOrder, setSortOrder] = useState<"ASC" | "DESC" | "CLOSEST_MATCH">("ASC");
  const [withinBudgetOnly, setWithinBudgetOnly] = useState<boolean>(false);

  const [analysisModalOrder, setAnalysisModalOrder] = useState<LiveOptionBookOrderDTO | null>(null);
  const [adjustModalOrder, setAdjustModalOrder] = useState<LiveOptionBookOrderDTO | null>(null);

  const resetToOverview = () => {
    setMarketTab(null);
    setSelectedCandidate(null);
    setAnalysisModalOrder(null);
    setAdjustModalOrder(null);
  };

  const handleChooseAnotherClick = () => {
    resetToOverview();
    if (onChooseAnotherContract) {
      onChooseAnotherContract();
    }
  };

  const handleRefreshClick = () => {
    resetToOverview();
    if (onRefresh) {
      onRefresh();
    }
  };

  const isLive =
    marketState?.status === "LIVE_READ_AVAILABLE";

  const orderCount =
    typeof marketState?.orderCount === "number"
      ? marketState.orderCount
      : undefined;

  const rawMyCategoryOrders = useMemo(() => {
    if (!marketExplorer) return [];
    const userCat = marketExplorer.confirmedCategory || "LONG_PUT";
    return marketExplorer.eligibleInMyCategory && marketExplorer.eligibleInMyCategory.length > 0
      ? marketExplorer.eligibleInMyCategory
      : marketExplorer.allLive.filter((o) => (o.optionCategory === userCat || o.categoryMatchesIntent) && o.proceedable);
  }, [marketExplorer]);

  const filteredAllLive = useMemo(() => {
    if (!marketExplorer) return [];
    const userCat = marketExplorer.confirmedCategory || "LONG_PUT";
    if (categoryFilter === "MY_CATEGORY") return rawMyCategoryOrders;
    if (categoryFilter === "LONG_PUT") return marketExplorer.allLive.filter((o) => o.optionCategory === "LONG_PUT");
    if (categoryFilter === "SHORT_PUT") return marketExplorer.allLive.filter((o) => o.optionCategory === "SHORT_PUT");
    if (categoryFilter === "LONG_CALL") return marketExplorer.allLive.filter((o) => o.optionCategory === "LONG_CALL");
    if (categoryFilter === "SHORT_CALL") return marketExplorer.allLive.filter((o) => o.optionCategory === "SHORT_CALL");
    return marketExplorer.allLive;
  }, [marketExplorer, categoryFilter, rawMyCategoryOrders]);

  const handleSelectMatchingOrder = (order: LiveOptionBookOrderDTO) => {
    const derivedTargetLoss = deriveContractTargetMaxLossPercent(order, intent);
    const totalRequiredPremiumBase = computeOrderTotalPremiumBase(order, intent);
    const currentBudgetBase = BigInt(intent.maxPremiumUSDC.value.amountBaseUnits);

    const budgetNeedsIncrease = totalRequiredPremiumBase !== undefined && totalRequiredPremiumBase > currentBudgetBase;
    const horizonNeedsAdjustment = Boolean(order.expiryTimestampMs && intent.horizonTimestamp.value.timestampMs > order.expiryTimestampMs);
    const targetLossNeedsAdjustment = Math.abs(derivedTargetLoss - intent.targetMaxLossPercent.value) > 0.0001;

    if (budgetNeedsIncrease || horizonNeedsAdjustment || targetLossNeedsAdjustment) {
      setAdjustModalOrder(order);
    } else if (onAcceptContract) {
      const proposedUpdates: {
        maxPremiumUSDC?: { amount: string };
        horizonTimestampMs?: number;
        targetMaxLossPercent?: number;
      } = {
        targetMaxLossPercent: derivedTargetLoss,
        ...(totalRequiredPremiumBase ? { maxPremiumUSDC: { amount: totalRequiredPremiumBase.toString() } } : {}),
        ...(order.expiryTimestampMs ? { horizonTimestampMs: order.expiryTimestampMs } : {}),
      };
      onAcceptContract(order, proposedUpdates);
    } else if (candidates.length > 0) {
      setSelectedCandidate(candidates[0]);
    }
  };

  const isRfqRequired =
    mode === "RFQ_REQUIRED";

  const hasInconsistentOptionBookResult =
    mode === "OPTIONBOOK_AVAILABLE" && candidates.length === 0;

  const rfqStrategyLabel =
    rfqSpecification?.strategyType === "PUT_SPREAD"
      ? "Put Spread"
      : rfqSpecification?.strategyType === "LONG_PUT"
        ? "Long Put"
        : "Protection Structure";

  const failureSummary = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const candidate of rejectedCandidates) {
      const decision =
        policyDecisions[candidate.strategyId] ||
        candidate.policyDecision;

      const categories = failureCategoriesForCandidate(
        candidate,
        decision
      );

      for (const category of categories) {
        counts[category] = (counts[category] || 0) + 1;
      }
    }

    return Object.entries(counts).sort(
      (a, b) => b[1] - a[1]
    );
  }, [rejectedCandidates, policyDecisions]);

  const closestEvaluatedCandidates = useMemo(() => {
    return rejectedCandidates
      .filter((candidate) => {
        const decision =
          policyDecisions[candidate.strategyId] ||
          candidate.policyDecision;

        return (
          decision &&
          candidate.preview?.previewStatus ===
          "PREVIEW_AVAILABLE" &&
          candidate.liquiditySufficient === true
        );
      })
      .sort((a, b) => {
        const aDecision =
          policyDecisions[a.strategyId] || a.policyDecision;
        const bDecision =
          policyDecisions[b.strategyId] || b.policyDecision;

        const aFails =
          aDecision?.checks?.filter(
            (check) => check.status === "FAIL"
          ).length || 0;

        const bFails =
          bDecision?.checks?.filter(
            (check) => check.status === "FAIL"
          ).length || 0;

        if (aFails !== bFails) {
          return aFails - bFails;
        }

        return a.strategyId.localeCompare(b.strategyId);
      })
      .slice(0, 3);
  }, [rejectedCandidates, policyDecisions]);

  const rfqCandidateForDrawer: CandidateStrategy | null =
    rfqSpecification?.strategyType === "LONG_PUT"
      ? {
        strategyId: `strat-${rfqSpecification.rfqSpecId}`,
        name: `Custom Protection Quote (${rfqStrategyLabel} RFQ)`,
        strategyType: "LONG_PUT",
        legs: [
          {
            side: "BUY",
            right: "PUT",
            strikePrice: rfqSpecification.strikes[0],
            expiryTimestampMs:
              rfqSpecification.expiryTimestampMs,
            requestedExposure: intent.exposureAmount.value,
            resolvedOptionQuantity:
              rfqSpecification.requestedContracts,
            sizingStatus: "RESOLVED",
            quoteReference: "rfq-leg-1",
          },
        ],
        quotes: [],
        status: "RFQ_SPECIFICATION_READY",
        rejectionReasons: [],
        scoresStatus: "NOT_AVAILABLE",
        sizingStatus: "RESOLVED",
        underlyingResolutionMethod:
          "RFQ_SPECIFICATION_DERIVATION",
      }
      : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      <div
        className="card confirmed-goal-summary-card"
        style={{
          padding: "1rem 1.25rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span className="badge badge-success" style={{ fontSize: "0.75rem" }}>✓ Confirmed Protection Goal</span>
            {intent.targetMaxLossPercent?.source === "USER_ACCEPTED_LIVE_CONTRACT" ? (
              <span className="badge badge-warning" style={{ fontSize: "0.75rem" }}>CONTRACT-ADJUSTED</span>
            ) : (
              <span className="badge badge-neutral" style={{ fontSize: "0.75rem" }}>ORIGINAL USER GOAL</span>
            )}
          </div>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: "0.9rem", marginTop: "0.35rem" }}>
            <span><strong>Target Max Loss:</strong> {intent.targetMaxLossPercent?.value}%</span>
            <span><strong>Max Budget:</strong> {formatExplorerAmount(intent.maxPremiumUSDC?.value)}</span>
            <span><strong>Horizon:</strong> {intent.horizonTimestamp?.value?.formattedDisplay || (intent.horizonTimestamp?.value?.timestampMs ? new Date(intent.horizonTimestamp.value.timestampMs).toLocaleDateString() : "N/A")}</span>
            <span><strong>Asset:</strong> {intent.exposureAmount?.value && intent.asset?.value ? formatRequestedProtectionQuantity(intent.exposureAmount.value, intent.asset.value) : "N/A"}</span>
          </div>
        </div>
        {onEditGoal && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
            onClick={onEditGoal}
          >
            ✏️ Edit Goal
          </button>
        )}
      </div>

      {revalidationFailure && (
        <section className="card revalidation-failure-card" style={{ padding: "1.25rem", border: "2px solid var(--color-warning, #f59e0b)", borderRadius: "var(--radius-md)", background: "rgba(245, 158, 11, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <span className="badge badge-warning">CONTRACT REVALIDATION</span>
              <span className="badge badge-neutral" style={{ marginLeft: "0.5rem" }}>NEEDS ATTENTION</span>
            </div>
            <span className="badge badge-danger">CODE: {revalidationFailure.reasonCode}</span>
          </div>

          <h3 style={{ marginTop: "0.75rem" }}>Selected Contract: {revalidationFailure.orderId}</h3>

          <div style={{ marginTop: "0.75rem", padding: "0.85rem", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
            <strong>Reason for Revalidation Warning:</strong>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem", color: "var(--text-primary)" }}>{revalidationFailure.explanation}</p>
          </div>

          <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {onChooseAnotherContract && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleChooseAnotherClick}
              >
                [ Choose Another Contract ]
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleRefreshClick}
              disabled={isSolving}
            >
              {isSolving ? "Refreshing..." : "[ Refresh Live Market ]"}
            </button>
          </div>
        </section>
      )}

      {analysisModalOrder && (
        <OrderAnalysisModal
          order={analysisModalOrder}
          intent={intent}
          onClose={() => setAnalysisModalOrder(null)}
          onContinueOrder={(o) => handleSelectMatchingOrder(o)}
          onAdjustGoal={(o) => setAdjustModalOrder(o)}
          onEditGoal={onEditGoal}
        />
      )}

      {adjustModalOrder && onEditGoal && (
        <GoalAdjustmentModal
          order={adjustModalOrder}
          intent={intent}
          onClose={() => setAdjustModalOrder(null)}
          onEditGoal={onEditGoal}
          onAcceptContract={onAcceptContract}
        />
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          padding: "0.75rem 1rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          fontSize: "0.825rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <span
            className={`live-dot ${isLive ? "active" : "warning"
              }`}
          >
            ●
          </span>

          <strong>Base Mainnet (Chain ID 8453)</strong>

          <span>•</span>

          <span
            style={{
              color: "var(--text-secondary)",
            }}
          >
            {isLive
              ? `Thetanuts OptionBook${orderCount !== undefined
                ? ` (${orderCount} live orders)`
                : ""
              }`
              : "Live market status unavailable"}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
          }}
        >
          {onEditGoal && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onEditGoal}
            >
              ✏️ Edit Protection Goal
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleRefreshClick}
            disabled={isSolving}
          >
            {isSolving
              ? "Refreshing..."
              : "↻ Refresh Market"}
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onReset}
          >
            Start New Plan
          </button>
        </div>
      </div>

      {marketExplorer && (
        <section className="card">
          <div className="card-header">
            <span className="badge badge-info">READ-ONLY LIVE MARKET</span>
            <h2 style={{ marginTop: "0.75rem" }}>Live Thetanuts OptionBook</h2>
            <p className="card-subtitle">
              {marketExplorer.liveOrderCount} live orders read through the Thetanuts SDK. Closest orders remain ineligible informational alternatives and do not change your confirmed limits.
            </p>
          </div>

          <div className="action-row" role="tablist" aria-label="Live OptionBook views">
            {([
              ["MATCHING", `Matching (${marketExplorer.matchingCount})`],
              ["CLOSEST", `Closest (${marketExplorer.closestCount})`],
              ["MY_CATEGORY", `Eligible in My Category (${marketExplorer.eligibleInMyCategoryCount ?? marketExplorer.eligibleInMyCategory?.length ?? 0})`],
              ["ALL_LIVE", `Live Market (${marketExplorer.liveOrderCount})`],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={marketTab === tab}
                className={marketTab === tab ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                onClick={() => setMarketTab((prev) => (prev === tab ? null : tab))}
              >
                {label}
              </button>
            ))}
          </div>

          {/* BUDGET SORT AND FILTER BAR */}
          {marketTab !== null && (
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginTop: "1rem", padding: "0.5rem 0.75rem", background: "var(--surface-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "0.825rem" }}>
              <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                <strong>Sort by Required Premium:</strong>
                {marketTab === "CLOSEST" && (
                  <button
                    type="button"
                    className={sortOrder === "CLOSEST_MATCH" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                    onClick={() => setSortOrder("CLOSEST_MATCH")}
                    style={{ padding: "0.15rem 0.5rem", fontSize: "0.75rem" }}
                  >
                    Closest Match
                  </button>
                )}
                <button
                  type="button"
                  className={sortOrder === "ASC" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                  onClick={() => setSortOrder("ASC")}
                  style={{ padding: "0.15rem 0.5rem", fontSize: "0.75rem" }}
                >
                  Lowest First (ASC)
                </button>
                <button
                  type="button"
                  className={sortOrder === "DESC" ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                  onClick={() => setSortOrder("DESC")}
                  style={{ padding: "0.15rem 0.5rem", fontSize: "0.75rem" }}
                >
                  Highest First (DESC)
                </button>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", margin: 0 }}>
                <input
                  type="checkbox"
                  checked={withinBudgetOnly}
                  onChange={(e) => setWithinBudgetOnly(e.target.checked)}
                />
                <strong>Within My Budget Only</strong> ({formatExplorerAmount(intent.maxPremiumUSDC.value)})
              </label>
            </div>
          )}

          {marketTab === "MATCHING" && (
            <MarketOrderList
              orders={sortAndFilterOrders(marketExplorer.matching, intent, sortOrder, withinBudgetOnly)}
              emptyMessage="No live OptionBook order currently satisfies every confirmed protection constraint."
              intent={intent}
              onViewAnalysis={(o) => setAnalysisModalOrder(o)}
              onSelectOrder={(o) => handleSelectMatchingOrder(o)}
            />
          )}

          {marketTab === "CLOSEST" && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ marginBottom: "0.5rem" }}>
                <strong style={{ fontSize: "0.95rem" }}>Closest Live Alternatives</strong>
                <p className="card-subtitle" style={{ marginTop: "0.2rem" }}>
                  Displaying up to 3 nearest real live orders in your confirmed category ({marketExplorer.confirmedCategory?.replace("_", " ") ?? "LONG PUT"}). Incompatible orders show why they were rejected.
                </p>
              </div>
              <MarketOrderList
                orders={sortAndFilterOrders(marketExplorer.closest.slice(0, 3), intent, sortOrder, withinBudgetOnly)}
                emptyMessage="No real live orders are currently available for comparison in your confirmed category."
                intent={intent}
                showReasons
                onViewAnalysis={(o) => setAnalysisModalOrder(o)}
                onAdjustGoal={(o) => setAdjustModalOrder(o)}
                onEditGoal={onEditGoal}
              />
            </div>
          )}

          {marketTab === "MY_CATEGORY" && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <strong style={{ fontSize: "0.95rem" }}>Eligible in My Category ({marketExplorer.eligibleInMyCategoryCount ?? marketExplorer.eligibleInMyCategory?.length ?? 0})</strong>
                  <span className="badge badge-info" style={{ marginLeft: "0.5rem" }}>
                    YOUR CONFIRMED CATEGORY: {(marketExplorer.confirmedCategory || "LONG_PUT").replace("_", " ")}
                  </span>
                </div>
              </div>
              <MarketOrderList
                orders={sortAndFilterOrders(rawMyCategoryOrders, intent, sortOrder, withinBudgetOnly)}
                emptyMessage="No proceedable orders in your confirmed category are currently available."
                intent={intent}
                showReasons
                onViewAnalysis={(o) => setAnalysisModalOrder(o)}
                onSelectOrder={(o) => handleSelectMatchingOrder(o)}
                onAdjustGoal={(o) => setAdjustModalOrder(o)}
                onEditGoal={onEditGoal}
              />
            </div>
          )}

          {marketTab === "ALL_LIVE" && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <strong style={{ fontSize: "0.95rem" }}>Sanitized Live Market ({filteredAllLive.length} shown)</strong>
                  <span className="badge badge-info" style={{ marginLeft: "0.5rem" }}>
                    YOUR CONFIRMED CATEGORY: {(marketExplorer.confirmedCategory || "LONG_PUT").replace("_", " ")}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Filter:</span>
                    {(
                      [
                        ["MY_CATEGORY", "Eligible in My Category"],
                        ["LONG_PUT", "Long Put"],
                        ["SHORT_PUT", "Short Put"],
                        ["LONG_CALL", "Long Call"],
                        ["SHORT_CALL", "Short Call"],
                        ["ALL", "All"],
                      ] as const
                    ).map(([filter, label]) => (
                      <button
                        key={filter}
                        type="button"
                        className={categoryFilter === filter ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                        onClick={() => setCategoryFilter(filter)}
                        style={{ padding: "0.15rem 0.45rem", fontSize: "0.75rem" }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setMarketTab(null)}
                  >
                    ✕ Close Live Market
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: "400px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0.5rem" }}>
                <MarketOrderList
                  orders={sortAndFilterOrders(filteredAllLive.slice(0, 100), intent, sortOrder, withinBudgetOnly)}
                  emptyMessage="No orders found matching the selected filter."
                  intent={intent}
                  onViewAnalysis={(o) => setAnalysisModalOrder(o)}
                  onSelectOrder={(o) => handleSelectMatchingOrder(o)}
                  onAdjustGoal={(o) => setAdjustModalOrder(o)}
                  onEditGoal={onEditGoal}
                />
              </div>
              {filteredAllLive.length > 100 && (
                <p className="card-subtitle" style={{ marginTop: "0.75rem" }}>
                  Showing the first 100 sanitized orders of {filteredAllLive.length}; no signatures or raw provider blobs are exposed.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {hasInconsistentOptionBookResult && (
        <section className="card">
          <div className="card-header">
            <span className="badge badge-warning">
              Market Result Incomplete
            </span>

            <h2 style={{ marginTop: "0.75rem" }}>
              Market result could not be displayed
            </h2>

            <p className="card-subtitle">
              HedgeOS received an OptionBook-available result but no eligible
              candidate was returned. Refresh the market before relying on this
              result.
            </p>
          </div>

          <div className="action-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={onRefresh}
              disabled={isSolving}
            >
              {isSolving ? "Refreshing..." : "Refresh Market"}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={onReset}
            >
              Start New Plan
            </button>
          </div>
        </section>
      )}

      {!isRfqRequired && candidates.length > 0 && (
        <>
          <HumanReviewCard
            intent={intent}
            proposal={actionProposal}
            simulation={simulationResult}
            reviewRecord={humanReviewRecord}
            onOpenAudit={() =>
              setSelectedCandidate(candidates[0])
            }
          />

          <AuthorizationBoundaryCard
            attestation={authorizationAttestation}
          />

          <ExecutionBoundaryCard
            commitment={executionCommitment}
            handoff={externalHumanAuthorizationHandoff}
          />

          <div>
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                <span className="badge badge-success">Read-only preview available</span>
                <span className="badge badge-neutral">No transaction submitted</span>
              </div>
              <h2 style={{ fontSize: "1.5rem" }}>Protection option found</h2>
              <p className="card-subtitle">
                This existing Thetanuts option satisfied the evaluated requirements for your confirmed goal.
              </p>
            </div>

            <CandidateCard
              candidate={candidates[0]}
              intent={intent}
              policyDecision={
                policyDecisions[candidates[0].strategyId]
              }
              onInspect={(candidate) =>
                setSelectedCandidate(candidate)
              }
            />

            {candidates.length > 1 && (
              <div style={{ marginTop: "1.5rem" }}>
                <h4
                  style={{
                    marginBottom: "0.75rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Other Feasible Protection Options (
                  {candidates.length - 1})
                </h4>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  {candidates.slice(1).map((candidate) => (
                    <CandidateCard
                      key={candidate.strategyId}
                      candidate={candidate}
                      intent={intent}
                      policyDecision={
                        policyDecisions[
                        candidate.strategyId
                        ]
                      }
                      onInspect={(selected) =>
                        setSelectedCandidate(selected)
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {isRfqRequired && (
        <section className="card rfq-card">
          <div className="card-header">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <span className="badge badge-warning">
                Custom Quote Needed
              </span>

              <span className="badge badge-neutral">
                RFQ Specification
              </span>
            </div>

            <h2>
              No existing option matches all of your limits
            </h2>

            <p className="card-subtitle">
              HedgeOS did not weaken your protection goal. Available OptionBook orders were evaluated against your confirmed limits, and the breakdown below explains why existing options did not match.
            </p>
          </div>

          {rejectedCandidates.length > 0 && (
            <div
              style={{
                marginTop: "1rem",
              }}
            >
              <h3 style={{ marginBottom: "0.75rem" }}>
                Why existing options did not match
              </h3>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.65rem",
                }}
              >
                {failureSummary.map(
                  ([category, count]) => (
                    <div
                      key={category}
                      style={{
                        padding: "0.85rem 1rem",
                        border:
                          "1px solid var(--border)",
                        borderRadius:
                          "var(--radius-sm)",
                        background:
                          "var(--surface-secondary)",
                      }}
                    >
                      <strong>
                        {category === "BUDGET"
                          ? "Protection budget"
                          : category === "PROTECTION"
                            ? "Protection target"
                            : category === "HORIZON"
                              ? "Protection horizon"
                              : category === "LIQUIDITY"
                                ? "Available capacity"
                                : category === "PREVIEW"
                                  ? "Market preview"
                                  : category === "SIZING"
                                    ? "Protection sizing"
                                    : "Other required checks"}
                      </strong>

                      <p
                        style={{
                          margin:
                            "0.3rem 0 0",
                          fontSize:
                            "0.85rem",
                          color:
                            "var(--text-secondary)",
                        }}
                      >
                        {
                          consumerReasonText[
                          category
                          ]
                        }{" "}
                        {count > 1
                          ? `(${count} evaluated orders)`
                          : ""}
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {closestEvaluatedCandidates.length > 0 && (
            <div
              style={{
                marginTop: "1.5rem",
              }}
            >
              <h3 style={{ marginBottom: "0.35rem" }}>
                Closest existing matches
              </h3>

              <p className="card-subtitle">
                These are the evaluated orders with the fewest failed confirmed
                checks. "Closest" does not mean recommended, and HedgeOS does
                not weaken your constraints.
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginTop: "0.75rem",
                }}
              >
                {closestEvaluatedCandidates.map(
                  (candidate) => {
                    const decision =
                      policyDecisions[
                      candidate.strategyId
                      ] || candidate.policyDecision;

                    const failedChecks =
                      decision?.checks?.filter(
                        (check) =>
                          check.status === "FAIL"
                      ) || [];

                    const quote =
                      candidate.quotes[0];

                    return (
                      <div
                        key={
                          candidate.strategyId
                        }
                        style={{
                          padding:
                            "1rem",
                          border:
                            "1px solid var(--border)",
                          borderRadius:
                            "var(--radius-sm)",
                          background:
                            "var(--surface-secondary)",
                        }}
                      >
                        <div
                          style={{
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
                            gap:
                              "0.75rem",
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <strong>
                            {
                              candidate.name
                            }
                          </strong>

                          <span className="badge badge-warning">
                            Not Eligible
                          </span>
                        </div>

                        <div
                          className="plan-metrics-grid"
                          style={{
                            marginTop:
                              "0.75rem",
                          }}
                        >
                          <div className="metric-item">
                            <span className="metric-label">
                              Expiry
                            </span>

                            <span className="metric-value">
                              {quote?.expiryTimestampMs
                                ? new Date(
                                  quote.expiryTimestampMs
                                ).toLocaleDateString()
                                : "Unknown"}
                            </span>
                          </div>

                          <div className="metric-item">
                            <span className="metric-label">
                              Protection Cost
                            </span>

                            <span className="metric-value">
                              {formatCandidateCost(
                                candidate
                              )}
                            </span>
                          </div>

                          <div className="metric-item">
                            <span className="metric-label">
                              Modeled Downside
                            </span>

                            <span className="metric-value">
                              {getCandidateDownside(
                                candidate
                              )}
                            </span>
                          </div>

                          <div className="metric-item">
                            <span className="metric-label">
                              Verified Capacity
                            </span>

                            <span className="metric-value">
                              {candidate.liquiditySufficient ===
                                true
                                ? "Available"
                                : candidate.liquiditySufficient ===
                                  false
                                  ? "Insufficient"
                                  : "Not evaluated"}
                            </span>
                          </div>
                        </div>

                        {failedChecks.length >
                          0 && (
                            <div
                              style={{
                                marginTop:
                                  "0.75rem",
                              }}
                            >
                              {failedChecks.map(
                                (
                                  check,
                                  index
                                ) => (
                                  <div
                                    key={`${check.ruleId}-${index}`}
                                    style={{
                                      fontSize:
                                        "0.82rem",
                                      marginTop:
                                        "0.25rem",
                                    }}
                                  >
                                    ✕{" "}
                                    {check.ruleId ===
                                      "POL-001"
                                      ? "Exceeds your confirmed protection budget."
                                      : check.ruleId ===
                                        "POL-009"
                                        ? "Does not satisfy your confirmed modeled downside target."
                                        : "Does not satisfy another required Financial Constitution rule."}
                                  </div>
                                )
                              )}
                            </div>
                          )}

                        <div
                          className="action-row"
                          style={{
                            marginTop:
                              "0.75rem",
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() =>
                              setSelectedCandidate(
                                candidate
                              )
                            }
                          >
                            Inspect why it failed
                          </button>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}

          <div
            className="rfq-reason-box"
            style={{ marginTop: "1.5rem" }}
          >
            <div className="rfq-reason-title">
              Custom quote specification
            </div>

            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--text-primary)",
                marginTop: "0.25rem",
              }}
            >
              Because no current OptionBook order satisfies all
              confirmed constraints, HedgeOS prepared a custom{" "}
              {rfqStrategyLabel} quote specification without weakening your
              original goal.
            </p>
          </div>

          {rfqSpecification ? (
            <div>
              <div className="plan-metrics-grid">
                <div className="metric-item">
                  <span className="metric-label">
                    Target Asset
                  </span>
                  <span className="metric-value">
                    {rfqSpecification.underlying}
                  </span>
                </div>

                <div className="metric-item">
                  <span className="metric-label">
                    Structure
                  </span>
                  <span className="metric-value">
                    {rfqStrategyLabel}
                  </span>
                </div>

                <div className="metric-item">
                  <span className="metric-label">
                    Target Strike Estimate
                  </span>
                  <span className="metric-value highlight">
                    $
                    {rfqSpecification.targetStrikeEstimateUSD.toFixed(
                      2
                    )}
                  </span>
                </div>

                <div className="metric-item">
                  <span className="metric-label">
                    Protection Horizon
                  </span>
                  <span
                    className="metric-value"
                    style={{
                      fontSize: "1.05rem",
                    }}
                  >
                    {rfqSpecification.expiryFormatted}
                  </span>
                </div>

                <div className="metric-item">
                  <span className="metric-label">
                    Requested Protection Quantity
                  </span>
                  <span className="metric-value">
                    {formatRequestedProtectionQuantity(
                      rfqSpecification.requestedContracts,
                      rfqSpecification.underlying,
                    )}
                  </span>
                </div>

                <div className="metric-item">
                  <span className="metric-label">
                    Premium Pricing
                  </span>

                  <span
                    className="metric-value"
                    style={{
                      fontSize: "0.95rem",
                      color: "var(--warning)",
                    }}
                  >
                    Waiting for market quotation
                  </span>
                </div>
              </div>

              <div className="compliance-checklist">
                <div
                  className={`compliance-item ${rfqSpecification.validationStatus ===
                    "VALID"
                    ? "passed"
                    : ""
                    }`}
                >
                  <span className="compliance-icon">
                    {rfqSpecification.validationStatus ===
                      "VALID"
                      ? "✓"
                      : "○"}
                  </span>

                  <span>
                    Specification:{" "}
                    {
                      rfqSpecification.validationStatus
                    }
                  </span>
                </div>

                <div className="compliance-item">
                  <span className="compliance-icon">
                    ○
                  </span>
                  <span>
                    Budget: NOT_EVALUATED — quote
                    price is not available yet
                  </span>
                </div>

                <div className="compliance-item">
                  <span className="compliance-icon">
                    ○
                  </span>
                  <span>
                    Modeled downside: NOT_EVALUATED —
                    quote price is not available yet
                  </span>
                </div>

                <div className="compliance-item">
                  <span className="compliance-icon">
                    ○
                  </span>
                  <span>
                    Submission: NOT_SUBMITTED
                  </span>
                </div>
              </div>

              <div className="toctou-alert-box">
                <div
                  style={{
                    fontSize: "1.25rem",
                  }}
                >
                  🛡️
                </div>

                <div>
                  <strong>
                    RFQ specification safety boundary
                  </strong>

                  <p
                    style={{
                      marginTop: "0.25rem",
                    }}
                  >
                    HedgeOS has prepared the specification only.
                    No RFQ has been submitted and no financial
                    transaction has been authorized.
                  </p>

                  <div className="human-auth-notice">
                    <strong>Status:</strong>{" "}
                    <code>
                      SPECIFICATION_ONLY_NOT_SUBMITTED
                    </code>{" "}
                    • Execution:{" "}
                    <code>NOT_AUTHORIZED</code>
                  </div>
                </div>
              </div>

              <div
                className="action-row"
                style={{ marginTop: "1.25rem" }}
              >
                {rfqCandidateForDrawer ? (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() =>
                      setSelectedCandidate(rfqCandidateForDrawer)
                    }
                  >
                    Inspect RFQ Specification & Technical Audit
                  </button>
                ) : rfqSpecification.strategyType === "PUT_SPREAD" ? (
                  <p
                    style={{
                      margin: 0,
                      color: "var(--text-secondary)",
                      fontSize: "0.85rem",
                    }}
                  >
                    Detailed spread-leg audit is unavailable until exact
                    leg construction is verified.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p
              style={{
                color: "var(--text-secondary)",
                marginTop: "1rem",
              }}
            >
              A custom RFQ specification could not be completed
              because the required live market reference data was
              unavailable.
            </p>
          )}
        </section>
      )}

      {selectedCandidate && (
        <AdvancedJudgeDrawer
          candidate={selectedCandidate}
          intent={intent}
          policyDecision={
            policyDecisions[
            selectedCandidate.strategyId
            ] || selectedCandidate.policyDecision
          }
          rfqSpecification={rfqSpecification}
          actionProposal={actionProposal}
          simulationResult={simulationResult}
          humanReviewRecord={humanReviewRecord}
          onClose={() =>
            setSelectedCandidate(null)
          }
        />
      )}
    </div>
  );
};
