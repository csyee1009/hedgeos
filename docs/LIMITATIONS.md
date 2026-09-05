# HedgeOS System Limitations

HedgeOS is designed with explicit technical, architectural, and financial boundaries. This document transparently lists all current limitations.

1. **Not a Custodial Wallet**: HedgeOS does not store, manage, or access private keys, mnemonic seed phrases, or wallet credentials.
2. **No Transaction Execution**: HedgeOS does not connect a web3 signer, sign transactions, approve token allowances, or submit on-chain state changes. Transaction execution remains strictly outside HedgeOS.
3. **External Executor Digest Binding**: Execution commitments use cryptographic payload digests (`EXTERNAL_PAYLOAD_BOUND`), which bind to external payloads without constructing or validating external transaction calldata.
4. **RFQ Specification Only**: When OptionBook liquidity is insufficient, HedgeOS produces an RFQ specification marked `NOT_SUBMITTED`. RFQs are not automatically submitted to the blockchain.
5. **Modeled Protection at Expiry**: Payoff models, floor values, and downside protection calculations are modeled mathematically at option expiry. Intra-term options pricing and implied volatility shifts are not modeled as constant guaranteed floors prior to expiry.
6. **Market Liquidity Dependency**: Protection proposal availability relies on live orderbook quotes on Thetanuts OptionBook contracts (Base Mainnet 8453). If market liquidity is missing or out-of-the-money, proposal generation will fail closed.
7. **RPC Dependency**: Public address balance queries depend on Base Mainnet RPC node availability. RPC latency or rate limits will flag balances as `PARTIAL` or `UNAVAILABLE`.
8. **AI Interpretation Requires Human Confirmation**: Natural language prompt parsing by Gemini is advisory. All inferred risk intents require explicit human review and lock (`POST /api/v1/intents/:id/confirm`) before solving or policy evaluation.
9. **Public Address Analysis Does Not Verify Ownership**: On-chain balance checks read public address data only and do not verify wallet control or ownership.
10. **Narrow Strategy Scope**: HedgeOS currently supports single-asset protective PUT strategies and defined put spreads on ETH/WETH and BTC/cbBTC. Exotic multi-leg or cross-margin options are not supported.
11. **Not Audit-Certified for Production Production**: HedgeOS is a hackathon innovation project and has not undergone a formal third-party smart contract or application security audit.
12. **Not Legal or Financial Advice**: HedgeOS outputs are technical preview models and do not constitute financial, investment, or legal advice.
