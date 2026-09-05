import { AuditReceipt } from "../types";
import { SqliteDatabase } from "./SqliteDatabase";

export class AuditReceiptRepository {
  private db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  public async save(receipt: AuditReceipt): Promise<AuditReceipt> {
    const payloadJson = JSON.stringify(receipt);
    const stmt = this.db.rawDb.prepare(
      "INSERT OR IGNORE INTO audit_receipts (receipt_id, receipt_digest, intent_id, intent_version, payload_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      receipt.receiptId,
      receipt.receiptDigest,
      receipt.intentId,
      receipt.intentVersion,
      payloadJson,
      receipt.createdAtMs
    );
    return receipt;
  }

  public async findById(receiptId: string): Promise<AuditReceipt | null> {
    const stmt = this.db.rawDb.prepare(
      "SELECT payload_json FROM audit_receipts WHERE receipt_id = ?"
    );
    const row = stmt.get(receiptId) as { payload_json: string } | undefined;
    if (!row) {
      return null;
    }
    try {
      return JSON.parse(row.payload_json);
    } catch {
      return null;
    }
  }

  public async findByIntentId(intentId: string): Promise<AuditReceipt[]> {
    const stmt = this.db.rawDb.prepare(
      "SELECT payload_json FROM audit_receipts WHERE intent_id = ? ORDER BY created_at_ms DESC"
    );
    const rows = stmt.all(intentId) as Array<{ payload_json: string }>;
    const results: AuditReceipt[] = [];
    for (const r of rows) {
      try {
        results.push(JSON.parse(r.payload_json));
      } catch {
        // ignore malformed
      }
    }
    return results;
  }
}
