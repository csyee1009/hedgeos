# Official Thetanuts Capabilities Verification & SDK Method Audit

**Last Updated**: 2026-08-31  
**Project**: HedgeOS (MUBA Hacks 2026)  
**Verified SDK Package**: `@thetanuts-finance/thetanuts-client` (v0.3.0)  

---

## 1. Verified Package Metadata

| Specification | Value | Verification Source |
|---|---|---|
| **Package Name** | `@thetanuts-finance/thetanuts-client` | Installed NPM Package (`node_modules/@thetanuts-finance/thetanuts-client/package.json`) |
| **Package Version** | `0.3.0` | Exact Installed Version |
| **Primary Peer Dependencies** | `ethers ^6.0.0`, `viem ^2.47.0`, `axios ^1.16.1` | SDK Package Manifest |
| **Official Repository** | `https://github.com/Thetanuts-Finance/thetanuts-sdk` | Repository Metadata |
| **Supported Chain IDs** | `8453` (Base Mainnet), `1` (Ethereum Mainnet) | `SupportedChainId` in SDK Typings |
| **Default Base RPC URL** | `https://mainnet.base.org` | `CHAIN_CONFIGS_BY_ID[8453]` |

> **Package Discrepancy Note**: The legacy package name `@thetanuts-finance/sdk` MUST NOT be used or documented. The verified primary TypeScript client package is `@thetanuts-finance/thetanuts-client` v0.3.0.

---

## 2. Integration Status Matrix

| Layer / Feature | Status | Technical Details |
|---|---|---|
| `ThetanutsClient` Core | **SDK_INSTALLED** | Primary entry point for initialization and network mapping |
| `client.optionBook` | **SDK_CONFIRMED, LIVE_READ_NOT_VERIFIED** | Orderbook fill/cancel helpers; live reads unverified in Phase 0 |
| `client.optionFactory` | **SDK_CONFIRMED, LIVE_RFQ_NOT_VERIFIED** | Sealed-bid RFQ quotation lifecycle; live RFQ unverified in Phase 0 |
| `client.erc20` | **SDK_INSTALLED** | Token allowances, approvals, and balance queries |
| Base RPC Connection | **RPC_CONNECTED** | Verified Base mainnet RPC endpoint (`https://mainnet.base.org`) |
| Real-Money Trade Execution | **NOT_EXECUTED** | Hard safety boundary enforced |

---

## 3. Verified SDK Method Audit (from installed `v0.3.0` typings)

| METHOD | MODULE | READ/WRITE | SIGNER REQUIRED? | CONFIRMED FROM SDK? | PHASE 0 USED? |
|---|---|---|---|---|---|
| `fillOrder` | `OptionBookModule` | WRITE | YES | YES | INTERFACE_ONLY |
| `previewFillOrder` | `OptionBookModule` | READ | NO | YES | INTERFACE_ONLY |
| `encodeFillOrder` | `OptionBookModule` | READ | NO | YES | INTERFACE_ONLY |
| `getFees` | `OptionBookModule` | READ | NO | YES | INTERFACE_ONLY |
| `calculateMaxContracts` | `OptionBookModule` | READ | NO | YES | INTERFACE_ONLY |
| `requestForQuotation` | `OptionFactoryModule` | WRITE | YES | YES | INTERFACE_ONLY |
| `makeOfferForQuotation` | `OptionFactoryModule` | WRITE | YES | YES | INTERFACE_ONLY |
| `revealOffer` | `OptionFactoryModule` | WRITE | YES | YES | INTERFACE_ONLY |
| `settleQuotation` | `OptionFactoryModule` | WRITE | YES | YES | INTERFACE_ONLY |
| `settleQuotationEarly` | `OptionFactoryModule` | WRITE | YES | YES | INTERFACE_ONLY |
| `cancelQuotation` | `OptionFactoryModule` | WRITE | YES | YES | INTERFACE_ONLY |
| `getQuotation` | `OptionFactoryModule` | READ | NO | YES | INTERFACE_ONLY |
| `getQuotationCount` | `OptionFactoryModule` | READ | NO | YES | INTERFACE_ONLY |
| `calculateFee` | `OptionFactoryModule` | READ | NO | YES | INTERFACE_ONLY |
| `buildOfferTypedData` | `OptionFactoryModule` | READ | NO | YES | INTERFACE_ONLY |
| `getBalance` | `ERC20Module` | READ | NO | YES | INTERFACE_ONLY |
| `getAllowance` | `ERC20Module` | READ | NO | YES | INTERFACE_ONLY |
| `approve` | `ERC20Module` | WRITE | YES | YES | INTERFACE_ONLY |
| `ensureAllowance` | `ERC20Module` | WRITE | YES | YES | INTERFACE_ONLY |

---

## 4. OptionBook vs RFQ / OptionFactory Separation

- **OptionBook (`client.optionBook` / `OptionBookQuoteSource`)**: Resolves resting limit orders via indexer endpoints.
- **RFQ / OptionFactory (`client.optionFactory` / `RFQQuoteSource`)**: Triggers custom quote creation via `requestForQuotation` when no resting order exists.
