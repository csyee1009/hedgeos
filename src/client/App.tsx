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
  LiveMarketExplorer,
  LiveOptionBookOrderDTO,
  MarketStateRecord,
  PolicyDecisionRecord,
  RFQReasonCode,
  RFQRequirementStatus,
  RFQSpecification,
  SimulationResult,
  StoredIntent,
  TypedRiskIntent,
} from "../types";
import { CandidateList, RevalidationFailureInfo } from "./components/CandidateList";
import { ConfirmedIntentView } from "./components/ConfirmedIntentView";
import { IntentReview } from "./components/IntentReview";
import type { HoldingsSource } from "./components/IntentReview";
import { OutcomeInput } from "./components/OutcomeInput";
import { PortfolioOnboarding } from "./components/PortfolioOnboarding";
import { SimpleDiscovery } from "./components/SimpleDiscovery";
import { ExternalExecutionPanel } from "./components/ExternalExecutionPanel";
import hedgeLogo from "../../logo.png";

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

export interface ParseFailureState {
  uiState: "ERROR";
  errorMessage: string;
}

export function buildParseFailureState(error: unknown): ParseFailureState {
  const fallback = "We couldn't interpret your protection goal right now. Please try again.";
  const errorMessage =
    error instanceof Error && error.message.trim() !== ""
      ? error.message
      : fallback;
  return { uiState: "ERROR", errorMessage };
}

