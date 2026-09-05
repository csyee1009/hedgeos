# Prompt 6: Pre-Execution Simulation, Proposal Binding, & Human Review Boundary

## Executive Overview
HedgeOS Prompt 6 implements the final pre-execution verification boundary before any financial transaction could be considered:
```
Confirmed TypedRiskIntent (v1)
        ↓
Eligible Candidate (OptionBook / RFQ)
        ↓
Prepared ActionProposal (OptionBook fill order / RFQ spec)
        ↓
Deterministic Proposal Binding (SHA-256 Proposal Digest)
        ↓
Read-Only Simulation (ThetanutsSimulationService / protocol preview / eth_call)
        ↓
Simulation Verification & Parameter Reconciliation
        ↓
Financial Constitution Re-check (Budget + Downside Payoff Target)
        ↓
Human Review Record (HumanReviewRecord + TOCTOU Disclosure)
        ↓
ELIGIBLE_HUMAN_AUTHORIZATION_REQUIRED
        ↓
STOP (Zero transaction broadcast, zero wallet connection, zero signing)
```

---

## 1. Proposal Domain Model & Deterministic Identity
An `ActionProposal` captures the precise, normalized financial action intended to satisfy the user's confirmed risk protection goal.

### Proposal Structure (`ActionProposal`)
- `proposalId`: Unique identifier (e.g. `prop-8f72a1b`)
- `intentId`: Binds to confirmed intent ID
- `intentVersion`: Binds to confirmed intent version (e.g. `1`)
- `strategyId`: Strategy candidate reference
- `protocol`: `"THETANUTS"`
- `chainId`: `8453` (Base Mainnet)
- `actionType`: `"OPTIONBOOK_FILL_ORDER"` or `"REQUEST_FOR_QUOTATION"`
- `targetContract`: Resolved on-chain contract (e.g. OptionBook `0x43063A482dB1DEb8Ecf4177263b652882Fa87431`)
- `normalizedParameters`: Maker address, order index, strike, expiry, contracts
- `expectedAsset`, `expectedOptionRight`, `expectedStrike`, `expectedQuantity`, `expectedPremium`, `expectedFees`, `expectedTotalCost`, `expectedExpiryMs`
- `boundQuoteId`: Binds the specific maker quote
- `proposalDigest`: Deterministic SHA-256 digest of normalized fields
- `proposalStatus`: `"PREPARED"` | `"INCOMPLETE"` | `"INVALIDATED"` | `"SIMULATION_REQUIRED"` | `"SIMULATED"` | `"REVIEW_REQUIRED"` | `"ELIGIBLE_HUMAN_AUTHORIZATION_REQUIRED"`
- `bindingStatus`: `"NOT_BOUND"` | `"PREVIEW_BOUND"` | `"EXACT_TRANSACTION_BOUND"`
- `authorizationStatus`: `"UNAUTHORIZED"` (server-controlled)

### Deterministic Proposal Digest (`ActionProposalBuilder`)
```typescript
const payload = [
  params.intentId,
  params.intentVersion.toString(),
  params.strategyId,
  params.protocol,
  params.chainId.toString(),
  params.actionType,
  params.targetContract.toLowerCase(),
  params.asset.toUpperCase(),
  params.optionRight.toUpperCase(),
  params.strikeBaseUnits,
  params.expiryTimestampMs.toString(),
  params.quantityBaseUnits,
  params.expectedTotalCostBaseUnits,
  params.boundQuoteId || "NONE",
].join(":");

return createHash("sha256").update(payload).digest("hex");
```
*Strict Safety Invariant:* No timestamps, nonces, random IDs, or secrets are included in the digest calculation. Any material change to financial terms or intent versions produces a new digest, invalidating stale proposals.

---

## 2. Read-Only Simulation Service (`ThetanutsSimulationService`)
Pre-execution simulation is performed in a strictly read-only mode without loading signers, private keys, or wallet providers:
- **No Signer / No Wallet:** Never accesses `window.ethereum`, private keys, mnemonics, or broadcast functions.
- **Protocol Preview:** Evaluates fillability, fees, and settlement against Thetanuts OptionBook contracts.
- **Intent Binding Validation:** Verifies that `proposal.intentVersion === intent.version`. If intent was edited, halts simulation with `SIMULATION_MISMATCH`.
- **Market Freshness Enforcement:** Enforces product policy threshold (60 seconds). If market evidence timestamp is older than 60s, returns `STALE`.
- **Exact BigInt Arithmetic:** Monetary comparisons (premium, protocol fees, total expected cost, contract quantities) use native `BigInt` base units to prevent floating-point inaccuracies.
- **Protection Target Re-evaluation:** Payoff analysis is re-run with live simulated cost. If simulated price increases effective downside beyond `targetMaxLossPercent`, simulation fails.
- **RFQ Honesty:** Unsubmitted RFQ specifications return `status: "NOT_AVAILABLE"` with `revertReason: "RFQ_NOT_SUBMITTED_NO_LIVE_QUOTATION"`.

---

## 3. Human Review Record & TOCTOU Disclosure
A `HumanReviewRecord` presents the verified outcome to the user:
- **Review Summary:**
  - Protecting: `2 ETH`
  - Until: `Friday, September 6, 2026`
  - Structure: `Long Put (OptionBook)`
  - Strike: `$2300 USD`
  - Estimated Cost: `9.00 USDC`
  - Modeled Downside: `5.50%`
  - Live Market Check: `Passed (Fresh)`
  - Simulation: `Passed (Verified)`
  - Execution Status: `NOT_AUTHORIZED`
  - Action: `Requires separate eligible human authorization`
- **TOCTOU Disclosure:**
  > *"Time-of-check / time-of-use (TOCTOU) limitation: simulation proves this proposal was valid at simulation time and does not eliminate market movement risk prior to separate authorized execution. Execution requires separate out-of-band transaction submission."*

---

## 4. Financial Constitution Re-Check
During the simulation phase, all non-negotiable policy invariants (`POL-001` through `POL-009`) are re-evaluated:
1. `POL-001`: Total simulated cost <= confirmed user budget (BigInt).
2. `POL-002`: Expiry timestamp >= confirmed protection horizon.
3. `POL-003`: Protocol provenance verified (Thetanuts on Base 8453).
4. `POL-004`: Execution authorization remains `UNAUTHORIZED`.
5. `POL-008`: Sizing exact Delta-1 verified.
6. `POL-009`: Modeled at-expiry downside <= user target max loss %.

---

## 5. Security & Invariant Audit Table
| Property | Implementation | Verification |
| :--- | :--- | :--- |
| **Authority Invariant** | AI proposes, deterministic code verifies, human authorizes | Passed |
| **Execution Path** | No `sendTransaction`, `signTransaction`, or wallet | Verified (Grep scanned: 0 calls) |
| **UI Boundary** | No "Buy", "Trade", "Execute", or "Connect Wallet" buttons | Verified |
| **Exact Arithmetic** | BigInt base-unit comparisons for cost and sizing | Verified |
| **Stale Detection** | Product freshness policy (<60s) flagged honestly | Tested |
| **RFQ Honesty** | Unsubmitted RFQ not simulated as live order | Tested |
