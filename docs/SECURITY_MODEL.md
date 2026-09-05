# HedgeOS Security & Trust Model

---

## 1. Safety Invariants & Boundaries

1. **Zero Private Key Exposure**: The server backend never requests, stores, or handles user private keys.
2. **Deterministic Policy Boundary**: LLMs are bounded strictly to intent extraction and outcome explanation. LLMs cannot generate, authorize, or modify transactions directly.
3. **No Unlimited ERC20 Approvals**: Approvals must match exact transaction premium requirements.
4. **Exact-Intent Binding**: Transaction previews contain a cryptographic hash (`bindingHash`) calculated from confirmed intent fields (`intentId`, `maxPremiumUSDC`, `horizonTimestamp`, `asset`). The preview is invalid if parameters diverge.
5. **Prompt Injection Mitigation**: Natural language inputs undergo Zod schema validation and field provenance tagging. Unrecognized or malicious injection phrases are flagged as `requiresConfirmation: true` or rejected by validator rules.
