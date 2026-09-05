export type RiskObjective = "DOWNSIDE_PROTECTION";

export type FieldProvenanceSource =
  | "USER_EXPLICIT"
  | "AI_INFERRED"
  | "PARSER_INFERRED"
  | "SYSTEM_DEFAULT";

export interface FieldProvenance<T> {
  value: T;
  source: FieldProvenanceSource;
  confidence: number;
  requiresConfirmation: boolean;
  rawUserInput?: string;
  originalPhrase?: string;
}

export interface TokenAmount {
  amountBaseUnits: string;
  decimals: number;
  symbol: string;
}

export function formatTokenAmount(tokenAmount: TokenAmount): string {
  try {
    const base = BigInt(tokenAmount.amountBaseUnits);
    const decimals = tokenAmount.decimals;
    const divisor = 10n ** BigInt(decimals);

    const integerPart = base / divisor;
    const remainder = base % divisor;

    if (remainder === 0n) {
      return `${integerPart.toString()} ${tokenAmount.symbol}`;
    }

    let remainderStr = remainder.toString().padStart(decimals, "0");
    remainderStr = remainderStr.replace(/0+$/, "");

    return `${integerPart.toString()}.${remainderStr} ${tokenAmount.symbol}`;
  } catch {
    return `${tokenAmount.amountBaseUnits} (${tokenAmount.decimals} decimals) ${tokenAmount.symbol}`;
  }
}

export interface HorizonTarget {
  timestampMs: number;
  isoString: string;
  formattedDisplay: string;
  timezone: string;
}

export interface AmbiguityResolution {
  field: string;
  detectedText: string;
  reason: string;
  suggestedValue: any;
}

export type LLMProviderType =
  | "REAL_LLM"
  | "DEVELOPMENT_ADAPTER"
  | "MOCK_EVALUATION";

export type LLMProviderStatus =
  | "NOT_CONFIGURED"
  | "READY"
  | "REQUESTING"
  | "AVAILABLE"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INVALID_PROVIDER_OUTPUT";

export interface LLMProviderMetadata {
  providerType: LLMProviderType;
  status: LLMProviderStatus;
  modelIdentifier: string;
  promptVersion: string;
  latencyMs?: number;
  requestTimestampMs?: number;
  responseTimestampMs?: number;
  retryCount?: number;
  error?: string;
}

export interface LLMIntentExtractionDTO {
  objective?: "DOWNSIDE_PROTECTION" | "UNSUPPORTED_OBJECTIVE" | string;

  unsupportedObjectiveReason?: string;

  asset?: {
    value: string | null;
    evidence?: string;
  } | null;

  exposureAmount?: {
    value: string | null;
    unit?: string;
    evidence?: string;
  } | null;

  targetMaxLossPercent?: {
    value: string | number | null;
    evidence?: string;
  } | null;

  maxPremium?: {
    value: string | null;
    currency?: string;
    evidence?: string;
  } | null;

  horizon?: {
    rawText: string | null;
    evidence?: string;
  } | null;

  allowMultiLeg?: {
    value: boolean | null;
    evidence?: string;
  } | null;

  ambiguities?: string[];
  clarificationQuestions?: string[];
}

export interface ParsedRiskIntentDraft {
  intentId: string;
  version: number;

  supersedesIntentId?: string;

  createdAtMs: number;
  updatedAtMs: number;

  objective: FieldProvenance<RiskObjective>;

  asset: FieldProvenance<string> | null;
  exposureAmount: FieldProvenance<TokenAmount> | null;
  targetMaxLossPercent: FieldProvenance<number> | null;
  maxPremiumUSDC: FieldProvenance<TokenAmount> | null;
  horizonTimestamp: FieldProvenance<HorizonTarget> | null;

  allowedProtocols: FieldProvenance<string[]>;
  allowMultiLeg: FieldProvenance<boolean>;

  missingFields?: string[];
  ambiguitiesFound?: AmbiguityResolution[];
  requiresClarification?: boolean;

  confirmedByUser: boolean;
  confirmedAtMs?: number;

  originalPromptText?: string;
  providerMetadata?: LLMProviderMetadata;
}

export interface TypedRiskIntent {
  intentId: string;
  version: number;

  supersedesIntentId?: string;

  createdAtMs: number;
  updatedAtMs: number;
  confirmedAtMs?: number;

  confirmedByUser: boolean;

  objective: FieldProvenance<RiskObjective>;

  asset: FieldProvenance<string>;
  exposureAmount: FieldProvenance<TokenAmount>;
  targetMaxLossPercent: FieldProvenance<number>;
  maxPremiumUSDC: FieldProvenance<TokenAmount>;
  horizonTimestamp: FieldProvenance<HorizonTarget>;

  allowedProtocols: FieldProvenance<string[]>;
  allowMultiLeg: FieldProvenance<boolean>;

  originalPromptText?: string;
}

export type StoredIntent = ParsedRiskIntentDraft | TypedRiskIntent;

/* ============================================================
 * OPTION / MARKET TYPES
 * ============================================================ */

export type QuoteSourceType =
  | "OPTION_BOOK"
  | "RFQ_OPTION_FACTORY";

