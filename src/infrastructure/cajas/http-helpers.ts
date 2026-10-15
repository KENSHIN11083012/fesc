import { CajaUnavailableError } from "../../application/ports/caja-gateway.js";

/** Une la URL base de la caja con una ruta, sin barras duplicadas. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** Convierte una respuesta HTTP inesperada en "caja no disponible". */
export function unexpectedStatus(caja: string, status: number): CajaUnavailableError {
  return new CajaUnavailableError(caja, `respuesta HTTP ${status}`);
}

/** Lee JSON de forma segura: si la caja devuelve algo que no es JSON, se considera no disponible. */
export async function readJson(caja: string, response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CajaUnavailableError(caja, "respuesta JSON inválida");
  }
}
