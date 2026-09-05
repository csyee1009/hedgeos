import { existsSync, mkdirSync } from "fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "path";

export class SqliteDatabase {
  private db: DatabaseSync;
  public readonly dbPath: string;

  constructor(customPath?: string) {
    const rawPath =
      customPath ||
      process.env.HEDGEOS_DB_PATH ||
      "./data/hedgeos.sqlite";

    if (rawPath === ":memory:") {
      this.dbPath = ":memory:";
    } else {
      this.dbPath = resolve(rawPath);
      const dir = dirname(this.dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.init();
  }

  private init() {
    try {
      this.db.exec("PRAGMA busy_timeout = 5000;");
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA foreign_keys = ON;");
    } catch {
      // WAL or timeout pragma may fail gracefully if another worker holds lock
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS intents (
        intent_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        confirmed INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_receipts (
        receipt_id TEXT PRIMARY KEY,
        receipt_digest TEXT NOT NULL UNIQUE,
        intent_id TEXT NOT NULL,
        intent_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS authorization_handoffs (
        request_id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL,
        intent_version INTEGER NOT NULL,
        proposal_digest TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS discovery_snapshots (
        discovery_id TEXT PRIMARY KEY,
        discovery_digest TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS execution_preparations (
        preparation_id TEXT PRIMARY KEY,
        preparation_digest TEXT NOT NULL,
        intent_id TEXT NOT NULL,
        intent_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS execution_verifications (
        verification_id TEXT PRIMARY KEY,
        verification_digest TEXT NOT NULL,
        preparation_id TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL
      );
    `);
  }

  public get rawDb(): DatabaseSync {
    return this.db;
  }

  public ping(): boolean {
    try {
      const row = this.db.prepare("SELECT 1 as alive").get() as { alive: number } | undefined;
      return row?.alive === 1;
    } catch {
      return false;
    }
  }

  public close() {
    this.db.close();
  }
}
