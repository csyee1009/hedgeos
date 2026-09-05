# HedgeOS

> **Protect outcomes, not instruments.**

HedgeOS is a **verifiable risk-intent pre-execution layer for Thetanuts Finance on Base Mainnet (Chain ID 8453)**. It helps users express downside-protection goals in human terms, converts those goals into structured risk constraints, reads Thetanuts OptionBook market data, evaluates feasible Long Put protection paths deterministically, and keeps financial authorization outside the AI boundary.

## Live Demo

**HedgeOS:** https://hedgeos-production.up.railway.app

**GitHub:** https://github.com/csyee1009/hedgeos

## What HedgeOS Does

HedgeOS supports two portfolio-entry paths:

- **Analyse a Base address** — read public Base Mainnet balances without connecting a wallet or requesting a private key.
- **Enter holdings manually** — users can describe the asset and amount they want to protect.

The hackathon demo also supports an explicitly labelled **Recorded Demo Portfolio** mode. The displayed balance in this mode is synthetic demo data and is clearly marked:

```text
RECORDED DEMO PORTFOLIO — NOT LIVE FUNDS
```

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
Thetanuts OptionBook market read
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
        ↓
Optional transaction-hash return
        ↓
Read-only Base Mainnet verification
```

HedgeOS does **not** keep a private key, sign transactions, or autonomously broadcast financial transactions.

## AI Intent Interpretation

Natural-language input is used only to produce an **untrusted structured draft**. The AI does not select or authorize a financial transaction.

The current real-LLM configuration uses the **Gemini API**:

```env
INTENT_PROVIDER=real
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.6-flash
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

Provider status is exposed by the backend so the demo can distinguish a real LLM from a development adapter.

## Thetanuts Integration

HedgeOS integrates with the official:

```text
@thetanuts-finance/thetanuts-client
```

on **Base Mainnet (Chain ID 8453)**.

Current integration includes:

- OptionBook order retrieval
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

The currently supported executable strategy path is **single-leg Long Put**.

**Put Spread remains intentionally blocked** until a defensible strike-selection and tail-risk policy is implemented.

## Financial Constitution

HedgeOS separates user intent from financial authorization.

The Financial Constitution deterministically evaluates user-defined constraints such as:

- Asset and exposure
- Protection structure
- Maximum premium
- Target maximum loss
- Time horizon
- Market eligibility
- Available capacity
- Preview validity

AI output cannot override these constraints.

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
- Signing and submission remain outside the HedgeOS trust boundary.

## Demo Portfolio Mode

For a reproducible hackathon demo:

```env
DEMO_PORTFOLIO_MODE=true
DEMO_PORTFOLIO_ADDRESS=0xYOUR_DEMO_ADDRESS
```

When the configured address is analysed, the UI displays:

```text
RECORDED DEMO PORTFOLIO — NOT LIVE FUNDS
```

The synthetic balance exists only for demonstration. Normal Base Mainnet portfolio reads remain available outside this controlled demo state.

## Demo / Snapshot Honesty

HedgeOS does not present simulated data as live data.

When a snapshot or demo path is used, the interface should clearly identify it, for example:

```text
RECORDED DEMO SNAPSHOT — NOT LIVE
```

A demo bypass must not create a fake transaction hash or fake on-chain verification result.

## Environment

Create a local `.env` file in the project root.

Example:

```env
INTENT_PROVIDER=real
LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.6-flash
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

BASE_RPC_URL=YOUR_BASE_RPC_URL
HEDGEOS_DB_PATH=YOUR_DB_PATH
HEDGEOS_ALLOWED_ORIGINS=YOUR_ALLOWED_ORIGINS

DEMO_SNAPSHOT_MODE=false
DEMO_PORTFOLIO_MODE=true
DEMO_PORTFOLIO_ADDRESS=YOUR_DEMO_ADDRESS
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

AI provider status:

```text
http://localhost:3000/api/v1/ai/status
```

## Verification

Before deploying or recording the final demo, run:

```bash
npx tsc --noEmit
npm test -- --run
npm run build
```

Only claim a specific automated-test count in submission materials when it matches the latest completed run.

## Deployment

The production deployment is hosted on Railway.

```bash
railway up --service hedgeos
```

The server uses Railway's provided `PORT` environment variable.

When running behind Railway's reverse proxy, Express must be proxy-aware:

```ts
app.set("trust proxy", 1);
```

The production server also serves the built Vite frontend from:

```text
dist/client
```

## Current Demo Capabilities

- Public Base-address onboarding
- Controlled recorded portfolio mode
- Explicit `NOT LIVE FUNDS` disclosure
- Gemini-based structured intent interpretation when the provider is available
- Thetanuts OptionBook reads
- Deterministic order eligibility filtering
- Long Put discovery
- Honest infeasibility handling
- Long Put RFQ specification fallback
- Financial-policy verification
- Read-only preview architecture
- Fresh revalidation
- Exact unsigned transaction preparation
- External authorization handoff
- Transaction-hash return path
- Read-only Base on-chain verification logic
- Explicit demo bypass without fake transaction evidence

## Known Demo Limitations

Thetanuts market orders are time-sensitive. A user request can have no suitable order because of:

- Expiry
- Sizing
- Maker capacity
- Implementation eligibility
- Preview requirements
- Current market availability

When that occurs, HedgeOS fails closed rather than fabricating a quote.

External AI providers can also become unavailable because of rate limits or quota. HedgeOS should expose the provider state honestly rather than presenting a fallback as a real LLM response.

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

Keep only safe templates such as `.env.example`.

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

## Hackathon

Built for **MUBA Hacks 2026 — Thetanuts Finance Track**.

### Demo Video

**HedgeOS — AI-Powered Risk Intent Compiler for Thetanuts | MUBA Hacks 2026 Demo**

Add the final YouTube demo URL here after upload.

## Positioning

**HedgeOS converts a human risk outcome into a verified, execution-ready Thetanuts protection proposal while keeping financial authorization outside the AI boundary.**

The product goal is simple:

> **Users choose outcomes. HedgeOS compiles the protection.**
