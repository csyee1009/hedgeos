import React, { useState } from "react";
import { TypedRiskIntent } from "../../types";

interface AdvancedIntentDrawerProps {
  intent: TypedRiskIntent;
}

export const AdvancedIntentDrawer: React.FC<AdvancedIntentDrawerProps> = ({ intent }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="advanced-drawer-container">
      <div className="drawer-trigger">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? "Hide Structured Intent" : "See Structured Intent (Judge/Dev View)"}
        </button>
      </div>

      {isOpen && (
        <div className="drawer-content card">
          <div className="drawer-header">
            <h3>Structured Risk Intent & Provenance Trace</h3>
            <span className="adapter-badge">
              Intent Provider: <strong>Development Adapter</strong>
            </span>
          </div>

          {/* Typed Intent Conversion Visual Trace */}
          <div className="conversion-trace">
            <h4>TYPED INTENT CONVERSION TRACE</h4>
            <div className="trace-steps">
              <div className="trace-step">
                <span className="step-title">1. YOUR WORDS</span>
                <p className="step-content">"{intent.originalPromptText || "Protect my 2 ETH until Friday..."}"</p>
              </div>
              <div className="trace-arrow">↓</div>
              <div className="trace-step">
                <span className="step-title">2. STRUCTURED INTENT</span>
                <p className="step-content">
                  Intent ID: {intent.intentId} (v{intent.version})
                  <br />
                  Max Loss: {intent.targetMaxLossPercent.value}% | Budget: {intent.maxPremiumUSDC.value.amountBaseUnits} base units
                </p>
              </div>
              <div className="trace-arrow">↓</div>
              <div className="trace-step">
                <span className="step-title">3. USER CONFIRMATION</span>
                <p className="step-content">
                  Status: <strong>{intent.confirmedByUser ? "CONFIRMED BY USER" : "UNCONFIRMED"}</strong>
                  {intent.confirmedAtMs && ` at ${new Date(intent.confirmedAtMs).toISOString()}`}
                </p>
              </div>
            </div>
          </div>

          {/* JSON Schema Representation */}
          <div className="json-schema-box">
            <h4>JSON INTENT SCHEMA (TypedRiskIntent)</h4>
            <pre className="json-code">
              {JSON.stringify(intent, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
