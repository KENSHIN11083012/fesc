import type { DocumentNumber } from "../../domain/document.js";
import { CajaUnavailableError, type CajaGateway, type CajaLookup } from "../../application/ports/caja-gateway.js";

export interface ResilienceOptions {
  /** Tiempo total máximo para obtener respuesta de la caja (incluye reintentos). */
  readonly timeoutMs: number;
  /** Reintentos adicionales si la caja falla rápido (por ejemplo, un 503 momentáneo). */
  readonly retries: number;
  /** Tiempo mínimo que debe quedar para que valga la pena reintentar. */
  readonly minAttemptMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decorator (patrón de diseño) que envuelve cualquier CajaGateway con un
 * presupuesto de tiempo y reintentos. Si la caja está caída, lenta o responde
 * algo inesperado, rechaza con CajaUnavailableError dentro del plazo, de modo
 * que una caja lenta nunca demora la respuesta completa.
 */
export class ResilientGateway implements CajaGateway {
  readonly name: string;

  constructor(
    private readonly inner: CajaGateway,
    private readonly options: ResilienceOptions,
  ) {
    this.name = inner.name;
  }

  async lookup(document: DocumentNumber): Promise<CajaLookup> {
    const deadline = Date.now() + this.options.timeoutMs;
    const minAttemptMs = this.options.minAttemptMs ?? 250;
    let lastError = "sin respuesta";

    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < minAttemptMs) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        return await Promise.race([
          this.inner.lookup(document, controller.signal),
          new Promise<never>((_, reject) =>
            controller.signal.addEventListener("abort", () => reject(new Error(`sin respuesta en ${this.options.timeoutMs} ms`)), { once: true }),
          ),
        ]);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (controller.signal.aborted) break; // se agotó el tiempo: no hay margen para reintentar
        await sleep(Math.min(100 * (attempt + 1), Math.max(deadline - Date.now() - minAttemptMs, 0)));
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    throw new CajaUnavailableError(this.name, lastError);
  }
}
