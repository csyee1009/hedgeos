import React, { useMemo, useState } from "react";
import {
  ActionProposal,
  BoundedAuthorizationAttestation,
  CandidateStrategy,
  ExecutionCommitment,
  ExternalHumanAuthorizationHandoff,
  HumanReviewRecord,
  MarketStateRecord,
  PolicyDecisionRecord,
  RFQReasonCode,
  RFQRequirementStatus,
  RFQSpecification,
  SimulationResult,
  TypedRiskIntent,
} from "../../types";
import { AdvancedJudgeDrawer } from "./AdvancedJudgeDrawer";
import { AuthorizationBoundaryCard } from "./AuthorizationBoundaryCard";
import { CandidateCard } from "./CandidateCard";
import { ExecutionBoundaryCard } from "./ExecutionBoundaryCard";
import { HumanReviewCard } from "./HumanReviewCard";

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
  actionProposal?: ActionProposal;
  simulationResult?: SimulationResult;
  humanReviewRecord?: HumanReviewRecord;
  authorizationAttestation?: BoundedAuthorizationAttestation;
  executionCommitment?: ExecutionCommitment;
  externalHumanAuthorizationHandoff?: ExternalHumanAuthorizationHandoff;
  policyDecisions: Record<string, PolicyDecisionRecord>;
  marketState?: MarketStateRecord;
  isSolving: boolean;
  onReset: () => void;
  onRefresh: () => void;
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

export const CandidateList: React.FC<CandidateListProps> = ({
  intent,
  mode = "OPTIONBOOK_AVAILABLE",
  candidates,
  rejectedCandidates = [],
  rfqRequirement,
  rfqSpecification,
  actionProposal,
  simulationResult,
  humanReviewRecord,
  authorizationAttestation,
  executionCommitment,
  externalHumanAuthorizationHandoff,
  policyDecisions,
  marketState,
  isSolving,
  onReset,
  onRefresh,
}) => {
  const [selectedCandidate, setSelectedCandidate] =
    useState<CandidateStrategy | null>(null);

  const isLive =
    marketState?.status === "LIVE_READ_AVAILABLE";

  const orderCount =
    typeof marketState?.orderCount === "number"
      ? marketState.orderCount
      : undefined;

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
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onRefresh}
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
                    {rfqSpecification.requestedContracts.amountBaseUnits &&
                      (() => {
                        const amount =
                          rfqSpecification
                            .requestedContracts;

                        const base = BigInt(
                          amount.amountBaseUnits
                        );

                        const padded =
                          base
                            .toString()
                            .padStart(
                              amount.decimals +
                              1,
                              "0"
                            );

                        const integer =
                          amount.decimals ===
                            0
                            ? padded
                            : padded.slice(
                              0,
                              -amount.decimals
                            );

                        const fraction =
                          amount.decimals ===
                            0
                            ? ""
                            : padded
                              .slice(
                                -amount.decimals
                              )
                              .slice(
                                0,
                                8
                              )
                              .replace(
                                /0+$/,
                                ""
                              );

                        return `${integer}${fraction
                          ? `.${fraction}`
                          : ""
                          } ${rfqSpecification.underlying
                          }`;
                      })()}
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