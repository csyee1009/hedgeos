# Typed Risk Intent Schema Specification

---

## 1. Intent Field Definitions & Provenance Rules

Every field in the `TypedRiskIntent` schema is wrapped in a `FieldProvenance<T>` object to guarantee zero silent assumptions.

Protocol and token financial values must NOT use JavaScript floating point `number`. All monetary values preserve exact precision using `AmountWithDecimals` (`amountBaseUnits: string`, `decimals: number`, `formatted: string`).

```typescript
export interface AmountWithDecimals {
  amountBaseUnits: string; // BigInt string representation to prevent JS float precision loss
  decimals: number;
  formatted: string; // Human-readable string representation
}

export interface HorizonTarget {
  timestamp: number; // Target timestamp ms
  isoString: string; // Explicit ISO-8601 representation
  timezone: string; // Documented timezone (e.g. Asia/Kuala_Lumpur MYT, UTC+8)
}

export interface TypedRiskIntent {
  intentId: string;
  timestamp: number;
  confirmedByUser: boolean;
  asset: FieldProvenance<string>;
  exposureAmount: FieldProvenance<AmountWithDecimals>;
  targetMaxLossPercent: FieldProvenance<number>; // Percentage 0-100
  maxPremiumUSDC: FieldProvenance<AmountWithDecimals>;
  horizonTimestamp: FieldProvenance<HorizonTarget>;
  allowedProtocols: FieldProvenance<string[]>;
  allowMultiLeg: FieldProvenance<boolean>;
}
```

---

## 2. Invariant Rules for Time & Intent Parsing

1. **Exact Horizon Parsing**: Natural-language "Friday" must resolve to the upcoming Friday at 23:59:59 MYT (UTC+8) represented in exact ISO-8601 format. Simple `now + 7 days` approximations are prohibited.
2. **Financially Material Confirmation**: All time horizons and inferred financial fields require explicit human confirmation (`requiresConfirmation: true`).
3. **Explicit User Locking**: An intent cannot enter the Financial Constitution Policy Engine until `confirmedByUser === true`.
