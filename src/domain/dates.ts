/** Utilidades de fecha sin dependencias externas. Todas devuelven fechas ISO (YYYY-MM-DD). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "20190201" → "2019-02-01" */
export function fromCompactDate(value: string): string | null {
  const text = value.trim();
  if (!/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/** "16/09/2019" → "2019-09-16" */
export function fromDayMonthYear(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** Acepta "2019-02-01" o "2019-02-01T00:00:00Z" y devuelve la parte de fecha. */
export function fromIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return ISO_DATE.test(date) ? date : null;
}
