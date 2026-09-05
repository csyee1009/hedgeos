# HedgeOS

**Protect outcomes, not instruments.**

HedgeOS is an outcome-first **Risk Intent Compiler for Thetanuts Finance**. It converts a user's protection goal into a live-market, deterministically verified protection proposal while keeping AI outside financial authority.

Instead of asking users to understand option strikes, liquidity, sizing, or protocol mechanics, HedgeOS lets them describe the outcome they want.

---

## Why HedgeOS

Most users can explain:

- what they hold
- how much downside they want to tolerate
- how long they need protection
- how much they are willing to spend

But they may not understand:

- option strikes
- order books
- contract sizing
- liquidity constraints
- protocol execution details

HedgeOS converts an outcome such as:

> “I have 2 ETH. Protect me until Friday. I don't want to lose more than 8% at expiry. Maximum protection budget 15 USDC.”

into a structured and verifiable protection workflow.

---

## Core Flow

```text
Natural Language
        ↓
Gemini Intent Interpretation
        ↓
Typed Risk Intent
        ↓
Human Confirmation
        ↓
Live Thetanuts Market
        ↓
Protection Solver
        ↓
Financial Constitution
        ↓
Simulation / Preview
        ↓
Action Proposal
        ↓
Bounded Authorization Attestation
        ↓
Execution Commitment
        ↓
External Human Authorization Handoff
```

Real transaction authorization, signing, and submission remain outside HedgeOS.

---

## Core Architecture

HedgeOS separates interpretation, financial verification, market evidence, authorization, and execution boundaries.

```text
USER
  ↓
Portfolio Context / Manual Holdings
  ↓
AI Intent Interpretation
  ↓
Typed Risk Intent
  ↓
Human Confirmation
  ↓
Live Thetanuts OptionBook
  ↓
Protection Solver
  ↓
Financial Constitution
  ↓
Read-only Simulation
  ↓
Action Proposal
  ↓
Bounded Authorization Attestation
  ↓
Execution Commitment
  ↓
External Human Authorization Handoff
  ↓
[ External Execution System ]
[ Outside HedgeOS ]
```

If suitable OptionBook liquidity is unavailable:

```text
No feasible OptionBook candidate
        ↓
Structured RFQ Specification
        ↓
NOT SUBMITTED
```

---

## AI Authority Boundary

AI is used for interpretation, not financial authority.

### AI may

- interpret natural-language protection goals
- infer candidate structured fields
- explain missing information
- explain protection results

### AI may not

- approve financial validity
- weaken confirmed user constraints
- bypass the Financial Constitution
- authorize a financial transaction
- sign transactions
- submit transactions
- hold private keys

The deterministic system remains authoritative for financial validation.

---

## Typed Risk Intent

Natural language is converted into a strict structured intent containing fields such as:

- asset
- exposure amount
- target maximum loss percentage
- maximum protection budget
- protection horizon
- allowed protocols
- multi-leg permission
- field provenance
- intent version
- human-confirmation state

Material AI-inferred values require user confirmation before the protection pipeline proceeds.

---

## Portfolio Context

HedgeOS supports two entry paths.

### Public Base address analysis

A user can provide a public Base Mainnet address.

HedgeOS can read supported balances without connecting a wallet or requesting credentials.

This is:

- read-only
- public-address based
- non-custodial

Public-address analysis does **not** prove ownership.

### Manual holdings

Users may also manually specify holdings such as:

```text
I have 2 ETH.
```

This remains available as a fallback when wallet context is unnecessary or unavailable.

---

## Thetanuts Integration

HedgeOS integrates directly with Thetanuts Finance on:

```text
Base Mainnet
Chain ID: 8453
```

The current implementation supports:

- live OptionBook reads
- Thetanuts SDK-derived contract sizing
- SDK preview functionality
- liquidity-aware feasibility checks
- OptionBook-first protection search
- structured RFQ fallback when existing liquidity cannot satisfy the confirmed goal

RFQ fallback currently generates a specification only.

HedgeOS does **not** automatically submit RFQs.

---

## Protection Solver

The Protection Solver searches live market evidence and determines whether available protection can satisfy the confirmed risk intent.

It considers:

- asset compatibility
- quantity
- expiry
- liquidity
- protection target
- maximum budget
- verified premium
- verified fees
- protocol constraints

Failed candidates remain visibly ineligible.

HedgeOS does not silently weaken confirmed constraints to force a result.

---

## Financial Constitution

The Financial Constitution is the deterministic policy layer between AI interpretation and financial action.

It verifies constraints such as:

- maximum spend
- asset consistency
- option structure
- expiry
- liquidity
- quantity
- protection coverage
- premium and fee evidence
- market freshness
- proposal binding

Possible policy states include:

```text
PASS
FAIL
INCOMPLETE
NOT_AVAILABLE
```

Incomplete evidence never becomes a false PASS.

