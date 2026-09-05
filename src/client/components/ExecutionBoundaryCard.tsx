import React from "react";
import {
  ExecutionCommitment,
  ExternalHumanAuthorizationHandoff,
  formatTokenAmount,
} from "../../types";

interface ExecutionBoundaryCardProps {
  commitment?: ExecutionCommitment;
  handoff?: ExternalHumanAuthorizationHandoff;
}

const shortHash = (value: string): string =>
  value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;

export const ExecutionBoundaryCard: React.FC<ExecutionBoundaryCardProps> = ({
  commitment,
  handoff,
}) => {
  if (!commitment || !handoff) {
    return null;
  }

  const commitmentLabel =
    commitment.status === "EXTERNAL_PAYLOAD_BOUND"
      ? "External executor payload bound"
      : commitment.status === "PROPOSAL_BOUND"
        ? "Proposal bound"
        : commitment.status === "EXPIRED"
          ? "Expired"
          : "Blocked";

  const actionLabel =
    commitment.actionType === "OPTIONBOOK_FILL_ORDER"
      ? "Existing OptionBook protection fill"
      : "Custom RFQ specification";

  const expiryDisplay = new Date(handoff.expiresAtMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <section className="card" style={{ marginTop: "1rem" }}>
      <div className="card-header">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ marginBottom: "0.35rem" }}>Execution boundary</h3>
            <p className="card-subtitle">
              HedgeOS has committed the verified protection proposal. Any real
              financial authorization and execution remain outside HedgeOS.
            </p>
          </div>

          <span className="badge badge-neutral">{commitmentLabel}</span>
        </div>
      </div>

      <div className="plan-metrics-grid" style={{ marginTop: "1rem" }}>
        <div className="metric-item">
          <span className="metric-label">Commitment</span>
          <span className="metric-value">{commitmentLabel}</span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Network</span>
          <span className="metric-value">Base Mainnet</span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Protocol</span>
          <span className="metric-value">Thetanuts</span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Maximum spend</span>
          <span className="metric-value">
            {formatTokenAmount(handoff.maximumSpendUSDC)}
          </span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Action</span>
          <span className="metric-value">{actionLabel}</span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Authorization</span>
          <span className="metric-value">Awaiting external human review</span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Expiry</span>
          <span className="metric-value">{expiryDisplay}</span>
        </div>
      </div>

      <div
        className="compliance-checklist"
        style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}
      >
        <div className="compliance-item passed">
          <span className="compliance-icon">✓</span>
          <span>No wallet connected</span>
        </div>
        <div className="compliance-item passed">
          <span className="compliance-icon">✓</span>
          <span>No signature created</span>
        </div>
        <div className="compliance-item passed">
          <span className="compliance-icon">✓</span>
          <span>No transaction submitted</span>
        </div>
      </div>

      <details style={{ marginTop: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          Advanced binding details
        </summary>

        <div
          style={{
            marginTop: "0.75rem",
            fontSize: "0.82rem",
            color: "var(--text-secondary)",
            display: "grid",
            gap: "0.35rem",
          }}
        >
          <div>
            Commitment ID: <code>{shortHash(commitment.commitmentId)}</code>
          </div>
          <div>
            Commitment digest: <code>{shortHash(commitment.commitmentDigest)}</code>
          </div>
          <div>
            Handoff request ID: <code>{shortHash(handoff.requestId)}</code>
          </div>
          {commitment.externalExecutorPayloadDigest && (
            <div>
              External payload digest:{" "}
              <code>{shortHash(commitment.externalExecutorPayloadDigest)}</code>
            </div>
          )}
        </div>
      </details>
    </section>
  );
};