export type OptionRight =
  | "PUT"
  | "CALL";

export type LegSide =
  | "BUY"
  | "SELL";

export type StrategyType =
  | "LONG_PUT"
  | "PUT_SPREAD";

export type SizingStatus =
  | "NOT_RESOLVED"
  | "RESOLVED";

export interface OptionLeg {
  side: LegSide;
  right: OptionRight;
  strikePrice: TokenAmount;
  expiryTimestampMs: number;
  requestedExposure: TokenAmount;
  resolvedOptionQuantity?: TokenAmount;
  sizingStatus: SizingStatus;
  quoteReference: string;
}

export interface OrderEligibilityEvidence {
  status:
  | "ELIGIBLE_LONG_PUT"
  | "REJECTED";

  checkedAtMs: number;

  checks: Array<{
    code: string;
    passed: boolean;
    details: string;
  }>;
}

export interface MarketQuote {
  quoteId: string;

  sourceType: QuoteSourceType;
  protocol: "THETANUTS";

  asset: string;
  optionRight: OptionRight;

  strikePrice: TokenAmount;
  expiryTimestampMs: number;

  premium: TokenAmount;
  availableQuantity: TokenAmount;

  availableCollateralToken?: string;

  executableNow: boolean;

  makerAddress?: string;
  orderIndex?: number;

  rawApiData?: Record<string, any>;

  /**
   * Full strike evidence retained from the protocol order.
   * Eligible LONG_PUT execution currently requires exactly one strike.
   */
  allStrikes?: TokenAmount[];

  implementationAddress?: string;
  implementationName?: string;

  /**
   * Direction interpreted from the actual protocol order.
   * This must not be invented from the intended strategy.
   */
  makerIsSeller?: boolean;

  /**
   * Optional raw SDK/API direction evidence retained so eligibility
   * checks can prove the normalized interpretation.
   */
  rawOrderIsLong?: boolean;

  /**
   * Normalized protocol option type.
   */
  normalizedOptionType?: OptionRight;

  /**
   * Raw protocol/SDK option type code when available.
   */
  rawOptionType?: string | number;

  orderValidityDeadlineMs?: number;

  eligibilityEvidence?: OrderEligibilityEvidence;
}

export type CandidateStatus =
  | "MARKET_FEASIBLE"
  | "SIZING_UNRESOLVED"
  | "TECHNICALLY_FEASIBLE"
  | "TECHNICALLY_REJECTED"
  | "BUDGET_REJECTED"
  | "PROTECTION_TARGET_NOT_MET"
  | "LIQUIDITY_INSUFFICIENT"
  | "EXPIRY_MISMATCH"
  | "PREVIEW_FAILED"
  | "POLICY_REJECTED"
  | "RFQ_REQUIRED"
  | "RFQ_SPECIFICATION_READY";

export type PolicyCheckStatus =
  | "PASS"
  | "FAIL"
  | "NOT_EVALUATED";

export type PolicyDecisionStatus =
  | "PASS"
  | "FAIL"
  | "INCOMPLETE";

export type PolicyEvaluationStage =
  | "ANALYSIS"
  | "EXECUTION"
  | "RFQ_SPECIFICATION";

export type FeeStatus =
  | "VERIFIED"
  | "INCOMPLETE"
  | "NOT_AVAILABLE";

export type BuyerSpendStatus =
  | "VERIFIED"
  | "INCOMPLETE"
  | "NOT_AVAILABLE";

export type BuyerSpendVerificationMode =
  | "TOTAL_BUYER_SPEND_PROVEN"
  | "PREMIUM_ONLY_PROVEN"
  | "INCOMPLETE";

export interface PremiumPreview {
  previewStatus:
  | "PREVIEW_AVAILABLE"
  | "PREVIEW_FAILED";

  pricePerContract: TokenAmount;

  premiumAmount: TokenAmount;

  protocolFee: TokenAmount;
  referrerFee: TokenAmount;

  totalExpectedCost: TokenAmount;

  feeStatus: FeeStatus;

  buyerSpendStatus?: BuyerSpendStatus;

  /**
   * Explains exactly what the protocol evidence establishes.
   * It avoids treating premium, protocol fees, and total buyer
   * spend as equivalent unless that relationship is proven.
   */
  buyerSpendVerificationMode?: BuyerSpendVerificationMode;

  feeEvidenceDetails?: string;

  collateralToken: string;

  previewTimestampMs: number;

  previewSource:
  | "THETANUTS_OPTIONBOOK_PREVIEW"
  | "THETANUTS_MM_PRICING";

  rawPreviewData?: Record<string, any>;

  error?: string;
}

/* ============================================================
 * PAYOFF / POLICY TYPES
 * ============================================================ */

export interface ScenarioPayoffPoint {
  spotPriceScenarioUSD: number;
  scenarioLabel: string;
  portfolioValueUSD: number;
  pnlUSD: number;
  pnlPercent: number;
}

export interface AtExpiryPayoffSummary {
  status:
  | "INTERFACE_ONLY"
  | "CALCULATED"
  | "NOT_AVAILABLE";

  spotExposureQuantity: string;

