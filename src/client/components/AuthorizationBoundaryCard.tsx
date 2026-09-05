import React from "react";
import type {
  BoundedAuthorizationAttestation,
} from "../../types";

interface AuthorizationBoundaryCardProps {
  attestation?: BoundedAuthorizationAttestation;
}

const shortHash = (value: string): string =>
  value.length > 20
    ? `${value.slice(0, 10)}...${value.slice(-8)}`
    : value;

const formatTokenAmount = (
  amountBaseUnits: string,
  decimals: number,
  symbol: string
): string => {
  const base = BigInt(amountBaseUnits);
  const negative = base < 0n;
  const absolute = negative ? -base : base;
  const padded = absolute.toString().padStart(decimals + 1, "0");
  const integerPart =
    decimals === 0 ? padded : padded.slice(0, -decimals);
  const fractionPart =
    decimals === 0
      ? ""
      : padded.slice(-decimals).replace(/0+$/, "").slice(0, 6);

  return `${negative ? "-" : ""}${integerPart}${
    fractionPart ? `.${fractionPart}` : ""
  } ${symbol}`;
};

export const AuthorizationBoundaryCard: React.FC<
  AuthorizationBoundaryCardProps
> = ({ attestation }) => {
  if (!attestation) {
    return null;
  }

  const scope = attestation.scope;

  const statusLabel =
    attestation.status === "SCOPE_ATTESTED_PREVIEW_ONLY"
      ? "Bounded scope attested — preview only"
      : attestation.status === "EXTERNAL_AUTHORIZATION_ELIGIBLE"
        ? "Eligible for separate human authorization"
        : "Authorization checks not satisfied";

  return (
    <section className="card">
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
            <h3 style={{ marginBottom: "0.35rem" }}>
              Bounded authorization boundary
            </h3>
            <p className="card-subtitle">
              HedgeOS defines what a future authorization may cover.
              This record does not authorize or execute anything.
            </p>
          </div>

          <span className="badge badge-neutral">
            {statusLabel}
          </span>
        </div>
      </div>

      {scope && (
        <div
          className="plan-metrics-grid"
          style={{ marginTop: "1rem" }}
        >
          <div className="metric-item">
            <span className="metric-label">Maximum spend</span>
            <span className="metric-value">
              {formatTokenAmount(
                scope.maxSpendUSDC.amountBaseUnits,
                scope.maxSpendUSDC.decimals,
                scope.maxSpendUSDC.symbol
              )}
            </span>
          </div>

          <div className="metric-item">
            <span className="metric-label">Allowed protocol</span>
            <span className="metric-value">Thetanuts only</span>
          </div>

          <div className="metric-item">
            <span className="metric-label">Network</span>
            <span className="metric-value">Base Mainnet (8453)</span>
          </div>

          <div className="metric-item">
            <span className="metric-label">Allowed action</span>
            <span className="metric-value">Existing OptionBook fill only</span>
          </div>

          <div className="metric-item">
            <span className="metric-label">Asset</span>
            <span className="metric-value">
              {scope.asset} protective PUT
            </span>
          </div>

          <div className="metric-item">
            <span className="metric-label">Expected cost</span>
            <span className="metric-value">
              {formatTokenAmount(
                scope.expectedTotalCostUSDC.amountBaseUnits,
                scope.expectedTotalCostUSDC.decimals,
                scope.expectedTotalCostUSDC.symbol
              )}
            </span>
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: "1rem",
          padding: "0.9rem 1rem",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          background: "var(--surface-secondary)",
        }}
      >
        <strong>Execution remains blocked</strong>
        <p
          style={{
            margin: "0.35rem 0 0",
            color: "var(--text-secondary)",
            fontSize: "0.88rem",
          }}
        >
          {attestation.disclosure}
        </p>
      </div>

      {scope && (
        <details style={{ marginTop: "1rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>
            Inspect attestation binding
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
              Proposal: <code>{shortHash(scope.proposalId)}</code>
            </div>
            <div>
              Proposal digest:{" "}
              <code>{shortHash(scope.proposalDigest)}</code>
            </div>
            <div>
              Simulation: <code>{shortHash(scope.simulationId)}</code>
            </div>
            <div>
              Attestation digest:{" "}
              <code>{shortHash(attestation.attestationDigest)}</code>
            </div>
            <div>
              Target contract:{" "}
              <code>{shortHash(scope.targetContract)}</code>
            </div>
          </div>
        </details>
      )}
    </section>
  );
};
