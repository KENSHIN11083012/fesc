import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CheckAffiliation } from "../../src/application/check-affiliation.js";
import type { AuditEntry, AuditRepository } from "../../src/application/ports/audit-repository.js";
import type { CajaGateway, CajaLookup } from "../../src/application/ports/caja-gateway.js";
import type { Clock } from "../../src/application/ports/clock.js";
import { ResilientGateway } from "../../src/infrastructure/cajas/resilient.gateway.js";

/** Dobles de prueba: implementan los puertos sin red ni base de datos. */
class FakeGateway implements CajaGateway {
  calls = 0;
  constructor(
    readonly name: string,
    private readonly behavior: () => Promise<CajaLookup>,
  ) {}
  lookup(): Promise<CajaLookup> {
    this.calls++;
    return this.behavior();
  }
}

class MemoryAudit implements AuditRepository {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): void {
    this.entries.push(entry);
  }
  recent(limit: number): AuditEntry[] {
    return this.entries.slice(-limit).reverse();
  }
}

const clock: Clock = { now: () => new Date("2026-10-14T15:00:00Z"), today: () => "2026-10-14" };
const ids = { next: () => "01TESTREQUEST" };
const found = (): Promise<CajaLookup> =>
  Promise.resolve({ source: "ONLINE", asOf: "2026-10-14", affiliations: [{ validFrom: "2020-01-01", validTo: null, affiliateType: "DEPENDIENTE" }] });
const notFound = (): Promise<CajaLookup> => Promise.resolve({ source: "ONLINE", asOf: "2026-10-14", affiliations: [] });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("caso de uso CheckAffiliation", () => {
  test("test_excluye_caja_consultante", async () => {
    const norte = new FakeGateway("NORTE", found);
    const oriente = new FakeGateway("ORIENTE", notFound);
    const report = await new CheckAffiliation([norte, oriente], new MemoryAudit(), clock, ids).execute({
      document: "1098765432",
      purpose: "VALIDACION_AFILIACION",
      requester: "NORTE",
    });
    assert.equal(norte.calls, 0, "no se consulta a la caja que pregunta");
    assert.equal(report.result, "NO_AFILIADO");
    assert.ok(report.matches.every((match) => match.caja !== "NORTE"));
  });

  test("test_auditoria_registra_finalidad_y_documento_enmascarado", async () => {
    const audit = new MemoryAudit();
    await new CheckAffiliation([new FakeGateway("ORIENTE", found)], audit, clock, ids).execute({
      document: "1.098.765.432",
      purpose: "SUBSIDIO_MONETARIO",
      requester: "NORTE",
    });
    const [entry] = audit.entries;
    assert.ok(entry);
    assert.equal(entry.requestingCaja, "NORTE");
    assert.equal(entry.purpose, "SUBSIDIO_MONETARIO");
    assert.equal(entry.result, "AFILIADO_OTRA_CAJA");
    assert.equal(entry.documentMasked, "******5432");
    assert.ok(!JSON.stringify(audit.entries).includes("1098765432"), "el documento completo nunca se guarda");
  });

  test("test_caja_que_falla_queda_en_unavailable", async () => {
    const failing = new FakeGateway("NORTE", () => Promise.reject(new Error("503")));
    const report = await new CheckAffiliation([failing, new FakeGateway("ORIENTE", notFound)], new MemoryAudit(), clock, ids).execute({
      document: "1098765432",
      purpose: "TARIFA_SUBSIDIADA",
      requester: "CENTRO",
    });
    assert.equal(report.result, "INDETERMINADO");
    assert.deepEqual(report.unavailable, ["NORTE"]);
  });
});

describe("decorator ResilientGateway", () => {
  test("test_caja_lenta_se_corta_por_tiempo", async () => {
    const slow = new FakeGateway("NORTE", async () => {
      await sleep(2000);
      return found();
    });
    const started = Date.now();
    await assert.rejects(new ResilientGateway(slow, { timeoutMs: 300, retries: 1, minAttemptMs: 50 }).lookup("1098765432" as never), /sin respuesta en 300 ms/);
    const elapsed = Date.now() - started;
    assert.equal(slow.calls, 1, "sí intentó consultar la caja");
    assert.ok(elapsed >= 250 && elapsed < 1000, `debe esperar el presupuesto y rendirse (tardó ${elapsed} ms)`);
  });

  test("test_reintenta_falla_momentanea", async () => {
    let attempts = 0;
    const flaky = new FakeGateway("NORTE", () => (++attempts === 1 ? Promise.reject(new Error("503")) : found()));
    const lookup = await new ResilientGateway(flaky, { timeoutMs: 2000, retries: 1 }).lookup("1098765432" as never);
    assert.equal(attempts, 2);
    assert.equal(lookup.affiliations.length, 1);
  });
});
