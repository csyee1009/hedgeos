import {
  ExternalHumanAuthorizationHandoff,
  ExternalHumanAuthorizationStatus,
} from "../types";
import { SqliteDatabase } from "./SqliteDatabase";

export class AuthorizationHandoffRepository {
  private db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  public async save(
    handoff: ExternalHumanAuthorizationHandoff
  ): Promise<ExternalHumanAuthorizationHandoff> {
    const payloadJson = JSON.stringify(handoff);
    const stmt = this.db.rawDb.prepare(
      "INSERT OR REPLACE INTO authorization_handoffs (request_id, intent_id, intent_version, proposal_digest, status, expires_at_ms, payload_json, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      handoff.requestId,
      handoff.intentId,
      handoff.intentVersion,
      handoff.proposalDigest,
      handoff.status,
      handoff.expiresAtMs,
      payloadJson,
      handoff.createdAtMs,
      handoff.createdAtMs
    );
    return handoff;
  }

  public async findById(
    requestId: string
  ): Promise<ExternalHumanAuthorizationHandoff | null> {
    const stmt = this.db.rawDb.prepare(
      "SELECT payload_json FROM authorization_handoffs WHERE request_id = ?"
    );
    const row = stmt.get(requestId) as { payload_json: string } | undefined;
    if (!row) {
      return null;
    }
    try {
      return JSON.parse(row.payload_json);
    } catch {
      return null;
    }
  }

  public async updateStatus(
    requestId: string,
    status: ExternalHumanAuthorizationStatus,
    updatedAtMs: number = Date.now()
  ): Promise<void> {
    const existing = await this.findById(requestId);
    if (!existing) {
      return;
    }
    existing.status = status;
    const payloadJson = JSON.stringify(existing);
    const stmt = this.db.rawDb.prepare(
      "UPDATE authorization_handoffs SET status = ?, payload_json = ?, updated_at_ms = ? WHERE request_id = ?"
    );
    stmt.run(status, payloadJson, updatedAtMs, requestId);
  }
}
