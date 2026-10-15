import { type DocumentNumber, normalizeDocument } from "../domain/document.js";
import { maskDocument } from "../domain/masking.js";
import type { Purpose } from "../domain/purpose.js";
import { type CajaOutcome, type Verdict, decideVerdict } from "../domain/verdict.js";
import type { AuditRepository } from "./ports/audit-repository.js";
import type { CajaGateway } from "./ports/caja-gateway.js";
import type { Clock } from "./ports/clock.js";
import type { IdGenerator } from "./ports/id-generator.js";

export interface AffiliationQuery {
  readonly document: string;
  readonly purpose: Purpose;
  /** Caja dueña del token que consulta; se excluye de la búsqueda. */
  readonly requester: string;
  readonly channel?: "ONLINE" | "BATCH";
}

export interface AffiliationReport extends Verdict {
  readonly requestId: string;
  readonly document: DocumentNumber;
}

/**
 * Caso de uso: ¿este documento tiene afiliación vigente en otra caja?
 * Consulta en paralelo todas las cajas excepto la que pregunta, decide el
 * veredicto con la regla de dominio y deja la traza en la auditoría.
 */
export class CheckAffiliation {
  constructor(
    private readonly gateways: readonly CajaGateway[],
    private readonly audit: AuditRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(query: AffiliationQuery): Promise<AffiliationReport> {
    const document = normalizeDocument(query.document);
    const requestId = this.ids.next();
    const targets = this.gateways.filter((gateway) => gateway.name !== query.requester);

    const outcomes = await Promise.all(targets.map((gateway) => this.consult(gateway, document)));
    const verdict = decideVerdict(outcomes, this.clock.today());

    this.audit.record({
      timestamp: this.clock.now().toISOString(),
      requestingCaja: query.requester,
      purpose: query.purpose,
      result: verdict.result,
      documentMasked: maskDocument(document),
      requestId,
      channel: query.channel ?? "ONLINE",
    });

    return { requestId, document, ...verdict };
  }

  private async consult(gateway: CajaGateway, document: DocumentNumber): Promise<CajaOutcome> {
    try {
      const lookup = await gateway.lookup(document);
      return { caja: gateway.name, status: "ANSWERED", ...lookup };
    } catch (error) {
      return { caja: gateway.name, status: "UNAVAILABLE", reason: error instanceof Error ? error.message : String(error) };
    }
  }
}
