import type { AffiliateType } from "../../domain/affiliation.js";

/** Traduce los códigos de tipo de afiliado de cada caja al vocabulario común. */
const EQUIVALENCES: Readonly<Record<string, AffiliateType>> = {
  DEPENDIENTE: "DEPENDIENTE",
  DEP: "DEPENDIENTE",
  D: "DEPENDIENTE",
  DEPENDENT: "DEPENDIENTE",
  INDEPENDIENTE: "INDEPENDIENTE",
  IND: "INDEPENDIENTE",
  I: "INDEPENDIENTE",
  SELF_EMPLOYED: "INDEPENDIENTE",
  PENSIONADO: "PENSIONADO",
  PEN: "PENSIONADO",
  P: "PENSIONADO",
  RETIREE: "PENSIONADO",
};

export function toAffiliateType(code: unknown): AffiliateType {
  const type = EQUIVALENCES[String(code ?? "").trim().toUpperCase()];
  if (!type) throw new Error(`Tipo de afiliado desconocido: ${String(code)}`);
  return type;
}
