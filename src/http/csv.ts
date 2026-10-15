import { HttpError } from "./http-error.js";

const DOCUMENT_COLUMNS = ["document", "documento", "numero_documento"];

/** Separa una línea CSV respetando comillas dobles. */
function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      fields.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Extrae la columna `document` de un CSV. Detecta el separador (coma, punto y
 * coma o tabulación) y conserva cada documento tal como llegó, para que el
 * resultado del lote se pueda cruzar con el archivo original.
 */
export function parseDocumentsCsv(content: string): string[] {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() !== "");
  if (headerIndex < 0) throw new HttpError(400, "LOTE_VACIO", "El archivo CSV está vacío");

  const headerLine = lines[headerIndex] ?? "";
  const delimiter = [",", ";", "\t"].find((candidate) => headerLine.includes(candidate)) ?? ",";
  const header = splitLine(headerLine, delimiter).map((column) => column.trim().toLowerCase());
  const column = header.findIndex((name) => DOCUMENT_COLUMNS.includes(name));
  if (column < 0) throw new HttpError(400, "LOTE_SIN_COLUMNA", "El CSV debe tener una columna llamada document");

  const documents: string[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim() === "") continue;
    documents.push(splitLine(line, delimiter)[column] ?? "");
  }
  if (documents.length === 0) throw new HttpError(400, "LOTE_VACIO", "El CSV no tiene documentos");
  return documents;
}

/** Obtiene el contenido del campo `file` de un cuerpo multipart/form-data. */
export function extractMultipartFile(body: Buffer, contentType: string): string {
  const boundary = /boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  if (!boundary) throw new HttpError(400, "MULTIPART_INVALIDO", "Falta el boundary del multipart");

  for (const part of body.toString("utf-8").split(`--${boundary}`)) {
    const separator = part.indexOf("\r\n\r\n");
    if (separator < 0) continue;
    const headers = part.slice(0, separator);
    if (/name="file"/i.test(headers)) {
      return part.slice(separator + 4).replace(/\r\n$/, "");
    }
  }
  throw new HttpError(400, "MULTIPART_INVALIDO", "El multipart debe incluir el campo file con el CSV");
}
