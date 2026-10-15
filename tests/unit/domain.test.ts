import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Affiliation, isActiveOn } from "../../src/domain/affiliation.js";
import { fromCompactDate, fromDayMonthYear } from "../../src/domain/dates.js";
import { InvalidDocumentError, normalizeDocument } from "../../src/domain/document.js";
import { maskDocument } from "../../src/domain/masking.js";
import { isPurpose } from "../../src/domain/purpose.js";
import { type CajaOutcome, decideVerdict } from "../../src/domain/verdict.js";

const TODAY = "2026-10-14";
const active: Affiliation = { validFrom: "2019-02-01", validTo: null, affiliateType: "DEPENDIENTE" };
const expired: Affiliation = { validFrom: "2010-05-03", validTo: "2014-01-31", affiliateType: "INDEPENDIENTE" };

describe("dominio", () => {
  test("test_normaliza_documento_con_puntos_espacios_y_ceros", () => {
    for (const variant of ["1.098.765.432", "001098765432", " 1098765432 ", "1098 765 432", "1098-765-432"]) {
      assert.equal(normalizeDocument(variant), "1098765432");
    }
  });

  test("test_rechaza_documento_con_letras_o_vacio", () => {
    assert.throws(() => normalizeDocument("10987A5432"), InvalidDocumentError);
    assert.throws(() => normalizeDocument("   "), InvalidDocumentError);
    assert.throws(() => normalizeDocument("0000"), InvalidDocumentError);
  });

  test("test_vigencia_por_fechas", () => {
    assert.equal(isActiveOn(active, TODAY), true);
    assert.equal(isActiveOn(expired, TODAY), false);
    assert.equal(isActiveOn({ ...active, validTo: TODAY }, TODAY), true, "fecha fin igual al corte sigue vigente");
    assert.equal(isActiveOn({ ...active, validFrom: "2027-01-01" }, TODAY), false, "aún no empieza");
  });

  test("test_convierte_formatos_de_fecha_de_las_cajas", () => {
    assert.equal(fromCompactDate("20190201"), "2019-02-01");
    assert.equal(fromCompactDate(""), null);
    assert.equal(fromDayMonthYear("16/09/2019"), "2019-09-16");
    assert.equal(fromDayMonthYear(""), null);
  });

  test("test_finalidad_solo_acepta_valores_legitimos", () => {
    assert.equal(isPurpose("TARIFA_SUBSIDIADA"), true);
    assert.equal(isPurpose("MERCADEO"), false);
    assert.equal(isPurpose(undefined), false);
  });

  test("test_documento_enmascarado_muestra_maximo_4_digitos", () => {
    const masked = maskDocument("1098765432");
    assert.equal(masked, "******5432");
    assert.ok(masked.replace(/\D/g, "").length <= 4);
  });
});

describe("veredicto", () => {
  const answered = (caja: string, affiliations = [active]): CajaOutcome => ({ caja, status: "ANSWERED", source: "ONLINE", asOf: TODAY, affiliations });
  const down = (caja: string): CajaOutcome => ({ caja, status: "UNAVAILABLE", reason: "503" });

  test("test_caja_caida_sin_coincidencias_da_indeterminado", () => {
    const verdict = decideVerdict([down("NORTE"), answered("ORIENTE", [])], TODAY);
    assert.equal(verdict.result, "INDETERMINADO");
    assert.deepEqual(verdict.unavailable, ["NORTE"]);
  });

  test("test_coincidencia_gana_aunque_otra_caja_este_caida", () => {
    const verdict = decideVerdict([down("NORTE"), answered("ORIENTE")], TODAY);
    assert.equal(verdict.result, "AFILIADO_OTRA_CAJA");
    assert.deepEqual(verdict.unavailable, ["NORTE"]);
  });

  test("test_todas_responden_sin_vigentes_da_no_afiliado", () => {
    const verdict = decideVerdict([answered("NORTE", [expired]), answered("ORIENTE", [])], TODAY);
    assert.equal(verdict.result, "NO_AFILIADO");
    assert.equal(verdict.matches.length, 0);
  });
});
