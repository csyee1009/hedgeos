# HedgeOS RQ4 — Bounded Authorization / Attestation

## What this closes

The research blueprint requires an explicit authorization layer between simulation and any future execution.

This bundle adds a deterministic bounded authorization attestation that binds:

- confirmed intent ID and version;
- proposal ID and digest;
- simulation ID and proposal digest;
- Base Mainnet chain ID 8453;
- Thetanuts-only protocol scope;
- OptionBook-fill-only action scope;
- explicit target contract;
- protective PUT-only right;
- confirmed asset;
- human-confirmed USDC maximum protection budget;
- verified expected total cost;
- proposal quantity and expiry;
- human review record;
- fresh market evidence;
- simulation verification results.

The attestation is hashed into an immutable digest.

## What this deliberately does NOT do

This does **not**:

- connect a wallet;
- request a private key or seed phrase;
- create token approvals;
- create spending allowances;
- sign a message or transaction;
- submit an RFQ;
- submit an OptionBook fill;
- execute a transaction.

`executionStatus` remains `NOT_AUTHORIZED` and `canExecute` is permanently `false`.

## Exact-transaction binding gate

Current HedgeOS proposals are `PREVIEW_BOUND`.

Therefore a valid current package can reach:

`SCOPE_ATTESTED_PREVIEW_ONLY`

but cannot truthfully reach a complete execution authorization state.

The service contains an explicit gate requiring both proposal and simulation to be:

`EXACT_TRANSACTION_BOUND`

before it can return:

`EXTERNAL_AUTHORIZATION_ELIGIBLE`

Even then, the attestation remains non-executable and still requires a separate eligible human authorization system.

## RQ4 interpretation

Before this layer, HedgeOS had:

Human Review → NOT_AUTHORIZED

After this layer, HedgeOS has:

Human Review
→ Deterministic Bounded Scope
→ Proposal/Intent/Simulation Binding
→ Budget / Protocol / Action / Contract / Expiry Limits
→ Attestation Digest
→ Exact-Transaction-Binding Gate
→ NOT_AUTHORIZED

This materially improves the authorization research question without falsely claiming live bounded execution.
