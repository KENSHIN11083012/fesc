import type { BatchResult } from "../batch/batch-types.js";

export type JobStatus = "PENDING" | "RUNNING" | "DONE";

export interface BatchJob {
  readonly id: string;
  readonly requester: string;
  readonly idempotencyKey: string;
  readonly purpose: string;
  readonly status: JobStatus;
  readonly total: number;
  readonly processed: number;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface JobRepository {
  create(job: BatchJob, documents: readonly string[]): void;
  findByIdempotencyKey(requester: string, key: string): BatchJob | null;
  get(id: string): BatchJob | null;
  documentsOf(id: string): string[];
  resultsOf(id: string): BatchResult[];
  markRunning(id: string): void;
  updateProgress(id: string, processed: number): void;
  complete(id: string, results: readonly BatchResult[], finishedAt: string): void;
  unfinished(): BatchJob[];
}
