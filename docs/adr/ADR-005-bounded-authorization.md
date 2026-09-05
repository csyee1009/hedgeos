# ADR-005: Bounded Authorization Attestation

* **Status**: Accepted
* **Context**: Downstream execution systems require cryptographic proof that a proposal adheres strictly to human-confirmed boundaries (chain, protocol, asset, action, contract, max spend, expiry).
* **Decision**: Implement `BoundedAuthorizationAttestationService` to issue SHA-256 attested scope objects (`SCOPE_ATTESTED_PREVIEW_ONLY`).
* **Consequences**: Provides deterministic cryptographic binding of verified parameters while keeping execution status explicitly `NOT_AUTHORIZED`.
