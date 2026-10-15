import type { AuditEntry, AuditRepository } from "./ports/audit-repository.js";

export const DEFAULT_AUDIT_LIMIT = 100;
export const MAX_AUDIT_LIMIT = 1000;

/** Caso de uso: últimas entradas de auditoría (solo administración). */
export class GetAuditLog {
  constructor(private readonly audit: AuditRepository) {}

  execute(limit: number = DEFAULT_AUDIT_LIMIT): AuditEntry[] {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), MAX_AUDIT_LIMIT) : DEFAULT_AUDIT_LIMIT;
    return this.audit.recent(safeLimit);
  }
}
