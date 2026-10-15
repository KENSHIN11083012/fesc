import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Abre (o crea) la base SQLite del servicio y aplica el esquema. */
export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "caja-link.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS audit_log (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp        TEXT NOT NULL,
      requesting_caja  TEXT NOT NULL,
      purpose          TEXT NOT NULL,
      result           TEXT NOT NULL,
      document_masked  TEXT NOT NULL,
      request_id       TEXT NOT NULL,
      channel          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batch_jobs (
      id               TEXT PRIMARY KEY,
      requester        TEXT NOT NULL,
      idempotency_key  TEXT NOT NULL,
      purpose          TEXT NOT NULL,
      status           TEXT NOT NULL,
      total            INTEGER NOT NULL,
      processed        INTEGER NOT NULL DEFAULT 0,
      documents        TEXT NOT NULL,
      results          TEXT,
      created_at       TEXT NOT NULL,
      finished_at      TEXT,
      UNIQUE (requester, idempotency_key)
    );
  `);
  return db;
}
