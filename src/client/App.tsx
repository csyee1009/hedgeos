import React, {
  useEffect,
  useState,
} from "react";
import {
  ActionProposal,
  BoundedAuthorizationAttestation,
  CandidateStrategy,
  ExecutionCommitment,
  ExternalHumanAuthorizationHandoff,
  HumanReviewRecord,
  MarketStateRecord,
  PolicyDecisionRecord,
  RFQReasonCode,
  RFQRequirementStatus,
  RFQSpecification,
  SimulationResult,
  StoredIntent,
  TypedRiskIntent,
} from "../types";
import { CandidateList } from "./components/CandidateList";
import { ConfirmedIntentView } from "./components/ConfirmedIntentView";
import { IntentReview } from "./components/IntentReview";
import { OutcomeInput } from "./components/OutcomeInput";
import { PortfolioOnboarding } from "./components/PortfolioOnboarding";
import { SimpleDiscovery } from "./components/SimpleDiscovery";
import { ExternalExecutionPanel } from "./components/ExternalExecutionPanel";

export type UIState =
  | "EMPTY"
  | "PARSING"
  | "NEEDS_CLARIFICATION"
  | "READY_FOR_CONFIRMATION"
  | "CONFIRMED"
  | "SOLVING"
  | "SOLVED"
  | "ERROR";

export type EntryMode = "ONBOARDING" | "SIMPLE" | "ADVANCED" | "ADVANCED_INPUT";

const normalizeAmbiguities = (
  value: unknown
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (
        item &&
        typeof item === "object"
      ) {
        const ambiguity =
          item as Record<
            string,
            unknown
          >;

        const detectedText =
          typeof ambiguity.detectedText ===
            "string"
            ? ambiguity.detectedText
            : "";

        const reason =
          typeof ambiguity.reason ===
            "string"
            ? ambiguity.reason
            : "";

        if (
          detectedText &&
          reason
        ) {
          return `"${detectedText}" — ${reason}`;
        }

        if (reason) {
          return reason;
        }
      }

      return "";
    })
    .filter(
      (item): item is string =>
        Boolean(item)
    );
};

