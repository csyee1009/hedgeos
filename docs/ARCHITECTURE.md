# HedgeOS System Architecture

## 1. System Context

HedgeOS is an outcome-first Risk Intent Compiler for Thetanuts Finance. It translates natural language protection requests or portfolio balances into structured risk intents, verifies candidate strategies against a deterministic Financial Constitution, and creates cryptographic bounded authorization handoffs—all without holding private keys or executing transactions.

```
+-----------------------------------------------------------------------------------+
|                                 USER / CLIENT                                     |
|              (Portfolio Address Analysis / Manual Holdings Entry)                 |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                            HEDGEOS API SERVER                                     |
|  +-------------------------+  +------------------------+  +--------------------+  |
|  | AI Interpretation Layer |  | Deterministic Solver   |  | Persistence Layer  |  |
|  | (Gemini / Zod Parser)   |  | & Financial Invariants |  | (SQLite Database)  |  |
|  +-------------------------+  +------------------------+  +--------------------+  |
+-----------------------------------------------------------------------------------+
            |                                                      |
            v                                                      v
+----------------------------------------+       +----------------------------------+
|            THETANUTS SDK               |       |   EXTERNAL HUMAN AUTHORIZATION   |
|   (Base Mainnet 8453 / Read-Only)      |       |             HANDOFF              |
+----------------------------------------+       | [OUTSIDE HEDGEOS TRUST BOUNDARY] |
                                                 +----------------------------------+
```

## 2. Component Diagram

```
+-----------------------------------------------------------------------+
|                              USER UI                                  |
|               (Portfolio Context / Manual Holdings Input)             |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                        AI INTERPRETATION LAYER                        |
|             Natural Language -> Inferred Risk Intent (Gemini)         |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                       HUMAN CONFIRMATION STEP                         |
|               Explicit User Lock of Structured Risk Intent            |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                    DETERMINISTIC VERIFICATION LAYER                   |
|  +-----------------------------------------------------------------+  |
|  | Protection Solver Engine (OptionBook-First + RFQ Fallback)      |  |
|  +-----------------------------------------------------------------+  |
|  | Financial Constitution Engine (9 Invariants: Budget, Liquidity) |  |
|  +-----------------------------------------------------------------+  |
|  | Simulation Engine (Read-Only Preview & Fee Verification)        |  |
|  +-----------------------------------------------------------------+  |
|  | Bounded Authorization Attestation (SCOPE_ATTESTED_PREVIEW_ONLY) |  |
|  +-----------------------------------------------------------------+  |
|  | Execution Commitment (PROPOSAL_BOUND / Digest Hashing)          |  |
|  +-----------------------------------------------------------------+  |
|  | External Human Authorization Handoff (AWAITING_EXTERNAL_HUMAN)  |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
         |                                           |
         v                                           v
+------------------------------------+   +-------------------------------+
|         THETANUTS MARKET           |   |       PERSISTENCE LAYER       |
| (Base Mainnet 8453 / Read-Only)    |   | SQLite (Intents, Receipts,    |
+------------------------------------+   | Handoffs - SHA-256 Digest)    |
                                         +-------------------------------+
         |                                           
         | [Side path when liquidity unavailable]
         v
+------------------------------------+
|          RFQ SPECIFICATION         |
|           (NOT SUBMITTED)          |
+------------------------------------+
```

## 3. Full Data Flow

1. **Portfolio Read / Manual Input**: The user inputs a public Base address or enters token holdings manually.
2. **Intent Parsing**: The prompt is processed via LLM/Gemini to infer structured intent parameters (`asset`, `exposure`, `targetMaxLossPercent`, `maxPremiumUSDC`, `horizonTimestamp`).
3. **Human Confirmation**: The user reviews and locks the structured `TypedRiskIntent` with version assignment.
4. **Market Read**: `ThetanutsMarketService` queries live Base Mainnet (chainId 8453) OptionBook quotes via `@thetanuts-finance/thetanuts-client`.
5. **Protection Solving & Ranking**: `ProtectionSolverEngine` filters quotes, computes exact contract sizing (`OptionSizingAdapter`), and evaluates payoff floors (`ExposurePayoffEngine`).
6. **Financial Constitution Check**: `FinancialConstitutionEngine` evaluates 9 strict invariant policies.
7. **Simulation & Preview**: `ThetanutsSimulationService` performs a read-only preview and fee calculation.
8. **Action Proposal Generation**: `ActionProposalBuilder` compiles an `ActionProposal` with a SHA-256 digest.
9. **Bounded Authorization Attestation**: `BoundedAuthorizationAttestationService` issues a scope attestation (`SCOPE_ATTESTED_PREVIEW_ONLY`).
10. **Execution Commitment**: `ExecutionCommitmentService` creates a cryptographic `ExecutionCommitment` (`PROPOSAL_BOUND`).
11. **External Authorization Handoff**: `ExternalHumanAuthorizationHandoffService` formats an expiring handoff package (`AWAITING_EXTERNAL_HUMAN`).
12. **Audit Receipt & Persistence**: `AuditReceiptService` persists intent, audit receipt, and handoff in SQLite.

