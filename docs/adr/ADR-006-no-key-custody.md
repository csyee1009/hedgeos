# ADR-006: Non-Custodial Architecture with Zero Transaction Write Path

* **Status**: Accepted
* **Context**: Managing user private keys or integrating wallet signers introduces high custodial, regulatory, and security risks.
* **Decision**: Enforce a strict non-custodial architecture with no private keys, no signers, no approval methods, and no transaction write paths within HedgeOS.
* **Consequences**: HedgeOS is regression-tested (`tests/custodyBoundary.test.ts`) against custody introduction; external human authorization and transaction submission are handled entirely outside HedgeOS.
