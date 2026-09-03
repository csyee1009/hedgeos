import React, { useState } from "react";
import { formatTokenAmount, StoredIntent } from "../../types";

interface IntentReviewProps {
  intent: StoredIntent;
  missingFields: string[];
  ambiguities: string[];
  onUpdateIntent: (updates: {
    asset?: string;
    exposureAmount?: { amount: string };
    targetMaxLossPercent?: number;
    maxPremiumUSDC?: { amount: string };
    horizonTimestampMs?: number;
    allowMultiLeg?: boolean;
  }) => Promise<void>;
  onConfirmIntent: () => Promise<void>;
  isSubmitting: boolean;
  errorMessage?: string;
}

export const IntentReview: React.FC<IntentReviewProps> = ({
  intent,
  missingFields,
  ambiguities,
  onUpdateIntent,
  onConfirmIntent,
  isSubmitting,
  errorMessage,
}) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const handleStartEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleSaveEdit = async (field: string) => {
    try {
      if (field === "asset") {
        await onUpdateIntent({ asset: editValue });
      } else if (field === "exposureAmount") {
        await onUpdateIntent({ exposureAmount: { amount: editValue } });
      } else if (field === "targetMaxLossPercent") {
        await onUpdateIntent({ targetMaxLossPercent: parseFloat(editValue) });
      } else if (field === "maxPremiumUSDC") {
        await onUpdateIntent({ maxPremiumUSDC: { amount: editValue } });
      }
      setEditingField(null);
    } catch (err) {
      console.error("Edit failed", err);
    }
  };

  const handleToggleMultiLeg = async (val: boolean) => {
    await onUpdateIntent({ allowMultiLeg: val });
  };

  const isMissingAsset = missingFields.includes("asset");
  const isMissingExposure = missingFields.includes("exposureAmount");
  const isMissingBudget = missingFields.includes("maxPremiumUSDC");
  const isMissingLoss = missingFields.includes("targetMaxLossPercent");

  return (
    <section className="card plan-hero-card">
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <span className="badge badge-info">Step 2: Review Goal</span>
          <span className="badge badge-neutral">Pre-Confirmation Gate</span>
        </div>
        <h2>Review your protection goal</h2>
        <p className="card-subtitle">
          Verify the structured protection constraints extracted from your request. You can edit any parameter before confirming.
        </p>
      </div>

      {errorMessage && (
        <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>
          <strong>Validation Error:</strong> {errorMessage}
        </div>
      )}

      {/* Missing Fields Banner */}
      {missingFields.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: "1.25rem", flexDirection: "column", alignItems: "flex-start" }}>
          <strong>Information Required Before Market Check:</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", marginTop: "0.75rem" }}>
            {isMissingAsset && (
              <div>
                <label style={{ fontSize: "0.8rem", display: "block", marginBottom: "0.25rem" }}>
                  Which asset do you want to protect (e.g. ETH, BTC)?
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="e.g. ETH"
                    style={{ maxWidth: "200px" }}
                    onChange={(e) => setEditValue(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onUpdateIntent({ asset: editValue })}
                  >
                    Set Asset
                  </button>
                </div>
              </div>
            )}

            {isMissingExposure && (
              <div>
                <label style={{ fontSize: "0.8rem", display: "block", marginBottom: "0.25rem" }}>
                  How much exposure quantity do you want protected?
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="e.g. 2.0"
                    style={{ maxWidth: "200px" }}
                    onChange={(e) => setEditValue(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onUpdateIntent({ exposureAmount: { amount: editValue } })}
                  >
                    Set Quantity
                  </button>
                </div>
              </div>
            )}

            {isMissingLoss && (
              <div>
                <label style={{ fontSize: "0.8rem", display: "block", marginBottom: "0.25rem" }}>
                  What is your maximum acceptable downside loss (%)?
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="number"
                    className="field-input"
                    placeholder="e.g. 8"
                    style={{ maxWidth: "200px" }}
                    onChange={(e) => setEditValue(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onUpdateIntent({ targetMaxLossPercent: parseFloat(editValue) })}
                  >
                    Set Downside
                  </button>
                </div>
              </div>
            )}

            {isMissingBudget && (
              <div>
                <label style={{ fontSize: "0.8rem", display: "block", marginBottom: "0.25rem" }}>
                  What is your maximum protection budget in USDC?
                </label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    className="field-input"
                    placeholder="e.g. 15.0"
                    style={{ maxWidth: "200px" }}
                    onChange={(e) => setEditValue(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onUpdateIntent({ maxPremiumUSDC: { amount: editValue } })}
                  >
                    Set Budget
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ambiguity Notifications */}
      {ambiguities.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          {ambiguities.map((a, i) => (
            <div key={i} style={{ fontSize: "0.825rem", color: "var(--warning)", marginBottom: "0.25rem" }}>
              ℹ️ {a}
            </div>
          ))}
        </div>
      )}

      {/* Structured Parameters Review Grid */}
      <div className="review-grid">
        {/* Asset */}
        <div className="review-field-card">
          <span className="field-title">Protecting Asset</span>
          {editingField === "asset" ? (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
              <input
                type="text"
                className="field-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSaveEdit("asset")}>Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingField(null)}>✕</button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="field-value">{intent.asset ? intent.asset.value : "UNRESOLVED"}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleStartEdit("asset", intent.asset ? intent.asset.value : "")}
              >
                Edit
              </button>
            </div>
          )}
          <span className="field-helper">
            {intent.asset?.source === "USER_EXPLICIT" ? "Direct from request" : "Please verify"}
          </span>
        </div>

        {/* Exposure Amount */}
        <div className="review-field-card">
          <span className="field-title">Exposure Quantity</span>
          {editingField === "exposureAmount" ? (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
              <input
                type="text"
                className="field-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSaveEdit("exposureAmount")}>Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingField(null)}>✕</button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="field-value">
                {intent.exposureAmount ? formatTokenAmount(intent.exposureAmount.value) : "UNRESOLVED"}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  handleStartEdit(
                    "exposureAmount",
                    intent.exposureAmount
                      ? (
                          Number(BigInt(intent.exposureAmount.value.amountBaseUnits)) /
                          10 ** intent.exposureAmount.value.decimals
                        ).toString()
                      : ""
                  )
                }
              >
                Edit
              </button>
            </div>
          )}
          <span className="field-helper">
            {intent.exposureAmount?.source === "USER_EXPLICIT" ? "Direct from request" : "Please verify"}
          </span>
        </div>

        {/* Max Downside Target */}
        <div className="review-field-card">
          <span className="field-title">Max Acceptable Downside</span>
          {editingField === "targetMaxLossPercent" ? (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
              <input
                type="number"
                className="field-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSaveEdit("targetMaxLossPercent")}>Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingField(null)}>✕</button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="field-value highlight">
                {intent.targetMaxLossPercent ? `${intent.targetMaxLossPercent.value}%` : "UNRESOLVED"}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  handleStartEdit(
                    "targetMaxLossPercent",
                    intent.targetMaxLossPercent ? intent.targetMaxLossPercent.value.toString() : ""
                  )
                }
              >
                Edit
              </button>
            </div>
          )}
          <span className="field-helper">Target floor limit</span>
        </div>

        {/* Max Budget */}
        <div className="review-field-card">
          <span className="field-title">Protection Budget</span>
          {editingField === "maxPremiumUSDC" ? (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
              <input
                type="text"
                className="field-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSaveEdit("maxPremiumUSDC")}>Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingField(null)}>✕</button>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="field-value">
                {intent.maxPremiumUSDC ? formatTokenAmount(intent.maxPremiumUSDC.value) : "UNRESOLVED"}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  handleStartEdit(
                    "maxPremiumUSDC",
                    intent.maxPremiumUSDC
                      ? (
                          Number(BigInt(intent.maxPremiumUSDC.value.amountBaseUnits)) /
                          10 ** intent.maxPremiumUSDC.value.decimals
                        ).toString()
                      : ""
                  )
                }
              >
                Edit
              </button>
            </div>
          )}
          <span className="field-helper">Cost ceiling</span>
        </div>

        {/* Protection Period */}
        <div className="review-field-card" style={{ gridColumn: "1 / -1" }}>
          <span className="field-title">Protection Horizon</span>
          <span className="field-value" style={{ fontSize: "1.05rem" }}>
            {intent.horizonTimestamp ? intent.horizonTimestamp.value.formattedDisplay : "UNRESOLVED"}
          </span>
          <span className="field-helper">
            {intent.horizonTimestamp?.value.timezone}
          </span>
        </div>
      </div>

      {/* Confirmation Action Box */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <button
          id="confirmGoalBtn"
          type="button"
          className="btn btn-primary"
          style={{ width: "fit-content" }}
          onClick={onConfirmIntent}
          disabled={isSubmitting || missingFields.length > 0}
        >
          {isSubmitting ? "Confirming..." : "Confirm Protection Goal →"}
        </button>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Explicit confirmation locks your intent constraints. HedgeOS never lets the natural language parser silently alter confirmed limits.
        </p>
      </div>
    </section>
  );
};
