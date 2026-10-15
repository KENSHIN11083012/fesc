/** Tipo de afiliado en el vocabulario común del sistema (contrato v2). */
export type AffiliateType = "DEPENDIENTE" | "INDEPENDIENTE" | "PENSIONADO";

/** De dónde proviene la información: consulta en línea o archivo publicado. */
export type Source = "ONLINE" | "FILE";

/**
 * Afiliación ya traducida al modelo interno. Por diseño no tiene campos para
 * datos personales: los adaptadores los descartan al leer la respuesta de cada caja.
 */
export interface Affiliation {
  /** Fecha ISO (YYYY-MM-DD) de inicio. */
  readonly validFrom: string;
  /** Fecha ISO de fin, o null si no tiene fecha de fin. */
  readonly validTo: string | null;
  readonly affiliateType: AffiliateType;
}

/**
 * Una afiliación es vigente si ya empezó y no tiene fecha de fin, o su fecha de
 * fin es igual o posterior a la fecha de corte. Las fechas ISO se comparan como texto.
 */
export function isActiveOn(affiliation: Affiliation, cutoffDate: string): boolean {
  const started = affiliation.validFrom <= cutoffDate;
  const notEnded = affiliation.validTo === null || affiliation.validTo >= cutoffDate;
  return started && notEnded;
}
