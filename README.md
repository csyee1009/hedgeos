# HedgeOS

> **Protect outcomes, not instruments.**

HedgeOS is an outcome-first risk protection platform that helps crypto holders express **what they want to protect** instead of forcing them to understand complex options mechanics.

Rather than asking users to manually choose strikes, expiries, option structures, or RFQ parameters, HedgeOS converts a natural-language protection goal into a structured financial intent, evaluates executable protection strategies through Thetanuts Finance, verifies them against deterministic user-defined rules, and presents the result in a simple and inspectable experience.

---

## 🎯 The Problem

A crypto holder may understand:

> “I’m worried ETH will fall before Friday.”

But they may not know:

- Which option should I use?
- Which strike is appropriate?
- Which expiry should I choose?
- How much should the protection cost?
- Is sufficient liquidity available?
- Should I use an existing OptionBook order or request a custom quote?
- Does the proposed hedge actually match my original goal?

Traditional options interfaces start with the **financial instrument**.

HedgeOS starts with the **desired outcome**.

---

## 💡 How HedgeOS Works

A user can simply say:

> **“I have 2 ETH. Protect me until Friday. I don't want to lose more than 8%. Maximum protection budget: 3 USDC.”**

HedgeOS is designed around the following pipeline:

```text
Natural-Language Risk Goal
        ↓
Typed Risk Intent
        ↓
Explicit User Confirmation
        ↓
Exposure Analysis
        ↓
Thetanuts Market Feasibility
        ↓
Protection Solver
        ↓
Deterministic Financial Constitution
        ↓
Transaction Preview / Simulation
        ↓
Human Authorization
        ↓
Thetanuts Options Execution
```

The key architectural rule is:

> **AI proposes. Deterministic systems verify. Humans authorize.**

The AI layer must never directly convert natural language into an authorized financial transaction.

---

## 🧠 Typed Risk Intent

Instead of allowing an AI model to freely interpret a trading request, HedgeOS converts the user's goal into a strict structured representation.

Conceptually:

```text
Asset
ETH

Exposure
2 ETH

Objective
Downside protection

Maximum downside target
8%

Protection horizon
Friday

Maximum protection budget
3 USDC

Multi-leg strategies
Allowed / Not Allowed
```

Each important field maintains provenance such as:

- `USER_EXPLICIT`
- `AI_INFERRED`
- `SYSTEM_DEFAULT`

High-impact assumptions must be reviewed and confirmed by the user.

---

## 🛡️ Financial Constitution

HedgeOS separates AI reasoning from financial authorization.

A deterministic policy layer evaluates constraints such as:

- Maximum protection budget
- Allowed asset
- Allowed protocol
- Protection horizon
- Strategy permissions
- Token approval limits
- Explicit user confirmation

A strategy that violates a hard rule is rejected rather than merely receiving a lower recommendation score.

---

## 🔎 Protection Solver

The planned Protection Solver evaluates protection strategies using real Thetanuts market conditions.

Its role is to eventually compare factors such as:

- Protection coverage
- Cost
- Executable liquidity
- User intent fit
- Strategy feasibility

The solver is designed to consider:

### OptionBook

Existing executable options liquidity.

### OptionFactory / RFQ

Custom quotation paths when an appropriate existing option is unavailable.

HedgeOS does **not** manufacture unavailable options or pretend that mathematically valid strategies are executable.

---

## 🔐 Safety Architecture

HedgeOS follows a strict execution model:

```text
Natural Language
      ↓
Parser Proposal
      ↓
Schema Validation
      ↓
User Confirmation
      ↓
Market Analysis
      ↓
Deterministic Policy
      ↓
Transaction Preview
      ↓
Simulation
      ↓
Human Authorization
```

A proposal is **not** authorization.

The system is designed so that AI cannot independently:

- approve spending
- override financial limits
- authorize arbitrary transfers
- silently change confirmed risk parameters
- execute an unrestricted wallet transaction

---

## 🧩 Architecture

```text
┌────────────────────────────────────┐
│ 1. Intent Engine                   │
│ Natural Language → Typed Intent    │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ 2. Protection Solver               │
│ Market Feasibility + Strategies    │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ 3. Financial Constitution          │
│ Deterministic Policy Verification  │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ 4. Simulation & Intent Binding     │
│ Preview → Verify → Human Approval  │
└────────────────────────────────────┘
```

---

## ⚙️ Technology Stack

### Frontend

- React
- TypeScript
- Vite
- CSS

### Backend

- Node.js
- Express
- TypeScript
- Zod

### Testing

- Vitest

### Options Infrastructure

- Thetanuts Finance
- `@thetanuts-finance/thetanuts-client`
- Base Mainnet

---

## 🏆 MUBA Hacks 2026

HedgeOS is being developed for two Thetanuts Finance tracks:

### 1. Best Product Built on the Thetanuts SDK

Thetanuts is intended to be a **load-bearing component** of HedgeOS.

Without live Thetanuts options liquidity and execution infrastructure, the final Protection Solver cannot perform its core job.

### 2. AI × Options

HedgeOS uses AI to interpret a user's financial risk intent while keeping financial authorization under deterministic policy and explicit human control.

The final hackathon implementation is intended to demonstrate an eligible human-confirmed on-chain options execution using the sponsor-supported Thetanuts workflow.

---

## 🚧 Current Development Status

HedgeOS is under active development.

### Completed Foundation

- ✅ Strict TypeScript architecture
- ✅ Typed Risk Intent domain model
- ✅ Field-level provenance model
- ✅ Exact financial amount representation
- ✅ Deterministic Financial Constitution foundation
- ✅ OptionBook / RFQ provider separation
- ✅ Thetanuts SDK capability verification
- ✅ Base Mainnet configuration
- ✅ Prompt-injection / authorization boundaries
- ✅ 19/19 Phase 0 tests passing

### Current Build Stage

- 🚧 Outcome-first user experience
- 🚧 Natural-language intent review
- 🚧 Ambiguity resolution
- 🚧 Explicit user confirmation
- 🚧 Structured-intent inspection

### Upcoming

- ⏳ Real AI intent provider
- ⏳ Live Thetanuts OptionBook reads
- ⏳ OptionFactory / RFQ integration
- ⏳ Option sizing
- ⏳ Exposure & payoff engine
- ⏳ Protection Solver ranking
- ⏳ Transaction proposal
- ⏳ Simulation
- ⏳ Final human-controlled execution flow

---

## ⚠️ Current Limitations

The current development version does **not** yet:

- execute real-money options trades
- perform verified live OptionBook reads
- perform live RFQ requests
- calculate option contract sizing
- calculate final hedge payoff
- rank protection strategies using live market data

These capabilities are being implemented progressively and will only be marked complete when genuine integration evidence exists.

---

## 🧭 Product Philosophy

HedgeOS is built around one idea:

> **People should express the outcome they want — not be forced to understand the financial instrument required to achieve it.**

The goal is not to hide financial risk.

The goal is to provide:

**simple interaction + inspectable depth.**

---

## 📌 Project Status

**Hackathon:** MUBA Hacks 2026  
**Target:** Thetanuts Finance Tracks  
**Network:** Base Mainnet  
**Development Status:** Active
