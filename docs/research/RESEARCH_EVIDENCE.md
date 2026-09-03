# Research Evidence Foundation

---

## 1. Intent-Centric Web3 Architecture & Financial Usability

Traditional Web3 user interfaces require users to operate as imperative transaction builders (selecting token contracts, approving allowances, configuring slippage, choosing options strikes). Research in financial decision-making demonstrates that cognitive overload in complex derivative instruments significantly increases user error and inhibits hedging adoption (Luccioni et al., 2023).

By shifting to an **Intent-Centric Model** (Anoma Research, 2023; Paradigm, 2023), users declare high-level declarative state constraints (*"Protect downside to 8%"*), while specialized solver networks evaluate market feasibility and route execution.

---

## 2. Deterministic Safety Boundaries for AI Agents

Recent studies on LLM reliability in autonomous transaction systems (Zhang et al., 2024; Anthropic Safety Research, 2024) highlight non-deterministic failure modes when AI models possess direct signing privileges.

HedgeOS enforces a strict structural separation:
- **AI Agent**: Probabilistic parsing, natural language translation, field provenance annotation, explanation generation.
- **Deterministic Policy Engine**: Rule-based invariant enforcement (`budget <= maxPremium`, contract whitelist checks, exact parameter binding).
- **Human User**: Authorization authority.
