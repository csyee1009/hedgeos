# HedgeOS Deployment & Operations Guide

## 1. Environment Checklist

### Development Checklist
- Node.js v24.x installed
- SQLite runtime support (`node:sqlite`)
- Local `.env` configured with safe dev settings
- Base Mainnet RPC endpoint accessible (`BASE_RPC_URL`)

### Production Checklist
- Persistent server/container environment (e.g. AWS EC2, GCP Compute Engine, Render Web Service, Railway with persistent volume).
- **Vercel / Serverless Warning**: Serverless ephemeral environments (such as Vercel functions) are **unsuitable** for HedgeOS due to persistent SQLite file storage requirements (`node:sqlite`). A persistent Node container/VM host must be used.
- Environment variables configured (see required list below)
- CORS allowlist explicitly defined (`HEDGEOS_ALLOWED_ORIGINS`)
- Production HTTPS reverse proxy (Nginx / Cloudflare / Caddy) configured

## 2. Required Environment Variable Names

- `INTENT_PROVIDER`: LLM intent parsing provider (`GEMINI` / `MOCK`)
- `LLM_PROVIDER`: LLM backend (`GEMINI`)
- `LLM_MODEL`: Model identifier (`gemini-2.5-flash`)
- `GEMINI_API_KEY`: API key for Gemini inference (never print/log)
- `BASE_RPC_URL`: Base Mainnet RPC node URL (https://mainnet.base.org or provider endpoint)
- `HEDGEOS_DB_PATH`: Absolute filesystem path to persistent SQLite database
- `HEDGEOS_ALLOWED_ORIGINS`: Comma-separated list of permitted CORS origins (e.g. `https://app.hedgeos.finance`)
- `DEMO_SNAPSHOT_MODE`: Boolean flag for deterministic demo snapshotting (`false` in prod)

## 3. Operations Commands

```bash
# Build Client Bundle
npm run build:client

# Start Production API Server
npm run start:server

# Perform Complete Local Check & Verification
npm run check
```

## 4. Health & Readiness Monitoring

- **Liveness Probe**: `GET /healthz` (Expect HTTP 200 `{ "status": "ok" }`)
- **Readiness Probe**: `GET /readyz` (Expect HTTP 200 `{ "status": "ready" }`). Checks SQLite database `SELECT 1`, Gemini configuration, Base RPC presence, and Thetanuts market engine state. Returns HTTP 503 if unready.

## 5. Persistence & Secret Management

- Backup persistent SQLite database file defined by `HEDGEOS_DB_PATH` regularly.
- Secrets must be injected via environment variables or secret management vaults (e.g., AWS Secrets Manager, HashiCorp Vault). Never commit secrets to source control.