export default function App() {
  const [theme, setTheme] =
    useState<"dark" | "light">(
      () => {
        const saved =
          localStorage.getItem(
            "hedgeos-theme"
          );

        if (
          saved === "light" ||
          saved === "dark"
        ) {
          return saved;
        }

        return window.matchMedia &&
          window.matchMedia(
            "(prefers-color-scheme: light)"
          ).matches
          ? "light"
          : "dark";
      }
    );

  const [entryMode, setEntryMode] = useState<EntryMode>("ONBOARDING");
  const [sourceNotice, setSourceNotice] = useState<string | undefined>(undefined);

  const [
    promptText,
    setPromptText,
  ] = useState("");

  const [uiState, setUiState] =
    useState<UIState>("EMPTY");

  const [intent, setIntent] =
    useState<StoredIntent | null>(
      null
    );

  const [
    missingFields,
    setMissingFields,
  ] = useState<string[]>([]);

  const [
    ambiguities,
    setAmbiguities,
  ] = useState<string[]>([]);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<
    string | undefined
  >(undefined);

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [
    marketState,
    setMarketState,
  ] = useState<
    MarketStateRecord | undefined
  >(undefined);

  const [
    candidates,
    setCandidates,
  ] = useState<
    CandidateStrategy[]
  >([]);

  const [
    rejectedCandidates,
    setRejectedCandidates,
  ] = useState<
    CandidateStrategy[]
  >([]);

  const [
    solverMode,
    setSolverMode,
  ] = useState<
    | "OPTIONBOOK_AVAILABLE"
    | "RFQ_REQUIRED"
  >("OPTIONBOOK_AVAILABLE");

  const [
    rfqRequirement,
    setRfqRequirement,
  ] = useState<
    | {
      status: RFQRequirementStatus;
      reasons: RFQReasonCode[];
      explanation: string;
    }
    | undefined
  >(undefined);

  const [
    rfqSpecification,
    setRfqSpecification,
  ] = useState<
    RFQSpecification | undefined
  >(undefined);

  const [
    actionProposal,
    setActionProposal,
  ] = useState<
    ActionProposal | undefined
  >(undefined);

  const [
    simulationResult,
    setSimulationResult,
  ] = useState<
    SimulationResult | undefined
  >(undefined);

  const [
    humanReviewRecord,
    setHumanReviewRecord,
  ] = useState<
    HumanReviewRecord | undefined
  >(undefined);

  const [
    authorizationAttestation,
    setAuthorizationAttestation,
  ] = useState<
    BoundedAuthorizationAttestation | undefined
  >(undefined);

  const [
    executionCommitment,
    setExecutionCommitment,
  ] = useState<
    ExecutionCommitment | undefined
  >(undefined);

  const [
    externalHumanAuthorizationHandoff,
    setExternalHumanAuthorizationHandoff,
  ] = useState<
    ExternalHumanAuthorizationHandoff | undefined
  >(undefined);

  const [
    policyDecisions,
    setPolicyDecisions,
  ] = useState<
    Record<
      string,
      PolicyDecisionRecord
    >
  >({});

  const [
    isSolving,
    setIsSolving,
  ] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      theme
    );

    localStorage.setItem(
      "hedgeos-theme",
      theme
    );
  }, [theme]);

  const toggleTheme = () => {
    setTheme((previous) =>
      previous === "dark"
        ? "light"
        : "dark"
    );
  };

  useEffect(() => {
    fetch("/api/v1/market/status")
      .then((response) => {
        if (!response.ok) {
          throw new Error();
        }

        return response.json();
      })
      .then((data) =>
        setMarketState(data)
      )
      .catch(() => {
        setMarketState(undefined);
      });
  }, []);

  const handleParse = async () => {
    if (!promptText.trim()) {
      return;
    }

    setUiState("PARSING");
    setErrorMessage(undefined);

    try {
      const response = await fetch(
        "/api/v1/intents/parse",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            prompt: promptText,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Failed to interpret protection request."
        );
      }

      if (
        data.unsupportedObjective
      ) {
        setErrorMessage(
          data.unsupportedObjectiveReason ||
          "HedgeOS currently supports downside-protection goals only."
        );

        setUiState("ERROR");
        return;
      }

      setIntent(
        data.candidateDraft
      );

      setMissingFields(
        data.missingFields || []
      );

      setAmbiguities(
        normalizeAmbiguities(
          data.ambiguitiesFound
        )
      );

      if (
        data.requiresClarification
      ) {
        setUiState(
          "NEEDS_CLARIFICATION"
        );
      } else {
        setUiState(
          "READY_FOR_CONFIRMATION"
        );
      }
    } catch {
      setErrorMessage(
        "We couldn't interpret your protection goal right now. Please try again."
      );

      setUiState("ERROR");
    }
  };

  const handleUpdateIntent =
    async (updates: {
      asset?: string;
      exposureAmount?: {
        amount: string;
      };
      targetMaxLossPercent?: number;
      maxPremiumUSDC?: {
        amount: string;
      };
      horizonTimestampMs?: number;
      allowMultiLeg?: boolean;
    }) => {
      if (!intent) {
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(undefined);

      try {
        const response =
          await fetch(
            `/api/v1/intents/${intent.intentId}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify(
                updates
              ),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            "Failed to update protection goal."
          );
        }

        setIntent(
          data.candidateIntent
        );

        setMissingFields(
          data.missingFields || []
        );

        setAmbiguities(
          normalizeAmbiguities(
            data.ambiguitiesFound
          )
        );

        if (
          data.missingFields?.length >
          0
        ) {
          setUiState(
            "NEEDS_CLARIFICATION"
          );
        } else {
          setUiState(
            "READY_FOR_CONFIRMATION"
          );
        }
      } catch (error: any) {
        setErrorMessage(
          error.message ||
          "Failed to update protection goal."
        );
      } finally {
        setIsSubmitting(false);
      }
    };

  const handleConfirmIntent =
    async () => {
      if (!intent) {
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(undefined);

      try {
        const response =
          await fetch(
            `/api/v1/intents/${intent.intentId}/confirm`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                expectedVersion:
                  intent.version,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            "Failed to confirm protection goal."
          );
        }

        setIntent(
          data.confirmedIntent
        );

        setUiState("CONFIRMED");
      } catch (error: any) {
        setErrorMessage(
          error.message ||
          "Failed to confirm protection goal."
        );
      } finally {
        setIsSubmitting(false);
      }
    };

  const handleSolveProtection =
    async () => {
      if (
        !intent ||
        !intent.confirmedByUser
      ) {
        return;
      }

      setIsSolving(true);
      setErrorMessage(undefined);

      try {
        const response =
          await fetch(
            `/api/v1/intents/${intent.intentId}/solve`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            "Failed to check live protection options."
          );
        }

        setSolverMode(
          data.mode ||
          "OPTIONBOOK_AVAILABLE"
        );

        setCandidates(
          data.rankedStrategies || []
        );

        setRejectedCandidates(
          data.rejectedCandidates ||
          []
        );

        setRfqRequirement(
          data.rfqRequirement
        );

        setRfqSpecification(
          data.rfqSpecification
        );

        setActionProposal(
          data.actionProposal
        );

        setSimulationResult(
          data.simulationResult
        );

        setHumanReviewRecord(
          data.humanReviewRecord
        );

        setAuthorizationAttestation(
          data.authorizationAttestation
        );

        setExecutionCommitment(
          data.executionCommitment
        );

        setExternalHumanAuthorizationHandoff(
          data.externalHumanAuthorizationHandoff
        );

        setPolicyDecisions(
          data.policyDecisions || {}
        );

        if (data.marketState) {
          setMarketState(
            data.marketState
          );
        }

        setUiState("SOLVED");
      } catch (error: any) {
        setErrorMessage(
          error.message ||
          "Failed to check live protection options."
        );

        setUiState("CONFIRMED");
      } finally {
        setIsSolving(false);
      }
    };

  const handleReset = () => {
    setPromptText("");
    setIntent(null);
    setMissingFields([]);
    setAmbiguities([]);
    setErrorMessage(undefined);
    setCandidates([]);
    setRejectedCandidates([]);
    setPolicyDecisions({});
    setRfqRequirement(undefined);
    setRfqSpecification(undefined);
    setActionProposal(undefined);
    setSimulationResult(undefined);
    setHumanReviewRecord(undefined);
    setAuthorizationAttestation(undefined);
    setExecutionCommitment(undefined);
    setExternalHumanAuthorizationHandoff(undefined);
    setSolverMode(
      "OPTIONBOOK_AVAILABLE"
    );
    setUiState("EMPTY");
    setEntryMode("ONBOARDING");
    setSourceNotice(undefined);
  };

  const isLiveMarket =
    marketState?.status ===
    "LIVE_READ_AVAILABLE";

  const marketLabel =
    marketState?.status === "LIVE_READ_AVAILABLE"
      ? "Live Base Mainnet"
      : marketState?.status === "CONNECTING"
        ? "Connecting"
        : marketState?.status === "VERIFIED_EMPTY_ORDERBOOK"
          ? "Live · empty orderbook"
          : marketState?.status === "STALE"
            ? "Stale market evidence"
        : marketState?.status === "NOT_CONFIGURED"
          ? "Market not connected"
          : "Live market unavailable";

  const currentStep = !intent
    ? 1
    : uiState === "NEEDS_CLARIFICATION" || uiState === "READY_FOR_CONFIRMATION"
      ? 2
      : uiState === "CONFIRMED" || isSolving
        ? 3
        : 4;

  const currentStepLabel =
    currentStep === 1
      ? "Define goal"
      : currentStep === 2
        ? "Review"
        : currentStep === 3
          ? "Market check"
          : "Result";

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-container">
          <div className="brand-box">
            <span className="brand-logo">
              🛡️ HedgeOS
            </span>

            <span className="brand-tagline">
              Protect outcomes, not
              instruments.
            </span>
          </div>

          <div className="header-controls">
            <div className="header-badges">
              <span
                className={`status-badge ${isLiveMarket
                  ? "live"
                  : "neutral"
                  }`}
              >
                <span
                  className={`live-dot ${isLiveMarket
                    ? "active"
                    : "failed"
                    }`}
                >
                  ●
                </span>

                {marketLabel}
              </span>

              <span className="status-badge neutral">
                Thetanuts
              </span>
            </div>

            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark"
                ? "Light"
                : "Dark"
                } mode`}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark"
                ? "☀️ Light"
                : "🌙 Dark"}
            </button>

            {intent && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleReset}
              >
                Start New Plan
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="content-container">
          <div className="journey-progress-mobile" aria-label={`Step ${currentStep} of 4: ${currentStepLabel}`}>
            <span className="journey-progress-mobile-count">Step {currentStep} of 4</span>
            <span className="journey-progress-mobile-label">{currentStepLabel}</span>
          </div>

          <div className="journey-progress-bar" aria-label="Protection planning progress">
            <div className={`progress-step ${currentStep >= 1 ? "completed" : ""} ${currentStep === 1 ? "active" : ""}`}>
              <span className="step-num">{currentStep > 1 ? "✓" : "1"}</span>
              <span className="step-label">Define goal</span>
            </div>
            <span className="progress-connector">→</span>
            <div className={`progress-step ${currentStep >= 2 ? "completed" : ""} ${currentStep === 2 ? "active" : ""}`}>
              <span className="step-num">{currentStep > 2 ? "✓" : "2"}</span>
              <span className="step-label">Review</span>
            </div>
            <span className="progress-connector">→</span>
            <div className={`progress-step ${currentStep >= 3 ? "completed" : ""} ${currentStep === 3 ? "active" : ""}`}>
              <span className="step-num">{currentStep > 3 ? "✓" : "3"}</span>
              <span className="step-label">Market check</span>
            </div>
            <span className="progress-connector">→</span>
            <div className={`progress-step ${currentStep >= 4 ? "completed" : ""} ${currentStep === 4 ? "active" : ""}`}>
              <span className="step-num">4</span>
              <span className="step-label">Result</span>
            </div>
          </div>
          {errorMessage && (
            <div
              className="alert alert-danger"
              role="alert"
            >
              <div>
                <strong>
                  Notice:
                </strong>{" "}
                {errorMessage}
              </div>

              {!intent && (
                <div
                  style={{
                    display:
                      "flex",
                    gap: "0.5rem",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={
                      handleParse
                    }
                  >
                    Try Again
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={
                      handleReset
                    }
                  >
                    Start Over
                  </button>
                </div>
              )}
            </div>
          )}

          {!intent &&
            (uiState ===
              "EMPTY" ||
              uiState ===
              "PARSING" ||
              uiState ===
              "ERROR") && (
              <>
                {entryMode === "ONBOARDING" && uiState === "EMPTY" ? (
                  <section className="entry-choice card">
                    <p className="eyebrow">HEDGEOS</p>
                    <h1>What would you like to do?</h1>
                    <div className="entry-choice-grid">
                      <button className="entry-choice-button" type="button" onClick={() => setEntryMode("SIMPLE")}>
                        <strong>Help me choose protection</strong>
                        <span>Describe your holding and concern. Compare feasible outcomes observed now.</span>
                      </button>
                      <button className="entry-choice-button" type="button" onClick={() => setEntryMode("ADVANCED")}>
                        <strong>I already know my limits</strong>
                        <span>Enter exact modeled downside, budget, exposure, and horizon constraints.</span>
                      </button>
                    </div>
                  </section>
                ) : entryMode === "SIMPLE" ? (
                  <SimpleDiscovery
                    onBack={() => setEntryMode("ONBOARDING")}
                    onCompiled={(compiled) => {
                      setIntent(compiled);
                      setMissingFields([]);
                      setAmbiguities([]);
                      setUiState("READY_FOR_CONFIRMATION");
                    }}
                  />
                ) : entryMode === "ADVANCED" ? (
                  <PortfolioOnboarding
                    onSelectManual={() => setEntryMode("ADVANCED_INPUT")}
                    onSelectPrefilledAmount={(prompt, notice) => {
                      setPromptText(prompt);
                      setSourceNotice(notice);
                      setEntryMode("ADVANCED_INPUT");
                    }}
                  />
                ) : (
                  <OutcomeInput
                    promptText={promptText}
                    setPromptText={setPromptText}
                    onParse={handleParse}
                    isParsing={uiState === "PARSING"}
                    sourceNotice={sourceNotice}
                    onResetOnboarding={() => {
                      setEntryMode("ADVANCED");
                      setSourceNotice(undefined);
                    }}
                  />
                )}
              </>
            )}

          {intent &&
            (uiState ===
              "NEEDS_CLARIFICATION" ||
              uiState ===
              "READY_FOR_CONFIRMATION") && (
              <IntentReview
                intent={intent}
                missingFields={
                  missingFields
                }
                ambiguities={
                  ambiguities
                }
                onUpdateIntent={
                  handleUpdateIntent
                }
                onConfirmIntent={
                  handleConfirmIntent
                }
                isSubmitting={
                  isSubmitting
                }
                errorMessage={
                  errorMessage
                }
              />
            )}

          {intent &&
            uiState ===
            "CONFIRMED" && (
              <ConfirmedIntentView
                intent={
                  intent as TypedRiskIntent
                }
                onCheckLiveMarket={
                  handleSolveProtection
                }
                onReset={
                  handleReset
                }
                isSolving={
                  isSolving
                }
              />
            )}

          {intent &&
            intent.confirmedByUser &&
            uiState ===
            "SOLVED" && (
              <>
              <CandidateList
                intent={
                  intent as TypedRiskIntent
                }
                mode={
                  solverMode
                }
                candidates={
                  candidates
                }
                rejectedCandidates={
                  rejectedCandidates
                }
                rfqRequirement={
                  rfqRequirement
                }
                rfqSpecification={
                  rfqSpecification
                }
                actionProposal={
                  actionProposal
                }
                simulationResult={
                  simulationResult
                }
                humanReviewRecord={
                  humanReviewRecord
                }
                authorizationAttestation={
                  authorizationAttestation
                }
                executionCommitment={
                  executionCommitment
                }
                externalHumanAuthorizationHandoff={
                  externalHumanAuthorizationHandoff
                }
                policyDecisions={
                  policyDecisions
                }
                marketState={
                  marketState
                }
                isSolving={
                  isSolving
                }
                onReset={
                  handleReset
                }
                onRefresh={
                  handleSolveProtection
                }
              />
              {candidates[0] && candidates[0].status === "TECHNICALLY_FEASIBLE" && (
                <ExternalExecutionPanel intent={intent as TypedRiskIntent} candidate={candidates[0]} />
              )}
              </>
            )}
        </div>
      </main>

      <footer className="app-footer">
        <div className="footer-container">
          <span>
            HedgeOS • Risk Intent
            Compiler for Thetanuts
            Finance
          </span>

          <span>
            Non-custodial • Externally authorized execution • On-chain verified only when evidence supports it
          </span>
        </div>
      </footer>
    </div>
  );
}
