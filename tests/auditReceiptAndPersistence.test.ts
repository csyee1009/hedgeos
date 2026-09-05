import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { resolve } from "path";
import {
  ActionProposal,
  AuditReceipt,
  BoundedAuthorizationAttestation,
  ExecutionCommitment,
  ExternalHumanAuthorizationHandoff,
  HumanReviewRecord,
  PolicyDecisionRecord,
  SimulationResult,
  TypedRiskIntent,
} from "../src/types";
import {
  AuditReceiptService,
  computeIntentDigest,
} from "../src/services/AuditReceiptService";
import { SqliteDatabase } from "../src/repositories/SqliteDatabase";
import { SqliteIntentRepository } from "../src/repositories/SqliteIntentRepository";
import { AuditReceiptRepository } from "../src/repositories/AuditReceiptRepository";
import { AuthorizationHandoffRepository } from "../src/repositories/AuthorizationHandoffRepository";

const testDbPath = resolve("./data/test_audit_db.sqlite");

const cleanupDbFiles = () => {
  for (const ext of ["", "-shm", "-wal"]) {
    const f = testDbPath + ext;
    if (existsSync(f)) {
      try {
        unlinkSync(f);
      } catch {}
    }
  }
};

const baseIntent = {
  intentId: "intent-audit-1",
  version: 1,
  createdAtMs: Date.now(),
  updatedAtMs: Date.now(),
  confirmedAtMs: Date.now(),
  confirmedByUser: true,
  objective: { value: "DOWNSIDE_PROTECTION" },
  asset: { value: "ETH" },
  exposureAmount: {
    value: { amountBaseUnits: "1000000000000000000", decimals: 18, symbol: "ETH" },
  },
  targetMaxLossPercent: { value: 10 },
  maxPremiumUSDC: {
    value: { amountBaseUnits: "10000000", decimals: 6, symbol: "USDC" },
  },
  horizonTimestamp: { timestampMs: Date.now() + 86400000 },
  allowedProtocols: { value: ["THETANUTS"] },
  allowMultiLeg: { value: false },
} as unknown as TypedRiskIntent;

const baseProposal = {
  proposalId: "prop-1",
  proposalDigest: "p-digest-1",
} as ActionProposal;

const baseSimulation = {
  simulationId: "sim-1",
  marketEvidenceTimestampMs: Date.now(),
  marketEvidenceStatus: "FRESH",
  status: "PROVIDER_SIMULATED",
} as SimulationResult;

const baseReview = {
  reviewId: "rev-1",
} as HumanReviewRecord;

const baseAttestation = {
  attestationId: "att-1",
  attestationDigest: "att-digest-1",
} as BoundedAuthorizationAttestation;

const baseCommitment = {
  commitmentId: "commit-1",
  commitmentDigest: "commit-digest-1",
} as ExecutionCommitment;

const baseHandoff = {
  requestId: "handoff-1",
  status: "AWAITING_EXTERNAL_HUMAN",
} as ExternalHumanAuthorizationHandoff;

