# ADR-001: Outcome-First Risk Intent Compilation

* **Status**: Accepted
* **Context**: DeFi option protocols require users to select complex parameters like strike prices, option series, sizing multipliers, and protocol endpoints. Most users understand outcome targets (e.g. max downside %, budget limit, time horizon) rather than option pricing math.
* **Decision**: Adopt an outcome-first architecture where natural language or manual target inputs are compiled into a canonical `TypedRiskIntent` schema that models financial goals explicitly.
* **Consequences**: User experience is simplified to outcome goals; intent structures can be deterministically validated by policy engines before quote matching.
