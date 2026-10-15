import type { BatchJob, JobRepository } from "../ports/job-repository.js";
import type { BatchResult } from "./batch-types.js";

export interface BatchStatusView {
  readonly job: BatchJob;
  readonly results: BatchResult[];
}

/**
 * Caso de uso: estado de un lote. Solo lo ve la caja que lo envió (o administración);
 * para cualquier otra caja el lote "no existe", así no se filtra información.
 */
export class GetBatchStatus {
  constructor(private readonly jobs: JobRepository) {}

  execute(jobId: string, requester: string, isAdmin: boolean): BatchStatusView | null {
    const job = this.jobs.get(jobId);
    if (!job || (!isAdmin && job.requester !== requester)) return null;
    return { job, results: job.status === "DONE" ? this.jobs.resultsOf(jobId) : [] };
  }
}