Protection calculations represent **modeled protection at option expiry** and should not be interpreted as guaranteed outcomes.

---

## OptionBook → RFQ Fallback

HedgeOS first searches existing Thetanuts OptionBook liquidity.

```text
Confirmed Risk Intent
        ↓
Live OptionBook Search
        ↓
Feasible Candidate?
     ↙       ↘
   YES        NO
    ↓          ↓
Candidate    RFQ Specification
    ↓          ↓
Verify      NOT SUBMITTED
```

Existing options that fail confirmed constraints may still be shown for diagnosis, but they are not presented as eligible recommendations.

---

## Read-only Simulation

Before any authorization boundary is reached, HedgeOS creates a read-only preview using current evidence.

Simulation verifies that:

- the proposal matches the confirmed intent
- market evidence is available and sufficiently fresh
- expected cost remains within the confirmed budget
- relevant policy checks passed
- the proposal has not drifted from the verified candidate

Simulation does not authorize execution.

---

## Bounded Authorization

HedgeOS generates a bounded authorization attestation over the permitted financial scope.

The scope can bind:

- Base Mainnet / Chain ID 8453
- Thetanuts only
- target contract
- action type
- protected asset
- protective PUT structure
- maximum USDC spend
- proposal ID
- proposal digest
- intent ID and version
- simulation ID
- expected quantity
- expected cost
- expiry

The normal current state is:

```text
SCOPE_ATTESTED_PREVIEW_ONLY
```

Execution remains:

```text
NOT_AUTHORIZED
```

and:

```text
canExecute = false
```

---

## Execution Commitment

HedgeOS creates a deterministic commitment over the verified proposal.

Default state:

```text
PROPOSAL_BOUND
```

This means the exact HedgeOS proposal and authorization scope have been cryptographically committed.

An external executor may optionally provide an opaque payload digest.

When successfully bound:

```text
EXTERNAL_PAYLOAD_BOUND
```

This represents cryptographic binding only.

It does **not** mean:

- financially authorized
- signed
- submitted
- executed

---

## External Human Authorization Handoff

HedgeOS creates an expiring, one-time handoff package for a separate eligible human-controlled execution system.

Default state:

```text
AWAITING_EXTERNAL_HUMAN
```

The handoff binds:

- intent
- proposal
- authorization attestation
- execution commitment
- maximum spend
- protocol
- chain
- expiry

Replay protection is enforced through expiry and one-time consumption semantics.

A consumed handoff means the handoff package cannot be reused.

It does **not** imply that an on-chain transaction succeeded.

---

## Auditability

HedgeOS generates deterministic SHA-256 evidence across the pipeline.

Examples include:

- intent digest
- proposal digest
- authorization attestation digest
- execution commitment digest
- audit receipt digest

Audit receipts summarize the complete protection decision pipeline while preserving:

```text
finalExecutionStatus = NOT_AUTHORIZED
```

Receipts do not contain:

- private keys
- API secrets
- RPC credentials
- authorization headers
- sensitive environment values

---

## Durable Persistence

HedgeOS uses SQLite through Node's built-in:

```text
node:sqlite
```

Durable data includes:

- intents
- audit receipts
- external authorization handoffs

Persistence has been tested across database close/reopen cycles.

The production server does not silently fall back to an in-memory repository if persistent storage initialization fails.

---

## Security

HedgeOS follows a fail-closed design.

Current security controls include:

- no private-key custody
- no signer
- no transaction write path
- explicit human confirmation
- intent version binding
- proposal digest binding
- simulation binding
- stale-market rejection
- replay protection
- expiring authorization handoffs
- one-time handoff consumption
- budget enforcement
- denomination validation
- wrong-chain rejection
- wrong-protocol rejection
- wrong-asset rejection
- Helmet security headers
- CORS allowlisting
- API rate limiting
- 64 KB request-body limit
- request IDs
- structured logging
- secret redaction
- sanitized production errors
- `/healthz`
- `/readyz`
- dependency auditing
- custody-regression tests

Current dependency audit:

```text
0 vulnerabilities found
```

---

## Observability

Every API request can receive a request ID.

Structured request logs include fields such as:

```text
timestamp
level
requestId
method
route
statusCode
durationMs
```

Sensitive request contents and secrets are excluded from logs.

### Health

```text
GET /healthz
```

Provides process liveness.

### Readiness

```text
GET /readyz
```

Checks readiness of major dependencies such as:

- SQLite
- LLM configuration
- Base RPC configuration
- Thetanuts configuration

No blockchain write is performed by readiness checks.

---

## Current Scope

HedgeOS is deliberately narrow.

Current focus:

- downside protection
- ETH / WETH
- BTC / cbBTC where supported by verified protocol evidence
- protective PUT workflows
- OptionBook-first market search
- RFQ specification fallback
- Base Mainnet
- Thetanuts Finance

The narrow scope allows financial assumptions and authorization boundaries to remain explicit and testable.

