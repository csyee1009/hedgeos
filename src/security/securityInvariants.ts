/**
 * Canonical Security Invariants Specification for HedgeOS
 *
 * These 20 non-negotiable security invariants guarantee that HedgeOS
 * fails closed under all adversarial, malformed, or ambiguous conditions.
 */

export interface SecurityInvariantDefinition {
  id: string;
  name: string;
  category: "AUTHORITY" | "DATA_INTEGRITY" | "FINANCIAL_SAFETY" | "EXECUTION_BOUNDARY" | "SECRETS";
  description: string;
  enforcementMechanism: string;
  failClosedBehavior: string;
}

export const SECURITY_INVARIANTS: Record<string, SecurityInvariantDefinition> = {
  "SEC-001": {
    id: "SEC-001",
    name: "LLM Cannot Confirm Intent",
    category: "AUTHORITY",
    description: "The AI intent parser can never produce a confirmed intent (confirmedByUser is strictly hardcoded to false).",
    enforcementMechanism: "LLMOutputValidator hardcodes draft.confirmedByUser = false regardless of LLM output or user injection.",
    failClosedBehavior: "Intent remains an unconfirmed draft requiring server-owned confirmation endpoint call.",
  },
  "SEC-002": {
    id: "SEC-002",
    name: "LLM Cannot Authorize Execution",
    category: "AUTHORITY",
    description: "The AI cannot grant execution authorization or emit execution tokens/signatures.",
    enforcementMechanism: "Strict Zod output schema strips any injected authorization fields; executionStatus is strictly server-owned.",
    failClosedBehavior: "Execution status is permanently locked to NOT_AUTHORIZED.",
  },
  "SEC-003": {
    id: "SEC-003",
    name: "LLM Cannot Modify Protocol Whitelist",
    category: "AUTHORITY",
    description: "The AI cannot alter protocol whitelist permissions (allowedProtocols is strictly server-governed).",
    enforcementMechanism: "Financial Constitution POL-003 enforces strict protocol whitelist matching independently of AI output.",
    failClosedBehavior: "Candidate strategies proposing unauthorized protocols fail with POL-003 REJECT.",
  },
  "SEC-004": {
    id: "SEC-004",
    name: "Missing Financial Values Remain Unresolved",
    category: "DATA_INTEGRITY",
    description: "Genuinely missing financial parameters remain null; the system never invents fake defaults.",
    enforcementMechanism: "LLMOutputValidator and DecimalParser preserve null for missing fields without fallback hallucination.",
    failClosedBehavior: "Intent cannot be confirmed until the user explicitly resolves missing parameters.",
  },
  "SEC-005": {
    id: "SEC-005",
    name: "Unknown Prices/Fees Never Become Zero",
    category: "FINANCIAL_SAFETY",
    description: "If option price, fee, or spot price is unknown or unavailable, it is never treated as zero.",
    enforcementMechanism: "FeeStatus must be explicitly ZERO_VERIFIED; unpriced RFQ quotes are kept unpriced; spot <= 0 fails evaluation.",
    failClosedBehavior: "Financial checks enter NOT_EVALUATED and overall status is INCOMPLETE/FAIL.",
  },
  "SEC-006": {
    id: "SEC-006",
    name: "Failed Market Reads Never Become Fabricated Live Data",
    category: "DATA_INTEGRITY",
    description: "When RPC/indexer calls fail or time out, market state is honestly marked failed/unavailable.",
    enforcementMechanism: "ThetanutsMarketService catches errors and sets status = LIVE_READ_FAILED; spot price remains 0.",
    failClosedBehavior: "UI displays 'Market Unavailable' and candidate ranking is halted.",
  },
  "SEC-007": {
    id: "SEC-007",
    name: "Only Confirmed Intent Reaches Financial Solving",
    category: "AUTHORITY",
    description: "The financial solver and simulation pipeline reject any unconfirmed draft intent.",
    enforcementMechanism: "Server endpoint POST /api/v1/intents/:id/solve enforces intent.confirmedByUser === true.",
    failClosedBehavior: "Returns HTTP 400 'Cannot solve protection for unconfirmed intent'.",
  },
  "SEC-008": {
    id: "SEC-008",
    name: "Edited Intent Invalidates Confirmation and Bound Proposal",
    category: "STATE_INTEGRITY" as any,
    description: "Any material edit to an intent immediately resets confirmedByUser to false and increments version.",
    enforcementMechanism: "PATCH /api/v1/intents/:id resets confirmedByUser = false and version += 1 upon any parameter modification.",
    failClosedBehavior: "Previous proposals, simulations, and review records become invalid.",
  },
  "SEC-009": {
    id: "SEC-009",
    name: "Stale Market Evidence Cannot Become Review-Ready",
    category: "FINANCIAL_SAFETY",
    description: "Market evidence older than 60 seconds is marked STALE and cannot be presented for human review.",
    enforcementMechanism: "ThetanutsSimulationService checks evidence age and assigns marketEvidenceStatus = STALE.",
    failClosedBehavior: "HumanReviewService marks reviewStatus = NOT_PRESENTED.",
  },
  "SEC-010": {
    id: "SEC-010",
    name: "Failed Preview/Simulation Cannot Become Successful",
    category: "FINANCIAL_SAFETY",
    description: "If read-only simulation or preview fails, the proposal cannot proceed to review.",
    enforcementMechanism: "HumanReviewService requires simulationResult.status === 'DETERMINISTIC_VERIFIED' or 'PROVIDER_SIMULATED'.",
    failClosedBehavior: "Review status is set to NOT_PRESENTED.",
  },
  "SEC-011": {
    id: "SEC-011",
    name: "Budget Violations Cannot Be Ranked/Reviewed as Eligible",
    category: "FINANCIAL_SAFETY",
    description: "Any strategy with total cost exceeding user max premium budget is rejected.",
    enforcementMechanism: "Financial Constitution POL-001 enforces expectedTotalCost <= maxPremiumUSDC via BigInt base units.",
    failClosedBehavior: "Candidate is rejected with REASON_BUDGET_EXCEEDED and excluded from ranking.",
  },
  "SEC-012": {
    id: "SEC-012",
    name: "Protection-Target Violations Cannot Be Ranked as Eligible",
    category: "FINANCIAL_SAFETY",
    description: "Any strategy failing to provide the requested downside floor is rejected.",
    enforcementMechanism: "Financial Constitution POL-009 validates effective downside against targetMaxLossPercent.",
    failClosedBehavior: "Candidate is rejected with REASON_PROTECTION_TARGET_NOT_MET.",
  },
  "SEC-013": {
    id: "SEC-013",
    name: "RFQ Unpriced State Cannot PASS Budget/Protection Policy",
    category: "FINANCIAL_SAFETY",
    description: "Unpriced RFQ specifications cannot be evaluated as passing financial policy before sealed bids are received.",
    enforcementMechanism: "Financial Constitution sets POL-001 and POL-009 to NOT_EVALUATED in RFQ_SPECIFICATION stage.",
    failClosedBehavior: "Overall policy status is INCOMPLETE; passedAllInvariants is false.",
  },
  "SEC-014": {
    id: "SEC-014",
    name: "Put Spread Remains Blocked Until Defensible Policy Exists",
    category: "FINANCIAL_SAFETY",
    description: "Put Spread strategies remain strictly blocked across OptionBook and RFQ pipelines.",
    enforcementMechanism: "ProtectionSolverEngine and RFQSpecificationBuilder enforce BLOCKED_PENDING_STRIKE_SELECTION_POLICY.",
    failClosedBehavior: "System falls back to Long Put RFQ specification with explicit rationale.",
  },
  "SEC-015": {
    id: "SEC-015",
    name: "No Wallet / Private Key / Signing / Broadcast Path Exists",
    category: "EXECUTION_BOUNDARY",
    description: "No private keys, wallet connection libraries, or transaction broadcasting routines are loaded.",
    enforcementMechanism: "Codebase audit verifies zero loaded signers, zero wallet connectors, and zero broadcast methods.",
    failClosedBehavior: "Runtime execution is physically impossible.",
  },
  "SEC-016": {
    id: "SEC-016",
    name: "Human Review Does Not Authorize Execution",
    category: "EXECUTION_BOUNDARY",
    description: "Human review produces an informational record only; executionStatus is strictly NOT_AUTHORIZED.",
    enforcementMechanism: "HumanReviewService hardcodes executionStatus = 'NOT_AUTHORIZED' and requiredAction = 'ELIGIBLE_HUMAN_REQUIRED'.",
    failClosedBehavior: "No execution triggers or submission handlers exist in UI or backend.",
  },
  "SEC-017": {
    id: "SEC-017",
    name: "PREVIEW_BOUND Is Never Presented as Exact Execution Guarantee",
    category: "EXECUTION_BOUNDARY",
    description: "OptionBook proposals are labeled PREVIEW_BOUND to indicate they are read-only previews subject to TOCTOU.",
    enforcementMechanism: "ActionProposal.bindingStatus is strictly 'PREVIEW_BOUND' with explicit TOCTOU disclosure.",
    failClosedBehavior: "UI displays clear warning that on-chain maker collateral may change before execution.",
  },
  "SEC-018": {
    id: "SEC-018",
    name: "Unknown Protocol Evidence Cannot PASS by Fallback",
    category: "DATA_INTEGRITY",
    description: "If underlying asset or protocol provenance cannot be verified against live metadata, check fails.",
    enforcementMechanism: "Financial Constitution POL-002 and POL-003 reject candidates lacking verifiable asset/protocol provenance.",
    failClosedBehavior: "Candidate is rejected with POL-002/POL-003 FAIL.",
  },
  "SEC-019": {
    id: "SEC-019",
    name: "Exact Monetary Comparisons Use BigInt Base Units",
    category: "FINANCIAL_SAFETY",
    description: "All monetary and sizing comparisons are performed using exact 18-decimal and 6-decimal BigInt integers.",
    enforcementMechanism: "DecimalParser and FinancialConstitutionEngine utilize BigInt arithmetic for all <= and >= comparisons.",
    failClosedBehavior: "Eliminates floating-point precision loss and rounding attacks.",
  },
  "SEC-020": {
    id: "SEC-020",
    name: "Provider Secrets Are Never Exposed to Public Responses",
    category: "SECRETS",
    description: "API keys, authorization headers, and raw model responses are stripped from public responses and client bundles.",
    enforcementMechanism: "Public endpoints redact secrets; Vite client config excludes process.env server credentials.",
    failClosedBehavior: "Zero credential leakage in client bundles, network responses, or error logs.",
  },
};
