import { ExecutionPreparation, ExecutionVerificationRecord, ProtectionDiscoveryResult } from "../types";
import { canonicalJson, sha256Digest } from "../utils/canonicalDigest";
import { SqliteDatabase } from "./SqliteDatabase";

function verifyDiscovery(value: ProtectionDiscoveryResult): boolean {
  const { discoveryDigest, ...payload } = value;
  return discoveryDigest === sha256Digest(payload);
}

function verifyPreparation(value: ExecutionPreparation): boolean {
  const { preparationDigest, ...payload } = value;
  return preparationDigest === sha256Digest(payload);
}

function verifyExecution(value: ExecutionVerificationRecord): boolean {
  const { verificationDigest, ...payload } = value;
  return verificationDigest === sha256Digest(payload);
}

export class EvidenceRepository {
  constructor(private db: SqliteDatabase) {}

  public saveDiscovery(value: ProtectionDiscoveryResult): void {
    if (!verifyDiscovery(value)) throw new Error("Discovery digest mismatch");
    this.db.rawDb.prepare(
      "INSERT OR REPLACE INTO discovery_snapshots (discovery_id, discovery_digest, payload_json, created_at_ms) VALUES (?, ?, ?, ?)"
    ).run(value.discoveryId, value.discoveryDigest, canonicalJson(value), value.marketSnapshot.capturedAtMs);
  }

  public getDiscovery(id: string): ProtectionDiscoveryResult | null {
    const row = this.db.rawDb.prepare("SELECT payload_json FROM discovery_snapshots WHERE discovery_id = ?")
      .get(id) as { payload_json: string } | undefined;
    if (!row) return null;
    const value = JSON.parse(row.payload_json) as ProtectionDiscoveryResult;
    if (!verifyDiscovery(value)) throw new Error("Stored discovery evidence failed digest validation");
    return value;
  }

  public savePreparation(value: ExecutionPreparation): void {
    if (!verifyPreparation(value)) throw new Error("Preparation digest mismatch");
    this.db.rawDb.prepare(
      "INSERT OR REPLACE INTO execution_preparations (preparation_id, preparation_digest, intent_id, intent_version, payload_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(value.preparationId, value.preparationDigest, value.intentId, value.intentVersion, canonicalJson(value), value.createdAtMs);
  }

  public getPreparation(id: string): ExecutionPreparation | null {
    const row = this.db.rawDb.prepare("SELECT payload_json FROM execution_preparations WHERE preparation_id = ?")
      .get(id) as { payload_json: string } | undefined;
    if (!row) return null;
    const value = JSON.parse(row.payload_json) as ExecutionPreparation;
    if (!verifyPreparation(value)) throw new Error("Stored execution preparation failed digest validation");
    return value;
  }

  public saveVerification(value: ExecutionVerificationRecord): void {
    if (!verifyExecution(value)) throw new Error("Verification digest mismatch");
    this.db.rawDb.prepare(
      "INSERT OR REPLACE INTO execution_verifications (verification_id, verification_digest, preparation_id, transaction_hash, payload_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(value.verificationId, value.verificationDigest, value.preparationId, value.transactionHash, canonicalJson(value), value.checkedAtMs);
  }

  public getVerification(id: string): ExecutionVerificationRecord | null {
    const row = this.db.rawDb.prepare("SELECT payload_json FROM execution_verifications WHERE verification_id = ?")
      .get(id) as { payload_json: string } | undefined;
    if (!row) return null;
    const value = JSON.parse(row.payload_json) as ExecutionVerificationRecord;
    if (!verifyExecution(value)) throw new Error("Stored on-chain evidence failed digest validation");
    return value;
  }
}