  spotReferencePriceUSD: number;
  spotExposureValueUSD: number;

  strikePriceUSD: number;

  protectedFloorValueUSD: number;
  effectiveDownsidePercent: number;

  totalProtectionCostUSD: number;
  costImpactPercent: number;

  isConstantFloorGuaranteed: boolean;

  scenarios: ScenarioPayoffPoint[];

  details: string;

  calculationTimestampMs: number;

  /**
   * Authoritative exact evidence.
   * Floating point/display fields above are not authoritative
   * for Financial Constitution thresholds.
   */
  exact?: {
    exposureValuePrice8: string;
    protectedFloorValuePrice8: string;
    maxLossValuePrice8: string;
    totalCostUSDC6: string;
    quantity18: string;
    strikePrice8: string;
    spotPrice8: string;
  };
}

export interface CandidateStrategy {
  strategyId: string;
  name: string;

  strategyType: StrategyType;

  legs: OptionLeg[];
  quotes: MarketQuote[];

  status: CandidateStatus;

  rejectionReasons: string[];

  rank?: number;
  rankExplanation?: string;

  scoresStatus:
  | "NOT_AVAILABLE"
  | "EVALUATED";

  sizingStatus: SizingStatus;

  maxFillableContracts?: TokenAmount;
  liquiditySufficient?: boolean;

  preview?: PremiumPreview;

  underlyingResolutionMethod?: string;

  policyDecision?: PolicyDecisionRecord;

  metrics?: {
    effectiveDownsidePercent?: number;
    totalProtectionCostUSD?: number;
    availableLiquidityContracts?: number;
    costImpactPercent?: number;
    modeledProtectedFloorUSD?: number;
  };

  scores?: {
    coverageScore?: number;
    efficiencyScore?: number;
    executabilityScore?: number;
    intentFitScore?: number;
    compositeScore?: number;
  };

  payoffSummary?:
  | AtExpiryPayoffSummary
  | {
    status:
    | "INTERFACE_ONLY"
    | "CALCULATED"
    | "NOT_AVAILABLE";

    details?: string;
  };
}

export interface PolicyCheckItem {
  ruleId: string;
  description: string;
  status: PolicyCheckStatus;
  details: string;
}

export interface PolicyDecisionRecord {
  decisionId: string;

  intentId: string;
  strategyId: string;

  overallStatus: PolicyDecisionStatus;

  passedAllInvariants: boolean;

  stage: PolicyEvaluationStage;

  checks: PolicyCheckItem[];

  timestampMs: number;
}

/* ============================================================
 * PROPOSAL / SIMULATION TYPES
 * ============================================================ */

export type BindingStatus =
  | "NOT_BOUND"
  | "PREVIEW_BOUND"
  | "EXACT_TRANSACTION_BOUND";

export type ActionProposalStatus =
  | "PREPARED"
  | "INCOMPLETE"
  | "INVALIDATED"
  | "SIMULATION_REQUIRED"
  | "SIMULATED"
  | "REVIEW_REQUIRED"
  | "ELIGIBLE_HUMAN_AUTHORIZATION_REQUIRED";

export type MarketEvidenceStatus =
  | "FRESH"
  | "STALE"
  | "UNAVAILABLE";

export interface ActionProposal {
  proposalId: string;

  intentId: string;
  intentVersion: number;

  strategyId: string;

  protocol: "THETANUTS";

  chainId: number;

  actionType:
  | "OPTIONBOOK_FILL_ORDER"
  | "REQUEST_FOR_QUOTATION";

  targetContract: string;

  normalizedParameters: Record<string, any>;

  expectedAsset: string;
  expectedOptionRight: OptionRight;

  expectedStrike: TokenAmount;
  expectedQuantity: TokenAmount;

  expectedPremium?: TokenAmount;
  expectedFees?: TokenAmount;
  expectedTotalCost?: TokenAmount;

  feeStatus?: FeeStatus;
  buyerSpendStatus?: BuyerSpendStatus;

  expectedExpiryMs: number;

  /**
   * Quote directly used to construct this proposal.
   */
  boundQuoteId?: string;

  /**
   * Discovery bindings.
   * These prevent a proposal for candidate A being used to prepare
   * candidate B.
   */
  boundCandidateDigest?: string;
  boundMarketSnapshotId?: string;
  boundMarketSnapshotDigest?: string;

  proposalCreatedAtMs: number;

  proposalStatus: ActionProposalStatus;

  bindingStatus: BindingStatus;

  proposalDigest: string;

  authorizationStatus: "UNAUTHORIZED";
}

export interface SimulationVerificationCheck {
  checkName: string;
  passed: boolean;
  details: string;
}

export interface SimulationResult {
  simulationId: string;

  proposalId: string;
  proposalDigest: string;

  intentId: string;
  intentVersion: number;

  strategyId: string;

  status:
  | "NOT_AVAILABLE"
  | "PREVIEW_ONLY"
  | "DETERMINISTIC_VERIFIED"
  | "PROVIDER_SIMULATED"
  | "CHAIN_SIMULATED"
  | "FAILED"
  | "STALE"
  | "SIMULATION_MISMATCH";

