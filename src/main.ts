/**
 * Composition root: el único lugar donde se crean las implementaciones
 * concretas y se inyectan en los casos de uso (inversión de dependencias).
 */
import { BatchProcessor } from "./application/batch/batch-processor.js";
import { GetBatchStatus } from "./application/batch/get-batch-status.js";
import { SubmitBatch } from "./application/batch/submit-batch.js";
import { CheckAffiliation } from "./application/check-affiliation.js";
import { GetAuditLog } from "./application/get-audit-log.js";
import { createApp } from "./http/app.js";
import { TokenRegistry } from "./http/middlewares/auth.js";
import { createGateways, withResilience } from "./infrastructure/cajas/gateway-factory.js";
import { loadConfig } from "./infrastructure/config/load-config.js";
import { openDatabase } from "./infrastructure/persistence/database.js";
import { SqliteAuditRepository } from "./infrastructure/persistence/sqlite-audit.repository.js";
import { SqliteJobRepository } from "./infrastructure/persistence/sqlite-job.repository.js";
import { SystemClock } from "./infrastructure/system/system-clock.js";
import { UlidGenerator } from "./infrastructure/system/ulid-generator.js";

const log = (message: string, error?: unknown) => {
  const detail = error instanceof Error ? error.message : error === undefined ? "" : String(error);
  console.log(JSON.stringify({ time: new Date().toISOString(), message, ...(detail ? { detail } : {}) }));
};

function main(): void {
  const config = loadConfig(process.env.CONFIG_PATH ?? "config/cajas.yaml");
  const clock = new SystemClock(process.env.TIME_ZONE || undefined);
  const ids = new UlidGenerator();

  const db = openDatabase(config.dataDir);
  const audit = new SqliteAuditRepository(db);
  const jobs = new SqliteJobRepository(db);

  // Los mismos adaptadores con dos políticas: la consulta en línea prioriza
  // responder rápido; el lote tolera más espera y reintenta más.
  const gateways = createGateways(config.cajas, clock);
  const onlineGateways = withResilience(gateways, { timeoutMs: config.onlineTimeoutMs, retries: config.onlineRetries });
  const batchGateways = withResilience(gateways, { timeoutMs: config.batch.timeoutMs, retries: config.batch.retries });

  const checkAffiliation = new CheckAffiliation(onlineGateways, audit, clock, ids);
  const batchCheck = new CheckAffiliation(batchGateways, audit, clock, ids);
  const processor = new BatchProcessor(jobs, batchCheck, clock, { concurrency: config.batch.concurrency, progressEvery: 250 }, (jobId, error) =>
    log(`Falló el lote ${jobId}`, error),
  );

  const app = createApp({
    tokens: new TokenRegistry(
      config.cajas.map((caja) => ({ caja: caja.name, token: caja.consumerToken })),
      config.adminToken,
    ),
    checkAffiliation,
    submitBatch: new SubmitBatch(jobs, processor, clock, ids),
    getBatchStatus: new GetBatchStatus(jobs),
    getAuditLog: new GetAuditLog(audit),
    enabledCajas: gateways.map((gateway) => gateway.name),
    log,
  });

  processor.resumeUnfinished();
  const server = app.listen(config.port, () => log(`Caja Link escuchando en el puerto ${config.port}; cajas: ${gateways.map((g) => g.name).join(", ")}`));

  const shutdown = () => {
    log("Cerrando Caja Link");
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

try {
  main();
} catch (error) {
  log("No se pudo iniciar Caja Link", error);
  process.exit(1);
}
