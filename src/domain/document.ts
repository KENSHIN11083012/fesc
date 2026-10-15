/**
 * Número de documento normalizado: solo dígitos y sin ceros a la izquierda.
 * Es la forma canónica con la que el sistema compara documentos entre cajas,
 * sin importar si llegaron con puntos, espacios, guiones o relleno de ceros.
 */
export type DocumentNumber = string & { readonly __brand: "DocumentNumber" };

export class InvalidDocumentError extends Error {
  constructor(message = "El documento debe contener solo dígitos, puntos, espacios o guiones") {
    super(message);
    this.name = "InvalidDocumentError";
  }
}

const ALLOWED_CHARACTERS = /^[\d.\s-]+$/;
const MIN_DIGITS = 3;
const MAX_DIGITS = 15;

export function normalizeDocument(raw: string): DocumentNumber {
  const trimmed = (raw ?? "").trim();
  if (!ALLOWED_CHARACTERS.test(trimmed)) {
    throw new InvalidDocumentError();
  }
  const digits = trimmed.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) {
    throw new InvalidDocumentError(`El documento debe tener entre ${MIN_DIGITS} y ${MAX_DIGITS} dígitos significativos`);
  }
  return digits as DocumentNumber;
}