  simulationMethod:
  | "THETANUTS_OPTIONBOOK_PREVIEW"
  | "READ_ONLY_ETH_CALL"
  | "DETERMINISTIC_VERIFICATION"
  | "NONE";

  chainId: number;

  targetContract: string;

  bindingStatus: BindingStatus;

  simulatedAtMs: number;

  marketEvidenceTimestampMs: number;
  marketEvidenceStatus: MarketEvidenceStatus;

  expectedPremium?: TokenAmount;
  expectedFees?: TokenAmount;
  expectedTotalCost?: TokenAmount;

  feeStatus?: FeeStatus;
  buyerSpendStatus?: BuyerSpendStatus;

  expectedExpiryMs: number;

  expectedOptionQuantity: TokenAmount;
  expectedUnderlying: string;

  providerResultSummary: string;

  revertReason?: string;

  verificationChecks: SimulationVerificationCheck[];

  authorizedByHuman: false;
}

export interface HumanReviewSummary {
  protectingAsset: string;
  exposureQuantity: string;
  untilDate: string;
  structure: string;
  strikePriceUSD: string;
  estimatedCostUSDC: string;
  modeledDownsidePercent: string;
  liveMarketCheck: string;
  simulationStatus: string;
  authorizationRequirement: string;
}

export interface HumanReviewRecord {
  reviewId: string;

  proposalId: string;
  proposalDigest: string;

  intentId: string;
  intentVersion: number;

  simulationId: string;

  presentedAtMs: number;

  reviewStatus:
  | "NOT_PRESENTED"
  | "READY_FOR_REVIEW"
  | "REVIEWED"
  | "ELIGIBLE_HUMAN_AUTHORIZATION_REQUIRED";

  executionStatus: "NOT_AUTHORIZED";

  warnings: string[];

  summary: HumanReviewSummary;

  toctouDisclosure: string;
}

/* ============================================================
 * MARKET STATE
 * ============================================================ */

export type MarketStatus =
  | "NOT_CONFIGURED"
  | "CONNECTING"
  | "LIVE_READ_AVAILABLE"
  | "VERIFIED_EMPTY_ORDERBOOK"
  | "LIVE_READ_FAILED"
  | "STALE"
  | "RATE_LIMITED";

export interface MarketStateRecord {
  status: MarketStatus;

  chainId: number;

  timestampMs: number;

  source: string;

  orderCount: number;

  spotPriceUSD?: number;

  error?: string;
}

/* ============================================================
 * RFQ DOMAIN CONCEPTS & LIFECYCLE TYPES
 * ============================================================ */

export type RFQRequirementStatus =
  | "NOT_REQUIRED"
  | "REQUIRED"
  | "UNSUPPORTED"
  | "INCOMPLETE";

export type RFQReasonCode =
  | "NO_MATCHING_EXPIRY"
  | "NO_MATCHING_STRIKE"
  | "INSUFFICIENT_LIQUIDITY"
  | "BUDGET_NOT_SATISFIED"
  | "PROTECTION_TARGET_NOT_SATISFIED"
  | "ATOMIC_STRUCTURE_NOT_AVAILABLE"
  | "NO_QUALIFYING_OPTIONBOOK_ORDERS";

export type RFQValidationStatus =
  | "VALID"
  | "INVALID"
  | "INCOMPLETE";

export type RFQLifecycleStatus =
  | "SPECIFICATION_ONLY"
  | "EXISTING_RFQ_READ"
  | "QUOTATION_AVAILABLE"
  | "QUOTATION_EXPIRED"
  | "SUBMISSION_REQUIRED"
  | "EXECUTION_NOT_AUTHORIZED";

export interface RFQSpecification {
  rfqSpecId: string;

  intentId: string;

  underlying: string;

  strategyType: StrategyType;

  optionRight: OptionRight;

  strikes: TokenAmount[];

  targetStrikeEstimateUSD: number;

  strikeDerivationStatus:
  "TARGET_STRIKE_ESTIMATE";

  pricingStatus:
  "PENDING_RFQ_PRICING_REFINEMENT";

  strikeDerivationMethod: string;

  expiryTimestampMs: number;
  expiryFormatted: string;

  offerDeadlineMinutes: number;

  offerDeadlineRationale:
  "PRODUCT_SELECTED_DEFAULT_REQUIRES_USER_REVIEW";

  requestedContracts: TokenAmount;

  settlementType: "CASH";

  collateralAsset: string;
  collateralDecimals: number;

  sourceReasons: RFQReasonCode[];

  createdAtMs: number;

  validationStatus: RFQValidationStatus;

  validationErrors: string[];

  putSpreadStatus?:
  | "SPECIFICATION_READY"
  | "BLOCKED_PENDING_STRIKE_SELECTION_POLICY";
}

export interface PendingRevealRFQQuote {
  quoteId: string;
  rfqId: string;

  maker: string;

  pricingStatus: "NOT_AVAILABLE";

  quoteStatus: "PENDING_REVEAL";

  expiryTimestampMs: number;

  strategyMetadata: Record<string, any>;

  source: "THETANUTS_OPTIONFACTORY_RFQ";

  timestampMs: number;
}

