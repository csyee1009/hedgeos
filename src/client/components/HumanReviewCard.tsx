import React from "react";
import { ActionProposal, HumanReviewRecord, SimulationResult, TypedRiskIntent } from "../../types";

interface HumanReviewCardProps {
  intent: TypedRiskIntent;
  proposal?: ActionProposal;
  simulation?: SimulationResult;
  reviewRecord?: HumanReviewRecord;
  onOpenAudit: () => void;
}

export const HumanReviewCard: React.FC<HumanReviewCardProps> = ({
  intent,
  proposal,
  simulation,
  reviewRecord,
  onOpenAudit,
}) => {
  const summary = reviewRecord?.summary;
  const isSimPassed =
    simulation?.status === "PROVIDER_SIMULATED" ||
    simulation?.status === "DETERMINISTIC_VERIFIED" ||
    simulation?.status === "PREVIEW_ONLY";

  return (
    <section className="card human-review-card">
      <div className="card-header">
        <div className="review-status-pill-row">
          <span className={`badge ${isSimPassed ? "badge-success" : "badge-warning"}`}>
            {isSimPassed ? "Ready for human review" : "Review Pending"}
          </span>
          <span className="badge badge-danger">Execution: Not Authorized</span>
        </div>
        <h2>Pre-Execution Protection Plan Review</h2>
        <p className="card-subtitle">
          Your proposed protection plan has been verified against current market evidence. Review the parameters below.
        </p>
      </div>

      <div className="plan-metrics-grid">
        <div className="metric-item">
          <span className="metric-label">Protecting Asset</span>
          <span className="metric-value">{summary?.protectingAsset || intent.asset.value}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Exposure Quantity</span>
          <span className="metric-value">
            {summary?.exposureQuantity || `${Number(BigInt(intent.exposureAmount.value.amountBaseUnits)) / 1e18} ETH`}
          </span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Protection Horizon</span>
          <span className="metric-value" style={{ fontSize: "1rem" }}>
            {summary?.untilDate || intent.horizonTimestamp.value.formattedDisplay}
          </span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Option Structure</span>
          <span className="metric-value">{summary?.structure || "Long Put"}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Strike Price Floor</span>
          <span className="metric-value">{summary?.strikePriceUSD || "N/A"}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Estimated Total Cost</span>
          <span className="metric-value highlight">{summary?.estimatedCostUSDC || "N/A"}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Modeled At-Expiry Downside</span>
          <span className="metric-value highlight">{summary?.modeledDownsidePercent || `${intent.targetMaxLossPercent.value}%`}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Protocol Preview Binding</span>
          <span className="metric-value" style={{ fontSize: "1rem", color: "var(--accent)" }}>
            PREVIEW_BOUND
          </span>
        </div>
      </div>

      {/* TOCTOU Alert & Security Boundary */}
      <div className="toctou-alert-box">
        <div style={{ fontSize: "1.25rem" }}>🛡️</div>
        <div>
          <strong>Pre-Execution Safety Boundary & TOCTOU Disclosure</strong>
          <p style={{ marginTop: "0.25rem" }}>
            {reviewRecord?.toctouDisclosure ||
              "Time-of-check / time-of-use (TOCTOU) limitation: simulation proves this proposal was valid at simulation time and does not eliminate market movement risk prior to separate authorized execution."}
          </p>
          <div className="human-auth-notice">
            <strong>Execution Status:</strong> <code>NOT_AUTHORIZED</code> • Any real financial execution requires a separate, out-of-band authorized human transaction. No transaction has been submitted.
          </div>
        </div>
      </div>

      <div className="action-row" style={{ marginTop: "1rem" }}>
        <button id="inspectAuditBtn" type="button" className="btn btn-outline" onClick={onOpenAudit}>
          🔍 Inspect Technical Proof & Financial Constitution
        </button>
      </div>
    </section>
  );
};
