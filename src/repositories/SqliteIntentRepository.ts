import { IntentRepository, StoredIntent } from "./IntentRepository";
import { SqliteDatabase } from "./SqliteDatabase";

export class SqliteIntentRepository implements IntentRepository {
  public readonly storageType = "SQLITE_DURABLE" as const;
  private db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  public async save(intent: StoredIntent): Promise<StoredIntent> {
    const payloadJson = JSON.stringify(intent);
    const confirmedInt = intent.confirmedByUser ? 1 : 0;
    const stmt = this.db.rawDb.prepare(
      "INSERT OR REPLACE INTO intents (intent_id, version, confirmed, payload_json, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?)"
    );
    stmt.run(
      intent.intentId,
      intent.version,
      confirmedInt,
      payloadJson,
      intent.createdAtMs,
      intent.updatedAtMs
    );
    return JSON.parse(payloadJson);
  }

  public async findById(intentId: string): Promise<StoredIntent | null> {
    const stmt = this.db.rawDb.prepare(
      "SELECT payload_json FROM intents WHERE intent_id = ?"
    );
    const row = stmt.get(intentId) as { payload_json: string } | undefined;
    if (!row) {
      return null;
    }
    try {
      return JSON.parse(row.payload_json);
    } catch {
      return null;
    }
  }

  public async update(intent: StoredIntent): Promise<StoredIntent> {
    const payloadJson = JSON.stringify(intent);
    const confirmedInt = intent.confirmedByUser ? 1 : 0;
    const stmt = this.db.rawDb.prepare(
      "UPDATE intents SET version = ?, confirmed = ?, payload_json = ?, updated_at_ms = ? WHERE intent_id = ?"
    );
    const result = stmt.run(
      intent.version,
      confirmedInt,
      payloadJson,
      intent.updatedAtMs,
      intent.intentId
    );

    if ((result as any).changes === 0) {
      return this.save(intent);
    }

    return JSON.parse(payloadJson);
  }
}
