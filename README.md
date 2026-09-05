# HedgeOS

**Protect outcomes, not instruments.**

HedgeOS is a non-custodial Risk Intent system for Thetanuts Finance on Base. It helps beginners discover observed long-put protection trade-offs, lets advanced users enter exact limits, compiles the user's choice into a confirmed Typed Risk Intent, applies deterministic financial policy, prepares exact unsigned OptionBook calldata, and verifies externally executed results from Base evidence.

HedgeOS has no private-key, mnemonic, seed-phrase, signer, or autonomous transaction-broadcast path. A user-controlled wallet or execution system remains the financial authorization boundary.

## Problem

Options interfaces often require a user to choose strikes, option terminology, volatility assumptions, and order mechanics before learning what protection is feasible. Asking a beginner to invent a maximum-loss percentage and budget creates the same problem in different words. HedgeOS starts with factual situation information and derives understandable trade-offs from a coherent market snapshot and deterministic math.

Protection figures are **MODELED AT EXPIRY** under the stated spot, fill-cost, quantity, and payoff assumptions. They are not guarantees of future performance.

## Simple Mode — Help me choose protection

A user can write:

> I have 2 ETH and I'm worried the price may fall this week. I don't know what protection makes sense.

AI extracts factual situation fields: asset, exposure, timeframe, and missing factual information. It does not choose a risk tolerance, budget, strategy, or financially passing candidate.

HedgeOS reads Thetanuts market evidence, permits only unambiguous taker-buy single-strike vanilla puts, verifies exact sizing and buyer spend, calculates modeled-at-expiry downside, removes dominated candidates, and presents the observed Pareto frontier:

- **LOWER COST**: lowest verified-cost frontier point.
- **STRONGER MODELED PROTECTION**: lowest modeled-downside frontier point.
- **MID-RANGE TRADE-OFF**: median verified-cost frontier point, shown only when at least three frontier points exist.

There is no weighted recommendation score and no “best” label. Choosing an outcome creates a new draft Typed Risk Intent that requires explicit confirmation.

## Advanced Mode — I already know my limits

Advanced Mode accepts asset, exposure, maximum modeled-at-expiry downside, maximum USDC protection budget, and horizon. Field provenance distinguishes `USER_EXPLICIT`, `AI_INFERRED`, and `SYSTEM_DEFAULT`; material inferred fields require review. The confirmed result enters the same solver, Financial Constitution, preparation, and verification core used by Simple Mode.

## No-dead-end outcomes

An exact request returns one of these truthful states:

- feasible OptionBook protection;
- observed market trade-offs;
- a proposed one-dimension alternative for explicit review;
- an unsubmitted and unpriced RFQ specification;
- a precise infeasibility explanation; or
- live market unavailable.

A market-read failure is never converted into an empty orderbook or RFQ conclusion. Selecting an alternative creates a new draft/version; HedgeOS never mutates a confirmed intent or silently relaxes a constraint.

## Financial evidence foundation

The installed `@thetanuts-finance/thetanuts-client` package is the protocol integration source of truth.

- Base Mainnet chain ID: `8453`.
- OptionBook and OptionFactory targets are resolved from the installed SDK chain configuration.
- Supported execution strategy: `LONG_PUT` only.
- Direction: SDK raw `isLong=true` means the maker sells, so the HedgeOS taker buys.
- Structure: exactly one strike, `isCall=false`, and an SDK-configured vanilla PUT implementation.
- Validity: order fill deadline and option expiry must be in the future; maker capacity must be positive and sufficient.
- Quantity: exposure base units are converted to internal 18-decimal contract units and then exactly to OptionBook 6-decimal units. Non-representable quantities fail closed.
- Spend: SDK `previewFillOrder` must return the requested contract quantity and exact USDC fill amount.
- Fees: the buyer fill amount is verified separately. SDK `getFees(token, referrer)` represents claimable referrer-fee state, so HedgeOS does not call it a buyer execution fee. Fee breakdown remains `INCOMPLETE` where it cannot be proven.
- Policy thresholds: quantities, premium/spend caps, and modeled-downside PASS/FAIL comparisons use integer/rational arithmetic. JavaScript numbers are used for display.

## Financial Constitution

AI never decides whether a candidate passes. Deterministic policy checks confirmed intent binding, asset, Thetanuts protocol, long-put structure, taker direction, exact quantity, capacity, order validity, expiry/horizon coverage, verified buyer spend, budget, modeled-at-expiry downside, and evidence availability. Unknown material evidence produces `INCOMPLETE`, `NOT_AVAILABLE`, or `FAIL`; it never silently becomes `PASS`.

## Exact non-custodial execution preparation

After confirmation and collection of an expected beneficiary address, HedgeOS performs a fresh market read and reruns policy. It then uses the SDK's non-writing `previewFillOrder` and `encodeFillOrder` methods to produce:

- `chainId`, `to`, `data`, and `value` for an unsigned `OptionBook.fillOrder` call;
- the signed order semantics, maker, nonce, direction, implementation, all strikes, expiry, order deadline, price feed, collateral, exact quantity, signature, referrer, spend cap, and beneficiary;
- `keccak256(calldata)`; and
- a canonical SHA-256 semantic digest and exact execution commitment.

