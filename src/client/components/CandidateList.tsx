import React, { useState } from "react";
import {
  ActionProposal,
  CandidateStrategy,
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
import { CandidateCard } from "./CandidateCard";
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
  policyDecisions: Record<string, PolicyDecisionRecord>;
  marketState?: MarketStateRecord;
  isSolving: boolean;
  onReset: () => void;
  onRefresh: () => void;
}

export const CandidateList: React.FC<CandidateListProps> = ({
  intent,
  mode = "OPTIONBOOK_AVAILABLE",
  candidates,
  rfqRequirement,
  rfqSpecification,
  actionProposal,
  simulationResult,
  humanReviewRecord,
  policyDecisions,
  marketState,
  isSolving,
  onReset,
  onRefresh,
}) => {
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateStrategy | null>(null);

  const orderCount = marketState?.orderCount || 368;
  const isLive = marketState?.status === "LIVE_READ_AVAILABLE";
  const isRfqRequired = mode === "RFQ_REQUIRED" || candidates.length === 0;

  // Synthesize candidate for the RFQ spec for the inspect drawer
  const rfqCandidateForDrawer: CandidateStrategy | null = rfqSpecification
    ? {
        strategyId: `strat-${rfqSpecification.rfqSpecId}`,
        name: `Custom Protection Quote (Long Put RFQ)`,
        strategyType: "LONG_PUT",
        legs: [
          {
            side: "BUY",
            right: "PUT",
            strikePrice: rfqSpecification.strikes[0],
            expiryTimestampMs: rfqSpecification.expiryTimestampMs,
            requestedExposure: intent.exposureAmount.value,
            resolvedOptionQuantity: rfqSpecification.requestedContracts,
            sizingStatus: "RESOLVED",
            quoteReference: "rfq-leg-1",
          },
        ],
        quotes: [],
        status: "RFQ_SPECIFICATION_READY",
        rejectionReasons: [],
        scoresStatus: "NOT_AVAILABLE",
        sizingStatus: "RESOLVED",
        underlyingResolutionMethod: "RFQ_SPECIFICATION_DERIVATION",
      }
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Market Connection Status Header */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className={`live-dot ${isLive ? "active" : "warning"}`}>●</span>
          <strong>Base Mainnet (Chain ID 8453)</strong>
          <span>•</span>
          <span style={{ color: "var(--text-secondary)" }}>
            Thetanuts OptionBook ({orderCount} live orders) & OptionFactory
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={isSolving}>
            {isSolving ? "Refreshing..." : "↻ Refresh Market"}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onReset}>
            Start New Plan
          </button>
        </div>
      </div>

      {/* OptionBook Available Path */}
      {!isRfqRequired && candidates.length > 0 && (
        <>
          {/* Pre-Execution Review Card */}
          <HumanReviewCard
            intent={intent}
            proposal={actionProposal}
            simulation={simulationResult}
            reviewRecord={humanReviewRecord}
            onOpenAudit={() => setSelectedCandidate(candidates[0])}
          />

          {/* Primary OptionBook Protection Solution */}
          <div>
            <h3 style={{ marginBottom: "0.5rem" }}>Matched Thetanuts Protection Plan</h3>
            <p className="card-subtitle">
              Ranked using deterministic Financial Constitution invariants and at-expiry downside fit.
            </p>

            <CandidateCard
              candidate={candidates[0]}
              intent={intent}
              policyDecision={policyDecisions[candidates[0].strategyId]}
              onInspect={(cand) => setSelectedCandidate(cand)}
            />

            {candidates.length > 1 && (
              <div style={{ marginTop: "1.5rem" }}>
                <h4 style={{ marginBottom: "0.75rem", color: "var(--text-secondary)" }}>
                  Other Feasible Protection Options ({candidates.length - 1})
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {candidates.slice(1).map((cand) => (
                    <CandidateCard
                      key={cand.strategyId}
                      candidate={cand}
                      intent={intent}
                      policyDecision={policyDecisions[cand.strategyId]}
                      onInspect={(c) => setSelectedCandidate(c)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* RFQ Fallback Path */}
      {isRfqRequired && (
        <section className="card rfq-card">
          <div className="card-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <span className="badge badge-warning">Custom Quote Required</span>
              <span className="badge badge-neutral">OptionFactory Specification</span>
            </div>
            <h2>No existing OptionBook order fully matches your protection goal</h2>
            <p className="card-subtitle">
              Existing maker liquidity cannot fulfill your exact target parameters. HedgeOS prepared a custom RFQ specification.
            </p>
          </div>

          <div className="rfq-reason-box">
            <div className="rfq-reason-title">
              Why a custom quote is required:
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginTop: "0.25rem" }}>
              {rfqRequirement?.explanation || "Available OptionBook liquidity is insufficient for your requested exposure and horizon constraints."}
            </p>
          </div>

          {rfqSpecification ? (
            <div>
              <div className="plan-metrics-grid">
                <div className="metric-item">
                  <span className="metric-label">Target Asset</span>
                  <span className="metric-value">{rfqSpecification.underlying}</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Structure</span>
                  <span className="metric-value">Long Put</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Target Strike Price</span>
                  <span className="metric-value highlight">
                    ${rfqSpecification.targetStrikeEstimateUSD.toFixed(2)}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Protection Horizon</span>
                  <span className="metric-value" style={{ fontSize: "1.05rem" }}>
                    {rfqSpecification.expiryFormatted}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Requested Contracts</span>
                  <span className="metric-value">
                    {Number(BigInt(rfqSpecification.requestedContracts.amountBaseUnits)) / 10 ** rfqSpecification.requestedContracts.decimals} {rfqSpecification.underlying}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Premium Pricing</span>
                  <span className="metric-value" style={{ fontSize: "0.95rem", color: "var(--warning)" }}>
                    Waiting for MM Quotation
                  </span>
                </div>
              </div>

              <div className="compliance-checklist">
                <div className="compliance-item passed">
                  <span className="compliance-icon">✓</span>
                  <span>Specification Status: Valid</span>
                </div>
                <div className="compliance-item passed">
                  <span className="compliance-icon">✓</span>
                  <span>Budget: Pending Quotation</span>
                </div>
                <div className="compliance-item passed">
                  <span className="compliance-icon">✓</span>
                  <span>Downside: Pending Quotation</span>
                </div>
                <div className="compliance-item passed">
                  <span className="compliance-icon">✓</span>
                  <span>Submission Status: Not Broadcast</span>
                </div>
              </div>

              <div className="toctou-alert-box">
                <div style={{ fontSize: "1.25rem" }}>🛡️</div>
                <div>
                  <strong>RFQ Specification Safety Boundary</strong>
                  <p style={{ marginTop: "0.25rem" }}>
                    The custom RFQ specification is prepared for Thetanuts OptionFactory. RFQ submission is out-of-scope for read-only preview mode and requires separate human authority.
                  </p>
                  <div className="human-auth-notice">
                    <strong>Status:</strong> <code>SPECIFICATION_ONLY_NOT_SUBMITTED</code> • Execution Status: <code>NOT_AUTHORIZED</code>
                  </div>
                </div>
              </div>

              <div className="action-row" style={{ marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => rfqCandidateForDrawer && setSelectedCandidate(rfqCandidateForDrawer)}
                >
                  🔍 Inspect RFQ Specification & Technical Audit
                </button>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>
              RFQ specification generation requires live market reference spot price.
            </p>
          )}
        </section>
      )}

      {/* Advanced Judge Drawer Modal */}
      {selectedCandidate && (
        <AdvancedJudgeDrawer
          candidate={selectedCandidate}
          intent={intent}
          policyDecision={policyDecisions[selectedCandidate.strategyId]}
          rfqSpecification={rfqSpecification}
          actionProposal={actionProposal}
          simulationResult={simulationResult}
          humanReviewRecord={humanReviewRecord}
          onClose={() => setSelectedCandidate(null)}
        />
      )}
    </div>
  );
};
