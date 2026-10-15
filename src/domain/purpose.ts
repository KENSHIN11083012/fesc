/**
 * Finalidades legítimas de consulta (Ley 1581 de 2012, principio de finalidad).
 * Sin una finalidad de esta lista el sistema no responde.
 */
export const PURPOSES = ["TARIFA_SUBSIDIADA", "SUBSIDIO_MONETARIO", "VALIDACION_AFILIACION"] as const;

export type Purpose = (typeof PURPOSES)[number];

export function isPurpose(value: unknown): value is Purpose {
  return typeof value === "string" && (PURPOSES as readonly string[]).includes(value);
}
