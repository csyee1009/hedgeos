/**
 * Application State Machine Definition & Invariant Validator
 * Formally enforces allowed transitions across the HedgeOS Risk Intent lifecycle.
 * Fails closed on any illegal transition (e.g. UNCONFIRMED -> MARKET_CHECKING, EMPTY -> REVIEW_READY).
 */

export type ApplicationState =
  | "EMPTY"
  | "PARSING"
  | "INTENT_REVIEW"
  | "NEEDS_CLARIFICATION"
  | "CONFIRMED"
  | "MARKET_CHECKING"
  | "OPTIONBOOK_AVAILABLE"
  | "RFQ_REQUIRED"
  | "MARKET_ERROR"
  | "REVIEW_READY";

export interface TransitionValidationResult {
  allowed: boolean;
  reason?: string;
}

export class ApplicationStateMachine {
  private static readonly VALID_TRANSITIONS: Record<ApplicationState, ApplicationState[]> = {
    EMPTY: ["PARSING"],
    PARSING: ["INTENT_REVIEW", "NEEDS_CLARIFICATION", "EMPTY"],
    NEEDS_CLARIFICATION: ["PARSING", "INTENT_REVIEW", "EMPTY"],
    INTENT_REVIEW: ["CONFIRMED", "PARSING", "EMPTY"],
    CONFIRMED: ["MARKET_CHECKING", "INTENT_REVIEW", "EMPTY"],
    MARKET_CHECKING: ["OPTIONBOOK_AVAILABLE", "RFQ_REQUIRED", "MARKET_ERROR", "INTENT_REVIEW", "EMPTY"],
    OPTIONBOOK_AVAILABLE: ["REVIEW_READY", "INTENT_REVIEW", "EMPTY"],
    RFQ_REQUIRED: ["REVIEW_READY", "INTENT_REVIEW", "EMPTY"],
    MARKET_ERROR: ["MARKET_CHECKING", "INTENT_REVIEW", "EMPTY"],
    REVIEW_READY: ["INTENT_REVIEW", "EMPTY"],
  };

  /**
   * Validates if a state transition is structurally permitted.
   */
  public static canTransition(from: ApplicationState, to: ApplicationState): TransitionValidationResult {
    const allowedNext = this.VALID_TRANSITIONS[from];
    if (!allowedNext || !allowedNext.includes(to)) {
      return {
        allowed: false,
        reason: `ILLEGAL_STATE_TRANSITION: Cannot transition from '${from}' to '${to}'.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Validates preconditions for reaching REVIEW_READY state.
   */
  public static validateReviewReadyPreconditions(params: {
    isIntentConfirmed: boolean;
    previewStatus?: string;
    passedFinancialInvariants: boolean;
    marketEvidenceStatus: string;
  }): TransitionValidationResult {
    if (!params.isIntentConfirmed) {
      return {
        allowed: false,
        reason: "PRECONDITION_FAILED: Cannot reach REVIEW_READY without confirmed user intent.",
      };
    }
    if (params.marketEvidenceStatus === "STALE") {
      return {
        allowed: false,
        reason: "PRECONDITION_FAILED: Cannot reach REVIEW_READY with STALE market evidence.",
      };
    }
    if (!params.passedFinancialInvariants) {
      return {
        allowed: false,
        reason: "PRECONDITION_FAILED: Cannot reach REVIEW_READY without passing Financial Constitution policies.",
      };
    }
    return { allowed: true };
  }
}
