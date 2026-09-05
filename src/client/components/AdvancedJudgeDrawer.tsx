import React, {
  useState,
} from "react";
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

type JudgeTab =
  | "ARCHITECTURE"
  | "POLICY"
  | "PAYOFF"
  | "SIMULATION"
  | "TRACKS"
  | "TRACE";

export const AdvancedJudgeDrawer:
  React.FC<AdvancedJudgeDrawerProps> = ({
    candidate,
    intent,
    policyDecision,
    rfqSpecification,
    actionProposal,
    simulationResult,
    humanReviewRecord,
    onClose,
  }) => {
    const [
      activeTab,
      setActiveTab,
    ] =
      useState<JudgeTab>(
        "ARCHITECTURE"
      );

    const payoff =
      candidate.payoffSummary &&
        "effectiveDownsidePercent" in
        candidate.payoffSummary
        ? candidate.payoffSummary
        : undefined;

    const exactPayoff =
      payoff &&
        "exact" in payoff
        ? (payoff as any).exact
        : undefined;

    const quote =
      candidate.quotes[0];

    const isRfq =
      candidate.status ===
      "RFQ_SPECIFICATION_READY" ||
      Boolean(
        rfqSpecification
      );

    const policyStatus =
      policyDecision
        ?.overallStatus ||
      "NOT_AVAILABLE";

    const policyPassed =
      policyDecision
        ?.overallStatus ===
      "PASS" &&
      policyDecision
        ?.passedAllInvariants ===
      true;

    const targetContract =
      actionProposal
        ?.targetContract ||
      "NOT_AVAILABLE";

    const underlyingResolution =
      candidate
        .underlyingResolutionMethod ||
      "NOT_AVAILABLE";

    const bindingStatus =
      actionProposal
        ?.bindingStatus ||
      "NOT_AVAILABLE";

    const formatAddress = (
      value:
        | string
        | undefined
    ) => {
      if (!value) {
        return "NOT_AVAILABLE";
      }

      if (
        value.length <= 18
      ) {
        return value;
      }

      return `${value.slice(
        0,
        10
      )}…${value.slice(-8)}`;
    };

    const renderTabButton = (
      tab: JudgeTab,
      text: string
    ) => (
      <button
        type="button"
        className={`tab-btn ${activeTab === tab
            ? "active"
            : ""
          }`}
        onClick={() =>
          setActiveTab(tab)
        }
      >
        {text}
      </button>
    );

    return (
      <div
        className="judge-drawer-backdrop"
        onClick={onClose}
      >
        <div
          className="judge-drawer-content"
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          {/* HEADER */}
          <div className="drawer-header">
            <div>
              <div
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap: "0.5rem",
                  marginBottom:
                    "0.35rem",
                  flexWrap:
                    "wrap",
                }}
              >
                <span className="badge badge-info">
                  Base Mainnet
                  8453
                </span>

                <span className="badge badge-neutral">
                  Deterministic
                  Verification
                </span>

                <span className="badge badge-neutral">
                  Non-Custodial
                </span>
              </div>

              <h2>
                Advanced Judge
                Inspection View
              </h2>

              <p className="card-subtitle">
                Strategy:{" "}
                <strong>
                  {
                    candidate.name
                  }
                </strong>{" "}
                • ID:{" "}
                <code>
                  {
                    candidate.strategyId
                  }
                </code>
              </p>
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
            >
              ✕ Close
            </button>
          </div>

          {/* TABS */}
          <div className="drawer-tabs">
            {renderTabButton(
              "ARCHITECTURE",
              "Architecture Flow"
            )}

            {renderTabButton(
              "POLICY",
              `Financial Constitution (${policyStatus})`
            )}

            {renderTabButton(
              "PAYOFF",
              "At-Expiry Payoff"
            )}

            {renderTabButton(
              "SIMULATION",
              "Proposal & Evidence"
            )}

            {renderTabButton(
              "TRACKS",
              "Track Integration"
            )}

            {renderTabButton(
              "TRACE",
              "Provenance & Trace"
            )}
          </div>

          <div className="drawer-body">
            {/* ====================================================
                ARCHITECTURE
            ==================================================== */}

            {activeTab ===
              "ARCHITECTURE" && (
                <div>
                  <h3>
                    HedgeOS
                    End-to-End
                    Architecture
                  </h3>

                  <p
                    style={{
                      marginTop:
                        "0.25rem",
                      marginBottom:
                        "1rem",
                    }}
                  >
                    AI is an
                    untrusted
                    language parser.
                    Financial
                    feasibility,
                    sizing, policy,
                    execution
                    binding, and
                    verification are
                    deterministic.
                  </p>

                  <div className="architecture-flow">
                    <div className="arch-node">
                      <span className="arch-node-title">
                        1. User Goal
                      </span>

                      <span className="arch-node-desc">
                        Outcome-first
                        language
                      </span>
                    </div>

                    <div className="arch-arrow">
                      →
                    </div>

                    <div className="arch-node highlight">
                      <span className="arch-node-title">
                        2. AI Draft
                      </span>

                      <span className="arch-node-desc">
                        Untrusted
                        extraction
                      </span>
                    </div>

                    <div className="arch-arrow">
                      →
                    </div>

                    <div className="arch-node">
                      <span className="arch-node-title">
                        3. Grounding
                      </span>

                      <span className="arch-node-desc">
                        Schema +
                        provenance
                      </span>
                    </div>

                    <div className="arch-arrow">
                      →
                    </div>

                    <div className="arch-node highlight">
                      <span className="arch-node-title">
                        4. User
                        Confirmation
                      </span>

                      <span className="arch-node-desc">
                        Versioned
                        Typed Intent
                      </span>
                    </div>

                    <div className="arch-arrow">
                      →
                    </div>

                    <div className="arch-node">
                      <span className="arch-node-title">
                        5. Live
                        Thetanuts
                      </span>

                      <span className="arch-node-desc">
                        OptionBook
                        evidence
                      </span>
                    </div>

                    <div className="arch-arrow">
                      →
                    </div>

                    <div className="arch-node highlight">
                      <span className="arch-node-title">
                        6.
                        Constitution
                      </span>

                      <span className="arch-node-desc">
                        Deterministic
                        PASS / FAIL
                      </span>
                    </div>

                    <div className="arch-arrow">
                      →
                    </div>

                    <div className="arch-node">
                      <span className="arch-node-title">
                        7. Exact
                        Preparation
                      </span>

                      <span className="arch-node-desc">
                        Unsigned
                        calldata
                      </span>
                    </div>

                    <div className="arch-arrow">
                      →
                    </div>

                    <div className="arch-node highlight">
                      <span className="arch-node-title">
                        8. Fresh
                        Revalidation
                      </span>

                      <span className="arch-node-desc">
                        TOCTOU gate
                      </span>
                    </div>

                    <div className="arch-arrow">
                      →
                    </div>

                    <div
                      className="arch-node"
                      style={{
                        borderColor:
                          "var(--warning-border)",
                      }}
                    >
                      <span className="arch-node-title">
                        9. External
                        Authorization
                      </span>

                      <span className="arch-node-desc">
                        Outside
                        HedgeOS
                      </span>
                    </div>

                    <div className="arch-arrow">
                      →
                    </div>

                    <div className="arch-node">
                      <span className="arch-node-title">
                        10. On-Chain
                        Proof
                      </span>

                      <span className="arch-node-desc">
                        Read-only
                        verification
                      </span>
                    </div>
                  </div>

                  <div
                    className="trace-section"
                    style={{
                      marginTop:
                        "1.25rem",
                    }}
                  >
                    <h4>
                      Core Safety
                      Invariants
                    </h4>

                    <ul
                      style={{
                        paddingLeft:
                          "1.25rem",
                        marginTop:
                          "0.5rem",
                        fontSize:
                          "0.875rem",
                        color:
                          "var(--text-secondary)",
                        lineHeight:
                          "1.6",
                      }}
                    >
                      <li>
                        <strong>
                          AI Authority:
                        </strong>{" "}
                        AI cannot
                        confirm an
                        intent, choose
                        an invented
                        budget, sign,
                        or broadcast.
                      </li>

                      <li>
                        <strong>
                          Exact
                          Arithmetic:
                        </strong>{" "}
                        Authoritative
                        sizing and
                        payoff checks
                        use exact
                        base-unit
                        arithmetic.
                      </li>

                      <li>
                        <strong>
                          Proposal ≠
                          Execution:
                        </strong>{" "}
                        Preview-bound
                        evidence is
                        not treated as
                        an exact
                        transaction.
                      </li>

                      <li>
                        <strong>
                          TOCTOU
                          Defense:
                        </strong>{" "}
                        The selected
                        signed order
                        is fetched
                        again before
                        an external
                        authorization
                        handoff.
                      </li>

                      <li>
                        <strong>
                          Custody:
                        </strong>{" "}
                        HedgeOS does
                        not hold a
                        private key or
                        autonomous
                        signer.
                      </li>

                      <li>
                        <strong>
                          Post-Execution
                          Proof:
                        </strong>{" "}
                        A successful
                        receipt alone
                        does not equal
                        confirmed
                        protection.
                      </li>
                    </ul>
                  </div>
                </div>
              )}

            {/* ====================================================
                POLICY
            ==================================================== */}

            {activeTab ===
              "POLICY" && (
                <div>
                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "center",
                      gap: "1rem",
                      marginBottom:
                        "1rem",
                      flexWrap:
                        "wrap",
                    }}
                  >
                    <div>
                      <h3>
                        Financial
                        Constitution
                      </h3>

                      <p
                        style={{
                          marginTop:
                            "0.25rem",
                        }}
                      >
                        Execution
                        preparation
                        requires
                        complete PASS
                        evidence. An
                        unknown check
                        is never
                        treated as a
                        pass.
                      </p>
                    </div>

                    <span
                      className={`badge ${policyPassed
                          ? "badge-success"
                          : policyDecision
                            ?.overallStatus ===
                            "FAIL"
                            ? "badge-danger"
                            : "badge-warning"
                        }`}
                    >
                      Overall:{" "}
                      {policyStatus}
                      {policyDecision
                        ?.stage
                        ? ` (${policyDecision.stage})`
                        : ""}
                    </span>
                  </div>

                  {!policyDecision && (
                    <div className="alert">
                      No Financial
                      Constitution
                      decision was
                      supplied for
                      this view.
                    </div>
                  )}

                  <div
                    style={{
                      display:
                        "flex",
                      flexDirection:
                        "column",
                      gap: "0.65rem",
                    }}
                  >
                    {policyDecision?.checks.map(
                      (check) => (
                        <div
                          key={
                            check.ruleId
                          }
                          style={{
                            background:
                              "var(--surface-secondary)",
                            border:
                              "1px solid var(--border)",
                            borderRadius:
                              "var(--radius-sm)",
                            padding:
                              "0.85rem 1rem",
                            display:
                              "flex",
                            alignItems:
                              "flex-start",
                            gap: "0.75rem",
                          }}
                        >
                          <span
                            style={{
                              fontSize:
                                "1rem",
                              color:
                                check.status ===
                                  "PASS"
                                  ? "var(--success)"
                                  : check.status ===
                                    "FAIL"
                                    ? "var(--danger)"
                                    : "var(--text-muted)",
                            }}
                          >
                            {check.status ===
                              "PASS"
                              ? "✓"
                              : check.status ===
                                "FAIL"
                                ? "✗"
                                : "○"}
                          </span>

                          <div
                            style={{
                              flex: 1,
                            }}
                          >
                            <div
                              style={{
                                display:
                                  "flex",
                                justifyContent:
                                  "space-between",
                                alignItems:
                                  "center",
                                gap:
                                  "0.5rem",
                              }}
                            >
                              <strong
                                style={{
                                  fontSize:
                                    "0.9rem",
                                  color:
                                    "var(--text-primary)",
                                }}
                              >
                                {
                                  check.ruleId
                                }
                                :{" "}
                                {
                                  check.description
                                }
                              </strong>

                              <span
                                className={`badge ${check.status ===
                                    "PASS"
                                    ? "badge-success"
                                    : check.status ===
                                      "FAIL"
                                      ? "badge-danger"
                                      : "badge-neutral"
                                  }`}
                              >
                                {
                                  check.status
                                }
                              </span>
                            </div>

                            <p
                              style={{
                                marginTop:
                                  "0.25rem",
                                fontSize:
                                  "0.825rem",
                                color:
                                  "var(--text-secondary)",
                              }}
                            >
                              {
                                check.details
                              }
                            </p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

            {/* ====================================================
                PAYOFF
            ==================================================== */}

            {activeTab ===
              "PAYOFF" && (
                <div>
                  <h3>
                    Modeled
                    At-Expiry
                    Protection
                  </h3>

                  <p
                    style={{
                      marginTop:
                        "0.25rem",
                      marginBottom:
                        "1rem",
                    }}
                  >
                    Protective long
                    put payoff is
                    modeled at
                    option expiry.
                    It is not a
                    guarantee of
                    portfolio value
                    before expiry.
                  </p>

                  {payoff ? (
                    <>
                      <div className="plan-metrics-grid">
                        <div className="metric-item">
                          <span className="metric-label">
                            Spot
                            Reference
                          </span>

                          <span className="metric-value">
                            $
                            {Number(
                              payoff.spotReferencePriceUSD
                            ).toFixed(
                              2
                            )}
                          </span>
                        </div>

                        <div className="metric-item">
                          <span className="metric-label">
                            Strike
                          </span>

                          <span className="metric-value">
                            $
                            {Number(
                              payoff.strikePriceUSD
                            ).toFixed(
                              2
                            )}
                          </span>
                        </div>

                        <div className="metric-item">
                          <span className="metric-label">
                            Modeled
                            Protected
                            Floor
                          </span>

                          <span className="metric-value highlight">
                            $
                            {Number(
                              payoff.protectedFloorValueUSD
                            ).toFixed(
                              2
                            )}
                          </span>
                        </div>

                        <div className="metric-item">
                          <span className="metric-label">
                            Modeled
                            Downside
                          </span>

                          <span className="metric-value highlight">
                            {Number(
                              payoff.effectiveDownsidePercent
                            ).toFixed(
                              2
                            )}
                            %
                          </span>
                        </div>
                      </div>

                      <p
                        style={{
                          fontSize:
                            "0.85rem",
                          color:
                            "var(--text-secondary)",
                          margin:
                            "0.75rem 0",
                        }}
                      >
                        {
                          payoff.details
                        }
                      </p>

                      {exactPayoff && (
                        <details>
                          <summary>
                            Exact
                            authoritative
                            payoff
                            evidence
                          </summary>

                          <pre>
                            {JSON.stringify(
                              exactPayoff,
                              null,
                              2
                            )}
                          </pre>
                        </details>
                      )}

                      <div className="table-responsive">
                        <table className="payoff-table">
                          <thead>
                            <tr>
                              <th>
                                Scenario
                              </th>

                              <th>
                                At-Expiry
                                Spot
                              </th>

                              <th>
                                Portfolio
                                Value
                              </th>

                              <th>
                                Net PnL
                              </th>

                              <th>
                                Net PnL
                                %
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {payoff.scenarios.map(
                              (
                                scenario,
                                index
                              ) => (
                                <tr
                                  key={
                                    index
                                  }
                                >
                                  <td>
                                    <strong>
                                      {
                                        scenario.scenarioLabel
                                      }
                                    </strong>
                                  </td>

                                  <td>
                                    $
                                    {Number(
                                      scenario.spotPriceScenarioUSD
                                    ).toFixed(
                                      2
                                    )}
                                  </td>

                                  <td>
                                    $
                                    {Number(
                                      scenario.portfolioValueUSD
                                    ).toFixed(
                                      2
                                    )}
                                  </td>

                                  <td
                                    className={
                                      scenario.pnlUSD >=
                                        0
                                        ? "positive"
                                        : "negative"
                                    }
                                  >
                                    $
                                    {Number(
                                      scenario.pnlUSD
                                    ).toFixed(
                                      2
                                    )}
                                  </td>

                                  <td
                                    className={
                                      scenario.pnlPercent >=
                                        0
                                        ? "positive"
                                        : "negative"
                                    }
                                  >
                                    {Number(
                                      scenario.pnlPercent
                                    ).toFixed(
                                      2
                                    )}
                                    %
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="alert">
                      Exact payoff
                      evidence is not
                      available for
                      this candidate.
                    </div>
                  )}
                </div>
              )}

            {/* ====================================================
                PROPOSAL / SIMULATION
            ==================================================== */}

            {activeTab ===
              "SIMULATION" && (
                <div>
                  <h3>
                    Proposal,
                    Binding &
                    Simulation
                    Evidence
                  </h3>

                  <p
                    style={{
                      marginTop:
                        "0.25rem",
                      marginBottom:
                        "1rem",
                    }}
                  >
                    Proposal evidence
                    is review evidence.
                    Exact calldata is
                    prepared only in
                    the later execution
                    preparation stage.
                  </p>

                  <div className="trace-grid">
                    <div className="trace-item">
                      <label>
                        Proposal ID
                      </label>

                      <code>
                        {actionProposal
                          ?.proposalId ||
                          "NOT_AVAILABLE"}
                      </code>
                    </div>

                    <div className="trace-item">
                      <label>
                        Intent /
                        Version
                      </label>

                      <code>
                        {actionProposal
                          ?.intentId ||
                          intent.intentId}{" "}
                        (v
                        {actionProposal
                          ?.intentVersion ??
                          intent.version}
                        )
                      </code>
                    </div>

                    <div
                      className="trace-item"
                      style={{
                        gridColumn:
                          "1 / -1",
                      }}
                    >
                      <label>
                        Proposal
                        Digest
                      </label>

                      <code className="digest-box">
                        {actionProposal
                          ?.proposalDigest ||
                          "NOT_AVAILABLE"}
                      </code>
                    </div>

                    <div className="trace-item">
                      <label>
                        Binding
                        Status
                      </label>

                      <span className="badge badge-info">
                        {
                          bindingStatus
                        }
                      </span>
                    </div>

                    <div className="trace-item">
                      <label>
                        Bound Quote
                      </label>

                      <code>
                        {actionProposal
                          ?.boundQuoteId ||
                          "NOT_AVAILABLE"}
                      </code>
                    </div>

                    <div className="trace-item">
                      <label>
                        Candidate
                        Digest
                      </label>

                      <code>
                        {actionProposal
                          ?.boundCandidateDigest ||
                          "NOT_AVAILABLE"}
                      </code>
                    </div>

                    <div className="trace-item">
                      <label>
                        Snapshot ID
                      </label>

                      <code>
                        {actionProposal
                          ?.boundMarketSnapshotId ||
                          "NOT_AVAILABLE"}
                      </code>
                    </div>

                    <div
                      className="trace-item"
                      style={{
                        gridColumn:
                          "1 / -1",
                      }}
                    >
                      <label>
                        Snapshot
                        Digest
                      </label>

                      <code className="digest-box">
                        {actionProposal
                          ?.boundMarketSnapshotDigest ||
                          "NOT_AVAILABLE"}
                      </code>
                    </div>

                    <div className="trace-item">
                      <label>
                        Simulation
                        Status
                      </label>

                      <span className="badge badge-neutral">
                        {simulationResult
                          ?.status ||
                          "NOT_AVAILABLE"}
                      </span>
                    </div>

                    <div className="trace-item">
                      <label>
                        Market
                        Evidence
                      </label>

                      <span className="badge badge-neutral">
                        {simulationResult
                          ?.marketEvidenceStatus ||
                          "NOT_AVAILABLE"}
                      </span>
                    </div>

                    <div className="trace-item">
                      <label>
                        Target
                        Contract
                      </label>

                      <code title={targetContract}>
                        {formatAddress(
                          targetContract
                        )}
                      </code>
                    </div>

                    <div className="trace-item">
                      <label>
                        Human Review
                      </label>

                      <span className="badge badge-neutral">
                        {humanReviewRecord
                          ? "AVAILABLE"
                          : "NOT_AVAILABLE"}
                      </span>
                    </div>
                  </div>

                  {simulationResult
                    ?.verificationChecks &&
                    simulationResult
                      .verificationChecks
                      .length >
                    0 && (
                      <div
                        style={{
                          marginTop:
                            "1rem",
                        }}
                      >
                        <h4>
                          Verification
                          Checks
                        </h4>

                        <div
                          style={{
                            display:
                              "flex",
                            flexDirection:
                              "column",
                            gap:
                              "0.5rem",
                            marginTop:
                              "0.5rem",
                          }}
                        >
                          {simulationResult.verificationChecks.map(
                            (
                              check,
                              index
                            ) => (
                              <div
                                key={
                                  index
                                }
                                style={{
                                  background:
                                    "var(--surface-secondary)",
                                  border:
                                    "1px solid var(--border)",
                                  padding:
                                    "0.6rem 0.85rem",
                                  borderRadius:
                                    "var(--radius-sm)",
                                  display:
                                    "flex",
                                  gap:
                                    "0.5rem",
                                  fontSize:
                                    "0.825rem",
                                }}
                              >
                                <span
                                  style={{
                                    color:
                                      check.passed
                                        ? "var(--success)"
                                        : "var(--danger)",
                                    fontWeight:
                                      700,
                                  }}
                                >
                                  {check.passed
                                    ? "✓"
                                    : "✗"}
                                </span>

                                <div>
                                  <strong>
                                    {
                                      check.checkName
                                    }
                                    :
                                  </strong>{" "}
                                  {
                                    check.details
                                  }
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </div>
              )}

            {/* ====================================================
                TRACK INTEGRATION
            ==================================================== */}

            {activeTab ===
              "TRACKS" && (
                <div>
                  <h3>
                    Thetanuts /
                    AI Integration
                    Proof
                  </h3>

                  <div
                    style={{
                      display:
                        "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: "1rem",
                      marginTop:
                        "1rem",
                    }}
                  >
                    <div
                      style={{
                        background:
                          "var(--surface-secondary)",
                        border:
                          "1px solid var(--border)",
                        padding:
                          "1.25rem",
                        borderRadius:
                          "var(--radius-sm)",
                      }}
                    >
                      <h4>
                        Thetanuts
                        Protocol
                      </h4>

                      <ul
                        style={{
                          paddingLeft:
                            "1.25rem",
                          marginTop:
                            "0.5rem",
                          fontSize:
                            "0.85rem",
                          color:
                            "var(--text-secondary)",
                          lineHeight:
                            "1.6",
                        }}
                      >
                        <li>
                          Thetanuts SDK
                          on Base chain
                          8453
                        </li>

                        <li>
                          Live
                          OptionBook
                          order
                          discovery
                        </li>

                        <li>
                          Signed-order
                          direction and
                          PUT
                          eligibility
                          checks
                        </li>

                        <li>
                          Protocol-derived
                          maximum fill
                          capacity
                        </li>

                        <li>
                          SDK
                          previewFillOrder
                          for exact
                          preview
                          evidence
                        </li>

                        <li>
                          Exact
                          encodeFillOrder
                          calldata
                          preparation
                        </li>

                        <li>
                          Pre-authorization
                          order
                          revalidation
                        </li>

                        <li>
                          Read-only Base
                          transaction,
                          event and
                          option-position
                          verification
                        </li>

                        <li>
                          RFQ remains
                          specification-only
                          unless separately
                          submitted outside
                          this flow
                        </li>
                      </ul>
                    </div>

                    <div
                      style={{
                        background:
                          "var(--surface-secondary)",
                        border:
                          "1px solid var(--border)",
                        padding:
                          "1.25rem",
                        borderRadius:
                          "var(--radius-sm)",
                      }}
                    >
                      <h4>
                        AI × Options
                        Intent Layer
                      </h4>

                      <ul
                        style={{
                          paddingLeft:
                            "1.25rem",
                          marginTop:
                            "0.5rem",
                          fontSize:
                            "0.85rem",
                          color:
                            "var(--text-secondary)",
                          lineHeight:
                            "1.6",
                        }}
                      >
                        <li>
                          Natural-language
                          extraction into
                          typed fields
                        </li>

                        <li>
                          AI output
                          treated as
                          untrusted draft
                          evidence
                        </li>

                        <li>
                          Strict Zod
                          validation and
                          authority-field
                          rejection
                        </li>

                        <li>
                          Independent
                          grounding of
                          financial values
                          in user text
                        </li>

                        <li>
                          Parser-inferred
                          relative
                          horizons require
                          confirmation
                        </li>

                        <li>
                          Deterministic
                          financial
                          solver and
                          Pareto
                          discovery
                        </li>

                        <li>
                          Versioned
                          user-confirmed
                          Typed Risk
                          Intent
                        </li>

                        <li>
                          No AI signing,
                          custody or
                          autonomous
                          transaction
                          broadcast
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div
                    className="alert"
                    style={{
                      marginTop:
                        "1rem",
                    }}
                  >
                    <strong>
                      Core product
                      novelty:
                    </strong>{" "}
                    Thetanuts exposes
                    option instruments.
                    HedgeOS adds an
                    outcome layer that
                    converts protection
                    goals into
                    deterministic,
                    verifiable
                    Thetanuts
                    protection
                    possibilities.
                  </div>
                </div>
              )}

            {/* ====================================================
                TRACE
            ==================================================== */}

            {activeTab ===
              "TRACE" && (
                <div>
                  <h3>
                    Sanitized
                    Provenance &
                    Protocol Trace
                  </h3>

                  <div className="trace-grid">
                    <div className="trace-item">
                      <label>
                        Objective
                        Source
                      </label>

                      <span className="badge badge-info">
                        {
                          intent.objective
                            .source
                        }
                      </span>
                    </div>

                    <div className="trace-item">
                      <label>
                        Asset
                        Grounding
                      </label>

                      <code>
                        {intent.asset
                          .originalPhrase
                          ? `"${intent.asset.originalPhrase}"`
                          : intent.asset
                            .source}
                      </code>
                    </div>

                    <div className="trace-item">
                      <label>
                        Horizon
                        Provenance
                      </label>

                      <code>
                        {
                          intent
                            .horizonTimestamp
                            .source
                        }
                      </code>
                    </div>

                    <div className="trace-item">
                      <label>
                        Option Right
                      </label>

                      <code>
                        {quote
                          ?.optionRight ||
                          rfqSpecification
                            ?.optionRight ||
                          "NOT_AVAILABLE"}
                      </code>
                    </div>

                    <div className="trace-item">
                      <label>
                        Underlying
                        Resolution
                      </label>

                      <code>
                        {
                          underlyingResolution
                        }
                      </code>
                    </div>

                    <div className="trace-item">
                      <label>
                        Execution
                        Authority
                      </label>

                      <code>
                        {
                          actionProposal
                            ?.authorizationStatus ||
                          "NOT_AUTHORIZED"
                        }
                      </code>
                    </div>
                  </div>

                  {intent.allowMultiLeg
                    .value && (
                      <div
                        style={{
                          background:
                            "var(--warning-subtle)",
                          border:
                            "1px solid var(--warning-border)",
                          borderRadius:
                            "var(--radius-sm)",
                          padding:
                            "0.75rem 1rem",
                          marginTop:
                            "1rem",
                        }}
                      >
                        <strong>
                          Multi-Leg
                          Status:
                        </strong>{" "}
                        User permission
                        does not itself
                        make a put spread
                        executable.
                        Current HedgeOS
                        exact execution
                        path remains
                        limited to
                        verified
                        single-strike
                        long puts.
                      </div>
                    )}

                  <div
                    style={{
                      marginTop:
                        "1rem",
                    }}
                  >
                    <h4>
                      Sanitized
                      Protocol
                      Evidence
                    </h4>

                    <pre
                      style={{
                        background:
                          "var(--surface-secondary)",
                        padding:
                          "1rem",
                        borderRadius:
                          "var(--radius-sm)",
                        overflowX:
                          "auto",
                        marginTop:
                          "0.5rem",
                      }}
                    >
                      {JSON.stringify(
                        quote
                          ? {
                            quoteId:
                              quote.quoteId,

                            sourceType:
                              quote.sourceType,

                            protocol:
                              quote.protocol,

                            orderIndex:
                              quote.orderIndex,

                            makerAddress:
                              quote.makerAddress,

                            targetContract:
                              actionProposal
                                ?.targetContract ||
                              "NOT_AVAILABLE",

                            optionRight:
                              quote.optionRight,

                            normalizedOptionType:
                              quote.normalizedOptionType,

                            rawOptionType:
                              quote.rawOptionType,

                            rawOrderIsLong:
                              quote.rawOrderIsLong,

                            makerIsSeller:
                              quote.makerIsSeller,

                            strike:
                              quote.strikePrice,

                            allStrikes:
                              quote.allStrikes,

                            expiryTimestampMs:
                              quote.expiryTimestampMs,

                            orderValidityDeadlineMs:
                              quote.orderValidityDeadlineMs,

                            availableQuantity:
                              quote.availableQuantity,

                            availableCollateralToken:
                              quote.availableCollateralToken,

                            eligibilityEvidence:
                              quote.eligibilityEvidence,

                            proposalBinding:
                              actionProposal
                                ? {
                                  boundQuoteId:
                                    actionProposal.boundQuoteId,

                                  boundCandidateDigest:
                                    actionProposal.boundCandidateDigest,

                                  boundMarketSnapshotId:
                                    actionProposal.boundMarketSnapshotId,

                                  boundMarketSnapshotDigest:
                                    actionProposal.boundMarketSnapshotDigest,

                                  proposalDigest:
                                    actionProposal.proposalDigest,

                                  bindingStatus:
                                    actionProposal.bindingStatus,
                                }
                                : undefined,
                          }
                          : rfqSpecification
                            ? {
                              rfqSpecId:
                                rfqSpecification.rfqSpecId,

                              underlying:
                                rfqSpecification.underlying,

                              strategyType:
                                rfqSpecification.strategyType,

                              optionRight:
                                rfqSpecification.optionRight,

                              strikes:
                                rfqSpecification.strikes,

                              expiryTimestampMs:
                                rfqSpecification.expiryTimestampMs,

                              requestedContracts:
                                rfqSpecification.requestedContracts,

                              validationStatus:
                                rfqSpecification.validationStatus,

                              pricingStatus:
                                rfqSpecification.pricingStatus,

                              submissionStatus:
                                "NOT_SUBMITTED",
                            }
                            : {
                              status:
                                "NO_PROTOCOL_EVIDENCE_AVAILABLE",
                            },
                        null,
                        2
                      )}
                    </pre>
                  </div>

                  {isRfq && (
                    <div className="alert">
                      <strong>
                        RFQ truthfulness
                        boundary:
                      </strong>{" "}
                      This view shows
                      an RFQ
                      specification,
                      not proof that
                      an RFQ was
                      submitted,
                      priced, won, or
                      executed.
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>
    );
  };