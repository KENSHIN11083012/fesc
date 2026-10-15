import type { Affiliation, Source } from "../../domain/affiliation.js";
import type { DocumentNumber } from "../../domain/document.js";

/** Respuesta de una caja ya traducida al modelo interno (sin datos personales). */
export interface CajaLookup {
  readonly source: Source;
  /** Fecha ISO a la que corresponde la información (hoy, o la fecha de corte del archivo). */
  readonly asOf: string;
  /** Afiliaciones de la persona en esa caja; vacía si nunca estuvo afiliada. */
  readonly affiliations: readonly Affiliation[];
}

/**
 * Puerto de salida hacia una caja de compensación. Cada caja (REST, SOAP, archivo…)
 * tiene su adaptador; el resto del sistema solo conoce esta interfaz.
 * Si la caja no se puede consultar, `lookup` rechaza la promesa.
 */
export interface CajaGateway {
  readonly name: string;
  lookup(document: DocumentNumber, signal?: AbortSignal): Promise<CajaLookup>;
}

/** Error que indica que una caja no pudo responder (caída, lenta, error de protocolo). */
export class CajaUnavailableError extends Error {
  constructor(
    readonly caja: string,
    reason: string,
  ) {
    super(`${caja}: ${reason}`);
    this.name = "CajaUnavailableError";
  }
}
