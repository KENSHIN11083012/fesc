import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { affiliation, allKeys, api, cajasOf, chaosNorte, token } from "./helpers.js";

/**
 * Documentos de los datos sintéticos del kit, elegidos por el caso que representan.
 * Estas pruebas hablan con el servicio solo por HTTP, igual que una caja real.
 */
const DOUBLE_NORTE_ORIENTE = "1002329359"; // afiliación vigente en Norte y en Oriente
const ONLY_CENTRO = "1001667616"; // vigente solo en el archivo de Caja Centro
const ONLY_HISTORICAL = "1001218866"; // solo tuvo afiliaciones ya terminadas
const ONLY_ORIENTE = "1003953732"; // vigente solo en Oriente

const FORBIDDEN_KEYS = ["nombre", "nombrecompleto", "name", "fullname", "direccion", "address", "telefono", "phone", "correo", "email",
  "salario", "salary", "monthlysalary", "beneficiarios", "beneficiaries", "titular", "person"];

describe("autenticación", () => {
  test("test_consulta_sin_token_responde_401", async () => {
    const { status } = await api(`/api/v1/affiliations/${ONLY_ORIENTE}?purpose=VALIDACION_AFILIACION`);
    assert.equal(status, 401);
  });

  test("test_token_invalido_responde_401", async () => {
    const { status } = await api(`/api/v1/affiliations/${ONLY_ORIENTE}?purpose=VALIDACION_AFILIACION`, { token: "token-que-no-existe" });
    assert.equal(status, 401);
  });

  test("test_auditoria_con_token_de_caja_responde_403", async () => {
    assert.equal((await api("/api/v1/audit?limit=5", { token: token("NORTE") })).status, 403);
    assert.equal((await api("/api/v1/audit?limit=5")).status, 401);
    assert.equal((await api("/api/v1/audit?limit=5", { token: token("ADMIN") })).status, 200);
  });
});

describe("finalidad", () => {
  test("test_consulta_sin_finalidad_responde_400", async () => {
    const { status, body } = await api(`/api/v1/affiliations/${ONLY_ORIENTE}`, { token: token("NORTE") });
    assert.equal(status, 400);
    assert.equal(body.error, "FINALIDAD_INVALIDA");
  });

  test("test_consulta_con_finalidad_invalida_responde_400", async () => {
    const { status } = await affiliation(ONLY_ORIENTE, "NORTE", "v1", "MERCADEO");
    assert.equal(status, 400);
  });
});

