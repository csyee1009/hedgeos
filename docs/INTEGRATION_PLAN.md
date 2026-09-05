# HedgeOS System Integration Plan

---

## 1. Provider Interfaces & System Integration

HedgeOS cleanly decouples system logic behind provider interfaces located in `src/providers/interfaces/`:

1. `AIIntentProvider`: Converts prompt strings into candidate risk intents. Defaults to `DEVELOPMENT_ADAPTER` when no live LLM API key is present.
2. `ThetanutsMarketProvider`: Unified market quote reader with sub-sources:
   - `OptionBookQuoteSource`: Resting limit order book orders via `@thetanuts-finance/thetanuts-client` (`client.optionBook`).
   - `RFQQuoteSource`: Custom option creation quotes via `@thetanuts-finance/thetanuts-client` (`client.optionFactory`).
3. `ProtectionSolver`: Runs Stage 1 Hard Constraints and Stage 2 Candidate Ranking.
4. `PolicyEngine`: Evaluates deterministic `FinancialConstitution` rules.
5. `SimulationProvider`: Prepares transaction previews and exact-intent binding hashes.

---

## 2. API Endpoint Mapping

- `POST /api/intent/parse`: Accepts `{ prompt }`, returns `ParsedIntent` with provenance metadata.
- `POST /api/intent/confirm`: Accepts user adjustments, locks `TypedRiskIntent`.
- `POST /api/solver/solve`: Queries `ThetanutsMarketProvider`, runs solver, returns ranked viable strategies and rejected candidates with reasons.
- `POST /api/policy/verify`: Runs `PolicyEngine`, emits `PolicyDecisionRecord`.
- `POST /api/simulate`: Generates transaction preview with status `PREVIEW_ONLY` (Prompt 1).
