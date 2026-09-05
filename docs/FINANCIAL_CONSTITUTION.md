# HedgeOS Financial Constitution (Policy Engine)

---

## 1. Deterministic Safety Mandate

The Financial Constitution is an unbypassable, deterministic policy engine that verifies all proposed transaction parameters before preview generation.

**Core Invariant**:
> The AI parser proposes intent parameters. The Financial Constitution enforces policy rules. The human user explicitly authorizes execution. No AI component can override policy engine decisions.

---

## 2. Policy Invariants

| Policy Rule ID | Constraint Description | Enforcement Logic | Failure Action |
|---|---|---|---|
| `POL-001` | Maximum Spend Bound | `transaction.premium <= intent.maxPremiumUSDC` | Immediate Reject (`MAX_PREMIUM_VIOLATION`) |
| `POL-002` | Strict Asset Match | `transaction.asset == intent.asset` | Immediate Reject (`UNAUTHORIZED_ASSET`) |
| `POL-003` | Protocol Whitelist | `transaction.targetContract IN WHITELISTED_THETANUTS_BASE` | Immediate Reject (`UNTRUSTED_CONTRACT`) |
| `POL-004` | No Unlimited ERC20 Approvals | `approvalAmount == exactPremium` | Immediate Reject (`UNLIMITED_APPROVAL_FORBIDDEN`) |
| `POL-005` | Exact Intent Hash Binding | `sha256(intent) == transaction.bindingHash` | Immediate Reject (`INTENT_TRANSACTION_MISMATCH`) |

---

## 3. Policy Decision Record Schema

```typescript
export interface PolicyDecisionRecord {
  decisionId: string;
  intentId: string;
  strategyId: string;
  passedAllInvariants: boolean;
  checks: {
    ruleId: string;
    description: string;
    passed: boolean;
    details: string;
  }[];
  timestamp: number;
}
```
