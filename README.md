# HedgeOS

> **Protect outcomes, not instruments.**

HedgeOS is a **verifiable risk-intent pre-execution layer for Thetanuts Finance on Base Mainnet (Chain ID 8453)**. It helps users express downside-protection goals in human terms, converts those goals into structured risk constraints, reads live Thetanuts OptionBook market data, evaluates feasible Long Put protection paths deterministically, and keeps financial authorization outside the AI boundary.

## What HedgeOS Does

HedgeOS supports two portfolio-entry paths:

- **Analyse a Base address** — read public Base Mainnet balances without connecting a wallet or requesting a private key.
- **Enter holdings manually** — users can describe the asset and amount they want to protect.

The current demo also supports an explicitly labelled **Recorded Demo Portfolio** mode. The demo address is user-controlled, while the displayed balance is synthetic demo data and is clearly marked **NOT LIVE FUNDS**.

## Core Flow

```text
User portfolio / protection goal
        ↓
AI structured extraction
(untrusted draft only)
        ↓
Schema validation + provenance
        ↓
User review / confirmation
        ↓
Live Thetanuts OptionBook read
        ↓
Deterministic protection discovery
        ↓
Feasible Long Put choices
        │
        └── if no exact live match:
            Long Put RFQ specification
            (NOT SUBMITTED / UNPRICED)
        ↓
Final typed risk intent
        ↓
Financial Constitution
        ↓
Read-only preview / simulation
        ↓
Fresh revalidation
        ↓
Exact unsigned transaction preparation
        ↓
External user-controlled authorization boundary
```

HedgeOS does **not** keep a private key, sign transactions, or autonomously broadcast financial transactions.

## Thetanuts Integration

HedgeOS integrates with the official `@thetanuts-finance/thetanuts-client` SDK and Base Mainnet.

Current integration includes:

- Live OptionBook order retrieval
- ETH / WETH / cbBTC / USDC portfolio reads
- PUT direction and single-strike eligibility checks
- Expiry and order-validity checks
- Maker-capacity checks
- Exact option sizing
- Read-only `previewFillOrder` validation
- Verified buyer-spend evidence
- Deterministic modeled-at-expiry downside calculations
- Long Put RFQ specification fallback
- Exact unsigned transaction preparation
- Read-only on-chain transaction / position verification logic

The currently supported executable strategy path is **single-leg Long Put**. Put Spread remains intentionally blocked until a defensible strike-selection and tail-risk policy is implemented.

## Safety and Authority Model

The main invariant is:

```text
Human Language ≠ Financial Authorization
```

AI may interpret and explain. Deterministic code verifies. Financial authorization remains external and user-controlled.

Key protections include:

- AI output is treated as an untrusted draft.
- Missing budget or loss values are never invented.
- Material inferred fields require review.
- Unknown evidence never becomes `PASS`.
- Market data can fail closed rather than fabricate liquidity.
- Snapshot/demo data is explicitly labelled as not live.
- RFQ specification does not mean RFQ submission.
- Read-only preview does not mean execution.
- Exact transaction preparation does not mean authorization.
- No private key is stored or used by HedgeOS.

## Demo Portfolio Mode

For a reproducible hackathon demo, HedgeOS supports a controlled recorded portfolio.

Example `.env` configuration:

```env
DEMO_PORTFOLIO_MODE=true
DEMO_PORTFOLIO_ADDRESS=0xYOUR_DEMO_ADDRESS
```

When the configured address is analysed, the UI clearly displays:

```text
RECORDED DEMO PORTFOLIO • NOT LIVE FUNDS
```

The synthetic balance is for demonstration only. Normal Base Mainnet portfolio reads remain available when demo mode is disabled or a different address is analysed.

## Environment

Create a local `.env` file in the project root.

Typical variables:

```env
INTENT_PROVIDER=...
LLM_PROVIDER=...
LLM_MODEL=...
GEMINI_API_KEY=...
BASE_RPC_URL=...
HEDGEOS_DB_PATH=...
HEDGEOS_ALLOWED_ORIGINS=...
DEMO_SNAPSHOT_MODE=...
DEMO_PORTFOLIO_MODE=...
DEMO_PORTFOLIO_ADDRESS=...
```

**Never commit `.env`, API keys, private keys, wallet keystores, or other secrets.**

## Installation

```bash
npm install
```

## Run Locally

Backend:

```bash
npm run start:server
```

Frontend:

```bash
npm run dev:client
```

Open:

```text
http://localhost:5173
```

Backend health endpoints:

```text
http://localhost:3000/healthz
http://localhost:3000/readyz
```

## Verification

Type-check:

```bash
npx tsc --noEmit
```

Tests:

```bash
npm test
```

Build:

```bash
npm run build
```

The last full pre-demo QA run passed **265 / 265 automated tests**, TypeScript checks, and the production build. After any local demo-specific edits, rerun the three commands above before the final submission.

## Current Demo Status

Working:

- Public Base-address onboarding
- Controlled recorded portfolio mode
- Explicit `NOT LIVE FUNDS` demo disclosure
- Live Thetanuts OptionBook reads
- Deterministic order eligibility filtering
- Long Put discovery path
- Honest precise-infeasibility handling
- Long Put RFQ specification fallback
- Financial-policy verification
- Read-only preview architecture
- Exact unsigned transaction preparation
- Read-only on-chain verification logic

Known demo limitation:

Live OptionBook orders are highly time-sensitive. A user request may have no exact matching order because of expiry, sizing, maker capacity, implementation eligibility, or preview requirements. In that case HedgeOS fails closed and produces an unsubmitted RFQ specification rather than fabricating a quote.

## Repository Safety

Commit source code, tests, documentation, and package metadata.

Do **not** commit:

```text
.env
.env.*
node_modules/
demo-wallet-keystore.json
demo-wallet-address.txt
*.db
*.sqlite
*.sqlite3
coverage/
dist/
.vite/
*.log
```

Keep only safe templates such as `.env.example` if needed.

## Suggested Project Structure

```text
src/
  client/
  server/
  services/
  providers/
  repositories/
  security/
  types/
  utils/

tests/

package.json
package-lock.json
tsconfig.json
vite.config.*
README.md
.gitignore
```

Optional project documentation can also be committed if it reflects the current implementation:

```text
JUDGE_QA.md
DEMO_PLAN.md
DEMO_VIDEO_SCRIPT.md
PITCH_SCRIPT.md
SECURITY_MODEL.md
TRACK_COMPLIANCE.md
```

## Positioning

**HedgeOS converts a human risk outcome into a verifiable Thetanuts protection proposal while keeping financial authorization outside the AI boundary.**

The product goal is simple:

> **Users choose outcomes. HedgeOS compiles the protection.**
