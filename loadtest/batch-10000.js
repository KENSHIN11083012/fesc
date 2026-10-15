// Prueba de carga de Caja Link con k6.
// Escenario "lote": envía el archivo de 10.000 documentos y espera a que el trabajo termine.
// Escenario "en_linea": mientras el lote corre, 10 cajas virtuales hacen consultas en línea,
// para comprobar que el lote no degrada la consulta individual (< 5 s).
//
// Ejecutar: docker compose --profile load run --rm k6
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const SERVICE = __ENV.SERVICE_URL || "http://caja-link:8083";
const CSV = open("/data/lote_10000.csv");
const DOCUMENTS = CSV.split("\n").slice(1).map((line) => line.trim()).filter((line) => line !== "");

const batchSeconds = new Trend("lote_duracion_segundos");
const batchResults = new Counter("lote_resultados");
const errors = new Counter("errores");

export const options = {
  scenarios: {
    lote: { executor: "shared-iterations", vus: 1, iterations: 1, exec: "batch", maxDuration: "6m" },
    en_linea: { executor: "constant-vus", vus: 10, duration: "30s", exec: "online", startTime: "1s" },
  },
  thresholds: {
    errores: ["count==0"],
    lote_duracion_segundos: ["max<300"],
    "http_req_duration{scenario:en_linea}": ["p(95)<5000"],
  },
};

const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

export function batch() {
  const started = Date.now();
  const submit = http.post(`${SERVICE}/api/v1/batch-checks`, CSV, {
    headers: { Authorization: `Bearer ${__ENV.NORTE_TOKEN}`, "Content-Type": "text/csv", "Idempotency-Key": `k6-${started}` },
  });
  if (!check(submit, { "lote aceptado (202)": (r) => r.status === 202 })) {
    errors.add(1);
    return;
  }
  const jobId = submit.json("jobId");
  let status = "PENDING";
  let body = null;
  while (status !== "DONE" && Date.now() - started < 300000) {
    sleep(1);
    const poll = http.get(`${SERVICE}/api/v1/batch-checks/${jobId}`, auth(__ENV.NORTE_TOKEN));
    if (poll.status !== 200) {
      errors.add(1);
      continue;
    }
    body = poll.json();
    status = body.status;
  }
  const seconds = (Date.now() - started) / 1000;
  batchSeconds.add(seconds);
  const results = body && body.results ? body.results.length : 0;
  batchResults.add(results);
  const complete = check(body, { "lote terminado con 10000 resultados": (b) => b && b.status === "DONE" && b.results.length === 10000 });
  if (!complete) errors.add(1);
  console.log(`documentos: ${results} duracion_segundos: ${seconds.toFixed(1)}`);
}

export function online() {
  const document = DOCUMENTS[Math.floor(Math.random() * DOCUMENTS.length)].replace(/"/g, "");
  const response = http.get(`${SERVICE}/api/v1/affiliations/${encodeURIComponent(document)}?purpose=VALIDACION_AFILIACION`, auth(__ENV.ORIENTE_TOKEN));
  if (!check(response, { "consulta en línea 200": (r) => r.status === 200 })) errors.add(1);
  sleep(0.2);
}
