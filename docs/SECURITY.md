# HedgeOS Security Model & Policies

## 1. Core Security Invariants

HedgeOS is engineered with two non-negotiable security invariants:

1. **No Key Custody**: HedgeOS never creates, imports, stores, or accesses private keys, mnemonic seed phrases, or wallet credentials.
2. **No Transaction Write Path**: HedgeOS never constructs signed transactions, approves token allowances, submits RFQs, or executes blockchain state changes.

All server status responses, attestation objects, commitment records, and audit receipts permanently state:
```json
{
  "executionStatus": "NOT_AUTHORIZED",
  "canExecute": false
}
```

## 2. Security Infrastructure

- **Helmet Security Headers**: Express server applies Helmet middleware (`helmet({ contentSecurityPolicy: false })`) for modern HTTP header protection.
- **Environment-Aware CORS**: Origin validation enforced via `HEDGEOS_ALLOWED_ORIGINS`. Production mode strictly prohibits wildcard `*` origins and terminates startup if origins are unconfigured.
- **Rate Limiting**: Sliding window rate limits via `express-rate-limit`:
  - `POST /api/v1/intents/parse`: 30 requests / 10 min per IP
  - `POST /api/v1/portfolio/analyze`: 60 requests / 10 min per IP
  - `POST /api/v1/intents/:id/solve`: 30 requests / 10 min per IP
  - `POST /api/v1/intents/:id/simulate`: 30 requests / 10 min per IP
  - General API: 300 requests / 10 min per IP
- **Payload Limits**: `express.json({ limit: "64kb" })` Safely rejects oversized JSON payloads with HTTP 413.
- **Request ID Tracking**: Middleware generates or validates `x-request-id` headers (matching `[A-Za-z0-9._:-]` up to 128 chars) and attaches them to all responses and error payloads.
- **Sanitized Log & Error Output**: All console logs and API error responses pass through `redactSensitiveText()` to scrub API keys, Bearer tokens, cookies, auth headers, and hex secrets. Raw stack traces are never exposed in production.
- **Custody Boundary Static Scanner**: Automated regression test `tests/custodyBoundary.test.ts` scans all production source files in `src/` to ensure zero usage of wallet signing or transaction submission functions.
- **Dependency Vulnerability Scans**: Automated `npm audit --audit-level=high` in local check scripts and CI pipelines.

## 3. Fail-Closed Philosophy

HedgeOS enforces a fail-closed design pattern across all decision layers:
- If market evidence is stale (> 5 minutes), simulation status is marked `STALE` and authorization attestation is `REJECTED`.
- If proposal parameters do not match simulation digests, execution commitment status is set to `BLOCKED`.
- If an authorization handoff has expired or was previously consumed, it cannot be reused.
- If SQLite database ping (`SELECT 1`) fails, readiness endpoint `/readyz` returns HTTP 503 `not_ready`.

## 4. Responsible Disclosure

If you discover a security vulnerability or weakness within HedgeOS, please follow responsible disclosure principles by reporting details to the repository maintainers through private issue reporting or direct security contact channels. Please do not open public issues containing unpatched vulnerability details.
