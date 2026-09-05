import React from "react";
import {
  CandidateStrategy,
  PolicyDecisionRecord,
  TypedRiskIntent,
} from "../../types";

interface CandidateCardProps {
  candidate: CandidateStrategy;
  intent: TypedRiskIntent;
  policyDecision?: PolicyDecisionRecord;
  onInspect: (candidate: CandidateStrategy) => void;
}

const formatBaseUnits = (
  amountBaseUnits: string,
  decimals: number,
  maxFractionDigits = 6
): string => {
  const value = BigInt(amountBaseUnits);
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  if (decimals === 0) {
    return `${negative ? "-" : ""}${absolute.toString()}`;
  }

  const padded = absolute.toString().padStart(decimals + 1, "0");
  const integerPart = padded.slice(0, -decimals);
  const rawFraction = padded.slice(-decimals);

  const fraction = rawFraction
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${integerPart}${fraction ? `.${fraction}` : ""
    }`;
};

const statusIcon = (status?: string): string => {
  if (status === "PASS") {
    return "✓";
  }

  if (status === "FAIL") {
    return "✕";
  }

  return "○";
};

const statusLabel = (status?: string): string => {
  if (status === "PASS") {
    return "PASS";
  }

  if (status === "FAIL") {
    return "FAIL";
  }

  if (status === "PREVIEW_AVAILABLE") {
    return "Read-only preview available";
  }

  if (status === "ZERO_VERIFIED") {
    return "Verified zero fee";
  }

  if (status === "NOT_EVALUATED") {
    return "Not evaluated";
  }

  return status || "Not evaluated";
};

export const CandidateCard: React.FC<CandidateCardProps> = ({
  candidate,
  intent,
  policyDecision,
  onInspect,
}) => {
  const effectivePolicyDecision =
    policyDecision || candidate.policyDecision;

  const payoff =
    candidate.payoffSummary &&
      typeof candidate.payoffSummary === "object" &&
      "effectiveDownsidePercent" in candidate.payoffSummary
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

  const costUSDC = payoff
    ? `${payoff.totalProtectionCostUSD.toFixed(2)} USDC`
    : candidate.preview
      ? `${formatBaseUnits(
        candidate.preview.totalExpectedCost.amountBaseUnits,
        candidate.preview.totalExpectedCost.decimals,
        6
      )} USDC`
      : "Not evaluated";

  const protectedFloorUSD = payoff
    ? `$${payoff.protectedFloorValueUSD.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
    : "Not evaluated";

  const effectiveDownside = payoff
    ? `${payoff.effectiveDownsidePercent.toFixed(2)}%`
    : "Not evaluated";

  const isFeasible =
    candidate.status === "TECHNICALLY_FEASIBLE" &&
    candidate.liquiditySufficient !== false;

  const budgetCheck = effectivePolicyDecision?.checks?.find(
    (check) => check.ruleId === "POL-001"
  );

  const downsideCheck = effectivePolicyDecision?.checks?.find(
    (check) => check.ruleId === "POL-009"
  );

  const policyStatus =
    effectivePolicyDecision?.overallStatus || "NOT_EVALUATED";

  const previewStatus =
    candidate.preview?.previewStatus || "NOT_EVALUATED";

  const exposureDisplay = formatBaseUnits(
    intent.exposureAmount.value.amountBaseUnits,
    intent.exposureAmount.value.decimals,
    8
  );

  const budgetDisplay = formatBaseUnits(
    intent.maxPremiumUSDC.value.amountBaseUnits,
    intent.maxPremiumUSDC.value.decimals,
    6
  );

  return (
    <div
      className="card plan-hero-card"
      style={{ marginTop: "1rem" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.35rem",
              flexWrap: "wrap",
            }}
          >
            <span
              className={`badge ${isFeasible ? "badge-success" : "badge-warning"
                }`}
            >
              {isFeasible
                ? "✓ Feasible Plan Found"
                : "Not Fully Eligible"}
            </span>

            {candidate.rank !== undefined && (
              <span className="badge badge-neutral">
                Rank #{candidate.rank}
              </span>
            )}
          </div>

          <h3>{candidate.name}</h3>

          <p className="card-subtitle">
            Source: Thetanuts OptionBook on Base Mainnet
          </p>
        </div>

        <span
          className={`badge ${candidate.liquiditySufficient === true
              ? "badge-success"
              : "badge-warning"
            }`}
        >
          {candidate.liquiditySufficient === true
            ? "● Verified Capacity Available"
            : candidate.liquiditySufficient === false
              ? "● Capacity Insufficient"
              : "○ Capacity Not Evaluated"}
        </span>
      </div>

      <div className="plan-metrics-grid">
        <div className="metric-item">
          <span className="metric-label">Protection Horizon</span>
          <span
            className="metric-value"
            style={{ fontSize: "1.05rem" }}
          >
            {expiryDateStr}
          </span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Evaluated Protection Cost</span>
          <span className="metric-value highlight">
            {costUSDC}
          </span>
        </div>

        <div className="metric-item">
          <span className="metric-label">
            Modeled Floor at Expiry
          </span>
          <span className="metric-value">
            {protectedFloorUSD}
          </span>
        </div>

        <div className="metric-item">
          <span className="metric-label">
            Modeled At-Expiry Downside
          </span>
          <span className="metric-value highlight">
            {effectiveDownside}
          </span>
        </div>
      </div>

      <div className="compliance-checklist">
        <div
          className={`compliance-item ${budgetCheck?.status === "PASS" ? "passed" : ""
            }`}
        >
          <span className="compliance-icon">
            {statusIcon(budgetCheck?.status)}
          </span>

          <span>
            Budget ≤ {budgetDisplay} USDC:{" "}
            <strong>{statusLabel(budgetCheck?.status)}</strong>
          </span>
        </div>

        <div
          className={`compliance-item ${downsideCheck?.status === "PASS" ? "passed" : ""
            }`}
        >
          <span className="compliance-icon">
            {statusIcon(downsideCheck?.status)}
          </span>

          <span>
            Modeled downside ≤{" "}
            {intent.targetMaxLossPercent.value}%:{" "}
            <strong>{statusLabel(downsideCheck?.status)}</strong>
          </span>
        </div>

        <div
          className={`compliance-item ${policyStatus === "PASS" ? "passed" : ""
            }`}
        >
          <span className="compliance-icon">
            {statusIcon(policyStatus)}
          </span>

          <span>
            Financial Constitution:{" "}
            <strong>{statusLabel(policyStatus)}</strong>
          </span>
        </div>

        <div
          className={`compliance-item ${previewStatus === "PREVIEW_AVAILABLE" ? "passed" : ""
            }`}
        >
          <span className="compliance-icon">
            {previewStatus === "PREVIEW_AVAILABLE" ? "✓" : "○"}
          </span>

          <span>
            Market preview: <strong>{statusLabel(previewStatus)}</strong>
          </span>
        </div>
      </div>

      <div
        style={{
          background: "var(--surface-secondary)",
          padding: "0.85rem 1rem",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
          }}
        >
          Why this plan matched
        </div>

        <p
          style={{
            marginTop: "0.25rem",
            marginBottom: 0,
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
          }}
        >
          {candidate.rankExplanation ||
            `This candidate was evaluated against your confirmed request to protect ${exposureDisplay} ${intent.asset.value} through ${expiryDateStr}.`}
        </p>
      </div>

      <div
        style={{
          marginTop: "0.8rem",
          fontSize: "0.78rem",
          color: "var(--text-muted)",
        }}
      >
        Exposure source: <strong>Entered by you</strong> • Wallet
        verification: <strong>Not connected</strong>
      </div>

      <div
        className="action-row"
        style={{ marginTop: "1.25rem" }}
      >
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => onInspect(candidate)}
        >
          Inspect Policy Audit & Technical Proof
        </button>
      </div>
    </div>
  );
};