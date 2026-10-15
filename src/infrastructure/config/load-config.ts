import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import type { AppConfig, CajaConfig } from "./app-config.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Configuración inválida: ${message}`);
    this.name = "ConfigError";
  }
}

type Env = Readonly<Record<string, string | undefined>>;

/** Reemplaza ${VAR} y ${VAR:-defecto} con valores del entorno. */
export function interpolate(text: string, env: Env): string {
  return text.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g, (_, name: string, fallback?: string) => {
    const value = env[name];
    return value !== undefined && value !== "" ? value : (fallback ?? "");
  });
}

/** Interpola recursivamente todos los textos ya leídos del YAML (así un secreto con ":" o "#" no rompe el archivo). */
function interpolateDeep(value: unknown, env: Env): unknown {
  if (typeof value === "string") return interpolate(value, env);
  if (Array.isArray(value)) return value.map((item) => interpolateDeep(item, env));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateDeep(item, env)]));
  }
  return value;
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new ConfigError(`${path} debe ser un objeto`);
  return value as Record<string, unknown>;
}

function asText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asNumber(value: unknown, path: string, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new ConfigError(`${path} debe ser un número positivo`);
  return number;
}

function asBoolean(value: unknown): boolean {
  return value === true || ["true", "1", "yes", "si", "sí"].includes(asText(value).toLowerCase());
}

function parseCaja(raw: unknown, index: number): CajaConfig {
  const entry = asRecord(raw, `cajas[${index}]`);
  const name = asText(entry.name).toUpperCase();
  const type = asText(entry.type);
  if (!name) throw new ConfigError(`cajas[${index}].name es obligatorio`);
  if (!type) throw new ConfigError(`cajas[${index}].type es obligatorio`);

  const connection: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry.connection ? asRecord(entry.connection, `${name}.connection`) : {})) {
    connection[key] = asText(value);
  }

  const enabled = entry.enabled === undefined ? true : asBoolean(entry.enabled);
  if (enabled) {
    const missing = Object.entries(connection).filter(([, value]) => value === "").map(([key]) => key);
    if (missing.length > 0) throw new ConfigError(`la caja ${name} está habilitada pero le falta: ${missing.join(", ")}`);
  }
  return { name, type, enabled, consumerToken: asText(entry.consumerToken), connection };
}

/** Lee el archivo YAML (o JSON), interpola el entorno y valida la estructura. */
export function loadConfig(path: string, env: Env = process.env): AppConfig {
  const document = asRecord(interpolateDeep(yaml.load(readFileSync(path, "utf-8")), env), "raíz");
  const service = asRecord(document.service ?? {}, "service");
  const batch = asRecord(service.batch ?? {}, "service.batch");
  const admin = asRecord(document.admin ?? {}, "admin");

  if (!Array.isArray(document.cajas) || document.cajas.length === 0) throw new ConfigError("cajas debe ser una lista no vacía");
  const cajas = document.cajas.map(parseCaja);

  const names = new Set<string>();
  for (const caja of cajas) {
    if (names.has(caja.name)) throw new ConfigError(`la caja ${caja.name} está repetida`);
    names.add(caja.name);
  }

  const adminToken = asText(admin.token);
  if (!adminToken) throw new ConfigError("admin.token (ADMIN_TOKEN) es obligatorio");

  return {
    port: asNumber(service.port, "service.port", 8083),
    onlineTimeoutMs: asNumber(service.onlineTimeoutMs, "service.onlineTimeoutMs", 3000),
    onlineRetries: Math.trunc(Number(service.onlineRetries ?? 1)) || 0,
    batch: {
      concurrency: asNumber(batch.concurrency, "service.batch.concurrency", 32),
      timeoutMs: asNumber(batch.timeoutMs, "service.batch.timeoutMs", 8000),
      retries: Math.trunc(Number(batch.retries ?? 2)) || 0,
    },
    adminToken,
    cajas,
    dataDir: asText(env.DATA_DIR) || "./data-runtime",
  };
}
