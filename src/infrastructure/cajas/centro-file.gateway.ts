import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Affiliation } from "../../domain/affiliation.js";
import { fromCompactDate } from "../../domain/dates.js";
import { type DocumentNumber, normalizeDocument } from "../../domain/document.js";
import { CajaUnavailableError, type CajaGateway, type CajaLookup } from "../../application/ports/caja-gateway.js";
import { toAffiliateType } from "./affiliate-type-mapper.js";

export interface CentroFileOptions {
  readonly name: string;
  readonly directory: string;
  /** Cada cuánto se revisa si llegó un archivo más reciente. */
  readonly refreshIntervalMs?: number;
}

const FILE_PATTERN = /^centro_afiliados_(\d{8})\.txt$/;

interface Snapshot {
  readonly fileName: string;
  readonly modifiedAt: number;
  readonly asOf: string;
  readonly byDocument: ReadonlyMap<string, Affiliation[]>;
}

/**
 * Adaptador de Caja Centro: no tiene servicio, publica un archivo plano diario.
 * Carga en memoria el archivo más reciente (solo documento, fechas y tipo:
 * NOMBRE y SALARIO nunca se leen) y lo recarga cuando llega uno nuevo.
 * Sus coincidencias salen con source=FILE y asOf=FECHA_CORTE del archivo.
 */
export class CentroFileGateway implements CajaGateway {
  readonly name: string;
  private snapshot: Snapshot | null = null;
  private lastCheck = 0;

  constructor(private readonly options: CentroFileOptions) {
    this.name = options.name;
  }

  async lookup(document: DocumentNumber): Promise<CajaLookup> {
    const snapshot = this.current();
    return { source: "FILE", asOf: snapshot.asOf, affiliations: snapshot.byDocument.get(document) ?? [] };
  }

  /** Devuelve el archivo vigente en memoria, recargándolo si hay uno más nuevo. */
  private current(): Snapshot {
    const now = Date.now();
    if (this.snapshot && now - this.lastCheck < (this.options.refreshIntervalMs ?? 30_000)) return this.snapshot;
    this.lastCheck = now;

    try {
      const latest = readdirSync(this.options.directory).filter((name) => FILE_PATTERN.test(name)).sort().at(-1);
      if (!latest) throw new Error("no hay archivo publicado");
      const path = join(this.options.directory, latest);
      const modifiedAt = statSync(path).mtimeMs;
      if (!this.snapshot || this.snapshot.fileName !== latest || this.snapshot.modifiedAt !== modifiedAt) {
        this.snapshot = { fileName: latest, modifiedAt, ...parseCentroFile(readFileSync(path, "utf-8")) };
      }
    } catch (error) {
      // Si ya había un archivo cargado se sigue usando; si nunca hubo, la caja no está disponible.
      if (!this.snapshot) throw new CajaUnavailableError(this.name, error instanceof Error ? error.message : String(error));
    }
    return this.snapshot as Snapshot;
  }
}

/** Interpreta el archivo de Caja Centro ubicando las columnas por su nombre en el encabezado. */
export function parseCentroFile(content: string): { asOf: string; byDocument: Map<string, Affiliation[]> } {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
  const cutoffLine = lines.find((line) => line.startsWith("FECHA_CORTE|"));
  const asOf = cutoffLine ? cutoffLine.split("|")[1]?.trim() ?? "" : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("el archivo no tiene una FECHA_CORTE válida");

  const headerIndex = lines.findIndex((line) => line.includes("NUMERO_DOCUMENTO"));
  if (headerIndex < 0) throw new Error("el archivo no tiene encabezado");
  const header = (lines[headerIndex] ?? "").split("|").map((column) => column.trim());
  const column = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`falta la columna ${name}`);
    return index;
  };
  const docIndex = column("NUMERO_DOCUMENTO");
  const fromIndex = column("FECHA_INICIO");
  const toIndex = column("FECHA_FIN");
  const typeIndex = column("TIPO_AFILIADO");

  const byDocument = new Map<string, Affiliation[]>();
  for (const line of lines.slice(headerIndex + 1)) {
    const fields = line.split("|");
    const validFrom = fromCompactDate(fields[fromIndex] ?? "");
    if (!validFrom) continue;
    let document: string;
    try {
      document = normalizeDocument(fields[docIndex] ?? "");
    } catch {
      continue;
    }
    const affiliation: Affiliation = {
      validFrom,
      validTo: fromCompactDate(fields[toIndex] ?? ""),
      affiliateType: toAffiliateType(fields[typeIndex]),
    };
    const list = byDocument.get(document);
    if (list) list.push(affiliation);
    else byDocument.set(document, [affiliation]);
  }
  return { asOf, byDocument };
}
