# Architectural Decision Records (ADR)

---

## ADR-001: Separation of Hard Constraints from Soft Ranking Scores
- **Status**: Approved
- **Context**: Scoring strategies with a multiplicative formula without strict filtering allows candidates exceeding budget to compete if coverage is high.
- **Decision**: Candidate evaluation must be divided into Stage 1 Hard Constraints (Instant Rejection) and Stage 2 Candidate Ranking (Objective Scoring). Candidates violating hard constraints are categorized as `REJECTED` with explicit failure messages.
- **Consequence**: Improves safety and provides clear feedback for users and judges.

---

## ADR-002: Provider Interface Abstraction for Thetanuts Market Operations
- **Status**: Approved
- **Context**: Thetanuts V4 supports both resting limit orders (`OptionBook`) and custom RFQ quotes (`OptionFactory`).
- **Decision**: Abstract market access under `ThetanutsMarketProvider` while explicitly preserving `OptionBookQuoteSource` and `RFQQuoteSource` as distinct sub-providers.
- **Consequence**: Clean architectural boundaries, simplified testing, and compliance with sponsor SDK capabilities.

---

## ADR-003: Field Provenance Tracking in Risk Intent
- **Status**: Approved
- **Context**: LLM parser outputs might infer missing parameters (e.g. default expiry horizon) without user knowledge.
- **Decision**: Every field in `TypedRiskIntent` wraps its value in `FieldProvenance<T>`, capturing source, confidence, and confirmation flags.
- **Consequence**: Prevents silent financial assumptions and enforces explicit user confirmation.