describe("AuditReceipt & Durable Persistence Suite", () => {
  beforeEach(() => {
    cleanupDbFiles();
  });

  afterEach(() => {
    cleanupDbFiles();
  });

  it("1. same audit inputs => same receiptDigest", () => {
    const fixedNow = 1725500000000;
    const r1 = AuditReceiptService.createReceipt({ intent: baseIntent, createdAtMs: fixedNow });
    const r2 = AuditReceiptService.createReceipt({ intent: baseIntent, createdAtMs: fixedNow });
    expect(r1.receiptDigest).toBe(r2.receiptDigest);
  });

  it("2. changed intentVersion => different receiptDigest", () => {
    const i2 = { ...baseIntent, version: 2 } as TypedRiskIntent;
    const r1 = AuditReceiptService.createReceipt({ intent: baseIntent });
    const r2 = AuditReceiptService.createReceipt({ intent: i2 });
    expect(r1.receiptDigest).not.toBe(r2.receiptDigest);
  });

  it("3. changed budget => different intentDigest and receiptDigest", () => {
    const i2 = {
      ...baseIntent,
      maxPremiumUSDC: {
        value: { amountBaseUnits: "12000000", decimals: 6, symbol: "USDC" },
      },
    } as TypedRiskIntent;

    const d1 = computeIntentDigest(baseIntent);
    const d2 = computeIntentDigest(i2);
    expect(d1).not.toBe(d2);

    const r1 = AuditReceiptService.createReceipt({ intent: baseIntent });
    const r2 = AuditReceiptService.createReceipt({ intent: i2 });
    expect(r1.receiptDigest).not.toBe(r2.receiptDigest);
  });

  it("4. changed proposalDigest => different receiptDigest", () => {
    const p2 = { ...baseProposal, proposalDigest: "p-digest-2" } as ActionProposal;
    const r1 = AuditReceiptService.createReceipt({
      intent: baseIntent,
      actionProposal: baseProposal,
    });
    const r2 = AuditReceiptService.createReceipt({
      intent: baseIntent,
      actionProposal: p2,
    });
    expect(r1.receiptDigest).not.toBe(r2.receiptDigest);
  });

  it("5. changed executionCommitmentDigest => different receiptDigest", () => {
    const c2 = { ...baseCommitment, commitmentDigest: "c-digest-2" } as ExecutionCommitment;
    const r1 = AuditReceiptService.createReceipt({
      intent: baseIntent,
      executionCommitment: baseCommitment,
    });
    const r2 = AuditReceiptService.createReceipt({
      intent: baseIntent,
      executionCommitment: c2,
    });
    expect(r1.receiptDigest).not.toBe(r2.receiptDigest);
  });

  it("6. PASS Constitution => PASS", () => {
    const pd: Record<string, PolicyDecisionRecord> = {
      p1: { decisionId: "d1", overallStatus: "PASS", passedAllInvariants: true } as any,
    };
    const r = AuditReceiptService.createReceipt({
      intent: baseIntent,
      policyDecisions: pd,
    });
    expect(r.financialConstitutionStatus).toBe("PASS");
  });

  it("7. failing policy => FAIL", () => {
    const pd: Record<string, PolicyDecisionRecord> = {
      p1: { decisionId: "d1", overallStatus: "PASS", passedAllInvariants: true } as any,
      p2: { decisionId: "d2", overallStatus: "FAIL", passedAllInvariants: false } as any,
    };
    const r = AuditReceiptService.createReceipt({
      intent: baseIntent,
      policyDecisions: pd,
    });
    expect(r.financialConstitutionStatus).toBe("FAIL");
  });

  it("8. incomplete evidence => INCOMPLETE", () => {
    const pd: Record<string, PolicyDecisionRecord> = {
      p1: { decisionId: "d1", overallStatus: "INCOMPLETE", passedAllInvariants: true } as any,
    };
    const r = AuditReceiptService.createReceipt({
      intent: baseIntent,
      policyDecisions: pd,
    });
    expect(r.financialConstitutionStatus).toBe("INCOMPLETE");
  });

  it("9. no policy => NOT_AVAILABLE", () => {
    const r = AuditReceiptService.createReceipt({
      intent: baseIntent,
      policyDecisions: {},
    });
    expect(r.financialConstitutionStatus).toBe("NOT_AVAILABLE");
  });

  it("10. finalExecutionStatus => always NOT_AUTHORIZED", () => {
    const r = AuditReceiptService.createReceipt({ intent: baseIntent });
    expect(r.finalExecutionStatus).toBe("NOT_AUTHORIZED");
  });

  it("11. SQLite intent survives restart (close & reopen database)", async () => {
    const db1 = new SqliteDatabase(testDbPath);
    const repo1 = new SqliteIntentRepository(db1);
    await repo1.save(baseIntent);
    db1.close();

    const db2 = new SqliteDatabase(testDbPath);
    const repo2 = new SqliteIntentRepository(db2);
    const loaded = await repo2.findById(baseIntent.intentId);
    db2.close();

    expect(loaded).not.toBeNull();
    expect(loaded?.intentId).toBe(baseIntent.intentId);
  });

  it("12. intent version survives restart", async () => {
    const db1 = new SqliteDatabase(testDbPath);
    const repo1 = new SqliteIntentRepository(db1);
    const updated = { ...baseIntent, version: 5 };
    await repo1.save(updated);
    db1.close();

    const db2 = new SqliteDatabase(testDbPath);
    const repo2 = new SqliteIntentRepository(db2);
    const loaded = await repo2.findById(baseIntent.intentId);
    db2.close();

    expect(loaded?.version).toBe(5);
  });

  it("13. audit receipt survives restart", async () => {
    const r = AuditReceiptService.createReceipt({ intent: baseIntent });

    const db1 = new SqliteDatabase(testDbPath);
    const repo1 = new AuditReceiptRepository(db1);
    await repo1.save(r);
    db1.close();

    const db2 = new SqliteDatabase(testDbPath);
    const repo2 = new AuditReceiptRepository(db2);
    const loaded = await repo2.findById(r.receiptId);
    db2.close();

    expect(loaded?.receiptDigest).toBe(r.receiptDigest);
  });

  it("14. authorization handoff survives restart", async () => {
    const handoff = {
      requestId: "req-100",
      intentId: "intent-1",
      intentVersion: 1,
      proposalId: "prop-1",
      proposalDigest: "prop-digest-1",
      status: "AWAITING_EXTERNAL_HUMAN" as const,
      expiresAtMs: Date.now() + 600000,
      createdAtMs: Date.now(),
      executionStatus: "NOT_AUTHORIZED" as const,
      canExecute: false as const,
      chainId: 8453 as const,
      protocol: "THETANUTS" as const,
      authorizationAttestationId: "att-1",
      authorizationAttestationDigest: "att-d",
      executionCommitmentId: "com-1",
      executionCommitmentDigest: "com-d",
      maximumSpendUSDC: { amountBaseUnits: "1000000", decimals: 6, symbol: "USDC" },
      expectedExpiryMs: Date.now() + 600000,
      disclosure: "disclosure text",
    };

    const db1 = new SqliteDatabase(testDbPath);
    const repo1 = new AuthorizationHandoffRepository(db1);
    await repo1.save(handoff);
    db1.close();

    const db2 = new SqliteDatabase(testDbPath);
    const repo2 = new AuthorizationHandoffRepository(db2);
    const loaded = await repo2.findById("req-100");
    db2.close();

    expect(loaded?.requestId).toBe("req-100");
    expect(loaded?.status).toBe("AWAITING_EXTERNAL_HUMAN");
  });

  it("15. parameterized quote-like input does NOT alter schema (SQL injection safe)", async () => {
    const maliciousId = "intent-1'; DROP TABLE intents; --";
    const maliciousIntent = {
      ...baseIntent,
      intentId: maliciousId,
    };

    const db = new SqliteDatabase(testDbPath);
    const repo = new SqliteIntentRepository(db);
    await repo.save(maliciousIntent);

    const loaded = await repo.findById(maliciousId);
    expect(loaded?.intentId).toBe(maliciousId);

    // Verify table still exists
    const checkStmt = db.rawDb.prepare("SELECT count(*) as cnt FROM intents");
    const res = checkStmt.get() as { cnt: number };
    expect(res.cnt).toBeGreaterThan(0);
    db.close();
  });

  it("16. malformed persisted JSON fails safely", async () => {
    const db = new SqliteDatabase(testDbPath);
    db.rawDb
      .prepare(
        "INSERT INTO audit_receipts (receipt_id, receipt_digest, intent_id, intent_version, payload_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run("r-bad", "digest-bad", "intent-1", 1, "{invalid_json", Date.now());

    const repo = new AuditReceiptRepository(db);
    const loaded = await repo.findById("r-bad");
    expect(loaded).toBeNull();
    db.close();
  });

  it("17. duplicate receipt digest handled safely", async () => {
    const r = AuditReceiptService.createReceipt({ intent: baseIntent });

    const db = new SqliteDatabase(testDbPath);
    const repo = new AuditReceiptRepository(db);
    await repo.save(r);
    // Duplicate save should not throw
    await expect(repo.save(r)).resolves.not.toThrow();
    db.close();
  });

  it("18. audit API unknown ID handling", async () => {
    const db = new SqliteDatabase(testDbPath);
    const repo = new AuditReceiptRepository(db);
    const loaded = await repo.findById("non-existent-id");
    expect(loaded).toBeNull();
    db.close();
  });

  it("19. audit payload excludes sensitive keys (RPC URL, API key, headers, private keys)", () => {
    const r = AuditReceiptService.createReceipt({ intent: baseIntent });
    const jsonStr = JSON.stringify(r);

    expect(jsonStr).not.toContain("GEMINI_API_KEY");
    expect(jsonStr).not.toContain("BASE_RPC_URL");
    expect(jsonStr).not.toContain("privateKey");
    expect(jsonStr).not.toContain("mnemonic");
    expect(jsonStr).not.toContain("Authorization");
  });

  it("20. production repository must not silently fall back to memory", () => {
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    // Attempting invalid path should throw in production rather than silently falling back
    expect(() => new SqliteDatabase("/invalid_path_that_cannot_be_created_/\0/db.sqlite")).toThrow();

    process.env.NODE_ENV = oldEnv;
  });
});
