# MUBA Hackathon Track Compliance Matrix

## Overview
HedgeOS is submitted to two hackathon tracks:
1. **Track 1: Thetanuts Finance Track**
2. **Track 2: AI × Options Track**

---

## 1. Track 1: Thetanuts Finance Track

### Track Objective
Build innovative products, tooling, and integrations utilizing Thetanuts Finance protocol architecture and options liquidity on Base Mainnet (Chain ID 8453).

### Implemented Capabilities & Evidence Matrix

| Thetanuts Component | HedgeOS Implementation | Source Code File | Evidence / Verification |
| :--- | :--- | :--- | :--- |
| **Thetanuts SDK** | Integrates `@thetanuts-finance/thetanuts-client` on Base Mainnet (8453) | `src/services/ThetanutsMarketService.ts` | Initialized targeting chain ID 8453 via `ethers.JsonRpcProvider` |
| **OptionBook Market Reads** | Queries live maker orders across active option series (ETH, BTC, SOL) | `src/services/ThetanutsMarketService.ts` | Real `fetchOrders()` query with deterministic underlying mapping |
| **Price Feed Mapping** | Maps underlying assets to Chainlink feeds in `chainConfig` | `src/services/ThetanutsMarketService.ts` | Zero heuristic strike guessing |
| **Maker Collateral Sizing** | Computes fillable contracts via `client.optionBook.calculateMaxContracts()` | `src/services/ThetanutsMarketService.ts` | Derived maximum-fill calculation from maker collateral depth |
| **Read-Only Fill Preview** | Dry-runs orders using synchronous `previewFillOrder()` | `src/services/ThetanutsMarketService.ts` | Retrieves exact price per contract and protocol fee evidence |
| **OptionFactory Integration** | Resolves Thetanuts `OptionFactory` contract address on Base | `src/services/ThetanutsMarketService.ts` | SDK `chainConfig.contracts.OptionFactory` dynamic resolution |
| **RFQ Specification Builder** | Generates structurally compliant Long Put RFQ parameters | `src/services/RFQSpecificationBuilder.ts` | Sizing, strikes, expiry, and deadlines mapped to Thetanuts RFQ schema |

---

## 2. Track 2: AI × Options Track

### Track Objective
Combine artificial intelligence and decentralized options to create new paradigms in risk management, intent compilation, and intelligent financial workflows.

### Implemented Capabilities & Evidence Matrix

| AI & Options Dimension | HedgeOS Implementation | Source Code File | Evidence / Verification |
| :--- | :--- | :--- | :--- |
| **Real LLM Intent Compiler** | Configured Gemini integration with the actual model reported at runtime | `src/providers/RealLLMIntentProvider.ts` | Natural language parsed to structured financial parameters |
| **Typed Risk Intent Model** | Canonical schema capturing asset, exposure, max loss, budget, horizon | `src/types/index.ts` | `TypedRiskIntent` domain model with field-level provenance metadata |
| **Adversarial Schema Defense** | Zod validator rejecting unauthorized authority/control fields | `src/services/LLMOutputValidator.ts` | Tested across prompt injection and authority bypass suites |
| **Deterministic Policy Layer** | Financial Constitution enforcing 9 strict mathematical invariants | `src/services/FinancialConstitutionEngine.ts` | Exact asset-specific BigInt base-unit arithmetic (ETH 18, BTC/cbBTC 8, USDC 6) |
| **Read-Only Protocol Binding** | Cryptographic SHA-256 parameter digest for proposal integrity | `src/services/ThetanutsSimulationService.ts` | Truthful `PREVIEW_BOUND` status with TOCTOU risk disclosure |
| **Separation of Authority** | Zero financial execution authority delegated to AI model | `src/services/HumanReviewService.ts` | Pre-execution review record locked to `NOT_AUTHORIZED` |

---

## 3. Submission Scope & Track 2 Eligibility Clarification

### Track 2 Live-Trade Requirement Status: UNRESOLVED
- **Official Builder Resources:** Official hackathon builder documentation states that a live mainnet OptionBook trade is required for full Track 2 eligibility.
- **Organizer / Mentor Clarification:** Subsequent informal Discord discussions from organizers and mentors suggested that teams with no testnet/mainnet funds could explain and demonstrate their full SDK/protocol integration without executing live funded trades and still be evaluated fairly on technical merit.
- **HedgeOS Architectural Decision:** HedgeOS is architected as a pre-execution Risk Intent Compiler and read-only preview tool. It intentionally terminates at the human authorization boundary (`NOT_AUTHORIZED`, `ELIGIBLE_HUMAN_REQUIRED`). HedgeOS proves live Base Mainnet protocol reading, live order parsing, dynamic contract address resolution, exact base-unit contract sizing, read-only fill simulation, and full RFQ specification compilation, while holding zero private keys and performing zero automated live trades.
- **Status:** This difference between the written builder guide and subsequent mentor clarification is documented honestly as an unresolved eligibility clarification pending organizer review.
