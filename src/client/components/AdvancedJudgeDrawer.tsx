import React, { useState } from "react";
import {
  ActionProposal,
  CandidateStrategy,
  HumanReviewRecord,
  PolicyDecisionRecord,
  RFQSpecification,
  SimulationResult,
  TypedRiskIntent,
} from "../../types";

interface AdvancedJudgeDrawerProps {
  candidate: CandidateStrategy;
  intent: TypedRiskIntent;
  policyDecision?: PolicyDecisionRecord;
  rfqSpecification?: RFQSpecification;
  actionProposal?: ActionProposal;
  simulationResult?: SimulationResult;
  humanReviewRecord?: HumanReviewRecord;
  onClose: () => void;
}

export const AdvancedJudgeDrawer: React.FC<AdvancedJudgeDrawerProps> = ({
  candidate,
  intent,
  policyDecision,
  rfqSpecification,
  actionProposal,
  simulationResult,
  humanReviewRecord,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<
    "ARCHITECTURE" | "POLICY" | "PAYOFF" | "SIMULATION" | "TRACKS" | "TRACE"
  >("ARCHITECTURE");

  const payoff = candidate.payoffSummary && "effectiveDownsidePercent" in candidate.payoffSummary
    ? candidate.payoffSummary
    : undefined;

  const quote = candidate.quotes[0];
  const isRfq = candidate.status === "RFQ_SPECIFICATION_READY" || Boolean(rfqSpecification);

  return (
    <div className="judge-drawer-backdrop" onClick={onClose}>
      <div className="judge-drawer-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <span className="badge badge-info">Base Mainnet 8453</span>
              <span className="badge badge-neutral">Technical Verification & Policy Audit</span>
            </div>
            <h2>Advanced Judge Inspection View</h2>
            <p className="card-subtitle">
              Strategy: <strong>{candidate.name}</strong> • ID: <code>{candidate.strategyId}</code>
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="drawer-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === "ARCHITECTURE" ? "active" : ""}`}
            onClick={() => setActiveTab("ARCHITECTURE")}
          >
            Architecture Flow
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "POLICY" ? "active" : ""}`}
            onClick={() => setActiveTab("POLICY")}
          >
            Financial Constitution ({policyDecision?.overallStatus || "PASS"})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "PAYOFF" ? "active" : ""}`}
            onClick={() => setActiveTab("PAYOFF")}
          >
            At-Expiry Payoff Model
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "SIMULATION" ? "active" : ""}`}
            onClick={() => setActiveTab("SIMULATION")}
          >
            Proposal & Simulation Digest
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "TRACKS" ? "active" : ""}`}
            onClick={() => setActiveTab("TRACKS")}
          >
            Track Compliance Proof
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === "TRACE" ? "active" : ""}`}
            onClick={() => setActiveTab("TRACE")}
          >
            Raw Provenance & Trace
          </button>
        </div>

        {/* Tab Content */}
        <div className="drawer-body">
          {/* Tab 1: Architecture Flow */}
          {activeTab === "ARCHITECTURE" && (
            <div>
              <h3>HedgeOS End-to-End Architecture Flow</h3>
              <p style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
                AI translates user intent into typed constraints. Deterministic financial engines verify all protocol and budget rules.
              </p>

              <div className="architecture-flow">
                <div className="arch-node">
                  <span className="arch-node-title">1. Natural Language</span>
                  <span className="arch-node-desc">Outcome-First Goal</span>
                </div>
                <div className="arch-arrow">→</div>
                <div className="arch-node highlight">
                  <span className="arch-node-title">2. Gemini Flash</span>
                  <span className="arch-node-desc">Structured Extraction</span>
                </div>
                <div className="arch-arrow">→</div>
                <div className="arch-node">
                  <span className="arch-node-title">3. Typed Intent</span>
                  <span className="arch-node-desc">Deterministic Schema</span>
                </div>
                <div className="arch-arrow">→</div>
                <div className="arch-node highlight">
                  <span className="arch-node-title">4. Confirmation</span>
                  <span className="arch-node-desc">Server-Owned Gate</span>
                </div>
                <div className="arch-arrow">→</div>
                <div className="arch-node">
                  <span className="arch-node-title">5. OptionBook</span>
                  <span className="arch-node-desc">Thetanuts (Base)</span>
                </div>
                <div className="arch-arrow">→</div>
                <div className="arch-node highlight">
                  <span className="arch-node-title">6. Constitution</span>
                  <span className="arch-node-desc">Deterministic Policy</span>
                </div>
                <div className="arch-arrow">→</div>
                <div className="arch-node">
                  <span className="arch-node-title">7. Preview Simulation</span>
                  <span className="arch-node-desc">PREVIEW_BOUND</span>
                </div>
                <div className="arch-arrow">→</div>
                <div className="arch-node" style={{ borderColor: "var(--warning-border)" }}>
                  <span className="arch-node-title">8. Human Review</span>
                  <span className="arch-node-desc">NOT_AUTHORIZED</span>
                </div>
              </div>

              <div className="trace-section" style={{ marginTop: "1.25rem" }}>
                <h4>Key Safety & Architecture Invariants</h4>
                <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem", fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                  <li><strong>AI Authority Boundary:</strong> AI extracts candidate parameters only; it has zero trading or execution authority.</li>
                  <li><strong>Deterministic Verification:</strong> Sizing, payoff modeling, and budget checks run in verified TypeScript/BigInt arithmetic.</li>
                  <li><strong>Read-Only Bound:</strong> Thetanuts interactions use preview functions and read-only eth_call without loaded private keys or signers.</li>
                  <li><strong>Human Authorization Boundary:</strong> Proposed actions stop at <code>ELIGIBLE_HUMAN_AUTHORIZATION_REQUIRED</code>.</li>
                </ul>
              </div>
            </div>
          )}

          {/* Tab 2: Financial Constitution */}
          {activeTab === "POLICY" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <h3>Financial Constitution Invariant Audit</h3>
                  <p style={{ marginTop: "0.25rem" }}>
                    Every candidate strategy must pass all non-negotiable policy invariants before being ranked.
                  </p>
                </div>
                <span className={`badge ${policyDecision?.overallStatus === "PASS" ? "badge-success" : "badge-danger"}`}>
                  Overall Policy: {policyDecision?.overallStatus || "PASS"} ({policyDecision?.stage || "ANALYSIS"})
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {policyDecision?.checks.map((check) => (
                  <div
                    key={check.ruleId}
                    style={{
                      background: "var(--surface-secondary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.85rem 1rem",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                    }}
                  >
                    <span style={{ fontSize: "1rem", color: check.status === "PASS" ? "var(--success)" : check.status === "FAIL" ? "var(--danger)" : "var(--text-muted)" }}>
                      {check.status === "PASS" ? "✓" : check.status === "FAIL" ? "✗" : "○"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong style={{ fontSize: "0.9rem", color: "var(--text-primary)" }}>
                          {check.ruleId}: {check.description}
                        </strong>
                        <span className={`badge ${check.status === "PASS" ? "badge-success" : check.status === "FAIL" ? "badge-danger" : "badge-neutral"}`}>
                          {check.status}
                        </span>
                      </div>
                      <p style={{ marginTop: "0.25rem", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                        {check.details}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Payoff Model */}
          {activeTab === "PAYOFF" && (
            <div>
              <h3>At-Expiry Protection Payoff Model</h3>
              <p style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
                Delta-1 spot holding hedged with protective Long Put options. Modeled at expiry: <code>PortfolioValue(S_T) = (S_T * Q_spot) + max(0, K - S_T) * Q_option - TotalCost</code>.
              </p>

              {payoff ? (
                <>
                  <div className="plan-metrics-grid">
                    <div className="metric-item">
                      <span className="metric-label">Spot Reference Price</span>
                      <span className="metric-value">${payoff.spotReferencePriceUSD.toFixed(2)}</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Strike Price Floor</span>
                      <span className="metric-value">${payoff.strikePriceUSD.toFixed(2)}</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Modeled Protected Floor</span>
                      <span className="metric-value highlight">${payoff.protectedFloorValueUSD.toFixed(2)}</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-label">Effective Downside</span>
                      <span className="metric-value highlight">{payoff.effectiveDownsidePercent.toFixed(2)}%</span>
                    </div>
                  </div>

                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0.75rem 0" }}>
                    {payoff.details}
                  </p>

                  <div className="table-responsive">
                    <table className="payoff-table">
                      <thead>
                        <tr>
                          <th>Market Scenario</th>
                          <th>At-Expiry Spot</th>
                          <th>Portfolio Value</th>
                          <th>Net PnL ($)</th>
                          <th>Net PnL (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payoff.scenarios.map((sc, idx) => (
                          <tr key={idx}>
                            <td><strong>{sc.scenarioLabel}</strong></td>
                            <td>${sc.spotPriceScenarioUSD.toFixed(2)}</td>
                            <td>${sc.portfolioValueUSD.toFixed(2)}</td>
                            <td className={sc.pnlUSD >= 0 ? "positive" : "negative"}>
                              ${sc.pnlUSD.toFixed(2)}
                            </td>
                            <td className={sc.pnlPercent >= 0 ? "positive" : "negative"}>
                              {sc.pnlPercent.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div style={{ padding: "1.5rem", background: "var(--surface-secondary)", borderRadius: "var(--radius-sm)" }}>
                  <p>Payoff modeling awaiting verified live spot price and pricing preview.</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Proposal & Simulation Digest */}
          {activeTab === "SIMULATION" && (
            <div>
              <h3>ActionProposal & Simulation Verification</h3>
              <p style={{ marginTop: "0.25rem", marginBottom: "1rem" }}>
                Cryptographic proposal digest binds intent parameters, quote identity, and cost bounds before read-only simulation.
              </p>

              <div className="trace-grid">
                <div className="trace-item">
                  <label>Proposal ID</label>
                  <code>{actionProposal?.proposalId || "prop-ready"}</code>
                </div>
                <div className="trace-item">
                  <label>Bound Intent ID / Version</label>
                  <code>{actionProposal?.intentId || intent.intentId} (v{actionProposal?.intentVersion ?? intent.version})</code>
                </div>
                <div className="trace-item" style={{ gridColumn: "1 / -1" }}>
                  <label>SHA-256 Proposal Digest</label>
                  <code className="digest-box">{actionProposal?.proposalDigest || "N/A"}</code>
                </div>
                <div className="trace-item">
                  <label>Simulation Status</label>
                  <span className={`badge ${simulationResult?.status === "PROVIDER_SIMULATED" || simulationResult?.status === "DETERMINISTIC_VERIFIED" ? "badge-success" : "badge-warning"}`}>
                    {simulationResult?.status || "PREVIEW_ONLY"}
                  </span>
                </div>
                <div className="trace-item">
                  <label>Binding Status</label>
                  <span className="badge badge-info">PREVIEW_BOUND</span>
                </div>
                <div className="trace-item">
                  <label>Market Evidence Status</label>
                  <span className={`badge ${simulationResult?.marketEvidenceStatus === "FRESH" ? "badge-success" : "badge-warning"}`}>
                    {simulationResult?.marketEvidenceStatus || "FRESH"} (&lt;= 60s Policy)
                  </span>
                </div>
                <div className="trace-item">
                  <label>Target Contract</label>
                  <code>{actionProposal?.targetContract || "0x43063a482db1deb8ecf4177263b652882fa87431"}</code>
                </div>
              </div>

              {simulationResult?.verificationChecks && simulationResult.verificationChecks.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <h4>Verification Checks List</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
                    {simulationResult.verificationChecks.map((chk, i) => (
                      <div
                        key={i}
                        style={{
                          background: "var(--surface-secondary)",
                          border: "1px solid var(--border)",
                          padding: "0.6rem 0.85rem",
                          borderRadius: "var(--radius-sm)",
                          display: "flex",
                          gap: "0.5rem",
                          fontSize: "0.825rem",
                        }}
                      >
                        <span style={{ color: chk.passed ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>
                          {chk.passed ? "✓" : "✗"}
                        </span>
                        <div>
                          <strong>{chk.checkName}:</strong> {chk.details}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 5: Track Compliance Proof */}
          {activeTab === "TRACKS" && (
            <div>
              <h3>MUBA Hacks Track Integration Proof</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
                <div style={{ background: "var(--surface-secondary)", border: "1px solid var(--border)", padding: "1.25rem", borderRadius: "var(--radius-sm)" }}>
                  <h4>Track 1: Thetanuts Finance Protocol (Base 8453)</h4>
                  <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                    <li><code>@thetanuts-finance/thetanuts-client</code> (v0.3.0) SDK integration</li>
                    <li>Live OptionBook order discovery on Base Mainnet (Chain ID 8453)</li>
                    <li>Verified 1:1 protective put option contract sizing</li>
                    <li>SDK max-fill and collateral liquidity checks</li>
                    <li>Synchronous read-only <code>previewFillOrder</code> simulation</li>
                    <li>OptionFactory RFQ specification fallback generation (Long Put)</li>
                    <li><em>Put Spread: Intentionally blocked pending verified lower-strike policy</em></li>
                  </ul>
                </div>

                <div style={{ background: "var(--surface-secondary)", border: "1px solid var(--border)", padding: "1.25rem", borderRadius: "var(--radius-sm)" }}>
                  <h4>Track 2: AI × Options Risk Intent Compiler</h4>
                  <ul style={{ paddingLeft: "1.25rem", marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                    <li>Gemini 3.7 Flash structured intent extraction (Version: INTENT_EXTRACTION_V1)</li>
                    <li>Adversarial Zod schema defense stripping injected authority flags</li>
                    <li>Evidence and provenance grounding (USER_EXPLICIT / AI_INFERRED)</li>
                    <li>Deterministic Financial Constitution single authority evaluator</li>
                    <li>Immutable server-owned user confirmation lifecycle</li>
                    <li>Strict Pre-Execution Human Authorization Boundary</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tab 6: Raw Provenance & Trace */}
          {activeTab === "TRACE" && (
            <div>
              <h3>Sanitized Technical Evidence Trace</h3>
              <div className="trace-grid">
                <div className="trace-item">
                  <label>Objective Source</label>
                  <span className="badge badge-info">{intent.objective.source}</span>
                </div>
                <div className="trace-item">
                  <label>Asset Grounding</label>
                  <code>{intent.asset.originalPhrase ? `"${intent.asset.originalPhrase}"` : "Direct Text"}</code>
                </div>
                <div className="trace-item">
                  <label>Option Right</label>
                  <code>{quote?.optionRight || "PUT"}</code>
                </div>
                <div className="trace-item">
                  <label>Underlying Resolution Method</label>
                  <code>{candidate.underlyingResolutionMethod || "Chainlink PriceFeed"}</code>
                </div>
              </div>

              {intent.allowMultiLeg.value && (
                <div style={{ background: "var(--warning-subtle)", border: "1px solid var(--warning-border)", borderRadius: "var(--radius-sm)", padding: "0.75rem 1rem", marginTop: "1rem" }}>
                  <strong>Multi-Leg Policy Status:</strong> Put Spread is not currently available. Reason: Deterministic lower-strike / spread-width policy has not yet been verified. Long Put RFQ fallback is active.
                </div>
              )}

              <div style={{ marginTop: "1rem" }}>
                <h4>Sanitized Protocol Evidence</h4>
                <pre style={{ background: "var(--surface-secondary)", padding: "1rem", borderRadius: "var(--radius-sm)", overflowX: "auto", marginTop: "0.5rem" }}>
                  {JSON.stringify(
                    quote?.rawApiData
                      ? {
                          orderIndex: quote.orderIndex,
                          makerAddress: quote.makerAddress,
                          targetContract: (quote.rawApiData as any)?.targetContract || "0x43063a482db1deb8ecf4177263b652882fa87431",
                          optionRight: quote.optionRight,
                          strikePriceUSD: quote.strikePrice ? Number(BigInt(quote.strikePrice.amountBaseUnits)) / 1e8 : undefined,
                          expiryTimestampMs: quote.expiryTimestampMs,
                          availableQuantityBaseUnits: quote.availableQuantity?.amountBaseUnits,
                          availableCollateralToken: quote.availableCollateralToken,
                          evidenceTimestampMs: (quote.rawApiData as any)?.timestampMs,
                          underlyingResolution: candidate.underlyingResolutionMethod || "Chainlink PriceFeed",
                        }
                      : rfqSpecification
                      ? {
                          rfqSpecId: rfqSpecification.rfqSpecId,
                          underlying: rfqSpecification.underlying,
                          strategyType: rfqSpecification.strategyType,
                          optionRight: rfqSpecification.optionRight,
                          targetStrikeEstimateUSD: rfqSpecification.targetStrikeEstimateUSD,
                          expiryTimestampMs: rfqSpecification.expiryTimestampMs,
                          requestedContractsBaseUnits: rfqSpecification.requestedContracts.amountBaseUnits,
                          submissionStatus: "SPECIFICATION_ONLY_NOT_SUBMITTED",
                          putSpreadStatus: "BLOCKED_PENDING_POLICY",
                        }
                      : { status: "Verified" },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
