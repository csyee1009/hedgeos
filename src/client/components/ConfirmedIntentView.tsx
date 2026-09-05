import React from "react";
import { formatTokenAmount, TypedRiskIntent } from "../../types";

interface ConfirmedIntentViewProps {
  intent: TypedRiskIntent;
  onCheckLiveMarket: () => void;
  onReset: () => void;
  isSolving: boolean;
}

export const ConfirmedIntentView: React.FC<ConfirmedIntentViewProps> = ({
  intent,
  onCheckLiveMarket,
  onReset,
  isSolving,
}) => {
  return (
    <section className="card plan-hero-card">
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <span className="badge badge-success">✓ Goal Confirmed</span>
          <span className="badge badge-neutral">Version #{intent.version}</span>
        </div>
        <h2>Protection goal confirmed</h2>
        <p className="card-subtitle">
          Your parameters are locked and ready for live Thetanuts market discovery.
        </p>
      </div>

      <div className="plan-metrics-grid">
        <div className="metric-item">
          <span className="metric-label">Asset to protect</span>
          <span className="metric-value">{intent.asset.value}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Amount to protect</span>
          <span className="metric-value">{formatTokenAmount(intent.exposureAmount.value)}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Loss target at expiry</span>
          <span className="metric-value highlight">{intent.targetMaxLossPercent.value}%</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Maximum protection cost</span>
          <span className="metric-value">{formatTokenAmount(intent.maxPremiumUSDC.value)}</span>
        </div>
        <div className="metric-item" style={{ gridColumn: "1 / -1" }}>
          <span className="metric-label">Protection period</span>
          <span className="metric-value" style={{ fontSize: "1.05rem" }}>
            {intent.horizonTimestamp.value.formattedDisplay}
          </span>
        </div>
      </div>

      {isSolving ? (
        <div className="solving-progress-card" style={{ marginTop: "1rem" }}>
          <h4>Checking live Thetanuts options...</h4>
          <div className="solving-steps-list">
            <div className="step-row completed">
              <span className="step-icon done">✓</span>
              <span>Reading Base Mainnet OptionBook indexer</span>
            </div>
            <div className="step-row running">
              <span className="step-icon running">●</span>
              <span>Verifying protection sizing...</span>
            </div>
            <div className="step-row pending">
              <span className="step-icon pending">○</span>
              <span>Checking your confirmed limits...</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div className="action-row">
            <button
              id="checkLiveMarketBtn"
              type="button"
              className="btn btn-primary"
              onClick={onCheckLiveMarket}
              disabled={isSolving}
            >
              Check Live Protection Options →
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onReset}
              disabled={isSolving}
            >
              Start New Plan
            </button>
          </div>

          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
            This checks current Thetanuts market availability using read-only data. No transaction will be submitted.
          </p>
        </div>
      )}
    </section>
  );
};
