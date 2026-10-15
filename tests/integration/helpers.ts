/** Utilidades para probar el servicio en funcionamiento (dentro de docker compose o en local). */

export const SERVICE_URL = (process.env.SERVICE_URL ?? "http://localhost:8083").replace(/\/+$/, "");
const NORTE_URL = (process.env.CAJA_NORTE_URL ?? "").replace(/\/+$/, "");

export function token(caja: "NORTE" | "ORIENTE" | "CENTRO" | "SUR" | "ADMIN"): string {
  const value = process.env[`${caja}_TOKEN`];
  if (!value) throw new Error(`Falta la variable ${caja}_TOKEN en el entorno de pruebas`);
  return value;
}

export interface ApiResponse {
  status: number;
  body: any;
  elapsedMs: number;
}

export async function api(path: string, options: { token?: string; method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<ApiResponse> {
  const started = Date.now();
  const response = await fetch(SERVICE_URL + path, {
    method: options.method ?? "GET",
    headers: { ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...options.headers },
    body: options.body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // respuesta no JSON: se deja como texto
  }
  return { status: response.status, body, elapsedMs: Date.now() - started };
}

export function affiliation(document: string, requester: Parameters<typeof token>[0], version = "v1", purpose = "VALIDACION_AFILIACION") {
  return api(`/api/${version}/affiliations/${encodeURIComponent(document)}?purpose=${purpose}`, { token: token(requester) });
}

/** Cambia el modo de Caja Norte (ok | down | slow) usando su endpoint de pruebas /__chaos. */
export async function chaosNorte(mode: "ok" | "down" | "slow"): Promise<void> {
  if (!NORTE_URL) throw new Error("Falta CAJA_NORTE_URL para provocar fallas");
  const response = await fetch(`${NORTE_URL}/__chaos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
  if (!response.ok) throw new Error(`/__chaos respondió ${response.status}`);
}

export function cajasOf(body: any): string[] {
  return [...new Set<string>((body?.matches ?? []).map((match: any) => String(match.caja)))].sort();
}

/** Recorre todas las claves de un JSON (incluidas las anidadas). */
export function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, nested]) => [key, ...allKeys(nested)]);
  return [];
}
