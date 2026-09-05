export type RiskObjective = "DOWNSIDE_PROTECTION";

export type FieldProvenanceSource = "USER_EXPLICIT" | "AI_INFERRED" | "PARSER_INFERRED" | "SYSTEM_DEFAULT";

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

export type LLMProviderType = "REAL_LLM" | "DEVELOPMENT_ADAPTER" | "MOCK_EVALUATION";

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

export type QuoteSourceType = "OPTION_BOOK" | "RFQ_OPTION_FACTORY";
export type OptionRight = "PUT" | "CALL";
export type LegSide = "BUY" | "SELL";
export type StrategyType = "LONG_PUT" | "PUT_SPREAD";
export type SizingStatus = "NOT_RESOLVED" | "RESOLVED";

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

export type PolicyCheckStatus = "PASS" | "FAIL" | "NOT_EVALUATED";
export type PolicyDecisionStatus = "PASS" | "FAIL" | "INCOMPLETE";
export type PolicyEvaluationStage = "ANALYSIS" | "EXECUTION" | "RFQ_SPECIFICATION";
export type FeeStatus = "AVAILABLE" | "ZERO_VERIFIED" | "NOT_AVAILABLE";

export interface PremiumPreview {
  previewStatus: "PREVIEW_AVAILABLE" | "PREVIEW_FAILED";
  pricePerContract: TokenAmount; // 8 decimals USD
  premiumAmount: TokenAmount; // USDC 6 decimals
  protocolFee: TokenAmount; // USDC 6 decimals
  referrerFee: TokenAmount; // USDC 6 decimals
  totalExpectedCost: TokenAmount; // USDC 6 decimals
  feeStatus: FeeStatus;
  collateralToken: string;
  previewTimestampMs: number;
  previewSource: "THETANUTS_OPTIONBOOK_PREVIEW" | "THETANUTS_MM_PRICING";
  rawPreviewData?: Record<string, any>;
  error?: string;
}

export interface ScenarioPayoffPoint {
  spotPriceScenarioUSD: number;
  scenarioLabel: string;
  portfolioValueUSD: number;
  pnlUSD: number;
  pnlPercent: number;
}

