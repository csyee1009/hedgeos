# HedgeOS REST API Documentation

All API endpoints return JSON. Every response includes an `x-request-id` header. Errors return sanitized payloads with `error`, `code`, `errorCode`, and `requestId`.

---

### 1. GET /healthz
**Purpose**: Process liveness check.

**Request**: None

**Response (200 OK)**:
```json
{
  "status": "ok",
  "service": "hedgeos",
  "timestampMs": 1700000000000
}
```

---

### 2. GET /readyz
**Purpose**: Read-only readiness checks for SQLite database, LLM, RPC, and Thetanuts market configuration.

**Request**: None

**Response (200 OK / 503 Service Unavailable)**:
```json
{
  "status": "ready",
  "checks": {
    "database": "READY",
    "llm": "CONFIGURED",
    "baseRpc": "CONFIGURED",
    "thetanuts": "CONFIGURED"
  }
}
```

---

### 3. GET /api/v1/market/status
**Purpose**: Check live Base Mainnet (chainId 8453) Thetanuts market connection status.

**Request**: None

**Response (200 OK)**:
```json
{
  "status": "LIVE_READ_AVAILABLE",
  "chainId": 8453,
  "timestampMs": 1700000000000,
  "source": "THETANUTS_OPTION_BOOK",
  "orderCount": 42
}
```

---

### 4. POST /api/v1/portfolio/analyze
**Purpose**: Read-only portfolio token balance analysis for a public Base address.

**Request**:
```json
{
  "address": "0x1111111111111111111111111111111111111111"
}
```

**Response (200 OK)**:
```json
{
  "address": "0x1111111111111111111111111111111111111111",
  "chainId": 8453,
  "capturedAtMs": 1700000000000,
  "balances": [
    {
      "asset": "ETH",
      "displaySymbol": "ETH",
      "amountBaseUnits": "2000000000000000000",
      "decimals": 18,
      "formattedAmount": "2.0",
      "source": "BASE_MAINNET_READ"
    }
  ],
  "status": "AVAILABLE",
  "warnings": []
}
```

---

### 5. POST /api/v1/intents/parse
**Purpose**: Parse natural language protection goal into a structured Risk Intent draft.

**Request**:
```json
{
  "prompt": "I have 2 ETH. Protect me until Friday. Maximum budget 15 USDC. Max loss 8%."
}
```

**Response (200 OK)**:
```json
{
  "intent": {
    "intentId": "intent-12345",
    "version": 1,
    "confirmedByUser": false,
    "status": "DRAFT",
    "asset": { "value": "ETH" },
    "exposureAmount": { "value": { "amountBaseUnits": "2000000000000000000", "decimals": 18, "symbol": "ETH" } },
    "targetMaxLossPercent": { "value": 8 },
    "maxPremiumUSDC": { "value": { "amountBaseUnits": "15000000", "decimals": 6, "symbol": "USDC" } },
    "horizonTimestamp": { "value": { "timestampMs": 1700432000000, "durationText": "7d" } },
    "provenance": "NATURAL_LANGUAGE_PROMPT"
  },
  "missingFields": []
}
```

---

### 6. PATCH /api/v1/intents/:id
**Purpose**: Update fields on a draft Risk Intent.

**Request**:
```json
{
  "targetMaxLossPercent": 10,
  "maxPremiumUSDC": "20.0"
}
```

**Response (200 OK)**:
```json
{
  "intent": {
    "intentId": "intent-12345",
    "version": 2,
    "confirmedByUser": false,
    "targetMaxLossPercent": { "value": 10 }
  },
  "missingFields": []
}
```

---

### 7. POST /api/v1/intents/:id/confirm
**Purpose**: Explicitly confirm and lock a Risk Intent version.

**Request**:
```json
{
  "expectedVersion": 2
}
```

**Response (200 OK)**:
```json
{
  "intent": {
    "intentId": "intent-12345",
    "version": 2,
    "confirmedByUser": true,
    "status": "CONFIRMED"
  }
}
```

---

### 8. POST /api/v1/intents/:id/solve
**Purpose**: Execute Protection Solver & Financial Constitution on a confirmed Risk Intent.

**Request**: `{}`

**Response (200 OK)**:
```json
{
  "mode": "OPTIONBOOK_AVAILABLE",
  "rankedStrategies": [...],
  "actionProposal": {
    "proposalId": "prop-987",
    "proposalDigest": "a3f5...",
    "authorizationStatus": "UNAUTHORIZED"
  },
  "policyDecisions": {...}
}
```

---

### 9. POST /api/v1/intents/:id/simulate
**Purpose**: Execute read-only simulation preview and return human review record.

**Request**: `{}`

**Response (200 OK)**:
```json
{
  "simulationResult": {
    "simulationId": "sim-456",
    "status": "PROVIDER_SIMULATED",
    "authorizedByHuman": false
  },
  "humanReviewRecord": {
    "reviewId": "rev-789",
    "executionStatus": "NOT_AUTHORIZED"
  }
}
```

---

### 10. GET /api/v1/intents/:id/audit-receipt
**Purpose**: Fetch immutable audit receipt for an intent.

**Request**: None

**Response (200 OK)**:
```json
{
  "receipt": {
    "receiptId": "receipt-001",
    "receiptDigest": "e7c1...",
    "finalExecutionStatus": "NOT_AUTHORIZED"
  }
}
```

---

### 11. GET /api/v1/intents/:id/audit-history
**Purpose**: Fetch full audit history for an intent.

**Request**: None

**Response (200 OK)**:
```json
{
  "intentId": "intent-12345",
  "receipts": [...]
}
```

---

### 12. GET /api/v1/rfq/existing
**Purpose**: Fetch SDK-resolved option factory address and existing RFQs (read-only).

**Request**: None

**Response (200 OK)**:
```json
{
  "quotationCount": "5",
  "factoryAddress": "0x1111111111111111111111111111111111111111",
  "chainId": 8453,
  "rfqs": [],
  "status": "READ_ONLY"
}
```
