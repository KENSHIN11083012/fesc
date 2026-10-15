import type { DatabaseSync, StatementSync } from "node:sqlite";
import type { AuditEntry, AuditRepository } from "../../application/ports/audit-repository.js";

interface AuditRow {
  timestamp: string;
  requesting_caja: string;
  purpose: string;
  result: string;
  document_masked: string;
  request_id: string;
  channel: string;
}

/** Auditoría en SQLite: solo guarda el documento enmascarado, nunca el número completo. */
export class SqliteAuditRepository implements AuditRepository {
  private readonly insert: StatementSync;
  private readonly selectRecent: StatementSync;

  constructor(db: DatabaseSync) {
    this.insert = db.prepare(
      `INSERT INTO audit_log (timestamp, requesting_caja, purpose, result, document_masked, request_id, channel)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.selectRecent = db.prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`);
  }

  record(entry: AuditEntry): void {
    this.insert.run(entry.timestamp, entry.requestingCaja, entry.purpose, entry.result, entry.documentMasked, entry.requestId, entry.channel);
  }

  recent(limit: number): AuditEntry[] {
    return (this.selectRecent.all(limit) as unknown as AuditRow[]).map((row) => ({
      timestamp: row.timestamp,
      requestingCaja: row.requesting_caja,
      purpose: row.purpose,
      result: row.result,
      documentMasked: row.document_masked,
      requestId: row.request_id,
      channel: row.channel === "BATCH" ? "BATCH" : "ONLINE",
    }));
  }
}
