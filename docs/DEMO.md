# HedgeOS Hackathon Live Demo Script (3–4 Minutes)

## 1. Demo Flow Timeline

- **0:00–0:20 | Problem & Positioning**:
  "DeFi option protocols like Thetanuts offer powerful hedging liquidity, but options interfaces force users to pick strikes, expirations, and sizing manually. HedgeOS changes this: specify outcomes, not instruments."

- **0:20–0:45 | Portfolio Entry**:
  "A user enters their public Base Mainnet address or inputs holdings manually (e.g. 2 ETH). HedgeOS performs a read-only analysis of on-chain balances without asking for wallet connection."

- **0:45–1:10 | Natural Language Risk Intent**:
  "The user types: *'I have 2 ETH. Protect me until Friday. I don't want to lose more than 8% at expiry. Maximum protection budget 15 USDC.'*"

- **1:10–1:30 | Inferred Intent & Human Confirmation**:
  "Gemini parses the prompt into a structured `TypedRiskIntent`. The user reviews the exact numbers (2.0 ETH, 8% max loss, $15 budget) and clicks **Confirm & Lock Intent**."

- **1:30–2:00 | Live Thetanuts OptionBook Search**:
  "HedgeOS queries live Base Mainnet (chainId 8453) OptionBook quotes from Thetanuts. `OptionSizingAdapter` computes exact contract sizing."

- **2:00–2:30 | Solver Ranking & Financial Constitution**:
  "The Financial Constitution Engine evaluates 9 strict invariant policies (budget limit, asset match, expiry, fee evidence, protection target). The top protective PUT candidate is selected."

- **2:30–2:50 | Read-Only Simulation & Digest Binding**:
  "HedgeOS simulates the option preview, verifies protocol fees, and generates a SHA-256 bound `ActionProposal` and `SimulationResult`."

- **2:50–3:15 | Bounded Authorization Attestation**:
  "HedgeOS issues a `BoundedAuthorizationAttestation` (`SCOPE_ATTESTED_PREVIEW_ONLY`). This scope attests exact boundaries (Base 8453, Thetanuts, target contract, max spend, expiry)."

- **3:15–3:35 | Execution Commitment & Handoff**:
  "HedgeOS compiles an `ExecutionCommitment` (`PROPOSAL_BOUND`) and an `ExternalHumanAuthorizationHandoff` (`AWAITING_EXTERNAL_HUMAN`). Notice status: `executionStatus: NOT_AUTHORIZED`."

- **3:35–4:00 | Tamper Proof & Fail-Closed Demo**:
  "Show tamper proof: Reduce maximum budget from $15 to $1 USDC. Re-evaluate solver: Financial Constitution immediately rejects candidate eligibility with `BUDGET_REJECTED`."

## 2. Backup Demo Plan

- **RPC Failure Backup**: Set `DEMO_SNAPSHOT_MODE=true` in `.env` to use pre-cached Base Mainnet market snapshots.
- **Gemini Outage Backup**: Use fallback deterministic parser (`IntentProviderFactory` fallback).
- **No OptionBook Match Backup**: Show RFQ specification fallback (`mode: "RFQ_REQUIRED"`, `status: "NOT_SUBMITTED"`).
