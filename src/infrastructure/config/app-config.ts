/** Configuración ya validada con la que arranca el servicio. */
export interface CajaConfig {
  readonly name: string;
  readonly type: string;
  readonly enabled: boolean;
  /** Token con el que esta caja se autentica ante Caja Link como consumidora. */
  readonly consumerToken: string;
  /** Parámetros propios del adaptador (url, credenciales, carpeta…). */
  readonly connection: Readonly<Record<string, string>>;
}

export interface AppConfig {
  readonly port: number;
  readonly onlineTimeoutMs: number;
  readonly onlineRetries: number;
  readonly batch: { readonly concurrency: number; readonly timeoutMs: number; readonly retries: number };
  readonly adminToken: string;
  readonly cajas: readonly CajaConfig[];
  readonly dataDir: string;
}
