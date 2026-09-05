# HedgeOS Live Judge Demo Guide

## Quick Overview
This guide provides step-by-step instructions for running a live walkthrough of HedgeOS during judge evaluations or presentations.

---

## 1. Demo Execution Flow

### Step 1: Launch HedgeOS Locally
```bash
# Terminal 1: Start Backend API
npm run start:server

# Terminal 2: Start Frontend UI
npm run dev:client
```
Open `http://localhost:5173` in your browser.

---

### Step 2: Show Clean UI & Positioning
- **What to point out:**
  - Clean, restrained institutional SaaS aesthetic (no purple AI gradients, no floating chatbot bubbles).
  - Tagline: *"Protect outcomes, not instruments."*
  - Live Base Mainnet (8453) status badge in header.
  - Light/Dark theme toggle (top right).

---

### Step 3: Natural Language Input
- Click the **Quick Example** button or paste the standard demo goal:
  ```
  I have 2 ETH. Protect me until Friday. I don't want to lose more than 8%. Maximum protection budget 3 USDC.
  ```
- Click **Parse Protection Goal**.

---

### Step 4: Review Typed Risk Intent
- **What to point out:**
  - The configured Gemini model converted the prompt into a structured `TypedRiskIntent` draft; its actual name is shown by the runtime status.
  - Every parameter shows its provenance badge (`USER_EXPLICIT`).
  - Notice that `confirmedByUser` is currently `false`—the AI has **zero authority** to confirm or execute.
  - You can edit any parameter (e.g. adjust budget or loss target) if needed.

---

### Step 5: Explicit Human Confirmation
- Click **Confirm Protection Goal**.
- The intent transitions to version 1 and locks in the server-side repository.

---

### Step 6: Live Thetanuts Discovery
- Click **Check Live Protection Options**.
- HedgeOS executes the protection pipeline:
  1. Queries live Base Mainnet (8453) OptionBook orders via `@thetanuts-finance/thetanuts-client`.
  2. Maps underlying assets deterministically using Chainlink price feed addresses.
  3. Verifies maker collateral depth and exact 1:1 option sizing.

---

### Step 7: Strategy Evaluation & Fallback Explanation
- **If an eligible OptionBook order exists:**
  - View the top-ranked protective put strategy.
  - Expand the **Financial Constitution Policy Matrix** showing 9 green checks (POL-001 through POL-009).
- **If OptionBook liquidity is unavailable/expired:**
  - View the **Custom Protection (RFQ) Specification** tab.
  - Point out that HedgeOS compiled a complete, structurally valid Long Put RFQ targeting the Thetanuts `OptionFactory` contract.
  - Show that unpriced quotes are truthfully labeled `PENDING_RFQ_PRICING_REFINEMENT` without fabricated costs.

---

### Step 8: Advanced Judge View & Cryptographic Evidence
- Click **Advanced Judge View** (top right of results card).
- Show the SHA-256 **Proposal Digest**.
- Show the read-only simulation check results.
- Show the `PREVIEW_BOUND` status and TOCTOU risk disclosure.
- Show the **Human Authorization Boundary** (`executionStatus = NOT_AUTHORIZED`).

---

### Step 9: Reset Demo
- Click **Start New Protection Goal** to return to a fresh, clean state.
