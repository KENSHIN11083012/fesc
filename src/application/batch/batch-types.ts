import type { Source, } from "../../domain/affiliation.js";
import type { VerdictResult } from "../../domain/verdict.js";

/** Coincidencia en el formato del contrato v1 (sin datos personales). */
export interface BatchMatch {
  readonly caja: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly source: Source;
  readonly asOf: string;
}

/** Resultado de un documento del lote, en el mismo orden del archivo recibido. */
export interface BatchResult {
  /** Documento tal como llegó en el archivo. */
  readonly document: string;
  /** Documento normalizado (solo dígitos, sin ceros a la izquierda); null si es inválido. */
  readonly normalizedDocument: string | null;
  readonly result: VerdictResult;
  readonly matches: readonly BatchMatch[];
  readonly unavailable: readonly string[];
  readonly error?: string;
}
