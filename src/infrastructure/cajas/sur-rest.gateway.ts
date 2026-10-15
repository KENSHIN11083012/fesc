import type { Affiliation } from "../../domain/affiliation.js";
import { fromIsoDate } from "../../domain/dates.js";
import type { DocumentNumber } from "../../domain/document.js";
import type { CajaGateway, CajaLookup } from "../../application/ports/caja-gateway.js";
import type { Clock } from "../../application/ports/clock.js";
import { toAffiliateType } from "./affiliate-type-mapper.js";
import { joinUrl, readJson, unexpectedStatus } from "./http-helpers.js";

export interface SurRestOptions {
  readonly name: string;
  readonly url: string;
  readonly token: string;
}

interface SurMembership {
  start?: string;
  end?: string | null;
  category?: string;
}

/**
 * Adaptador de Caja Sur (REST JSON v2, autenticación Bearer).
 * Se incorpora solo por configuración; descarta `person` (nombre, correo, salario).
 */
export class SurRestGateway implements CajaGateway {
  readonly name: string;

  constructor(
    private readonly options: SurRestOptions,
    private readonly clock: Clock,
  ) {
    this.name = options.name;
  }

  async lookup(document: DocumentNumber, signal?: AbortSignal): Promise<CajaLookup> {
    const response = await fetch(joinUrl(this.options.url, `/v2/people/${document}/memberships`), {
      headers: { Authorization: `Bearer ${this.options.token}`, Accept: "application/json" },
      signal,
    });
    const asOf = this.clock.today();

    if (response.status === 404) {
      await response.body?.cancel();
      return { source: "ONLINE", asOf, affiliations: [] };
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw unexpectedStatus(this.name, response.status);
    }

    const body = (await readJson(this.name, response)) as { memberships?: SurMembership[] };
    const affiliations: Affiliation[] = (body.memberships ?? []).flatMap((item) => {
      const validFrom = fromIsoDate(item.start);
      if (!validFrom) return [];
      return [{ validFrom, validTo: fromIsoDate(item.end), affiliateType: toAffiliateType(item.category) }];
    });
    return { source: "ONLINE", asOf, affiliations };
  }
}
