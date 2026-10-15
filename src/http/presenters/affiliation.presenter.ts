import type { AffiliationReport } from "../../application/check-affiliation.js";

/**
 * Presenters del contrato. Construyen la respuesta campo por campo (lista
 * blanca): aunque el modelo interno creciera, a la respuesta solo sale lo que
 * se declara aquí. Es la última barrera del principio de dato mínimo.
 */

/** Contrato v1: congelado, no debe cambiar. */
export function presentV1(report: AffiliationReport) {
  return {
    requestId: report.requestId,
    result: report.result,
    matches: report.matches.map((match) => ({
      caja: match.caja,
      validFrom: match.validFrom,
      validTo: match.validTo,
      source: match.source,
      asOf: match.asOf,
    })),
    unavailable: [...report.unavailable],
  };
}

/** Contrato v2: igual a v1 y agrega affiliateType en cada coincidencia. */
export function presentV2(report: AffiliationReport) {
  return {
    requestId: report.requestId,
    result: report.result,
    matches: report.matches.map((match) => ({
      caja: match.caja,
      validFrom: match.validFrom,
      validTo: match.validTo,
      source: match.source,
      asOf: match.asOf,
      affiliateType: match.affiliateType,
    })),
    unavailable: [...report.unavailable],
  };
}
