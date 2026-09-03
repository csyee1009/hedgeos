# HedgeOS Final Hackathon Submission Summary

---

## 1. Project Overview

| Attribute | Detail |
| :--- | :--- |
| **Product Name** | **HedgeOS** |
| **Tagline** | **Protect outcomes, not instruments.** |
| **One-Liner** | Risk Intent Compiler for Thetanuts Finance converting natural-language downside protection goals into mathematically verified, fail-closed on-chain option strategies. |
| **Target Tracks** | **Track 1:** Thetanuts Finance Track<br>**Track 2:** AI × Options Track |
| **Deployment Boundary** | Local single-demo-user hackathon prototype with in-memory state repository |

---

## 2. Core User & Technical Workflow
1. **Natural Language Input:** User inputs plain English protection goal.
2. **AI Intent Compilation:** Gemini 3.7 Flash maps prompt to structured `TypedRiskIntent` draft.
3. **Adversarial Schema Validation:** Zod validator rejects unauthorized authority/control fields and preserves nulls.
4. **Server-Owned Versioned Confirmation:** User explicitly approves versioned intent (`version = 1`); material edits invalidate confirmation.
5. **Live Thetanuts Search:** Queries live Base Mainnet (8453) OptionBook orders via `@thetanuts-finance/thetanuts-client`.
6. **Financial Constitution Verification:** Evaluates 9 deterministic invariants (`POL-001` through `POL-009`) using exact asset-specific BigInt base units (ETH 18, BTC/cbBTC 8, USDC 6).
7. **Read-Only Preview & RFQ Fallback:** Executes read-only fill preview (`PREVIEW_BOUND`) or compiles custom Long Put RFQ specification (`PENDING_RFQ_PRICING_REFINEMENT`).
8. **Pre-Execution Review Boundary:** Review record locked to `NOT_AUTHORIZED` (`ELIGIBLE_HUMAN_REQUIRED`).

---

## 3. Implemented Components

### Live Protocol Components
- Base Mainnet (8453) Thetanuts OptionBook live order queries.
- SDK-driven Chainlink price feed underlying asset resolution.
- Real Gemini 3.7 Flash (`gemini-3.7-flash`) intent parsing.
- Dynamic Thetanuts `OptionFactory` and `OptionBook` contract address resolution.

### Deterministic Safety Components
- **Financial Constitution Engine:** 9 strict rules evaluated via integer base units (PASS / FAIL / NOT_EVALUATED).
- **Option Sizing Adapter:** Verified 1:1 option contract sizing derived from maker collateral depth.
- **Cryptographic Parameter Digest:** SHA-256 digest over normalized financial parameters for tamper detection.
- **Application State Machine:** Lifecycle transition validator blocking illegal shortcuts.
- **Async Race Guards:** Sequence, version, and digest freshness validators.

### Read-Only & Prototype Limitations
- Zero wallet connection or private key storage.
- Zero autonomous transaction broadcasting (`NOT_AUTHORIZED`).
- Put Spreads intentionally blocked (`BLOCKED_PENDING_STRIKE_SELECTION_POLICY`).
- Single-user in-memory repository boundary.

---

## 4. Evaluation & Security Metrics

| Evaluation Dimension | Final Validated Metric |
| :--- | :--- |
| **Automated Tests** | **162 / 162 PASS** across 31 test suites |
| **Security Invariants** | **20 / 20 PASS** (SEC-001 through SEC-020) |
| **Controlled Adversarial Dataset** | **45 / 45 PASS** (100% fail-closed compliance) |
| **Live Gemini Verification** | **3 / 3 PASS** on selected live test cases |
| **TypeScript Typecheck** | **PASS** (`tsc --noEmit` clean, 0 errors) |
| **Frontend Production Build** | **PASS** (Vite production bundle clean) |
| **NPM Security Audit** | **0 vulnerabilities** |
| **Secret Scan** | **CLEAN** (Zero API keys or credentials exposed) |
| **Prohibited Execution Paths** | **NONE_REACHABLE** (0 reachable write invocations) |

---

## 5. Submission Asset Inventory

| Document | Purpose | File Location |
| :--- | :--- | :--- |
| **README** | Primary project overview & setup guide | `README.md` |
| **Architecture** | Component responsibilities & trust boundaries | `docs/ARCHITECTURE.md` |
| **Track Compliance** | Track 1 & Track 2 evidence mapping & eligibility notes | `docs/TRACK_COMPLIANCE.md` |
| **Security Architecture** | Authority model & canonical invariants (SEC-001..020) | `docs/SECURITY.md` |
| **Threat Model** | 6-category adversarial threat analysis | `docs/THREAT_MODEL.md` |
| **Evaluation Report** | Dataset metrics & stress test results | `docs/EVALUATION_REPORT.md` |
| **Demo Video Script** | 2–3 minute video narration & visual plan | `docs/DEMO_VIDEO_SCRIPT.md` |
| **Live Demo Guide** | Step-by-step judge walkthrough | `docs/LIVE_DEMO_GUIDE.md` |
| **Pitch Scripts** | 30s, 60s, and 2min pitch scripts | `docs/PITCH_SCRIPT.md` |
| **Judge Q&A** | 30 technical question & answer pairs | `docs/JUDGE_QA.md` |
| **Screenshot Checklist** | 13 specified manual capture states | `docs/SCREENSHOT_CHECKLIST.md` |
| **Manual Checklist** | Pre-submission human inspection checklist | `docs/FINAL_MANUAL_CHECKLIST.md` |
