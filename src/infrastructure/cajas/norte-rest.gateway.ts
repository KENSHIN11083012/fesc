import type { Affiliation } from "../../domain/affiliation.js";
import { fromIsoDate } from "../../domain/dates.js";
import type { DocumentNumber } from "../../domain/document.js";
import type { CajaGateway, CajaLookup } from "../../application/ports/caja-gateway.js";
import type { Clock } from "../../application/ports/clock.js";
import { toAffiliateType } from "./affiliate-type-mapper.js";
import { joinUrl, readJson, unexpectedStatus } from "./http-helpers.js";

export interface NorteRestOptions {
  readonly name: string;
  readonly url: string;
  readonly apiKey: string;
}

interface NorteAffiliation {
  fechaInicio?: string;
  fechaFin?: string | null;
  tipoAfiliado?: string;
}

/**
 * Adaptador de Caja Norte (REST JSON, autenticación con X-Api-Key).
 * Su respuesta incluye datos del titular (nombre, salario, beneficiarios…):
 * aquí solo se leen las fechas y el tipo de afiliado; lo demás se descarta.
 */
export class NorteRestGateway implements CajaGateway {
  readonly name: string;

  constructor(
    private readonly options: NorteRestOptions,
    private readonly clock: Clock,
  ) {
    this.name = options.name;
  }

  async lookup(document: DocumentNumber, signal?: AbortSignal): Promise<CajaLookup> {
    const response = await fetch(joinUrl(this.options.url, `/api/v1/afiliados/${document}`), {
      headers: { "X-Api-Key": this.options.apiKey, Accept: "application/json" },
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

    const body = (await readJson(this.name, response)) as { afiliaciones?: NorteAffiliation[] };
    const affiliations: Affiliation[] = (body.afiliaciones ?? []).flatMap((item) => {
      const validFrom = fromIsoDate(item.fechaInicio);
      if (!validFrom) return [];
      return [{ validFrom, validTo: fromIsoDate(item.fechaFin), affiliateType: toAffiliateType(item.tipoAfiliado) }];
    });
    return { source: "ONLINE", asOf, affiliations };
  }
}
