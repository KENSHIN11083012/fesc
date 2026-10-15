import express, { type Request, type Response, Router } from "express";
import type { GetBatchStatus } from "../../application/batch/get-batch-status.js";
import type { SubmitBatch } from "../../application/batch/submit-batch.js";
import { PURPOSES, isPurpose } from "../../domain/purpose.js";
import { extractMultipartFile, parseDocumentsCsv } from "../csv.js";
import { HttpError } from "../http-error.js";
import { consumerOf } from "../middlewares/auth.js";

const MAX_BODY = "20mb";
const DEFAULT_BATCH_PURPOSE = "VALIDACION_AFILIACION";

/** Rutas del cruce por lote: envío asíncrono (202) y consulta de estado. */
export function batchRouter(submitBatch: SubmitBatch, getBatchStatus: GetBatchStatus): Router {
  const router = Router();

  router.post(
    "/v1/batch-checks",
    express.text({ type: ["text/csv", "text/plain", "application/csv"], limit: MAX_BODY }),
    express.raw({ type: ["multipart/form-data", "application/octet-stream"], limit: MAX_BODY }),
    (req: Request, res: Response) => {
      const idempotencyKey = (req.header("idempotency-key") ?? "").trim();
      if (!idempotencyKey) throw new HttpError(400, "FALTA_IDEMPOTENCY_KEY", "El encabezado Idempotency-Key es obligatorio");
      if (idempotencyKey.length > 200) throw new HttpError(400, "IDEMPOTENCY_KEY_INVALIDA", "Idempotency-Key admite máximo 200 caracteres");

      const purpose = req.query.purpose ?? DEFAULT_BATCH_PURPOSE;
      if (!isPurpose(purpose)) throw new HttpError(400, "FINALIDAD_INVALIDA", `purpose debe ser uno de: ${PURPOSES.join(", ")}`);

      const receipt = submitBatch.execute({
        requester: consumerOf(res).caja,
        idempotencyKey,
        purpose,
        documents: parseDocumentsCsv(readCsvBody(req)),
      });
      res.status(202).location(`/api/v1/batch-checks/${receipt.jobId}`).json({ jobId: receipt.jobId });
    },
  );

  router.get("/v1/batch-checks/:jobId", (req: Request, res: Response) => {
    const consumer = consumerOf(res);
    const view = getBatchStatus.execute(String(req.params.jobId), consumer.caja, consumer.isAdmin);
    if (!view) throw new HttpError(404, "LOTE_NO_ENCONTRADO", "No existe un lote con ese jobId para esta caja");
    res.setHeader("Cache-Control", "no-store");
    res.json({
      jobId: view.job.id,
      status: view.job.status,
      total: view.job.total,
      processed: view.job.processed,
      createdAt: view.job.createdAt,
      finishedAt: view.job.finishedAt,
      results: view.results,
    });
  });

  return router;
}

function readCsvBody(req: Request): string {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) {
    const contentType = req.header("content-type") ?? "";
    return contentType.toLowerCase().startsWith("multipart/") ? extractMultipartFile(req.body, contentType) : req.body.toString("utf-8");
  }
  throw new HttpError(415, "FORMATO_NO_SOPORTADO", "Envíe el CSV como text/csv o multipart/form-data con el campo file");
}
