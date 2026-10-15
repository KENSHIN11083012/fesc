import type { DatabaseSync } from "node:sqlite";
import type { BatchResult } from "../../application/batch/batch-types.js";
import type { BatchJob, JobRepository, JobStatus } from "../../application/ports/job-repository.js";

interface JobRow {
  id: string;
  requester: string;
  idempotency_key: string;
  purpose: string;
  status: string;
  total: number;
  processed: number;
  created_at: string;
  finished_at: string | null;
}

const JOB_COLUMNS = "id, requester, idempotency_key, purpose, status, total, processed, created_at, finished_at";

function toJob(row: JobRow | undefined): BatchJob | null {
  if (!row) return null;
  return {
    id: row.id,
    requester: row.requester,
    idempotencyKey: row.idempotency_key,
    purpose: row.purpose,
    status: row.status as JobStatus,
    total: Number(row.total),
    processed: Number(row.processed),
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

/**
 * Lotes en SQLite. La restricción UNIQUE (requester, idempotency_key) garantiza
 * la idempotencia incluso si el servicio se reinicia entre dos envíos.
 */
export class SqliteJobRepository implements JobRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(job: BatchJob, documents: readonly string[]): void {
    this.db
      .prepare(
        `INSERT INTO batch_jobs (id, requester, idempotency_key, purpose, status, total, processed, documents, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(job.id, job.requester, job.idempotencyKey, job.purpose, job.status, job.total, job.processed, JSON.stringify(documents), job.createdAt);
  }

  findByIdempotencyKey(requester: string, key: string): BatchJob | null {
    const row = this.db.prepare(`SELECT ${JOB_COLUMNS} FROM batch_jobs WHERE requester = ? AND idempotency_key = ?`).get(requester, key);
    return toJob(row as unknown as JobRow | undefined);
  }

  get(id: string): BatchJob | null {
    const row = this.db.prepare(`SELECT ${JOB_COLUMNS} FROM batch_jobs WHERE id = ?`).get(id);
    return toJob(row as unknown as JobRow | undefined);
  }

  documentsOf(id: string): string[] {
    const row = this.db.prepare(`SELECT documents FROM batch_jobs WHERE id = ?`).get(id) as { documents?: string } | undefined;
    return row?.documents ? (JSON.parse(row.documents) as string[]) : [];
  }

  resultsOf(id: string): BatchResult[] {
    const row = this.db.prepare(`SELECT results FROM batch_jobs WHERE id = ?`).get(id) as { results?: string | null } | undefined;
    return row?.results ? (JSON.parse(row.results) as BatchResult[]) : [];
  }

  markRunning(id: string): void {
    this.db.prepare(`UPDATE batch_jobs SET status = 'RUNNING' WHERE id = ?`).run(id);
  }

  updateProgress(id: string, processed: number): void {
    this.db.prepare(`UPDATE batch_jobs SET processed = ? WHERE id = ?`).run(processed, id);
  }

  complete(id: string, results: readonly BatchResult[], finishedAt: string): void {
    this.db
      .prepare(`UPDATE batch_jobs SET status = 'DONE', processed = ?, results = ?, finished_at = ? WHERE id = ?`)
      .run(results.length, JSON.stringify(results), finishedAt, id);
  }

  unfinished(): BatchJob[] {
    const rows = this.db.prepare(`SELECT ${JOB_COLUMNS} FROM batch_jobs WHERE status <> 'DONE' ORDER BY created_at`).all();
    return (rows as unknown as JobRow[]).map((row) => toJob(row) as BatchJob);
  }
}