Any material mutation changes the binding. HedgeOS does not sign, send, or broadcast the transaction. The external wallet must separately review any required token approval and the prepared call.

## External authorization and on-chain verification

The preparation API returns a transaction request for an external user-controlled wallet or executor. After external execution, the user returns a transaction hash to `POST /api/v1/executions/verify`.

The read-only verifier checks Base 8453, transaction and receipt existence, receipt success, confirmation policy, canonical block hash, canonical OptionBook target, exact calldata hash, native value, sender/beneficiary, decoded `fillOrder` action, and expected `OrderFilled` fields. It then reads the resulting option contract and checks deployed bytecode, buyer, seller, implementation, full strikes, expiry, price feed, collateral token, exact contract quantity, and canonical Thetanuts factory relationship.

A successful receipt alone is insufficient evidence. `PROTECTION_CONFIRMED_ON_CHAIN` appears only for `POSITION_CONFIRMED`, when transaction, protocol event, and resulting contract state agree. Other states include `PENDING_CONFIRMATIONS`, `EXECUTION_OBSERVED`, `MISMATCH`, `REVERTED`, `REORGED_OR_UNSTABLE`, and `INSUFFICIENT_EVIDENCE`.

## RFQ truthfulness

HedgeOS can create `RFQ_SPECIFICATION_PREPARED` with `NOT_SUBMITTED`, `UNPRICED`, and `POLICY_INCOMPLETE_PENDING_PRICING`. It does not submit, price, or execute an RFQ.

## Tamper-evident audit evidence

SQLite stores intents, audit receipts, discovery snapshots, exact preparations, handoffs, and execution verifications. Canonical digests are recomputed when evidence records are read. Records link intent, market snapshot, candidate, policy decision, preview, proposal, authorization, exact transaction, external transaction, block/log, and position evidence.

This is a **tamper-evident audit record**, not an immutable database. External anchoring would be required for cryptographic immutability against an operator controlling both the application and database.

## Architecture

```text
Simple factual situation ─┐
                         ├─> observed discovery ─> user choice ─┐
Advanced exact limits ───┘                                      │
                                                                v
Typed Risk Intent draft -> explicit confirmation -> live OptionBook snapshot
  -> eligibility + exact sizing + modeled-at-expiry math
  -> deterministic Financial Constitution
  -> SDK preview -> exact unsigned calldata + semantic commitment
  -> external user-controlled authorization/signing/broadcast
  -> transaction hash -> Base receipt + Thetanuts event verification
  -> option-contract verification -> tamper-evident audit evidence
```

## API highlights

- `POST /api/v1/discovery/parse` — factual Simple Mode extraction.
- `POST /api/v1/discovery/search` — deterministic discovery from one captured market snapshot.
- `POST /api/v1/discovery/:id/compile` — selected candidate to a new draft intent.
- `POST /api/v1/intents/parse` — Advanced Mode intent parsing.
- `PATCH /api/v1/intents/:id` and `POST /api/v1/intents/:id/confirm` — explicit review/version lifecycle.
- `POST /api/v1/intents/:id/solve` — exact solver, alternatives, or truthful RFQ specification.
- `POST /api/v1/intents/:id/alternatives/apply` — revalidate a proposed one-dimension change and create a new draft/version.
- `POST /api/v1/executions/prepare` — fresh revalidation and exact unsigned transaction preparation.
- `POST /api/v1/executions/verify` — independent transaction, event, and position verification.
- `GET /healthz`, `GET /readyz`, `GET /api/v1/market/status`, and `GET /api/v1/ai/status` — runtime status.

## Quickstart

Requirements: Node.js 22+ and npm.

```bash
npm install
copy .env.example .env
npm run typecheck
npm run test
npm run build:client
npm run start:server
```

Set `BASE_RPC_URL` for Base reads. For real Gemini extraction, configure `INTENT_PROVIDER=real`, `LLM_PROVIDER=gemini`, an API key, and a model identifier supported by the provider account. The API reports the configured model; the product does not hardcode a model-version claim.

## Tests

`npm run test` is deterministic and does not require a successful live market read. Coverage includes intent provenance and confirmation, adversarial LLM output, market honesty, SDK sizing, exact arithmetic, order direction/structure/deadline gates, Pareto discovery, feasibility alternatives, proposal/simulation binding, exact calldata preparation, on-chain negative cases, persistence, digest revalidation, security middleware, stale evidence, and custody regressions.

Before submission, run:

```bash
npm run typecheck
npm run test
npm run build:client
npm audit --audit-level=high
```

Optional live smoke checks must remain separate and report failures honestly.

## Current limitations

- Only fully covered, single-leg vanilla `LONG_PUT` is supported. Put spreads remain blocked until a defensible tail-risk policy exists.
- Discovery reflects observed snapshot liquidity and does not predict future availability.
- Payoff and downside figures are modeled at expiry and do not model interim option value, post-revalidation slippage, tax, or every wallet approval requirement.
- The exact buyer fill amount is bound; fee breakdown is not asserted where the installed SDK does not provide buyer-fee semantics.
- HedgeOS does not submit RFQs.
- HedgeOS does not hold keys, connect a backend signer, fund a wallet, approve tokens, or broadcast transactions.
- Position confirmation depends on Base RPC availability, configured confirmations, expected Thetanuts events, and readable option-contract state.
