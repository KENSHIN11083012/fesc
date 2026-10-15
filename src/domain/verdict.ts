import { type Affiliation, type AffiliateType, type Source, isActiveOn } from "./affiliation.js";

export type VerdictResult = "AFILIADO_OTRA_CAJA" | "NO_AFILIADO" | "INDETERMINADO";

/** Lo que respondió una caja al consultarla. */
export type CajaOutcome =
  | { readonly caja: string; readonly status: "ANSWERED"; readonly source: Source; readonly asOf: string; readonly affiliations: readonly Affiliation[] }
  | { readonly caja: string; readonly status: "UNAVAILABLE"; readonly reason: string };

/** Afiliación vigente encontrada en otra caja. */
export interface Match {
  readonly caja: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly source: Source;
  readonly asOf: string;
  readonly affiliateType: AffiliateType;
}

export interface Verdict {
  readonly result: VerdictResult;
  readonly matches: readonly Match[];
  readonly unavailable: readonly string[];
}

/**
 * Regla central del negocio (principio de veracidad):
 * - Si alguna caja tiene una afiliación vigente → AFILIADO_OTRA_CAJA.
 * - Si no hay coincidencias pero alguna caja no respondió → INDETERMINADO (nunca NO_AFILIADO).
 * - Solo si todas respondieron y ninguna tiene afiliación vigente → NO_AFILIADO.
 */
export function decideVerdict(outcomes: readonly CajaOutcome[], cutoffDate: string): Verdict {
  const matches: Match[] = [];
  const unavailable: string[] = [];

  for (const outcome of outcomes) {
    if (outcome.status === "UNAVAILABLE") {
      unavailable.push(outcome.caja);
      continue;
    }
    for (const affiliation of outcome.affiliations) {
      if (isActiveOn(affiliation, cutoffDate)) {
        matches.push({
          caja: outcome.caja,
          validFrom: affiliation.validFrom,
          validTo: affiliation.validTo,
          source: outcome.source,
          asOf: outcome.asOf,
          affiliateType: affiliation.affiliateType,
        });
      }
    }
  }

  const result: VerdictResult = matches.length > 0 ? "AFILIADO_OTRA_CAJA" : unavailable.length > 0 ? "INDETERMINADO" : "NO_AFILIADO";
  return { result, matches, unavailable };
}
