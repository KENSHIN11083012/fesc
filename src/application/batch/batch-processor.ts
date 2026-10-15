import { InvalidDocumentError, normalizeDocument } from "../../domain/document.js";
import type { Purpose } from "../../domain/purpose.js";
import type { AffiliationReport, CheckAffiliation } from "../check-affiliation.js";
import type { Clock } from "../ports/clock.js";
import type { JobRepository } from "../ports/job-repository.js";
import type { BatchResult } from "./batch-types.js";

export interface BatchProcessorOptions {
  /** Documentos que se consultan al mismo tiempo. */
  readonly concurrency: number;
  /** Cada cuántos documentos se guarda el avance. */
  readonly progressEvery: number;
}

/**
 * Procesa los lotes en segundo plano, uno a la vez (cola), con un grupo de
 * trabajadores concurrentes. Los documentos repetidos se consultan una sola vez.
 */
export class BatchProcessor {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly jobs: JobRepository,
    private readonly checkAffiliation: CheckAffiliation,
    private readonly clock: Clock,
    private readonly options: BatchProcessorOptions,
    private readonly onError: (jobId: string, error: unknown) => void = () => {},
  ) {}

  enqueue(jobId: string): void {
    this.queue = this.queue.then(() => this.run(jobId)).catch((error) => this.onError(jobId, error));
  }

  /** Retoma los lotes que quedaron sin terminar (por ejemplo, tras un reinicio). */
  resumeUnfinished(): void {
    for (const job of this.jobs.unfinished()) this.enqueue(job.id);
  }

  private async run(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.status === "DONE") return;

    this.jobs.markRunning(jobId);
    const documents = this.jobs.documentsOf(jobId);
    const results: BatchResult[] = new Array(documents.length);
    const cache = new Map<string, Promise<AffiliationReport>>();
    let next = 0;
    let processed = 0;

    const worker = async (): Promise<void> => {
      while (next < documents.length) {
        const index = next++;
        results[index] = await this.checkOne(documents[index] ?? "", job.requester, job.purpose as Purpose, cache);
        processed++;
        if (processed % this.options.progressEvery === 0) this.jobs.updateProgress(jobId, processed);
      }
    };

    const workers = Array.from({ length: Math.max(1, this.options.concurrency) }, () => worker());
    await Promise.all(workers);
    this.jobs.complete(jobId, results, this.clock.now().toISOString());
  }

  private async checkOne(
    raw: string,
    requester: string,
    purpose: Purpose,
    cache: Map<string, Promise<AffiliationReport>>,
  ): Promise<BatchResult> {
    let normalized: string;
    try {
      normalized = normalizeDocument(raw);
    } catch (error) {
      if (!(error instanceof InvalidDocumentError)) throw error;
      return { document: raw, normalizedDocument: null, result: "INDETERMINADO", matches: [], unavailable: [], error: "DOCUMENTO_INVALIDO" };
    }

    let pending = cache.get(normalized);
    if (!pending) {
      pending = this.checkAffiliation.execute({ document: normalized, purpose, requester, channel: "BATCH" });
      cache.set(normalized, pending);
    }
    const report = await pending;
    return {
      document: raw,
      normalizedDocument: normalized,
      result: report.result,
      matches: report.matches.map(({ caja, validFrom, validTo, source, asOf }) => ({ caja, validFrom, validTo, source, asOf })),
      unavailable: report.unavailable,
    };
  }
}
