# HedgeOS Prompt 3 Implementation Summary: Live Thetanuts Market & Protection Engine

## 1. Architectural Overview & Implemented Pipeline

Prompt 3 establishes the first genuine, protocol-aware protection engine for HedgeOS on Base Mainnet (Chain ID 8453):

```
Confirmed TypedRiskIntent
        ↓
Exposure Analysis (ExposureAnalyzer)
        ↓
Live Thetanuts OptionBook Read (ThetanutsMarketService)
        ↓
Deterministic Underlying Identification (Chainlink PriceFeed / Token Mapping)
        ↓
Candidate Filtering (Side, Unexpired, Positive Liquidity)
        ↓
Verified Option Sizing (OptionSizingAdapter: 1.0 ETH = 1.0 Contract = 10^18 units)
        ↓
Maximum Fill Check (calculateMaxContracts)
        ↓
Read-Only Premium Preview Dry-Run (previewFillOrder)
        ↓
Protective Payoff Analysis (ExposurePayoffEngine: At-Expiry Scenarios)
        ↓
Financial Constitution (FinancialConstitutionEngine: Single Policy Authority)
        ↓
Ranked Feasible Protection Candidates
```

---

## 2. Component Deliverables

### A. Thetanuts Market Service (`src/services/ThetanutsMarketService.ts`)
- **Initialization:** Direct integration with `@thetanuts-finance/thetanuts-client` on Base mainnet (chainId: 8453).
- **Runtime States:** Explicitly exposes `NOT_CONFIGURED`, `CONNECTING`, `LIVE_READ_AVAILABLE`, `LIVE_READ_FAILED`, `RATE_LIMITED`.
- **Deterministic Underlying Resolution:** Maps orders via `order.priceFeed` / `rawApiData.priceFeed` to `client.chainConfig.priceFeeds` (e.g. `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` -> `"ETH"`). Strictly avoids strike-range heuristics.
- **Max-Fill Calculation:** Implements `calculateMaxContracts` utilizing maker available collateral.
- **Read-Only Preview:** Invokes `client.optionBook.previewFillOrder` for gasless dry-run simulations.

### B. Option Sizing Adapter (`src/services/OptionSizingAdapter.ts`)
- Resolves delta-1 spot holding exposure to 18-decimal on-chain option contract quantities (`1.0 ETH = 1.0 contract = 1e18 on-chain units`).
- Marks `sizingStatus: "RESOLVED"` for verified assets (`ETH`, `BTC`), and returns `"NOT_RESOLVED"` for unverified tokens.

### C. Exposure Payoff Engine (`src/services/ExposurePayoffEngine.ts`)
- Implements terminal at-expiry payoff calculation:
  $$\text{PortfolioValue}(S_T) = (S_T \times Q_{\text{spot}}) + \max(0, K - S_T) \times Q_{\text{opt}} - \text{TotalCost}$$
- Generates 7 scenario payoff points (+10%, 0%, -5%, -8%, -15%, -30%, -50%) with clear `AT-EXPIRY ANALYSIS` labeling.

### D. Protection Solver Engine (`src/services/ProtectionSolverEngine.ts`)
- Evaluates live OptionBook quotes against confirmed risk intent.
- Assigns clear technical feasibility statuses (`TECHNICALLY_FEASIBLE`, `LIQUIDITY_INSUFFICIENT`, `EXPIRY_MISMATCH`, `BUDGET_REJECTED`, `PROTECTION_TARGET_NOT_MET`, `SIZING_UNRESOLVED`).
- Implements deterministic, explainable ranking (`Rank #1`, `Rank #2`) based on objective fit and cost efficiency.

### E. Financial Constitution Engine (`src/services/FinancialConstitutionEngine.ts`)
- Serves as the single authoritative policy engine.
- Evaluates POL-001 (Budget Limit via pure BigInt token arithmetic), POL-002 (Asset), POL-003 (Protocol Whitelist), POL-004 (Approval Security), POL-005 (User Confirmation), POL-006 (Protection Horizon), POL-007 (Multi-Leg Authorization), and POL-008 (Sizing & Liquidity).

### F. Frontend & Advanced View
- `CandidateList.tsx` & `CandidateCard.tsx`: Consumer-facing cards with outcome-first metrics ("Protection until", "Estimated cost", "Protected value at expiry", "Effective max downside", "Why this matches your goal").
- `AdvancedJudgeDrawer.tsx`: Full judge/developer inspection drawer with "LIVE THETANUTS DATA" tag, raw-to-normalized trace, policy invariant audit table, and at-expiry payoff scenario table.

---

## 3. Strict Safety & Boundary Enforcements

- **STRICTLY READ-ONLY:** No private keys requested, no wallet connection required, no transactions signed or submitted.
- **PUT SPREAD:** `PUT_SPREAD_RUNTIME = "BLOCKED_PENDING_ATOMIC_MARKET_IMPLEMENTATION"` (strictly forbids synthesizing a fake spread from two separate vanilla orders).
- **RFQ:** Understood as a fallback trigger (`RFQ_REQUIRED`), with live RFQ execution deferred to future prompts.
