# HedgeOS Golden User Flow & State Transitions

---

## 1. Outcome-First Golden User Flow

```
[ Step 1: Input Outcome ]
User types: "Protect my 2 ETH until Friday. Max downside 8%, budget 3 USDC."
       │
       ▼
[ Step 2: Intent Confirmation ]
System presents structured fields with provenance:
  • Asset: ETH (USER_EXPLICIT)
  • Exposure: 2 ETH (USER_EXPLICIT)
  • Target Loss: 8% (USER_EXPLICIT)
  • Horizon: Fri 23:59 MYT (AI_INFERRED, Confirmed required)
  • Budget: 3 USDC (USER_EXPLICIT)
User clicks: [ Confirm Intent ]
       │
       ▼
[ Step 3: Protection Solver Analysis ]
System queries OptionBook & RFQ quote sources.
Evaluates Hard Constraints & Ranks Candidates:
  • Strategy A (Put Spread): PASS (Rank #1) - Cost 2.7 USDC
  • Strategy B (Out-of-the-Money Put): REJECTED - Premium (5.2 USDC) > Budget (3 USDC)
  • Strategy C (Deep Put): PASS (Rank #2) - Cost 2.9 USDC
       │
       ▼
[ Step 4: Deterministic Policy & Preview ]
Financial Constitution verifies exact parameters.
Displays strategy outcome summary + "See Option Details" progressive disclosure.
Preview Status: PREVIEW_UNAUTHORIZED (Prompt 1 Safety Boundary)
```

---

## 2. Explicit State Transitions

| Current State | Event | Next State | Action / Safeguard |
|---|---|---|---|
| `IDLE` | Submit Natural Language | `INTENT_PARSED` | LLM adapter extracts fields + provenance |
| `INTENT_PARSED` | User edits/confirms | `INTENT_CONFIRMED` | Intent locked with `RiskIntentId` |
| `INTENT_CONFIRMED` | Trigger Solver | `SOLVING_FEASIBILITY` | Fetch OptionBook & RFQ liquidity |
| `SOLVING_FEASIBILITY` | Hard Constraint Filter | `CANDIDATES_EVALUATED` | Rejects invalid candidates with reasons |
| `CANDIDATES_EVALUATED` | Run Policy Checks | `POLICY_VERIFIED` | Generates `PolicyDecisionRecord` |
| `POLICY_VERIFIED` | Generate Preview | `PREVIEW_READY` | Displays preview; status `PREVIEW_UNAUTHORIZED` |