export interface RevealedRFQQuote {
  quoteId: string;
  rfqId: string;

  maker: string;

  pricingStatus: "AVAILABLE";

  quoteStatus:
  | "ACTIVE"
  | "EXPIRED";

  premium: TokenAmount;

  feeStatus: FeeStatus;

  totalExpectedCost: TokenAmount;

  expiryTimestampMs: number;

  strategyMetadata: Record<string, any>;

  source: "THETANUTS_OPTIONFACTORY_RFQ";

  timestampMs: number;
}

export type RFQQuote =
  | PendingRevealRFQQuote
  | RevealedRFQQuote;

export interface PreparedActionProposal {
  proposalId: string;

  actionType: "REQUEST_FOR_QUOTATION";

  protocol: "THETANUTS";

  chainId: number;

  intentId: string;

  rfqSpecId: string;

  requiredMethod: "requestForQuotation";

  targetContract: string;

  unsignedCalldata?: string;

  normalizedParams: Record<string, any>;

  authorizationStatus: "UNAUTHORIZED";

  submissionStatus: "NOT_SUBMITTED";
}

export interface ProtectionSolverPipelineResult {
  mode:
  | "OPTIONBOOK_AVAILABLE"
  | "RFQ_REQUIRED";

  rankedStrategies: CandidateStrategy[];

  rejectedCandidates: CandidateStrategy[];

  rfqRequirement?: {
    status: RFQRequirementStatus;
    reasons: RFQReasonCode[];
    explanation: string;
  };

  rfqSpecification?: RFQSpecification;

  actionProposal?: ActionProposal;

  simulationResult?: SimulationResult;

  humanReviewRecord?: HumanReviewRecord;

  policyDecisions: Record<
    string,
    PolicyDecisionRecord
  >;

  marketState?: MarketStateRecord;
}

/* ============================================================
 * PORTFOLIO TYPES
 * ============================================================ */

export type PortfolioSource =
  | "PUBLIC_BASE_ADDRESS"
  | "MANUAL";

export interface PortfolioTokenBalance {
  asset:
  | "ETH"
  | "WETH"
  | "BTC"
  | "CBBTC"
  | "USDC";

  displaySymbol: string;

  amountBaseUnits: string;

  decimals: number;

  formattedAmount: string;

  tokenAddress?: string;

  source:
  | "BASE_MAINNET_READ"
  | "RECORDED_DEMO_PORTFOLIO";
}

export interface ReadOnlyPortfolioSnapshot {
  address: string;

  chainId: 8453;

  capturedAtMs: number;

  balances: PortfolioTokenBalance[];

  status:
  | "AVAILABLE"
  | "PARTIAL"
  | "UNAVAILABLE";

  warnings: string[];
}

/* ============================================================
 * BOUNDED AUTHORIZATION
 * ============================================================ */

export type AuthorizationAttestationStatus =
  | "REJECTED"
  | "SCOPE_ATTESTED_PREVIEW_ONLY"
  | "EXTERNAL_AUTHORIZATION_ELIGIBLE";

export interface BoundedAuthorizationScope {
  chainId: 8453;

  protocol: "THETANUTS";

  actionType:
  "OPTIONBOOK_FILL_ORDER";

  targetContract: string;

  asset: string;

  optionRight: "PUT";

  proposalId: string;
  proposalDigest: string;

  intentId: string;
  intentVersion: number;

  simulationId: string;

  boundQuoteId?: string;

  maxSpendUSDC: TokenAmount;

  expectedTotalCostUSDC: TokenAmount;

  expectedQuantity: TokenAmount;

  expectedExpiryMs: number;
}

export interface BoundedAuthorizationAttestation {
  attestationId: string;
  attestationDigest: string;

  createdAtMs: number;

  status: AuthorizationAttestationStatus;

  executionStatus: "NOT_AUTHORIZED";

  canExecute: false;

  scope?: BoundedAuthorizationScope;

  checks: Array<{
    check: string;
    passed: boolean;
    details: string;
  }>;

  blockers: string[];

  disclosure: string;
}

/* ============================================================
 * EXECUTION COMMITMENT
 * ============================================================ */

export type ExecutionCommitmentStatus =
  | "PROPOSAL_BOUND"
  | "EXACT_TRANSACTION_BOUND"
  | "EXTERNAL_PAYLOAD_BOUND"
  | "BLOCKED"
  | "EXPIRED";

export interface ExecutionCommitment {
  commitmentId: string;
  commitmentDigest: string;

  intentId: string;
  intentVersion: number;

  proposalId: string;
  proposalDigest: string;

  authorizationAttestationId: string;
  authorizationAttestationDigest: string;

  chainId: 8453;

  protocol: "THETANUTS";

  actionType:
  | "OPTIONBOOK_FILL_ORDER"
  | "REQUEST_FOR_QUOTATION";

  targetContract: string;

  expectedAsset: string;

  expectedOptionRight: "PUT";

  expectedQuantity: TokenAmount;

  expectedTotalCostUSDC?: TokenAmount;

  expectedExpiryMs: number;

  externalExecutorPayloadDigest?: string;

  exactPreparationId?: string;
  exactPreparationDigest?: string;

