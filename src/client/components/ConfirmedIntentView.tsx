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
        <h2>Your protection goal is confirmed</h2>
        <p className="card-subtitle">
          Your parameters are locked and ready for live Thetanuts market discovery.
        </p>
      </div>

      <div className="plan-metrics-grid">
        <div className="metric-item">
          <span className="metric-label">Target Asset</span>
          <span className="metric-value">{intent.asset.value}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Exposure Quantity</span>
          <span className="metric-value">{formatTokenAmount(intent.exposureAmount.value)}</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Max Acceptable Downside</span>
          <span className="metric-value highlight">{intent.targetMaxLossPercent.value}%</span>
        </div>
        <div className="metric-item">
          <span className="metric-label">Max Protection Budget</span>
          <span className="metric-value">{formatTokenAmount(intent.maxPremiumUSDC.value)}</span>
        </div>
        <div className="metric-item" style={{ gridColumn: "1 / -1" }}>
          <span className="metric-label">Protection Horizon</span>
          <span className="metric-value" style={{ fontSize: "1.05rem" }}>
            {intent.horizonTimestamp.value.formattedDisplay}
          </span>
        </div>
      </div>

      {isSolving ? (
        <div className="solving-progress-card" style={{ marginTop: "1rem" }}>
          <h4>Discovering & verifying Thetanuts protection options...</h4>
          <div className="solving-steps-list">
            <div className="step-row completed">
              <span className="step-icon done">✓</span>
              <span>Reading Base Mainnet OptionBook indexer</span>
            </div>
            <div className="step-row completed">
              <span className="step-icon done">✓</span>
              <span>Matching {intent.asset.value} protective put options</span>
            </div>
            <div className="step-row">
              <span className="step-icon running">●</span>
              <span>Checking verified 1:1 option sizing and maker collateral liquidity...</span>
            </div>
            <div className="step-row">
              <span className="step-icon pending">○</span>
              <span>Executing read-only premium and fee preview...</span>
            </div>
            <div className="step-row">
              <span className="step-icon pending">○</span>
              <span>Auditing Financial Constitution invariants...</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="action-row" style={{ marginTop: "1.25rem" }}>
          <button
            id="checkLiveMarketBtn"
            type="button"
            className="btn btn-primary"
            onClick={onCheckLiveMarket}
            disabled={isSolving}
          >
            Check live Thetanuts market options →
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onReset}
            disabled={isSolving}
          >
            Edit Goal
          </button>
        </div>
      )}
    </section>
  );
};
