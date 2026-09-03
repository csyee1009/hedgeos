# Protection Solver Engine Architecture

---

## 1. Separation of Responsibilities & Pipeline Flow

The Protection Solver operates exclusively on **Technical & Mathematical Feasibility**. It DOES NOT duplicate user financial/budget policy checks, which are strictly owned by `FinancialConstitutionEngine`.

```
Candidate Quotes
       │
       ▼
┌──────────────────────────────────────────────┐
│ Stage 1: ProtectionSolverEngine              │
│ (Technical Feasibility Filter)               │
│   • Valid Option Legs Structure              │
│   • Executable Quote Status                  │
│   • Non-Expired Timestamp                    │
│   • Non-Zero Orderbook Liquidity             │
└──────────────────────┬───────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
[ Technically Feasible ]     [ Technical Rejections ]
         │
         ▼
┌──────────────────────────────────────────────┐
│ Stage 2: FinancialConstitutionEngine         │
│ (Single Source of Truth for Policy)          │
│   • POL-001: Max Premium Budget              │
│   • POL-002: Asset Match                     │
│   • POL-003: Allowed Protocols Whitelist     │
│   • POL-004: Approval Security               │
│   • POL-005: User Confirmation Requirement   │
│   • POL-006: Horizon Policy                  │
└──────────────────────┬───────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
[ Policy Compliant ]         [ Policy Rejections ]
         │
         ▼
┌──────────────────────────────────────────────┐
│ Stage 3: Candidate Ranking                   │
│   • Coverage Score                           │
│   • Cost Efficiency Score                    │
│   • Executable Liquidity Score               │
│   • Intent Fit Score                         │
└──────────────────────────────────────────────┘
```

---

## 2. Multi-Leg Option Strategy Model

Option strategies must NOT be represented as a single quote pretending to be a single vanilla option.

- **OptionRight**: `PUT` | `CALL`
- **LegSide**: `BUY` | `SELL`
- **StrategyType**: `LONG_PUT` | `LONG_CALL` | `PUT_SPREAD` | `CALL_SPREAD`

Every candidate strategy contains a `legs: OptionLeg[]` array:

```typescript
export interface OptionLeg {
  side: LegSide;
  right: OptionRight;
  strikeBaseUnits: string;
  expiryTimestamp: number;
  quantityBaseUnits: string;
  quoteReference?: string;
}
```

A `PUT_SPREAD` strategy contains two explicit legs:
1. `BUY PUT` at Strike A (Higher strike)
2. `SELL PUT` at Strike B (Lower strike)

---

## 3. Exposure & Payoff Calculation

Payoff calculations are decoupled from the solver into `ExposurePayoffEngine`. In Phase 0, the status is set to `INTERFACE_ONLY`. No fabricated max-loss percentages or arbitrary reference prices are hardcoded in solver logic.