  calldataHash?: string;
  semanticDigest?: string;

  expectedBeneficiary?: string;

  /**
   * For the currently supported direct-wallet execution path,
   * executor and beneficiary should be identical.
   */
  expectedExecutor?: string;

  preSignRevalidationId?: string;
  preSignRevalidationDigest?: string;

  createdAtMs: number;
  expiresAtMs: number;

  status: ExecutionCommitmentStatus;

  executionStatus: "NOT_AUTHORIZED";

  canExecute: false;
}

/* ============================================================
 * EXTERNAL HUMAN AUTHORIZATION
 * ============================================================ */

export type ExternalHumanAuthorizationStatus =
  | "AWAITING_EXTERNAL_HUMAN"
  | "BLOCKED"
  | "EXPIRED"
  | "CONSUMED";

export interface ExternalHumanAuthorizationHandoff {
  requestId: string;

  intentId: string;
  intentVersion: number;

  proposalId: string;
  proposalDigest: string;

  authorizationAttestationId: string;
  authorizationAttestationDigest: string;

  executionCommitmentId: string;
  executionCommitmentDigest: string;

  chainId: 8453;

  protocol: "THETANUTS";

  maximumSpendUSDC: TokenAmount;

  expectedExpiryMs: number;

  exactPreparationId?: string;

  calldataHash?: string;

  expectedBeneficiary?: string;

  expectedExecutor?: string;

  /**
   * A wallet handoff should only be considered current if it is
   * bound to the latest successful pre-sign revalidation.
   */
  preSignRevalidationId?: string;
  preSignRevalidationDigest?: string;

  createdAtMs: number;
  expiresAtMs: number;

  status: ExternalHumanAuthorizationStatus;

  executionStatus: "NOT_AUTHORIZED";

  canExecute: false;

  disclosure: string;
}

/* ============================================================
 * AUDIT RECEIPT
 * ============================================================ */

export interface AuditReceipt {
  receiptId: string;
  receiptDigest: string;

  intentId: string;
  intentVersion: number;

  confirmedAtMs?: number;

  intentDigest: string;

  marketEvidenceTimestampMs?: number;
  marketEvidenceStatus?: MarketEvidenceStatus;

  selectedStrategyId?: string;

  policyDecisionIds: string[];

  financialConstitutionStatus:
  | "PASS"
  | "FAIL"
  | "INCOMPLETE"
  | "NOT_AVAILABLE";

  proposalId?: string;
  proposalDigest?: string;

  simulationId?: string;
  simulationStatus?: SimulationResult["status"];

  humanReviewId?: string;

  authorizationAttestationId?: string;
  authorizationAttestationDigest?: string;

  executionCommitmentId?: string;
  executionCommitmentDigest?: string;

  externalAuthorizationHandoffId?: string;

  externalAuthorizationHandoffStatus?:
  ExternalHumanAuthorizationStatus;

  marketSnapshotDigest?: string;

  candidateDigest?: string;

  exactPreparationId?: string;
  exactPreparationDigest?: string;

  preSignRevalidationId?: string;
  preSignRevalidationDigest?: string;
  preSignRevalidationStatus?: PreSignRevalidationStatus;

  calldataHash?: string;

  transactionHash?: string;

  blockNumber?: number;
  blockHash?: string;

  protocolLogIndex?: number;

  executionVerificationId?: string;

  executionVerificationStatus?:
  ExecutionVerificationStatus;

  positionAddress?: string;

  finalExecutionStatus:
  | "NOT_AUTHORIZED"
  | "EXTERNAL_EXECUTION_OBSERVED"
  | "ON_CHAIN_VERIFIED"
  | "MISMATCH"
  | "REVERTED"
  | "INSUFFICIENT_EVIDENCE";

  createdAtMs: number;
}

/* ============================================================
 * SIMPLE MODE / DISCOVERY
 * ============================================================ */

export type ProductEntryMode =
  | "SIMPLE"
  | "ADVANCED";

export interface FactualGroundingCheck {
  field:
  | "ASSET"
  | "EXPOSURE_AMOUNT"
  | "HORIZON"
  | "CONCERN";

  value: string;

  evidenceText?: string;

  grounded: boolean;

  source: FieldProvenanceSource;

  requiresConfirmation: boolean;

  details: string;
}

export interface ProtectionSituation {
  asset:
  | FieldProvenance<string>
  | null;

  exposureAmount:
  | FieldProvenance<TokenAmount>
  | null;

  horizonTimestamp:
  | FieldProvenance<HorizonTarget>
  | null;

  concern:
  FieldProvenance<"PRICE_FALL">;

  missingFactualFields: string[];

  /**
   * AI output is treated only as an untrusted draft.
   * These checks record whether extracted facts are grounded
   * in the original user statement.
   */
  groundingChecks?: FactualGroundingCheck[];

  providerMetadata?: LLMProviderMetadata;

  originalPromptText?: string;
}

/* ============================================================
 * MARKET SNAPSHOT EVIDENCE
 * ============================================================ */

export interface MarketSnapshotEvidence {
  snapshotId: string;
  snapshotDigest: string;

  chainId: 8453;

  status: MarketStatus;

