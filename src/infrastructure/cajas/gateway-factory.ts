import type { CajaGateway } from "../../application/ports/caja-gateway.js";
import type { Clock } from "../../application/ports/clock.js";
import type { CajaConfig } from "../config/app-config.js";
import { CentroFileGateway } from "./centro-file.gateway.js";
import { NorteRestGateway } from "./norte-rest.gateway.js";
import { OrienteSoapGateway } from "./oriente-soap.gateway.js";
import { type ResilienceOptions, ResilientGateway } from "./resilient.gateway.js";
import { SurRestGateway } from "./sur-rest.gateway.js";

type GatewayBuilder = (caja: CajaConfig, clock: Clock) => CajaGateway;

/**
 * Registro de tipos de caja soportados (principio abierto/cerrado): para
 * integrar un protocolo nuevo se agrega un adaptador y una línea aquí; las
 * cajas concretas se declaran en config/cajas.yaml con su "type".
 */
const BUILDERS: Readonly<Record<string, GatewayBuilder>> = {
  "rest-norte": (caja, clock) => new NorteRestGateway({ name: caja.name, url: required(caja, "url"), apiKey: required(caja, "apiKey") }, clock),
  "soap-oriente": (caja, clock) =>
    new OrienteSoapGateway({ name: caja.name, url: required(caja, "url"), user: required(caja, "user"), password: required(caja, "password") }, clock),
  "file-centro": (caja) => new CentroFileGateway({ name: caja.name, directory: required(caja, "directory") }),
  "rest-sur": (caja, clock) => new SurRestGateway({ name: caja.name, url: required(caja, "url"), token: required(caja, "token") }, clock),
};

function required(caja: CajaConfig, key: string): string {
  const value = caja.connection[key];
  if (!value) throw new Error(`La caja ${caja.name} necesita connection.${key}`);
  return value;
}

export function supportedTypes(): string[] {
  return Object.keys(BUILDERS);
}

/** Crea los adaptadores de las cajas habilitadas en la configuración. */
export function createGateways(cajas: readonly CajaConfig[], clock: Clock): CajaGateway[] {
  return cajas
    .filter((caja) => caja.enabled)
    .map((caja) => {
      const build = BUILDERS[caja.type];
      if (!build) throw new Error(`Tipo de caja no soportado: ${caja.type} (soportados: ${supportedTypes().join(", ")})`);
      return build(caja, clock);
    });
}

/** Envuelve cada adaptador con un presupuesto de tiempo y reintentos. */
export function withResilience(gateways: readonly CajaGateway[], options: ResilienceOptions): CajaGateway[] {
  return gateways.map((gateway) => new ResilientGateway(gateway, options));
}