export function buildResetSolverState(): {
  candidates: CandidateStrategy[];
  rejectedCandidates: CandidateStrategy[];
  rfqRequirement: undefined;
  rfqSpecification: undefined;
  errorMessage: undefined;
  solverMode: "OPTIONBOOK_AVAILABLE";
} {
  return {
    candidates: [],
    rejectedCandidates: [],
    rfqRequirement: undefined,
    rfqSpecification: undefined,
    errorMessage: undefined,
    solverMode: "OPTIONBOOK_AVAILABLE",
  };
}

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
  const [holdingsSource, setHoldingsSource] = useState<HoldingsSource>("MANUAL");
  const [marketExplorer, setMarketExplorer] = useState<LiveMarketExplorer | undefined>(undefined);

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

  const [
    revalidationFailure,
    setRevalidationFailure,
  ] = useState<RevalidationFailureInfo | null>(null);

  const [acceptedCandidate, setAcceptedCandidate] = useState<CandidateStrategy | null>(null);
  const [baseConfirmedIntent, setBaseConfirmedIntent] = useState<StoredIntent | null>(null);

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
    if (!acceptedCandidate || revalidationFailure) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById("selected-protection-workflow")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    });

    return () =>
      window.cancelAnimationFrame(frame);
  }, [acceptedCandidate, revalidationFailure]);

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

      const data = await response.json().catch(() => ({}));

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
    } catch (error) {
      const failure = buildParseFailureState(error);
      setErrorMessage(failure.errorMessage);
      setUiState(failure.uiState);
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
        setBaseConfirmedIntent(
          JSON.parse(JSON.stringify(data.confirmedIntent))
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

  const restoreBaseConfirmedIntent = async (): Promise<StoredIntent | null> => {
    if (
      !baseConfirmedIntent ||
      !baseConfirmedIntent.maxPremiumUSDC?.value ||
      !baseConfirmedIntent.targetMaxLossPercent ||
      !baseConfirmedIntent.horizonTimestamp?.value
    ) {
      return intent;
    }

    const currentTarget = intent?.targetMaxLossPercent?.value;
    const baseTarget = baseConfirmedIntent.targetMaxLossPercent?.value;
    const currentBudgetBase = intent?.maxPremiumUSDC?.value?.amountBaseUnits;
    const baseBudgetBase = baseConfirmedIntent.maxPremiumUSDC.value.amountBaseUnits;
    const currentHorizon = intent?.horizonTimestamp?.value?.timestampMs;
    const baseHorizon = baseConfirmedIntent.horizonTimestamp.value.timestampMs;

    const isDifferent =
      currentTarget !== baseTarget ||
      currentBudgetBase !== baseBudgetBase ||
      currentHorizon !== baseHorizon ||
      intent?.targetMaxLossPercent?.source === "USER_ACCEPTED_LIVE_CONTRACT";

    if (!isDifferent) {
      return baseConfirmedIntent;
    }

    try {
      // 1. Try server restore-base endpoint first
      const restoreRes = await fetch(`/api/v1/intents/${baseConfirmedIntent.intentId}/restore-base`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (restoreRes.ok) {
        const restoreData = await restoreRes.json();
        if (restoreData.restoredIntent) {
          setIntent(restoreData.restoredIntent);
          return restoreData.restoredIntent;
        }
      }

      // 2. Fallback to PATCH + confirm with base values
      const budgetBase = BigInt(baseConfirmedIntent.maxPremiumUSDC.value.amountBaseUnits);
      const budgetDecimals = baseConfirmedIntent.maxPremiumUSDC.value.decimals;
      const scale = 10n ** BigInt(budgetDecimals);
      const integerPart = budgetBase / scale;
      const fracPart = budgetBase % scale;
      const budgetString = fracPart === 0n
        ? integerPart.toString()
        : `${integerPart.toString()}.${fracPart.toString().padStart(budgetDecimals, "0").replace(/0+$/, "")}`;

      const patchRes = await fetch(`/api/v1/intents/${baseConfirmedIntent.intentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetMaxLossPercent: baseConfirmedIntent.targetMaxLossPercent.value,
          maxPremiumUSDC: { amount: budgetString },
          horizonTimestampMs: baseConfirmedIntent.horizonTimestamp.value.timestampMs,
          source: "USER_EXPLICIT",
        }),
      });
      const patchData = await patchRes.json();
      if (patchRes.ok && patchData.candidateIntent) {
        const confirmRes = await fetch(`/api/v1/intents/${baseConfirmedIntent.intentId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: patchData.candidateIntent.version }),
        });
        const confirmData = await confirmRes.json();
        if (confirmRes.ok && confirmData.confirmedIntent) {
          setIntent(confirmData.confirmedIntent);
          return confirmData.confirmedIntent;
        }
      }
    } catch (e) {
      console.error("Failed to restore base intent on server:", e);
    }

    setIntent(baseConfirmedIntent);
    return baseConfirmedIntent;
  };

  const handleSolveProtection =
    async (intentToSolve?: any) => {
      const explicitIntent = intentToSolve && intentToSolve.intentId ? (intentToSolve as StoredIntent) : undefined;
      const activeIntent = explicitIntent || (await restoreBaseConfirmedIntent());
      const targetIntent = activeIntent || baseConfirmedIntent || intent;

      if (
        !targetIntent ||
        !targetIntent.confirmedByUser
      ) {
        return;
      }

      setIsSolving(true);
      setErrorMessage(undefined);
      setRevalidationFailure(null);
      setAcceptedCandidate(null);

      try {
        const response =
          await fetch(
            `/api/v1/intents/${targetIntent.intentId}/solve`,
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

        setMarketExplorer(
          data.marketExplorer
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

  const handleAcceptContract = async (
    order: LiveOptionBookOrderDTO,
    updates: {
      maxPremiumUSDC?: { amount: string };
      horizonTimestampMs?: number;
      targetMaxLossPercent?: number;
    }
  ) => {
    if (!intent) return;
    setIsSolving(true);
    setErrorMessage(undefined);
    setRevalidationFailure(null);
    setAcceptedCandidate(null);

    try {
      const patchRes = await fetch(`/api/v1/intents/${intent.intentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...updates,
          source: "USER_ACCEPTED_LIVE_CONTRACT",
        }),
      });
      const patchData = await patchRes.json();
      if (!patchRes.ok) {
        throw new Error(patchData.error || "Failed to update protection goal for accepted contract.");
      }

      const updatedCandidateIntent = patchData.candidateIntent;
      setIntent(updatedCandidateIntent);

      const confirmRes = await fetch(`/api/v1/intents/${updatedCandidateIntent.intentId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: updatedCandidateIntent.version }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        throw new Error(confirmData.error || "Failed to confirm updated protection goal.");
      }

      setIntent(confirmData.confirmedIntent);

      const solveRes = await fetch(`/api/v1/intents/${confirmData.confirmedIntent.intentId}/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const solveData = await solveRes.json();
      if (!solveRes.ok) {
        throw new Error(solveData.error || "Failed to revalidate live market options.");
      }

      setSolverMode(solveData.mode || "OPTIONBOOK_AVAILABLE");
      setCandidates(solveData.rankedStrategies || []);
      setRejectedCandidates(solveData.rejectedCandidates || []);
      setRfqRequirement(solveData.rfqRequirement);
      setRfqSpecification(solveData.rfqSpecification);
      setMarketExplorer(solveData.marketExplorer);
      setActionProposal(solveData.actionProposal);
      setSimulationResult(solveData.simulationResult);
      setHumanReviewRecord(solveData.humanReviewRecord);
      setAuthorizationAttestation(solveData.authorizationAttestation);
      setExecutionCommitment(solveData.executionCommitment);
      setExternalHumanAuthorizationHandoff(solveData.externalHumanAuthorizationHandoff);
      setPolicyDecisions(solveData.policyDecisions || {});
      if (solveData.marketState) setMarketState(solveData.marketState);

      const verifiedCandidate = (solveData.rankedStrategies || []).find((c: CandidateStrategy) =>
        c.quotes?.some((q) => q.quoteId === order.orderId)
      );

      if (verifiedCandidate && verifiedCandidate.status === "TECHNICALLY_FEASIBLE") {
        setCandidates([verifiedCandidate, ...(solveData.rankedStrategies || []).filter((c: CandidateStrategy) => c.strategyId !== verifiedCandidate.strategyId)]);
        setAcceptedCandidate(verifiedCandidate);
        setRevalidationFailure(null);
        setErrorMessage(undefined);
      } else {
        const freshMarket = solveData.marketExplorer as LiveMarketExplorer | undefined;
        const freshOrder = freshMarket?.allLive.find((o) => o.orderId === order.orderId);

        let failureInfo: RevalidationFailureInfo;

        if (!freshOrder) {
          failureInfo = {
            orderId: order.orderId,
            reasonCode: "ORDER_DISAPPEARED",
            explanation: `The selected order '${order.orderId}' is no longer available in the live Thetanuts OptionBook.`,
          };
        } else if (freshOrder.activeStatus === "EXPIRED" || (freshOrder.expiryTimestampMs && freshOrder.expiryTimestampMs < Date.now())) {
          failureInfo = {
            orderId: order.orderId,
            reasonCode: "ORDER_EXPIRED",
            explanation: `The selected order '${order.orderId}' has expired and can no longer be accepted.`,
          };
        } else if (freshOrder.availableCapacity && BigInt(freshOrder.availableCapacity.amountBaseUnits) === 0n) {
          failureInfo = {
            orderId: order.orderId,
            reasonCode: "INSUFFICIENT_CAPACITY",
            explanation: `Maker available capacity for '${order.orderId}' has dropped below your requested exposure quantity.`,
          };
        } else {
          const rejected = (solveData.rejectedCandidates || []).find((c: CandidateStrategy) =>
            c.quotes?.some((q) => q.quoteId === order.orderId)
          );
          const reasonText = rejected?.rejectionReasons?.join("; ") || "Order terms or conditions changed.";
          failureInfo = {
            orderId: order.orderId,
            reasonCode: "ORDER_CHANGED",
            explanation: `Revalidation failed for order '${order.orderId}': ${reasonText}`,
          };
        }

        setAcceptedCandidate(null);
        setRevalidationFailure(failureInfo);
        setErrorMessage(undefined);
      }

      setUiState("SOLVED");
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to process accepted contract.");
      setUiState("CONFIRMED");
    } finally {
      setIsSolving(false);
    }
  };

  const handleEditGoal = () => {
    const resetSolverState = buildResetSolverState();
    setRevalidationFailure(null);
    setAcceptedCandidate(null);
    setErrorMessage(resetSolverState.errorMessage);
    setCandidates(resetSolverState.candidates);
    setRejectedCandidates(resetSolverState.rejectedCandidates);
    setPolicyDecisions({});
    setRfqRequirement(resetSolverState.rfqRequirement);
    setRfqSpecification(resetSolverState.rfqSpecification);
    setMarketExplorer(undefined);
    setActionProposal(undefined);
    setSimulationResult(undefined);
    setHumanReviewRecord(undefined);
    setAuthorizationAttestation(undefined);
    setExecutionCommitment(undefined);
    setExternalHumanAuthorizationHandoff(undefined);
    setSolverMode(resetSolverState.solverMode);

    if (baseConfirmedIntent) {
      setIntent(baseConfirmedIntent);
    }

    if (intent || baseConfirmedIntent) {
      setUiState(
        missingFields.length > 0
          ? "NEEDS_CLARIFICATION"
          : "READY_FOR_CONFIRMATION"
      );
    } else {
      setUiState("EMPTY");
    }
  };

  const handleReset = () => {
    const resetSolverState = buildResetSolverState();
    setPromptText("");
    setIntent(null);
    setBaseConfirmedIntent(null);
    setMissingFields([]);
    setAmbiguities([]);
    setRevalidationFailure(null);
    setAcceptedCandidate(null);
    setErrorMessage(resetSolverState.errorMessage);
    setCandidates(resetSolverState.candidates);
    setRejectedCandidates(resetSolverState.rejectedCandidates);
    setPolicyDecisions({});
    setRfqRequirement(resetSolverState.rfqRequirement);
    setRfqSpecification(resetSolverState.rfqSpecification);
    setMarketExplorer(undefined);
    setActionProposal(undefined);
    setSimulationResult(undefined);
    setHumanReviewRecord(undefined);
    setAuthorizationAttestation(undefined);
    setExecutionCommitment(undefined);
    setExternalHumanAuthorizationHandoff(undefined);
    setSolverMode(resetSolverState.solverMode);
    setUiState("EMPTY");
    setEntryMode("ONBOARDING");
    setSourceNotice(undefined);
    setHoldingsSource("MANUAL");
  };

  const handleBackToMarket = async () => {
    setAcceptedCandidate(null);
    setRevalidationFailure(null);
    setErrorMessage(undefined);

    const restored =
      await restoreBaseConfirmedIntent();

    await handleSolveProtection(
      restored || undefined
    );
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
            <img
              src={hedgeLogo}
              alt="HedgeOS"
              className="brand-logo-image"
            />

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
                    onSelectManual={() => {
                      setHoldingsSource("MANUAL");
                      setEntryMode("ADVANCED_INPUT");
                    }}
                    onSelectPrefilledAmount={(prompt, notice, source) => {
                      setPromptText(prompt);
                      setSourceNotice(notice);
                      setHoldingsSource(source);
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
                holdingsSource={
                  holdingsSource
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
                {(!acceptedCandidate || revalidationFailure) && (
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
                    marketExplorer={
                      marketExplorer
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
                    revalidationFailure={
                      revalidationFailure
                    }
                    onReset={
                      handleReset
                    }
                    onRefresh={async () => {
                      setRevalidationFailure(null);
                      setAcceptedCandidate(null);
                      setErrorMessage(undefined);
                      const restored = await restoreBaseConfirmedIntent();
                      await handleSolveProtection(restored || undefined);
                    }}
                    onEditGoal={
                      handleEditGoal
                    }
                    onChooseAnotherContract={
                      handleBackToMarket
                    }
                    onAcceptContract={
                      handleAcceptContract
                    }
                  />
                )}

                {acceptedCandidate &&
                  acceptedCandidate.status ===
                  "TECHNICALLY_FEASIBLE" &&
                  !revalidationFailure && (
                    <div
                      id="selected-protection-workflow"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1.5rem",
                      }}
                    >
                      <section className="card">
                        <div
                          className="card-header"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: "1rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: "flex",
                                gap: "0.5rem",
                                flexWrap: "wrap",
                                marginBottom: "0.65rem",
                              }}
                            >
                              <span className="badge badge-success">
                                SELECTED PROTECTION PLAN
                              </span>
                              <span className="badge badge-neutral">
                                MARKET SELECTION COMPLETE
                              </span>
                            </div>

                            <h2>
                              {acceptedCandidate.name}
                            </h2>

                            <p className="card-subtitle">
                              Your selected contract is now the only active plan in the workflow.
                              Alternative market options are hidden unless you return to the market.
                            </p>
                          </div>

                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleBackToMarket}
                            disabled={isSolving}
                          >
                            ← Back to Market
                          </button>
                        </div>

                        <div
                          className="plan-metrics-grid"
                          style={{ marginTop: "1rem" }}
                        >
                          <div className="metric-item">
                            <span className="metric-label">
                              Strategy
                            </span>
                            <span className="metric-value">
                              {acceptedCandidate.strategyType.replace(/_/g, " ")}
                            </span>
                          </div>

                          <div className="metric-item">
                            <span className="metric-label">
                              Selected Order
                            </span>
                            <span className="metric-value">
                              {acceptedCandidate.quotes?.[0]?.quoteId ||
                                acceptedCandidate.legs?.[0]?.quoteReference ||
                                "Bound to selected candidate"}
                            </span>
                          </div>

                          <div className="metric-item">
                            <span className="metric-label">
                              Candidate Status
                            </span>
                            <span className="metric-value">
                              TECHNICALLY FEASIBLE
                            </span>
                          </div>

                          <div className="metric-item">
                            <span className="metric-label">
                              Authorization
                            </span>
                            <span className="metric-value">
                              USER-CONTROLLED WALLET
                            </span>
                          </div>
                        </div>

                        <div
                          className="alert alert-info"
                          style={{ marginTop: "1rem" }}
                        >
                          <strong>Financial Constitution</strong>
                          <div style={{ marginTop: "0.3rem" }}>
                            The selected candidate passed the current deterministic feasibility checks.
                            Exact transaction preparation still requires fresh pre-authorization revalidation
                            before the wallet is asked to approve anything.
                          </div>
                        </div>
                      </section>

                      <ExternalExecutionPanel
                        intent={intent as TypedRiskIntent}
                        candidate={acceptedCandidate}
                        onBackToMarket={
                          handleBackToMarket
                        }
                      />
                    </div>
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
