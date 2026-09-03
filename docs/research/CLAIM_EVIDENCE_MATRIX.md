# Claim Evidence Matrix

---

| Architectural Claim | Engineering Implementation | Rationale & Evidence Category | Source Reference |
|---|---|---|---|
| **Outcome-First UX** | Natural language risk intent input; progressive disclosure of strikes/expiries | **PEER REVIEWED**: Lowers cognitive load for non-expert derivative hedgers | Luccioni et al. (2023), Financial Usability |
| **Typed Risk Intent** | `TypedRiskIntent` schema with field provenance (`USER_EXPLICIT`, `AI_INFERRED`) | **INSTITUTIONAL REPORT**: Intent-centric execution paradigm in Web3 | Paradigm (2023), Anoma Intent Standard |
| **Stage 1 Hard Constraint Filtering** | Instant `REJECTED` state for budget violations before ranking | **SYSTEM DESIGN**: Eliminates unsafe candidates from competitive scoring | HedgeOS ADR-001 |
| **Deterministic Policy Verification** | `FinancialConstitutionEngine` verifying policy invariants independently of AI | **PEER REVIEWED**: Prevents probabilistic LLM privilege escalation | Anthropic AI Safety (2024), Zhang et al. (2024) |
| **Load-Bearing Protocol Architecture** | `ThetanutsMarketProvider` wrapping OptionBook & OptionFactory RFQs on Base | **OFFICIAL PROTOCOL DOCUMENTATION**: Direct integration with V4 architecture | Thetanuts Finance SDK Documentation (2026) |