  source:
  | "THETANUTS_OPTIONBOOK_API"
  | "CONTROLLED_TEST_SNAPSHOT";

  capturedAtMs: number;

  spotPrice: TokenAmount | null;

  rawOrderCount: number;
  eligibleOrderCount: number;
  rejectedOrderCount: number;

  quotes: MarketQuote[];

  rejectionReasons: Array<{
    orderReference: string;
    reasons: string[];
  }>;

  error?: string;
}

/* ============================================================
 * DISCOVERY FRONTIER
 * ============================================================ */

export type DiscoveryChoiceLabel =
  | "LOWER_COST"
  | "MID_RANGE_TRADE_OFF"
  | "STRONGER_MODELED_PROTECTION";

export interface DiscoveryCandidate {
  candidateId: string;

  quoteId: string;

  strategyType: "LONG_PUT";

  asset: string;

  quantity: TokenAmount;

  coveredExposure: TokenAmount;

  verifiedBuyerSpend: TokenAmount;

  buyerSpendStatus: "VERIFIED";

  feeStatus: FeeStatus;

  modeledAtExpiryDownside: {
    /**
     * Display only.
     * Never use this rounded value for authoritative policy.
     */
    displayPercent: number;

    /**
     * Authoritative exact rational evidence.
     */
    maxLossValuePrice8: string;
    exposureValuePrice8: string;
  };

  strike: TokenAmount;

  expiryTimestampMs: number;

  maxFillableQuantity: TokenAmount;

  marketSnapshotId: string;
  marketSnapshotDigest: string;

  candidateDigest: string;

  labels: DiscoveryChoiceLabel[];
}

export type DiscoveryOutcomeStatus =
  | "FEASIBLE_MARKET_TRADE_OFFS"
  | "VERIFIED_EMPTY_ORDERBOOK"
  | "PRECISE_INFEASIBILITY"
  | "LIVE_MARKET_UNAVAILABLE";

export interface ProtectionDiscoveryResult {
  discoveryId: string;
  discoveryDigest: string;

  situation: ProtectionSituation;

  marketSnapshot: MarketSnapshotEvidence;

  status: DiscoveryOutcomeStatus;

  paretoFrontier: DiscoveryCandidate[];

  excludedCandidateCount: number;

  deterministicRule: string;

  explanation: string;

  /**
   * Optional no-dead-end alternatives calculated from deterministic
   * feasibility boundaries. They remain proposals until explicitly
   * selected by the user.
   */
  proposedAlternatives?: ProposedIntentAlternative[];
}

/* ============================================================
 * NO-DEAD-END ALTERNATIVES
 * ============================================================ */

export interface ProposedIntentAlternative {
  alternativeId: string;

  sourceCandidateId: string;

  sourceCandidateDigest?: string;

  sourceSnapshotId: string;

  sourceSnapshotDigest?: string;

  sourceIntentId?: string;
  sourceIntentVersion?: number;

  status:
  "PROPOSED_ALTERNATIVE";

  dimension:
  | "MAX_PREMIUM_USDC"
  | "TARGET_MAX_LOSS_PERCENT"
  | "HORIZON";

  currentValue: string;

  proposedValue: string;

  delta: string;

  explanation: string;

  alternativeDigest: string;
}

/* ============================================================
 * EXACT UNSIGNED TRANSACTION PREPARATION
 * ============================================================ */

export interface ExactUnsignedTransaction {
  status:
  "EXACT_TRANSACTION_PREPARED";

  chainId: 8453;

  to: string;

  data: string;

  value: string;

  action:
  "OPTIONBOOK_FILL_ORDER";

  functionSelector: string;

  calldataHash: string;

  semanticDigest: string;

  /**
   * Address that receives/owns the resulting option position.
   */
  expectedBeneficiary: string;

  /**
   * Address expected to submit the transaction.
   * Current direct-wallet mode normally uses the same address
   * as expectedBeneficiary.
   */
  expectedExecutor?: string;

  referrer: string;

  maxTotalSpendUSDC: TokenAmount;

  exactBuyerSpendUSDC: TokenAmount;

  buyerSpendStatus?: BuyerSpendStatus;

  buyerSpendVerificationMode?: BuyerSpendVerificationMode;

  feeStatus?: FeeStatus;

  /**
   * Canonical protocol factory expected to have created the
   * resulting option contract.
   */
  canonicalOptionFactory?: string;

  order: {
    maker: string;

    signature: string;

    nonce: string;

    /**
     * These values must come from actual verified order evidence,
     * not from the desired strategy.
     */
    isLong: true;

    implementation: string;

    strikes: string[];

    isCall: false;

    expiry: string;

    orderExpiryTimestamp: string;

    priceFeed: string;

    collateral: string;

    maxCollateralUsable: string;

    price: string;

    /**
     * OptionBook order quantity, historically represented in
     * 6-decimal contract units by the installed SDK.
     */
    numContracts: string;

    numContractsDecimals?: 6;

    /**
     * Derived 18-decimal quantity evidence where needed for
     * option-contract/token-level verification.
     */
    expectedOptionQuantity18?: string;

    extraOptionData: string;
  };

  preparedAtMs: number;

