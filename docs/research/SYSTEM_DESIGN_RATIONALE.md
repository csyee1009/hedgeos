# System Design Rationale

---

## 1. Why Outcome-First Beats Instrument-First in Web3 Options

In traditional DeFi option interfaces, users must specify:
1. Underlying contract address
2. Call vs Put
3. Strike Price ($)
4. Expiry Date
5. Order Type (Limit vs Market / RFQ)

This design assumes the user already possesses quantitative options pricing capabilities and understands delta hedging. For 95% of crypto holders, this barrier prevents effective risk management.

HedgeOS inverts this flow:
- User declares financial intent: *"Protect 2 ETH down to 8% loss until Friday for max 3 USDC."*
- System computes implied floor price, queries OptionBook orderbooks and OptionFactory RFQ channels, validates safety rules, and returns an executable hedge.

---

## 2. AI as Interpreter, Deterministic Engine as Authority

LLMs excel at translation, ambiguity detection, and natural language understanding. However, using an LLM to generate raw transaction payloads directly exposes users to prompt injection and hallucinated contract calls.

HedgeOS enforces: **AI PROPOSES. DETERMINISTIC POLICY VERIFIES. HUMAN AUTHORIZES.**
