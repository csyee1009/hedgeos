# HedgeOS Prompt 2 Implementation Document

## Overview & Objective

HedgeOS Prompt 2 implements the complete, real user-facing flow for outcome-first protection intent compilation:

```
LANDING / OUTCOME INPUT
        ↓
INTENT PARSING (Development Adapter)
        ↓
REVIEW WHAT WE UNDERSTOOD & AMBIGUITY RESOLUTION
        ↓
EXPLICIT USER CONFIRMATION
        ↓
CONFIRMED TYPED RISK INTENT (Pipeline Stage Boundary)
```

Prompt 2 adheres strictly to the rule: **"Protect outcomes, not instruments."** It compiles natural language financial requests into user-reviewed and user-confirmed `TypedRiskIntent` schemas, while preserving all Phase 0 security invariants (`OPTION SIZING: NOT_RESOLVED`, `SOLVER RANKING: NOT_AVAILABLE`, `OPTIONBOOK/RFQ: LIVE_READ_NOT_VERIFIED`, `REAL EXECUTION: NOT_EXECUTED`).

---

## Key Architecture & Design Components

### 1. Exact Decimal Parsing (`src/utils/decimalParser.ts`)
- String-to-BigInt base-unit converter (`parseExactDecimal`) with **zero floating-point arithmetic**.
- Avoids `parseFloat` multiplication errors.
- Syntactically permits `"0"` base units.
- Field-specific business rules enforce:
  - `exposureAmount > 0`
  - `maxPremiumUSDC >= 0`
  - `targetMaxLossPercent` between 0% and 100%
  - `horizonTimestamp` strictly in the future

### 2. Intent Persistence & Repository Pattern (`src/repositories/IntentRepository.ts`)
- Clean `IntentRepository` interface.
- `DevelopmentIntentRepository` implementation explicitly labeled `IN_MEMORY_DEVELOPMENT`.

### 3. Server-Owned Confirmation Authority & Invalidation Lifecycle
- `POST /api/v1/intents/parse`: Parses prompt and saves unconfirmed candidate (`confirmedByUser: false`).
- `PATCH /api/v1/intents/:id`: Whitelisted field edits update provenance to `USER_EXPLICIT`, increment `version`, update `updatedAtMs`, and **reset `confirmedByUser` to `false`**.
- `POST /api/v1/intents/:id/confirm`: **Server exclusively owns confirmation state transition**. Validates all fields and version match before setting `confirmedByUser = true` and `confirmedAtMs = Date.now()`.

### 4. Prompt Injection Security Boundary (`tests/promptInjectionBoundary.test.ts`)
- User natural language text is stored verbatim as untrusted data (`originalPromptText`).
- Parser output can NEVER set `confirmedByUser = true`, override system protocol whitelists, or bypass missing field validation.

### 5. Responsive Outcome-First UI (`src/client/App.tsx`)
- **Outcome Input**: Clean landing overview with tagline "Protect outcomes, not instruments.", natural language prompt textarea, 3 safe preset examples, and zero options jargon.
- **Review & Ambiguity Resolution**: "WE UNDERSTOOD" card format with inline field editing, provenance indicators ("From your request" / "Please confirm"), focused missing-fields input forms, and multi-leg strategy toggle.
- **Confirmed Intent & Transition Boundary**: Polished success state displaying confirmed intent parameters and an honest pipeline boundary notice ("Market matching will be available in the next HedgeOS pipeline stage.").
- **Advanced Intent Drawer**: Toggleable `[ See Structured Intent ]` view displaying ZK/JSON schema, provenance breakdown, resolved MYT horizon, `Intent Provider: Development Adapter`, and visual conversion trace.