---

## What HedgeOS Does Not Do

HedgeOS currently does **not**:

- hold private keys
- request seed phrases
- connect an execution signer
- automatically authorize trades
- automatically submit transactions
- submit OptionBook fills
- submit RFQs
- silently weaken confirmed constraints
- guarantee financial outcomes
- prove ownership of a public Base address

Real transaction signing and submission remain outside the HedgeOS trust boundary.

---

## Tech Stack

Current stack includes:

- TypeScript
- React
- Vite
- Express
- Zod
- Gemini
- Thetanuts Finance SDK
- Base Mainnet
- SQLite via `node:sqlite`
- Helmet
- express-rate-limit
- Vitest

---

## Running Locally

Install dependencies:

```bash
npm install
```

Start the project using the scripts defined in `package.json`.

For a complete integrity check:

```bash
npm run check
```

Equivalent validation includes:

```bash
npx tsc --noEmit
npm run test
npm run build:client
npm audit
```

Current validated baseline:

```text
TypeScript: PASS
Tests:      243 / 243 PASS
Build:      PASS
npm audit:  0 vulnerabilities
```

---

## Environment Variables

See:

```text
.env.example
```

Environment variables may include configuration for:

```text
INTENT_PROVIDER
LLM_PROVIDER
LLM_MODEL
GEMINI_API_KEY
BASE_RPC_URL
HEDGEOS_DB_PATH
HEDGEOS_ALLOWED_ORIGINS
DEMO_SNAPSHOT_MODE
```

Use only variables supported by the current source code.

Never commit real `.env` credentials.

---

## CI/CD

GitHub Actions validates every push and pull request.

The CI pipeline performs:

```text
npm ci
npx tsc --noEmit
npm run test
npm run build:client
npm audit --audit-level=high
```

CI runs on Node.js 24.

---

## Repository Documentation

Detailed engineering documentation is available under:

```text
docs/
```

Including:

- `ARCHITECTURE.md`
- `THREAT_MODEL.md`
- `SECURITY.md`
- `API.md`
- `DEPLOYMENT.md`
- `LIMITATIONS.md`
- `DEMO.md`

Architecture Decision Records are stored under:

```text
docs/adr/
```

---

## Hackathon Relevance

HedgeOS is designed around Thetanuts rather than treating the protocol as a generic execution backend.

Its core contribution is:

```text
User Protection Outcome
        ↓
Typed Risk Intent
        ↓
Live Thetanuts Feasibility
        ↓
Deterministic Financial Verification
        ↓
Bounded Authorization
```

The system is intentionally different from a generic:

```text
Chat
→ AI
→ Buy Put
```

AI interprets the user's goal.

The deterministic system determines whether the protection proposal is financially valid.

Authorization remains separately bounded.

---

## Demo Story

A typical HedgeOS demo:

```text
1. Enter or read an exposure
2. Describe the desired protection outcome
3. Gemini produces a Typed Risk Intent
4. User confirms the structured constraints
5. HedgeOS checks live Thetanuts liquidity
6. Solver generates eligible candidates
7. Financial Constitution verifies the candidate
8. Read-only simulation validates the proposal
9. Bounded authorization scope is generated
10. Execution commitment is created
11. External human authorization handoff is prepared
12. Audit receipt records the entire decision chain
```

A useful fail-closed demonstration is to reduce the maximum protection budget below the verified cost.

HedgeOS should reject the candidate instead of weakening the user's confirmed limit.

---

## Limitations

HedgeOS is currently a development and hackathon system.

Important limitations include:

- HedgeOS does not execute transactions
- transaction construction/signing remains outside HedgeOS
- RFQ fallback is specification-only
- protection is modeled at option expiry
- market liquidity may change
- Base RPC availability can affect live evidence
- LLM interpretation can be incorrect and therefore requires explicit confirmation
- public-address analysis does not verify ownership
- supported strategies are intentionally narrow
- the system has not undergone an independent external security audit
- production use would require additional security, operational, legal, and compliance review

HedgeOS is not financial or legal advice.

---

## Project Status

```text
Typecheck                  PASS
Tests                      243 / 243 PASS
Client Build               PASS
Dependency Audit           0 vulnerabilities

Live Thetanuts Reads       ✓
Typed Risk Intent          ✓
Human Confirmation         ✓
Protection Solver          ✓
Financial Constitution     ✓
Simulation                 ✓
Proposal Binding           ✓
Bounded Authorization      ✓
Execution Commitment       ✓
External Human Handoff     ✓
Audit Receipts             ✓
SQLite Persistence         ✓
Security Hardening         ✓
Observability              ✓
CI/CD                      ✓

Wallet Custody             NONE
Signer                     NONE
Private Key Consumption    NONE
Transaction Write Path     NONE
Execution Status           NOT_AUTHORIZED
```

---

## Tagline

> **HedgeOS — Protect outcomes, not instruments.**