  validUntilMs: number;
}

/* ============================================================
 * PRE-SIGN REVALIDATION
 * ============================================================ */

export type PreSignRevalidationStatus =
  | "NOT_CHECKED"
  | "REVALIDATED"
  | "INVALIDATED"
  | "MARKET_UNAVAILABLE"
  | "ORDER_NOT_FOUND"
  | "ORDER_EXPIRED"
  | "LIQUIDITY_CHANGED"
  | "PRICE_CHANGED"
  | "COST_EXCEEDS_LIMIT"
  | "EVIDENCE_MISMATCH";

export interface PreSignRevalidationCheck {
  check:
  | "CHAIN"
  | "ORDER_IDENTITY"
  | "ORDER_SIGNATURE"
  | "ORDER_DIRECTION"
  | "ORDER_STRUCTURE"
  | "ORDER_DEADLINE"
  | "OPTION_EXPIRY"
  | "MAKER"
  | "IMPLEMENTATION"
  | "STRIKES"
  | "PRICE_FEED"
  | "COLLATERAL"
  | "AVAILABLE_CAPACITY"
  | "REQUESTED_QUANTITY"
  | "BUYER_SPEND"
  | "MAX_SPEND"
  | "CALLDATA"
  | "SEMANTIC_DIGEST";

  passed: boolean;

  details: string;
}

export interface PreSignRevalidationRecord {
  revalidationId: string;
  revalidationDigest: string;

  preparationId: string;
  preparationDigest: string;

  intentId: string;
  intentVersion: number;

  proposalId: string;
  proposalDigest: string;

  boundQuoteId: string;

  candidateDigest: string;

  originalMarketSnapshotDigest: string;

  refreshedMarketSnapshotId?: string;
  refreshedMarketSnapshotDigest?: string;

  checkedAtMs: number;

  status: PreSignRevalidationStatus;

  refreshedBuyerSpendUSDC?: TokenAmount;

  refreshedMaxFillableQuantity?: TokenAmount;

  checks: PreSignRevalidationCheck[];

  blockers: string[];

  /**
   * True only when every material execution input is still valid
   * for the exact prepared action.
   */
  mayProceedToExternalAuthorization: boolean;

  explanation: string;
}

export interface ExecutionPreparation {
  preparationId: string;
  preparationDigest: string;

  intentId: string;
  intentVersion: number;

  proposalId: string;
  proposalDigest: string;

  /**
   * Strategy/candidate bindings.
   */
  strategyId?: string;
  boundQuoteId?: string;

  marketSnapshotId?: string;
  marketSnapshotDigest: string;

  candidateDigest: string;

  intentDigest: string;

  /**
   * Runtime preparation will require a PASS policy decision.
   * Kept optional at the type level for legacy persisted fixtures.
   */
  policyDecisionDigest?: string;

  previewEvidenceDigest: string;

  transaction: ExactUnsignedTransaction;

  status:
  | "EXACT_TRANSACTION_PREPARED"
  | "REVALIDATION_REQUIRED"
  | "INVALIDATED"
  | "EXPIRED";

  invalidationReason?: string;

  latestPreSignRevalidation?: PreSignRevalidationRecord;

  createdAtMs: number;
}

/* ============================================================
 * ON-CHAIN EXECUTION EVIDENCE
 * ============================================================ */

export type ExecutionVerificationStatus =
  | "PENDING_CONFIRMATIONS"
  | "EXECUTION_OBSERVED"
  | "EXECUTION_VERIFIED"
  | "POSITION_CONFIRMED"
  | "MISMATCH"
  | "REVERTED"
  | "REORGED_OR_UNSTABLE"
  | "INSUFFICIENT_EVIDENCE";

export interface ProtocolEventEvidence {
  transactionHash: string;

  blockNumber: number;

  blockHash: string;

  logIndex: number;

  nonce: string;

  buyer: string;

  seller: string;

  optionAddress: string;

  premiumAmount: string;

  feeCollected: string;

  referrer: string;

  referralFeePaid: string;

  sellerWasMaker: boolean;
}

export interface PositionEvidence {
  optionAddress: string;

  bytecodePresent: boolean;

  buyer: string;

  seller: string;

  /**
   * Raw option type value returned by the option contract.
   */
  optionType: string;

  /**
   * Normalized interpretation where it can be proven.
   */
  normalizedOptionType?: OptionRight;

  implementation: string;

  strikes: string[];

  expiryTimestamp: string;

  priceFeed: string;

  collateralToken: string;

  numContracts: string;

  collateralAmount: string;

  factory: string;

  checks: Array<{
    field: string;
    passed: boolean;
    details: string;
  }>;
}

export interface ExecutionVerificationRecord {
  verificationId: string;
  verificationDigest: string;

  preparationId: string;

  transactionHash: string;

  chainId: 8453;

  status: ExecutionVerificationStatus;

  confirmations: number;
  requiredConfirmations: number;

  checkedAtMs: number;

  checks: Array<{
    check: string;
    passed: boolean;
    details: string;
  }>;

  protocolEvent?: ProtocolEventEvidence;

  position?: PositionEvidence;

  explanation: string;
}
