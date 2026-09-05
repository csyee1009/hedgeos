# ADR-003: OptionBook-First Liquidity Search with RFQ Fallback

* **Status**: Accepted
* **Context**: On-chain option markets contain both instant orderbook orders (OptionBook) and custom pricing channels (Request For Quotation / OptionFactory).
* **Decision**: Implement an OptionBook-first solver workflow. If active OptionBook quotes satisfy the confirmed risk intent, compile an `OPTIONBOOK_FILL_ORDER` proposal. If no OptionBook quote meets the criteria, generate a read-only RFQ specification marked `NOT_SUBMITTED`.
* **Consequences**: Maximizes instant executability when liquidity exists; provides a clean specification path when custom liquidity is required, without performing unauthorized transactions.
