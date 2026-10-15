export interface AuditEntry {
  readonly timestamp: string;
  readonly requestingCaja: string;
  readonly purpose: string;
  readonly result: string;
  /** Documento enmascarado: nunca se guarda el número completo. */
  readonly documentMasked: string;
  readonly requestId: string;
  readonly channel: "ONLINE" | "BATCH";
}

export interface AuditRepository {
  record(entry: AuditEntry): void;
  recent(limit: number): AuditEntry[];
}
