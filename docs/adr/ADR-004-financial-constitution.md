# ADR-004: Deterministic Financial Constitution Policy Engine

* **Status**: Accepted
* **Context**: Financial proposals must be validated against hard risk boundaries (budget, asset, expiry, liquidity, protection level, fee evidence, freshness, binding) before being presented to users.
* **Decision**: Create a dedicated `FinancialConstitutionEngine` evaluating 9 invariant policies in code using exact base-unit integer math. If any invariant fails, the proposal is rejected or marked incomplete.
* **Consequences**: Ensures zero budget overruns, eliminates denomination mismatch bugs, and guarantees fail-closed behavior on stale market evidence.
