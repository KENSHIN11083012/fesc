import type { Purpose } from "../../domain/purpose.js";
import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { JobRepository } from "../ports/job-repository.js";
import type { BatchProcessor } from "./batch-processor.js";

export interface BatchSubmission {
  readonly requester: string;
  readonly idempotencyKey: string;
  readonly purpose: Purpose;
  readonly documents: readonly string[];
}

export interface BatchSubmissionReceipt {
  readonly jobId: string;
  /** false cuando la llave de idempotencia ya existía y se devolvió el mismo trabajo. */
  readonly created: boolean;
}

/**
 * Caso de uso: recibir un lote. Es idempotente: la misma caja con la misma
 * `Idempotency-Key` siempre obtiene el mismo `jobId` y el lote no se procesa dos veces.
 */
export class SubmitBatch {
  constructor(
    private readonly jobs: JobRepository,
    private readonly processor: BatchProcessor,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  execute(submission: BatchSubmission): BatchSubmissionReceipt {
    const existing = this.jobs.findByIdempotencyKey(submission.requester, submission.idempotencyKey);
    if (existing) {
      return { jobId: existing.id, created: false };
    }

    const jobId = this.ids.next();
    this.jobs.create(
      {
        id: jobId,
        requester: submission.requester,
        idempotencyKey: submission.idempotencyKey,
        purpose: submission.purpose,
        status: "PENDING",
        total: submission.documents.length,
        processed: 0,
        createdAt: this.clock.now().toISOString(),
        finishedAt: null,
      },
      submission.documents,
    );
    this.processor.enqueue(jobId);
    return { jobId, created: true };
  }
}
