# Prompt 4: RFQ Fallback & Custom Quote Workflow

## Overview
HedgeOS Prompt 4 extends the protocol integration pipeline from the existing OptionBook solver to a robust, deterministic Request-for-Quotation (RFQ) fallback workflow. When live OptionBook maker liquidity cannot satisfy a user's protection objective (e.g. strike unavailable, horizon mismatch, budget limit exceeded, or custom multi-leg structure required), HedgeOS triggers the `RFQRequirementEngine`, constructs an unsubmitted `RFQSpecification` via `RFQSpecificationBuilder`, and sets up an unauthorized `PreparedActionProposal` boundary.

---

## Architecture & Pipeline

```
Confirmed TypedRiskIntent
        ↓
OptionBook Candidate Evaluation (Long Put)
        ↓
    Eligible candidate exists?
        ├── YES ──> OPTIONBOOK_AVAILABLE ──> Ranked candidate cards
        └── NO  ──> OPTIONBOOK_INSUFFICIENT
                    ↓
            RFQRequirementEngine (Deterministic Reason Codes)
                    ↓
            RFQSpecificationBuilder
                    ├── Strike Derivation: spotPrice * (1 - targetMaxLossPercent/100)
                    ├── Expiry Horizon: Verified Protocol Bounds
                    ├── Option Sizing: Reused Delta-1 BigInt Adapter
                    └── Native Put Spread: 2-Strike Atomic RFQ (if allowMultiLeg = true)
                    ↓
            Financial Constitution (Stage: RFQ_SPECIFICATION)
                    ├── Non-pricing invariants: PASS
                    └── Pricing-dependent rules: NOT_EVALUATED
                    ↓
            PreparedActionProposal Boundary (UNAUTHORIZED / NOT_SUBMITTED)
```

---

## RFQ Domain Concepts & Lifecycle

### 1. RFQ Reason Codes
- `NO_MATCHING_EXPIRY`: Orderbook expiries precede requested protection horizon.
- `NO_MATCHING_STRIKE`: No orderbook strike satisfies the target downside floor.
- `INSUFFICIENT_LIQUIDITY`: Orderbook available collateral cannot fill the requested exposure.
- `BUDGET_NOT_SATISFIED`: Orderbook premium costs exceed user's confirmed maximum budget.
- `PROTECTION_TARGET_NOT_SATISFIED`: Orderbook effective downside exceeds maximum tolerated loss.
- `ATOMIC_STRUCTURE_NOT_AVAILABLE`: User authorized multi-leg protection (Put Spread) requiring atomic OptionFactory contract execution.
- `NO_QUALIFYING_OPTIONBOOK_ORDERS`: Zero orders present for the target asset.

### 2. Strike Derivation
Strike selection is mathematically linked to the user's confirmed downside objective:
- **Long Put Target Strike:**
  $$\text{Target Strike USD} = \text{Spot Price USD} \times \left(1 - \frac{\text{Target Max Loss Percent}}{100}\right)$$
- **Put Spread Target Strikes (if `allowMultiLeg = true`):**
  - Upper Strike: $\text{Spot Price} \times (1 - \text{Target Max Loss Percent}/100)$
  - Lower Strike (Floor): $\text{Spot Price} \times (1 - 2 \times \text{Target Max Loss Percent}/100)$
- Documented Method: `TARGET_STRIKE_ESTIMATE` (pending sealed market maker quotes).

### 3. Sizing & Precision
- Reuses `OptionSizingAdapter.resolveSizing` to prevent duplicate math or rounding discrepancies.
- Computes exact 18-decimal contract quantities.

### 4. Financial Constitution Integration
- In `RFQ_SPECIFICATION` stage:
  - `POL-001` (Budget): `NOT_EVALUATED` (pending sealed market maker pricing).
  - `POL-002` (Asset): `PASS` (verified against whitelist).
  - `POL-003` (Protocol): `PASS` (Thetanuts authorized).
  - `POL-004` (Approval): `NOT_EVALUATED` (execution boundary preserved).
  - `POL-005` (Confirmation): `PASS` (bound to confirmed intent).
  - `POL-006` (Horizon): `PASS` (expiry covers horizon).
  - `POL-007` (Multi-leg): `PASS` (requires `allowMultiLeg = true` for spread).
  - `POL-008` (Sizing): `PASS` (sizing resolved).
  - `POL-009` (Protection Target): `NOT_EVALUATED` (pending quote pricing).

### 5. Strict Execution Boundary
- `PreparedActionProposal` contains:
  - `targetContract`: `0x8118daD971dEbffB49B9280047659174128A8B94` (Thetanuts OptionFactory on Base Mainnet 8453)
  - `requiredMethod`: `requestForQuotation`
  - `authorizationStatus`: `UNAUTHORIZED`
  - `submissionStatus`: `NOT_SUBMITTED`
- Strictly **NO** transaction submission, **NO** signing, **NO** private keys, **NO** wallet connections.

---

## Live Protocol Discovery (Base Mainnet 8453)
- Live on-chain quotation count: `124+` active quotations read via `eth_call`.
- Read-only historical & active RFQ records fetched via `ThetanutsClient.api.getFactoryRfqs()`.
- Verified OptionFactory contract configuration on Base Mainnet.