export interface AtExpiryPayoffSummary {
  status: "INTERFACE_ONLY" | "CALCULATED" | "NOT_AVAILABLE";
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
  scoresStatus: "NOT_AVAILABLE" | "EVALUATED";
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
  payoffSummary?: AtExpiryPayoffSummary | {
    status: "INTERFACE_ONLY" | "CALCULATED" | "NOT_AVAILABLE";
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

export type BindingStatus = "NOT_BOUND" | "PREVIEW_BOUND" | "EXACT_TRANSACTION_BOUND";

export type ActionProposalStatus =
  | "PREPARED"
  | "INCOMPLETE"
  | "INVALIDATED"
  | "SIMULATION_REQUIRED"
  | "SIMULATED"
  | "REVIEW_REQUIRED"
  | "ELIGIBLE_HUMAN_AUTHORIZATION_REQUIRED";

export type MarketEvidenceStatus = "FRESH" | "STALE" | "UNAVAILABLE";

export interface ActionProposal {
  proposalId: string;
  intentId: string;
  intentVersion: number;
  strategyId: string;
  protocol: "THETANUTS";
  chainId: number;
  actionType: "OPTIONBOOK_FILL_ORDER" | "REQUEST_FOR_QUOTATION";
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
  expectedExpiryMs: number;
  boundQuoteId?: string;
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
  simulationMethod: "THETANUTS_OPTIONBOOK_PREVIEW" | "READ_ONLY_ETH_CALL" | "DETERMINISTIC_VERIFICATION" | "NONE";
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
  reviewStatus: "NOT_PRESENTED" | "READY_FOR_REVIEW" | "REVIEWED" | "ELIGIBLE_HUMAN_AUTHORIZATION_REQUIRED";
  executionStatus: "NOT_AUTHORIZED";
  warnings: string[];
  summary: HumanReviewSummary;
  toctouDisclosure: string;
}

export type MarketStatus =
  | "NOT_CONFIGURED"
  | "CONNECTING"
  | "LIVE_READ_AVAILABLE"
  | "LIVE_READ_FAILED"
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
 * PROMPT 4 RFQ DOMAIN CONCEPTS & LIFECYCLE TYPES
 * ============================================================ */

export type RFQRequirementStatus = "NOT_REQUIRED" | "REQUIRED" | "UNSUPPORTED" | "INCOMPLETE";

export type RFQReasonCode =
  | "NO_MATCHING_EXPIRY"
  | "NO_MATCHING_STRIKE"
  | "INSUFFICIENT_LIQUIDITY"
  | "BUDGET_NOT_SATISFIED"
  | "PROTECTION_TARGET_NOT_SATISFIED"
  | "ATOMIC_STRUCTURE_NOT_AVAILABLE"
  | "NO_QUALIFYING_OPTIONBOOK_ORDERS";

export type RFQValidationStatus = "VALID" | "INVALID" | "INCOMPLETE";

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
  strikeDerivationStatus: "TARGET_STRIKE_ESTIMATE";
  pricingStatus: "PENDING_RFQ_PRICING_REFINEMENT";
  strikeDerivationMethod: string;
  expiryTimestampMs: number;
  expiryFormatted: string;
  offerDeadlineMinutes: number;
  offerDeadlineRationale: "PRODUCT_SELECTED_DEFAULT_REQUIRES_USER_REVIEW";
  requestedContracts: TokenAmount;
  settlementType: "CASH";
  collateralAsset: string;
  collateralDecimals: number;
  sourceReasons: RFQReasonCode[];
  createdAtMs: number;
  validationStatus: RFQValidationStatus;
  validationErrors: string[];
  putSpreadStatus?: "SPECIFICATION_READY" | "BLOCKED_PENDING_STRIKE_SELECTION_POLICY";
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
  quoteStatus: "ACTIVE" | "EXPIRED";
  premium: TokenAmount;
  feeStatus: FeeStatus;
  totalExpectedCost: TokenAmount;
  expiryTimestampMs: number;
  strategyMetadata: Record<string, any>;
  source: "THETANUTS_OPTIONFACTORY_RFQ";
  timestampMs: number;
}

export type RFQQuote = PendingRevealRFQQuote | RevealedRFQQuote;

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
  mode: "OPTIONBOOK_AVAILABLE" | "RFQ_REQUIRED";
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
  policyDecisions: Record<string, PolicyDecisionRecord>;
  marketState?: MarketStateRecord;
}

export type PortfolioSource = "PUBLIC_BASE_ADDRESS" | "MANUAL";

export interface PortfolioTokenBalance {
  asset: "ETH" | "WETH" | "BTC" | "CBBTC" | "USDC";
  displaySymbol: string;
  amountBaseUnits: string;
  decimals: number;
  formattedAmount: string;
  tokenAddress?: string;
  source: "BASE_MAINNET_READ";
}

export interface ReadOnlyPortfolioSnapshot {
  address: string;
  chainId: 8453;
  capturedAtMs: number;
  balances: PortfolioTokenBalance[];
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  warnings: string[];
}

export type AuthorizationAttestationStatus =
  | "REJECTED"
  | "SCOPE_ATTESTED_PREVIEW_ONLY"
  | "EXTERNAL_AUTHORIZATION_ELIGIBLE";

export interface BoundedAuthorizationScope {
  chainId: 8453;
  protocol: "THETANUTS";
  actionType: "OPTIONBOOK_FILL_ORDER";
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

export type ExecutionCommitmentStatus =
  | "PROPOSAL_BOUND"
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

  createdAtMs: number;
  expiresAtMs: number;

  status: ExecutionCommitmentStatus;

  executionStatus: "NOT_AUTHORIZED";
  canExecute: false;
}

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

  createdAtMs: number;
  expiresAtMs: number;

  status: ExternalHumanAuthorizationStatus;

  executionStatus: "NOT_AUTHORIZED";
  canExecute: false;

  disclosure: string;
}

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
  externalAuthorizationHandoffStatus?: ExternalHumanAuthorizationStatus;

  finalExecutionStatus: "NOT_AUTHORIZED";

  createdAtMs: number;
}