describe("resultados y contrato", () => {
  test("test_doble_afiliacion_norte_y_oriente", async () => {
    const { status, body } = await affiliation(DOUBLE_NORTE_ORIENTE, "CENTRO");
    assert.equal(status, 200);
    assert.equal(body.result, "AFILIADO_OTRA_CAJA");
    assert.deepEqual(cajasOf(body), ["NORTE", "ORIENTE"]);
    assert.match(body.requestId, /^[0-9A-Z]{26}$/);
  });

  test("test_excluye_caja_consultante_en_la_respuesta", async () => {
    const { body } = await affiliation(DOUBLE_NORTE_ORIENTE, "NORTE");
    assert.deepEqual(cajasOf(body), ["ORIENTE"]);
  });

  test("test_no_afiliado_cuando_todas_responden", async () => {
    const { body } = await affiliation(ONLY_HISTORICAL, "ORIENTE");
    assert.equal(body.result, "NO_AFILIADO");
    assert.deepEqual(body.matches, []);
    assert.deepEqual(body.unavailable, []);
  });

  test("test_normalizacion_da_el_mismo_resultado", async () => {
    const expected = cajasOf((await affiliation(DOUBLE_NORTE_ORIENTE, "CENTRO")).body);
    for (const variant of ["1.002.329.359", "001002329359", " 1002329359 "]) {
      const { status, body } = await affiliation(variant, "CENTRO");
      assert.equal(status, 200, variant);
      assert.deepEqual(cajasOf(body), expected, variant);
    }
  });

  test("test_coincidencia_centro_con_source_file", async () => {
    const { body } = await affiliation(ONLY_CENTRO, "NORTE");
    const centro = body.matches.find((match: any) => match.caja === "CENTRO");
    assert.ok(centro, "debe encontrar la afiliación del archivo de Caja Centro");
    assert.equal(centro.source, "FILE");
    assert.match(centro.asOf, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("test_respuesta_sin_datos_personales", async () => {
    const bodies = await Promise.all([
      affiliation(DOUBLE_NORTE_ORIENTE, "CENTRO", "v1"),
      affiliation(DOUBLE_NORTE_ORIENTE, "CENTRO", "v2"),
      affiliation(ONLY_CENTRO, "NORTE", "v2"),
    ]);
    for (const { body } of bodies) {
      const keys = allKeys(body).map((key) => key.toLowerCase().replace(/[^a-z]/g, ""));
      assert.deepEqual(keys.filter((key) => FORBIDDEN_KEYS.includes(key)), []);
      assert.deepEqual(Object.keys(body).sort(), ["matches", "requestId", "result", "unavailable"]);
    }
  });

  test("test_v2_agrega_affiliate_type_y_v1_no_cambia", async () => {
    const v1 = (await affiliation(DOUBLE_NORTE_ORIENTE, "CENTRO", "v1")).body;
    const v2 = (await affiliation(DOUBLE_NORTE_ORIENTE, "CENTRO", "v2")).body;
    assert.ok(v2.matches.every((match: any) => ["DEPENDIENTE", "INDEPENDIENTE", "PENSIONADO"].includes(match.affiliateType)));
    assert.ok(!allKeys(v1).includes("affiliateType"));
    assert.deepEqual(Object.keys(v1.matches[0]).sort(), ["asOf", "caja", "source", "validFrom", "validTo"]);
  });
});

describe("tolerancia a fallas", () => {
  after(() => chaosNorte("ok"));

  test("test_caja_norte_caida_responde_indeterminado", async () => {
    await chaosNorte("down");
    try {
      const { status, body } = await affiliation(ONLY_HISTORICAL, "ORIENTE");
      assert.equal(status, 200);
      assert.equal(body.result, "INDETERMINADO", "nunca NO_AFILIADO si una caja no respondió");
      assert.ok(body.unavailable.includes("NORTE"));
    } finally {
      await chaosNorte("ok");
    }
  });

  test("test_caja_norte_lenta_responde_en_menos_de_5_segundos", async () => {
    await chaosNorte("slow");
    try {
      const { status, body, elapsedMs } = await affiliation(ONLY_ORIENTE, "CENTRO");
      assert.equal(status, 200);
      assert.ok(elapsedMs < 5000, `tardó ${elapsedMs} ms`);
      assert.equal(body.result, "AFILIADO_OTRA_CAJA", "las demás cajas siguen respondiendo");
    } finally {
      await chaosNorte("ok");
    }
  });
});

describe("auditoría", () => {
  test("test_auditoria_registra_campos_y_documento_enmascarado", async () => {
    await affiliation(ONLY_ORIENTE, "SUR", "v1", "TARIFA_SUBSIDIADA");
    const { status, body } = await api("/api/v1/audit?limit=100", { token: token("ADMIN") });
    assert.equal(status, 200);
    assert.ok(body.entries.length > 0);
    for (const entry of body.entries) {
      for (const field of ["timestamp", "requestingCaja", "purpose", "result", "documentMasked"]) assert.ok(entry[field], `falta ${field}`);
      assert.ok(String(entry.documentMasked).replace(/\D/g, "").length <= 4, "documento sin enmascarar");
    }
    const mine = body.entries.find((entry: any) => entry.requestingCaja === "SUR" && entry.purpose === "TARIFA_SUBSIDIADA");
    assert.ok(mine, "la consulta recién hecha debe quedar auditada");
    assert.equal(mine.documentMasked, "******3732");
  });
});

describe("lote", () => {
  test("test_lote_idempotente_y_con_resultados", async () => {
    const key = `prueba-${Date.now()}`;
    const csv = `document\n${DOUBLE_NORTE_ORIENTE}\n 1.001.218.866 \n${ONLY_CENTRO}\nABC\n`;
    const submit = () =>
      api("/api/v1/batch-checks", { method: "POST", token: token("ORIENTE"), body: csv, headers: { "Content-Type": "text/csv", "Idempotency-Key": key } });

    const first = await submit();
    const second = await submit();
    assert.equal(first.status, 202);
    assert.ok(first.body.jobId);
    assert.equal(second.body.jobId, first.body.jobId, "misma Idempotency-Key, mismo jobId");

    let job: any;
    for (let i = 0; i < 40; i++) {
      job = (await api(`/api/v1/batch-checks/${first.body.jobId}`, { token: token("ORIENTE") })).body;
      if (job.status === "DONE") break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(job.status, "DONE");
    assert.deepEqual(job.results.map((result: any) => result.result), ["AFILIADO_OTRA_CAJA", "NO_AFILIADO", "AFILIADO_OTRA_CAJA", "INDETERMINADO"]);
    assert.deepEqual(cajasOf(job.results[0]), ["NORTE"], "excluye a la caja que envió el lote");
    assert.equal(job.results[3].error, "DOCUMENTO_INVALIDO");

    const other = await api(`/api/v1/batch-checks/${first.body.jobId}`, { token: token("NORTE") });
    assert.equal(other.status, 404, "otra caja no puede ver el lote");
  });

  test("test_lote_sin_idempotency_key_responde_400", async () => {
    const { status } = await api("/api/v1/batch-checks", { method: "POST", token: token("NORTE"), body: "document\n123456\n", headers: { "Content-Type": "text/csv" } });
    assert.equal(status, 400);
  });
});
