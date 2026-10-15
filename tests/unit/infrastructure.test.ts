import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { parseDocumentsCsv } from "../../src/http/csv.js";
import { parseCentroFile } from "../../src/infrastructure/cajas/centro-file.gateway.js";
import { createGateways } from "../../src/infrastructure/cajas/gateway-factory.js";
import { toOrienteDocument } from "../../src/infrastructure/cajas/oriente-soap.gateway.js";
import type { CajaConfig } from "../../src/infrastructure/config/app-config.js";
import { interpolate, loadConfig } from "../../src/infrastructure/config/load-config.js";

const clock = { now: () => new Date(), today: () => "2026-10-14" };

describe("adaptadores", () => {
  test("test_documento_oriente_doce_digitos_con_puntos", () => {
    assert.equal(toOrienteDocument("1098765432"), "001.098.765.432");
    assert.equal(toOrienteDocument("91336507"), "000.091.336.507");
  });

  test("test_archivo_centro_descarta_nombre_y_salario", () => {
    const file = [
      "FECHA_CORTE|2026-10-03",
      "TIPO_DOC|NUMERO_DOCUMENTO|FECHA_INICIO|FECHA_FIN|TIPO_AFILIADO|NOMBRE|SALARIO",
      "CC|1098765432|20190201||DEP|PERSONA DE PRUEBA|2500000",
      "CC|0091336507|20100101|20140131|PEN|OTRA PERSONA|1000000",
    ].join("\n");
    const { asOf, byDocument } = parseCentroFile(file);
    assert.equal(asOf, "2026-10-03");
    assert.deepEqual(byDocument.get("1098765432"), [{ validFrom: "2019-02-01", validTo: null, affiliateType: "DEPENDIENTE" }]);
    assert.ok(byDocument.has("91336507"), "normaliza los ceros a la izquierda del archivo");
    assert.ok(!JSON.stringify([...byDocument]).includes("PERSONA"), "el nombre nunca se carga en memoria");
    assert.ok(!JSON.stringify([...byDocument]).includes("2500000"), "el salario nunca se carga en memoria");
  });

  test("test_csv_lote_extrae_columna_document", () => {
    assert.deepEqual(parseDocumentsCsv("document\n1088653751\n 882 463 32 \n\n13029225\n"), ["1088653751", " 882 463 32 ", "13029225"]);
    assert.deepEqual(parseDocumentsCsv("id;document\n1;\"1.098.765.432\"\n"), ["1.098.765.432"]);
  });
});

describe("configuración", () => {
  test("test_configuracion_interpola_variables_de_entorno", () => {
    assert.equal(interpolate("${URL}/api", { URL: "http://servidor" }), "http://servidor/api");
    assert.equal(interpolate("${NO_EXISTE:-false}", {}), "false");
  });

  test("test_cuarta_caja_se_activa_solo_por_configuracion", () => {
    const sur: CajaConfig = { name: "SUR", type: "rest-sur", enabled: false, consumerToken: "x", connection: { url: "http://sur", token: "t" } };
    assert.deepEqual(createGateways([sur], clock).map((gateway) => gateway.name), []);
    assert.deepEqual(createGateways([{ ...sur, enabled: true }], clock).map((gateway) => gateway.name), ["SUR"]);
  });

  test("test_config_cajas_declara_las_cuatro_cajas", () => {
    const env = { ADMIN_TOKEN: "admin", CAJA_SUR_ENABLED: "true", CAJA_NORTE_URL: "u", CAJA_NORTE_API_KEY: "k", CAJA_ORIENTE_URL: "u",
      CAJA_ORIENTE_USER: "u", CAJA_ORIENTE_PASSWORD: "p", CAJA_CENTRO_DIR: "d", CAJA_SUR_URL: "u", CAJA_SUR_TOKEN: "t" };
    const config = loadConfig("config/cajas.yaml", env);
    assert.deepEqual(config.cajas.map((caja) => caja.name), ["NORTE", "ORIENTE", "CENTRO", "SUR"]);
    assert.ok(config.cajas.every((caja) => caja.enabled));
  });
});

/** Recorre una carpeta y devuelve el contenido de sus archivos de texto. */
function readTree(folder: string): { path: string; text: string }[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? readTree(path) : [{ path, text: readFileSync(path, "utf-8") }];
  });
}

describe("secretos", () => {
  test("test_secretos_no_escritos_en_codigo_ni_configuracion", () => {
    const secretNames = Object.keys(process.env).filter((name) => /(TOKEN|API_KEY|PASSWORD|SECRET)$/.test(name));
    const secrets = secretNames.map((name) => process.env[name] ?? "").filter((value) => value.length >= 4);
    for (const file of [...readTree("src"), ...readTree("config")]) {
      for (const secret of secrets) assert.ok(!file.text.includes(secret), `${file.path} contiene el valor de un secreto`);
    }
    const yaml = readFileSync("config/cajas.yaml", "utf-8");
    for (const variable of ["${ADMIN_TOKEN}", "${NORTE_TOKEN}", "${CAJA_NORTE_API_KEY}", "${CAJA_ORIENTE_PASSWORD}", "${CAJA_SUR_TOKEN}"]) {
      assert.ok(yaml.includes(variable), `config/cajas.yaml debe leer ${variable} del entorno`);
    }
  });
});
