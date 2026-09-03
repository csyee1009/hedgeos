# HedgeOS Pitch Scripts

---

## 1. 30-Second Pitch (Elevator / Lightning Round)

> "HedgeOS is a Risk Intent Compiler for Thetanuts Finance.
>
> Options interfaces force users to pick strikes and expiries, but users think in outcomes: what they hold, how long they need protection, their maximum acceptable loss, and their budget.
>
> HedgeOS translates natural-language goals into typed risk constraints, searches live Thetanuts OptionBook liquidity on Base Mainnet, and deterministically verifies whether an available strategy satisfies the user's constraints. If existing liquidity is insufficient, it compiles a custom Long Put RFQ specification.
>
> AI interprets the goal; our deterministic Financial Constitution verifies the math; intent confirmation is separated from financial execution.
>
> Users choose outcomes. HedgeOS compiles the protection."

---

## 2. 60-Second Pitch (Hackathon Demo Stage)

> "Options are the most powerful risk-management primitive in finance, but decentralized options interfaces suffer from an instrument-first barrier. Users are forced to guess strikes, calculate expiries, and model Greeks.
>
> HedgeOS introduces an outcome-first paradigm: **Protect outcomes, not instruments.**
>
> When a user enters: *'I have 2 ETH, protect me until Friday, max 8% loss, budget 3 USDC'*, HedgeOS compiles that prompt using Gemini 3.7 Flash into a typed, versioned risk intent.
>
> Next, HedgeOS queries live OptionBook liquidity on Base Mainnet using the official Thetanuts SDK. It performs verified 1:1 option contract sizing from maker collateral depth, previews execution costs, and subjects every candidate to our deterministic Financial Constitution—a 9-invariant mathematical policy engine that evaluates budget limits and modeled at-expiry downside floors.
>
> If the OptionBook lacks matching liquidity, HedgeOS automatically compiles a structurally valid Long Put RFQ targeting the Thetanuts OptionFactory contract.
>
> Every proposal is cryptographically bound via a SHA-256 parameter digest under a strict `PREVIEW_BOUND` label. AI interprets, deterministic policy verifies, and financial execution authority remains strictly segregated at the human authorization boundary."

---

## 3. 2-Minute Pitch (Deep-Dive Judging Session)

> "Decentralized options have struggled with adoption not because the underlying protocols lack utility, but because user interfaces require retail users and DAO treasuries to act like derivatives traders.
>
> HedgeOS solves this by creating the first **Risk Intent Compiler for Thetanuts Finance**.
>
> ### The Workflow
> 1. **Natural Language Compilation:** Users define their protection goals in plain language. HedgeOS uses Gemini 3.7 Flash to extract asset, exposure, max loss percentage, budget, and horizon into a structured `TypedRiskIntent`. An adversarial Zod validator rejects any unauthorized authority/control fields.
> 2. **Server-Owned Confirmation:** The user reviews the draft parameters. Confirmation is strictly server-owned and bound to a specific intent version—material edits invalidate previous confirmations.
> 3. **Live Thetanuts Search & Sizing:** HedgeOS queries live Base Mainnet OptionBook orders via the `@thetanuts-finance/thetanuts-client` SDK. It resolves underlying assets deterministically through Chainlink price feeds and calculates fillable contracts derived from real maker collateral depth.
> 4. **The Financial Constitution:** Every strategy is evaluated across 9 mathematical invariants—including exact asset-specific base-unit budget comparisons (ETH 18 decimals, BTC/cbBTC 8 decimals, USDC 6 decimals) and modeled at-expiry payoff floors. Unknown fees never become zero, and missing data fails closed.
> 5. **OptionBook to RFQ Fallback:** If existing orders cannot fulfill the outcome, HedgeOS compiles a complete Long Put RFQ specification for Thetanuts market makers without fabricating fake prices.
> 6. **Cryptographic Integrity & Pre-Execution Review:** The resulting proposal is hashed into a SHA-256 parameter digest for tamper detection, simulated in read-only mode, and presented as `PREVIEW_BOUND` with explicit disclosures that market state can shift before execution.
>
> ### Rigorous Verification
> HedgeOS is backed by 162 automated tests, 20 canonical security invariants, and a 45-case controlled adversarial evaluation suite. We maintain zero private keys and zero automated broadcast paths.
>
> HedgeOS makes options intuitive, mathematically verifiable, and secure. Users choose outcomes; HedgeOS compiles those outcomes into feasible Thetanuts protection."
