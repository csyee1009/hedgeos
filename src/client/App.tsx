import React, { useEffect, useState } from "react";
import {
  ActionProposal,
  CandidateStrategy,
  HumanReviewRecord,
  MarketStateRecord,
  PolicyDecisionRecord,
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

export type UIState =
  | "EMPTY"
  | "PARSING"
  | "NEEDS_CLARIFICATION"
  | "READY_FOR_CONFIRMATION"
  | "CONFIRMED"
  | "SOLVING"
  | "SOLVED"
  | "ERROR";

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("hedgeos-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  });

  const [promptText, setPromptText] = useState(
    "I have 2 ETH. Protect me until Friday. I don't want to lose more than 8%. Maximum protection budget 15 USDC."
  );
  const [uiState, setUiState] = useState<UIState>("EMPTY");
  const [intent, setIntent] = useState<StoredIntent | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [ambiguities, setAmbiguities] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Market & Protection Solver State
  const [marketState, setMarketState] = useState<MarketStateRecord | undefined>(undefined);
  const [candidates, setCandidates] = useState<CandidateStrategy[]>([]);
  const [rejectedCandidates, setRejectedCandidates] = useState<CandidateStrategy[]>([]);
  const [solverMode, setSolverMode] = useState<"OPTIONBOOK_AVAILABLE" | "RFQ_REQUIRED">("OPTIONBOOK_AVAILABLE");
  const [rfqRequirement, setRfqRequirement] = useState<{
    status: RFQRequirementStatus;
    reasons: any[];
    explanation: string;
  } | undefined>(undefined);
  const [rfqSpecification, setRfqSpecification] = useState<RFQSpecification | undefined>(undefined);
  const [actionProposal, setActionProposal] = useState<ActionProposal | undefined>(undefined);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | undefined>(undefined);
  const [humanReviewRecord, setHumanReviewRecord] = useState<HumanReviewRecord | undefined>(undefined);
  const [policyDecisions, setPolicyDecisions] = useState<Record<string, PolicyDecisionRecord>>({});
  const [isSolving, setIsSolving] = useState(false);

  // AI Intent Provider State
  const [aiStatus, setAiStatus] = useState<{
    activeProviderName: string;
    realProviderStatus: string;
    realModel: string;
  } | null>(null);

  // Apply Theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("hedgeos-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  // Query Market & AI Status on Mount
  useEffect(() => {
    fetch("/api/v1/market/status")
      .then((res) => res.json())
      .then((data) => setMarketState(data))
      .catch(() => {});

    fetch("/api/v1/ai/status")
      .then((res) => res.json())
      .then((data) => setAiStatus(data))
      .catch(() => {});
  }, []);

  // Action 1: Parse Natural Language Intent
  const handleParse = async () => {
    if (!promptText.trim()) return;
    setUiState("PARSING");
    setErrorMessage(undefined);

    try {
      const res = await fetch("/api/v1/intents/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to interpret protection request.");
      }

      const data = await res.json();

      if (data.unsupportedObjective) {
        setErrorMessage(
          data.unsupportedObjectiveReason ||
            "HedgeOS currently specializes in Downside Protection intents. Speculation and yield strategies are not supported in this version."
        );
        setUiState("ERROR");
        return;
      }

      setIntent(data.candidateDraft);
      setMissingFields(data.missingFields || []);
      setAmbiguities(data.ambiguitiesFound || []);

      if (data.requiresClarification) {
        setUiState("NEEDS_CLARIFICATION");
      } else {
        setUiState("READY_FOR_CONFIRMATION");
      }
    } catch (err: any) {
      setErrorMessage("We couldn't interpret your protection goal right now. Please try again.");
      setUiState("ERROR");
    }
  };

  // Action 2: Edit/Update Intent Parameter (PATCH /api/v1/intents/:id)
  const handleUpdateIntent = async (updates: {
    asset?: string;
    exposureAmount?: { amount: string };
    targetMaxLossPercent?: number;
    maxPremiumUSDC?: { amount: string };
    horizonTimestampMs?: number;
    allowMultiLeg?: boolean;
  }) => {
    if (!intent) return;
    setIsSubmitting(true);
    setErrorMessage(undefined);

    try {
      const res = await fetch(`/api/v1/intents/${intent.intentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update protection parameter.");
      }

      const data = await res.json();
      setIntent(data.candidateIntent);
      setMissingFields(data.missingFields || []);

      if (data.missingFields && data.missingFields.length > 0) {
        setUiState("NEEDS_CLARIFICATION");
      } else {
        setUiState("READY_FOR_CONFIRMATION");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update protection parameter.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action 3: Confirm Protection Goal (POST /api/v1/intents/:id/confirm)
  const handleConfirmIntent = async () => {
    if (!intent) return;
    setIsSubmitting(true);
    setErrorMessage(undefined);

    try {
      const res = await fetch(`/api/v1/intents/${intent.intentId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: intent.version }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to confirm protection goal.");
      }

      const data = await res.json();
      setIntent(data.confirmedIntent);
      setUiState("CONFIRMED");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to confirm protection goal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action 4: Solve Live Protection Options (POST /api/v1/intents/:id/solve)
  const handleSolveProtection = async () => {
    if (!intent || !intent.confirmedByUser) return;
    setIsSolving(true);
    setErrorMessage(undefined);

    try {
      const res = await fetch(`/api/v1/intents/${intent.intentId}/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to discover live protection options.");
      }

      const data = await res.json();
      setSolverMode(data.mode || "OPTIONBOOK_AVAILABLE");
      setCandidates(data.rankedStrategies || []);
      setRejectedCandidates(data.rejectedCandidates || []);
      setRfqRequirement(data.rfqRequirement);
      setRfqSpecification(data.rfqSpecification);
      setActionProposal(data.actionProposal);
      setSimulationResult(data.simulationResult);
      setHumanReviewRecord(data.humanReviewRecord);
      setPolicyDecisions(data.policyDecisions || {});
      if (data.marketState) setMarketState(data.marketState);

      setUiState("SOLVED");
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to discover live protection options.");
    } finally {
      setIsSolving(false);
    }
  };

  const handleReset = () => {
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
    setUiState("EMPTY");
  };

  const isLiveMarket = marketState?.status === "LIVE_READ_AVAILABLE";

  return (
    <div className="app-layout">
      {/* Header Bar */}
      <header className="app-header">
        <div className="header-container">
          <div className="brand-box">
            <span className="brand-logo">🛡️ HedgeOS</span>
            <span className="brand-tagline">Protect outcomes, not instruments.</span>
          </div>

          <div className="header-controls">
            <div className="header-badges">
              <span className={`status-badge ${isLiveMarket ? "live" : "neutral"}`}>
                <span className={`live-dot ${isLiveMarket ? "active" : "failed"}`}>●</span>
                {isLiveMarket ? "Live Base Mainnet (8453)" : "Market Unavailable"}
              </span>

              <span className="status-badge neutral">
                Thetanuts OptionBook & RFQ
              </span>
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
            >
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>

            {intent && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleReset}
              >
                Reset Plan
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        <div className="content-container">
          {/* Error Banner */}
          {uiState === "ERROR" && errorMessage && (
            <div className="alert alert-danger" role="alert">
              <div>
                <strong>Notice:</strong> {errorMessage}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleParse}
                >
                  Try Again
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleReset}
                >
                  Start Over
                </button>
              </div>
            </div>
          )}

          {/* Outcome Input Section (Landing / Primary Screen / Error State) */}
          {(!intent && (uiState === "EMPTY" || uiState === "PARSING" || uiState === "ERROR")) && (
            <OutcomeInput
              promptText={promptText}
              setPromptText={setPromptText}
              onParse={handleParse}
              isParsing={uiState === "PARSING"}
            />
          )}

          {/* Intent Review & Confirmation Section */}
          {intent && (uiState === "NEEDS_CLARIFICATION" || uiState === "READY_FOR_CONFIRMATION") && (
            <IntentReview
              intent={intent}
              missingFields={missingFields}
              ambiguities={ambiguities}
              onUpdateIntent={handleUpdateIntent}
              onConfirmIntent={handleConfirmIntent}
              isSubmitting={isSubmitting}
              errorMessage={errorMessage}
            />
          )}

          {/* Confirmed Intent View */}
          {intent && uiState === "CONFIRMED" && (
            <ConfirmedIntentView
              intent={intent as TypedRiskIntent}
              onCheckLiveMarket={handleSolveProtection}
              onReset={handleReset}
              isSolving={isSolving}
            />
          )}

          {/* Solved Protection Options & RFQ Fallback Section */}
          {intent && intent.confirmedByUser && uiState === "SOLVED" && (
            <CandidateList
              intent={intent as TypedRiskIntent}
              mode={solverMode}
              candidates={candidates}
              rejectedCandidates={rejectedCandidates}
              rfqRequirement={rfqRequirement}
              rfqSpecification={rfqSpecification}
              actionProposal={actionProposal}
              simulationResult={simulationResult}
              humanReviewRecord={humanReviewRecord}
              policyDecisions={policyDecisions}
              marketState={marketState}
              isSolving={isSolving}
              onReset={handleReset}
              onRefresh={handleSolveProtection}
            />
          )}
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="app-footer">
        <div className="footer-container">
          <span>HedgeOS • Risk Intent Compiler for Thetanuts Finance (Base Mainnet 8453)</span>
          <span>Pre-Execution Boundary: <code>ELIGIBLE_HUMAN_REQUIRED</code></span>
        </div>
      </footer>
    </div>
  );
}
