# HedgeOS Demo Video Script

**Target Duration:** 2 minutes 50 seconds (Under 3:00)  
**Tone:** Calm, technical, institutional fintech, clear, and confident.  
**Screen Display:** HedgeOS Web App in clean light/dark theme.

---

### [00:00 – 00:20] The Problem
**Visual:** Opening screen of HedgeOS. Clean, minimalist fintech interface with the tagline *"Protect outcomes, not instruments."*
**Narration:**
> "Decentralized options interfaces usually force users to think like derivatives traders: choosing strikes, calculating expiries, and wrestling with Greeks. But real users and treasury managers think in outcomes: what they hold, how long they need protection, their maximum acceptable loss, and their budget."

---

### [00:20 – 00:35] The Concept
**Visual:** Hovering over the natural language prompt input.
**Narration:**
> "HedgeOS is a Risk Intent Compiler for Thetanuts. It bridges that gap. Instead of asking you to construct complex option legs, HedgeOS lets you define your protection outcome, and deterministically compiles it into feasible on-chain protection strategies."

---

### [00:35 – 01:00] Natural Language Input & Gemini Interpretation
**Visual:** Pasting the demo prompt:  
`"I have 2 ETH. Protect me until Friday. I don't want to lose more than 8%. Maximum protection budget 3 USDC."`  
Clicking **Parse Protection Goal**.
**Narration:**
> "Let's input a plain English protection goal. When we click Parse, the configured Gemini model interprets our natural language into structured financial constraints. But notice: the AI does not execute anything. Its extraction is strictly validated against an adversarial Zod schema that rejects any unauthorized authority fields."

---

### [01:00 – 01:20] Typed Risk Intent & Versioned Confirmation
**Visual:** The **Intent Review** card appears. Showing the extracted parameters: Asset: ETH, Exposure: 2.0 ETH, Max Loss: 8%, Budget: 3.0 USDC, Horizon: Friday 11:59 PM MYT. Clicking **Confirm Protection Goal**.
**Narration:**
> "Here is our Typed Risk Intent. Field-level provenance metadata is recorded and viewable in the Advanced Judge View. Confirmation is strictly server-owned and bound to this specific intent version—any material edit immediately invalidates confirmation. When we click Confirm, the intent version is locked for solving."

---

### [01:20 – 01:45] Live Thetanuts OptionBook Search
**Visual:** The solver runs against Base Mainnet (Chain ID 8453). Showing the green live market badge.
**Narration:**
> "Now, HedgeOS searches live OptionBook liquidity on Base Mainnet using the official Thetanuts SDK. It resolves underlying assets deterministically through Chainlink price feed metadata, evaluates maximum-fill sizing derived from maker collateral depth, and performs read-only fill previews."

---

### [01:45 – 02:20] Strategy Evaluation: Two Truthful Branches

#### [Branch A: Live OptionBook Candidate Discovered]
**Visual:** The strategy card is presented. Opening the **Financial Constitution Policy Matrix** (showing PASS / FAIL / NOT_EVALUATED status per rule).
**Narration:**
> "When an eligible OptionBook quote is found, our Financial Constitution evaluates every rule. It checks exact 18-decimal base-unit sizing, verifies that total costs are within budget, and verifies the modeled at-expiry downside floor. Invariant evaluation produces explicit PASS, FAIL, or NOT_EVALUATED states."

#### [Branch B: OptionBook Insufficient → Long Put RFQ Fallback]
**Visual:** Showing the **Custom Protection (RFQ) Specification** tab with `PENDING_RFQ_PRICING_REFINEMENT` and unpriced status.
**Narration:**
> "If existing OptionBook orders cannot satisfy the requested exposure, expiry, or strike, HedgeOS never fabricates fake market success. It automatically compiles a structured Long Put RFQ specification targeting the Thetanuts OptionFactory contract, keeping unpriced fields honestly unpriced until market makers respond."

---

### [02:20 – 02:40] Advanced Judge View & Cryptographic Digest
**Visual:** Toggling the **Advanced Judge Drawer**. Showing the SHA-256 proposal digest, protocol evidence, and evaluation metrics.
**Narration:**
> "For judges and auditors, the Advanced Judge View provides full cryptographic transparency. Every proposal includes a SHA-256 parameter digest to detect any post-solve parameter tampering. Over 160 automated tests and 45 controlled adversarial evaluation cases verify this pipeline."

---

### [02:40 – 02:55] PREVIEW_BOUND & Pre-Execution Review Boundary
**Visual:** Highlighting the **Pre-Execution Review Record** badge: `PREVIEW_BOUND` and `executionStatus: NOT_AUTHORIZED`.
**Narration:**
> "Finally, HedgeOS maintains a strict separation of authority. Intent confirmation is separate from any future financial execution authorization. The proposal is labeled truthfully as PREVIEW_BOUND, with explicit disclosures that live market state can shift before execution. The prototype ends safely at NOT_AUTHORIZED."

---

### [02:55 – 03:00] Conclusion
**Visual:** Return to the hero header. Clean UI view.
**Narration:**
> "Users choose outcomes. HedgeOS compiles those outcomes into feasible Thetanuts protection."
