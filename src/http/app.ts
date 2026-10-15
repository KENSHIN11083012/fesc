import express, { type Express } from "express";
import type { GetBatchStatus } from "../application/batch/get-batch-status.js";
import type { SubmitBatch } from "../application/batch/submit-batch.js";
import type { CheckAffiliation } from "../application/check-affiliation.js";
import type { GetAuditLog } from "../application/get-audit-log.js";
import { type TokenRegistry, authenticate } from "./middlewares/auth.js";
import { errorHandler, notFound } from "./middlewares/error-handler.js";
import { affiliationsRouter } from "./routes/affiliations.routes.js";
import { auditRouter } from "./routes/audit.routes.js";
import { batchRouter } from "./routes/batch.routes.js";

export interface HttpDependencies {
  readonly tokens: TokenRegistry;
  readonly checkAffiliation: CheckAffiliation;
  readonly submitBatch: SubmitBatch;
  readonly getBatchStatus: GetBatchStatus;
  readonly getAuditLog: GetAuditLog;
  readonly enabledCajas: readonly string[];
  readonly log: (message: string, error: unknown) => void;
}

/** Arma la aplicación Express: solo enruta y traduce HTTP; la lógica vive en los casos de uso. */
export function createApp(deps: HttpDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);

  app.get("/health", (_req, res) => {
    res.json({ status: "UP", cajas: deps.enabledCajas });
  });

  app.use("/api", authenticate(deps.tokens));
  app.use("/api", affiliationsRouter(deps.checkAffiliation));
  app.use("/api", batchRouter(deps.submitBatch, deps.getBatchStatus));
  app.use("/api", auditRouter(deps.getAuditLog));

  app.use(notFound);
  app.use(errorHandler(deps.log));
  return app;
}
