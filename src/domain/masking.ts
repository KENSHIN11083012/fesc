const VISIBLE_DIGITS = 4;

/**
 * Enmascara un documento para la auditoría: solo quedan visibles los últimos
 * cuatro dígitos (principio de trazabilidad sin exponer el dato completo).
 */
export function maskDocument(document: string): string {
  const visible = document.slice(-VISIBLE_DIGITS);
  return "*".repeat(Math.max(document.length - VISIBLE_DIGITS, 2)) + visible;
}