## 4. Trust Boundaries

- **Untrusted Zone**: User input prompts, raw HTTP headers, external web browsers.
- **AI Boundary**: Gemini model parses and infers intent structure, but has zero financial authority.
- **Deterministic Trust Zone**: Intent Repository, Financial Constitution, Protection Solver, Simulation Service, Bounded Authorization Attestation, SQLite Database.
- **Protocol Read Boundary**: Base Mainnet RPC and Thetanuts OptionBook smart contracts (read-only).
- **Execution Boundary**: External human execution system (outside HedgeOS).

## 5. State Transitions

- **Intent**: `DRAFT` → `CONFIRMED`
- **Proposal**: `PREPARED` → `SIMULATED` → `REVIEW_REQUIRED`
- **Attestation**: `SCOPE_ATTESTED_PREVIEW_ONLY`
- **Commitment**: `PROPOSAL_BOUND` → `EXTERNAL_PAYLOAD_BOUND` (or `EXPIRED` / `BLOCKED`)
- **Handoff**: `AWAITING_EXTERNAL_HUMAN` → `CONSUMED` (or `EXPIRED` / `BLOCKED`)
- **Execution Status**: `NOT_AUTHORIZED` (permanently invariant)

## 6. Digest & Binding Relationships

```
TypedRiskIntent (sha256 digest)
   │
   ├─► ActionProposal (sha256 proposalDigest)
   │      │
   │      ├─► SimulationResult (sha256 binding)
   │      │      │
   │      │      └─► BoundedAuthorizationAttestation (sha256 attestationDigest)
   │      │             │
   │      │             └─► ExecutionCommitment (sha256 commitmentDigest)
   │      │                    │
   │      │                    └─► ExternalHumanAuthorizationHandoff (sha256 requestDigest)
   │      │                           │
   └──────┴───────────────────────────┴─► Immutable AuditReceipt (sha256 receiptDigest)
```

## 7. Market Evidence Flow

Market quotes are fetched live from Thetanuts OptionBook contracts on Base Mainnet. Each quote includes pricing, available contracts, expiry, and timestamp. If evidence is older than 5 minutes or chainId !== 8453, the market evidence status is marked `STALE` or `UNAVAILABLE`, causing the Financial Constitution and Bounded Authorization Attestation to fail closed.

## 8. Persistence

All domain records are persisted to SQLite using `node:sqlite`:
- `intents`: Stores drafts and versioned confirmed intents.
- `audit_receipts`: Stores immutable receipt records and digests.
- `authorization_handoffs`: Stores external human authorization handoffs and statuses.

## 9. Failure Modes

- **Liquidity Mismatch**: If OptionBook liquidity cannot satisfy the confirmed goal, the solver outputs an RFQ specification marked `NOT_SUBMITTED`.
- **Budget Exceeded**: If quote premium exceeds `maxPremiumUSDC`, the Financial Constitution rejects the proposal.
- **Stale Quote**: If market evidence expires, attestation status transitions to `REJECTED` or `BLOCKED`.
- **RPC Outage**: If Base RPC fails, ReadOnlyPortfolioService produces partial results without fabricating zero balances.

## 10. Execution Boundary

HedgeOS operates strictly up to the generation of the `ExternalHumanAuthorizationHandoff`. It does not contain private keys, signers, or transaction submission paths. Any transaction execution must be performed by a separate, authorized external system.
