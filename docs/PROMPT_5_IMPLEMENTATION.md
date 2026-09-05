# Prompt 5: Real AI Intent Provider & Adversarial Structured Parsing

## Overview
HedgeOS Prompt 5 introduces the production-ready AI intent extraction layer. Natural language user goals are processed by an LLM-backed `AIIntentProvider` returning an untrusted extraction DTO. This DTO is strictly sanitized and validated by `LLMOutputValidator` using Zod schema constraints, and then deterministically normalized into a safe `ParsedRiskIntentDraft`.

---

## Authority & Security Architecture

```
User Natural Language Input (Untrusted Data)
          ↓
  AIIntentProvider
  ├── RealLLMIntentProvider (Gemini / OpenAI / OpenRouter REST)
  └── IntentEngine (Development / Test Adapter)
          ↓
  Untrusted Extraction DTO (JSON)
          ↓
  LLMOutputValidator (Strict Zod Schema Boundary)
    ├── Strips/Rejects Dangerous Authority Fields (confirmedByUser, authorizationStatus, etc.)
    ├── Validates Objective Scope ("DOWNSIDE_PROTECTION" only)
    ├── Performs Deterministic Decimal Conversion (parseExactDecimal)
    ├── Resolves Calendar / Friday Expiries Deterministically
    └── Grounds Extracted Phrases Against Original User Input
          ↓
  ParsedRiskIntentDraft (confirmedByUser = false, Server-Owned Confirmation Gate)
          ↓
  User Review & Parameter Editing
          ↓
  Explicit Server-Owned Confirmation (/api/v1/intents/:id/confirm)
          ↓
  TypedRiskIntent (confirmedByUser = true)
          ↓
  Deterministic HedgeOS Financial Pipeline (OptionBook + RFQ Solver)
```

---

## Key Invariants & Safeguards

### 1. Zero Direct AI-to-Execution Path
- The LLM provider cannot confirm an intent, approve ERC-20 tokens, select a contract call, or submit transactions.
- All extracted drafts are assigned `confirmedByUser = false`.
- Any attempt by the LLM or user text to inject authority fields (`confirmedByUser: true`, `authorizationStatus: "AUTHORIZED"`, `approvalAmount: "UNLIMITED"`, `allowedProtocols`) is automatically rejected and stripped.

### 2. Missing Value Honesty
- Missing fields remain `null` / unresolved.
- The provider never hallucinates default values (e.g. 2 ETH, 8% loss, 3 USDC budget, or Friday expiry).

### 3. Financial Decimal Normalization
- Numerical values are returned as raw decimal strings (e.g. `"2.0503"`), never pre-calculated base units.
- `parseExactDecimal` performs exact integer base-unit scaling.

### 4. Objective Scoping
- Only `DOWNSIDE_PROTECTION` is supported in MVP.
- Speculation, yield, arbitrage, or trading bot prompts trigger `unsupportedObjective = true` with a clear user explanation.

### 5. Multi-Leg Permission
- `allowMultiLeg = true` is set ONLY when the user explicitly mentions spreads or multi-leg structures. Casual phrases like "find cheap protection" do not grant multi-leg authorization.

### 6. Provider Status & Secret Protection
- Secret API keys are never leaked into the browser bundle, API responses, logs, errors, or Advanced Judge View.
- Prompt version is explicitly tracked as `INTENT_EXTRACTION_V1`.
- If API credentials are not configured in `.env`, the provider honestly reports status `NOT_CONFIGURED` without failing the build.

---

## Evaluation Results (15/15 Cases Passing)
- Evaluated against full 15-case test suite (`CASE_A_FULLY_EXPLICIT` through `CASE_O_NATURAL_CASUAL_LANGUAGE`).
- 100% pass rate across missing field detection, date parsing, adversarial injection defense, and objective validation.
