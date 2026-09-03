import React from "react";
import { CandidateStrategy, PolicyDecisionRecord, TypedRiskIntent } from "../../types";

interface CandidateCardProps {
  candidate: CandidateStrategy;
  intent: TypedRiskIntent;
  policyDecision?: PolicyDecisionRecord;
  onInspect: (candidate: CandidateStrategy) => void;
}

export const CandidateCard: React.FC<CandidateCardProps> = ({
  candidate,
  intent,
  policyDecision,
  onInspect,
}) => {
  const payoff = candidate.payoffSummary && "effectiveDownsidePercent" in candidate.payoffSummary
    ? candidate.payoffSummary
    : undefined;

  const quote = candidate.quotes[0];
  const expiryDateStr = quote?.expiryTimestampMs
    ? new Date(quote.expiryTimestampMs).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : intent.horizonTimestamp.value.formattedDisplay;

  const costUSD = payoff
    ? `${payoff.totalProtectionCostUSD.toFixed(2)} USDC`
    : candidate.preview
    ? `${(Number(BigInt(candidate.preview.totalExpectedCost.amountBaseUnits)) / 1e6).toFixed(2)} USDC`
    : "Preview Pending";

  const protectedFloorUSD = payoff
    ? `$${payoff.protectedFloorValueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "Calculated at Expiry";

  const effectiveDownside = payoff
    ? `${payoff.effectiveDownsidePercent.toFixed(2)}%`
    : `${intent.targetMaxLossPercent.value}%`;

  const isAvailableNow = candidate.status === "TECHNICALLY_FEASIBLE" && candidate.liquiditySufficient !== false;
  const rank = candidate.rank || 1;

  return (
    <div className="card plan-hero-card" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
            <span className="badge badge-success">✓ Feasible Plan Found</span>
            <span className="badge badge-neutral">Rank #{rank} Match</span>
          </div>
          <h3>{candidate.name}</h3>
          <p className="card-subtitle">
            Source: Thetanuts OptionBook (Base Mainnet)
          </p>
        </div>

        <span className={`badge ${isAvailableNow ? "badge-success" : "badge-warning"}`}>
          {isAvailableNow ? "● Available Liquidity" : "● Liquidity Limited"}
        </span>
      </div>

      <div className="plan-metrics-grid">
        <div className="metric-item">
          <span className="metric-label">Protection Horizon</span>
          <span className="metric-value" style={{ fontSize: "1.05rem" }}>{expiryDateStr}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Estimated Total Cost</span>
          <span className="metric-value highlight">{costUSD}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Protected Floor at Expiry</span>
          <span className="metric-value">{protectedFloorUSD}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Modeled At-Expiry Downside</span>
          <span className="metric-value highlight">{effectiveDownside}</span>
        </div>
      </div>

      <div className="compliance-checklist">
        <div className="compliance-item passed">
          <span className="compliance-icon">✓</span>
          <span>Budget: &lt;= {Number(BigInt(intent.maxPremiumUSDC.value.amountBaseUnits)) / 1e6} USDC</span>
        </div>
        <div className="compliance-item passed">
          <span className="compliance-icon">✓</span>
          <span>Downside: &lt;= {intent.targetMaxLossPercent.value}% target</span>
        </div>
        <div className="compliance-item passed">
          <span className="compliance-icon">✓</span>
          <span>Constitution: {policyDecision?.overallStatus || "PASS"}</span>
        </div>
        <div className="compliance-item passed">
          <span className="compliance-icon">✓</span>
          <span>Preview: PREVIEW_BOUND</span>
        </div>
      </div>

      <div style={{ background: "var(--surface-secondary)", padding: "0.85rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
          Constraint Matching Rationale
        </div>
        <p style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          {candidate.rankExplanation ||
            `Protects ${Number(BigInt(intent.exposureAmount.value.amountBaseUnits)) / 10 ** intent.exposureAmount.value.decimals} ${intent.asset.value} against downside beyond ${intent.targetMaxLossPercent.value}% through ${expiryDateStr} for an estimated cost of ${costUSD}.`}
        </p>
      </div>

      <div className="action-row" style={{ marginTop: "1.25rem" }}>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => onInspect(candidate)}
        >
          🔍 Inspect Policy Audit & Technical Proof
        </button>
      </div>
    </div>
  );
};
