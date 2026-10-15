import { XMLParser } from "fast-xml-parser";
import type { Affiliation } from "../../domain/affiliation.js";
import { fromDayMonthYear } from "../../domain/dates.js";
import type { DocumentNumber } from "../../domain/document.js";
import { CajaUnavailableError, type CajaGateway, type CajaLookup } from "../../application/ports/caja-gateway.js";
import type { Clock } from "../../application/ports/clock.js";
import { toAffiliateType } from "./affiliate-type-mapper.js";

export interface OrienteSoapOptions {
  readonly name: string;
  readonly url: string;
  readonly user: string;
  readonly password: string;
}

const ORIENTE_DOCUMENT_LENGTH = 12;
const NAMESPACE = "http://cajaoriente.example/afiliacion";

const XML_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

/** Formato de Caja Oriente: 12 dígitos con ceros a la izquierda, agrupados con puntos (001.098.765.432). */
export function toOrienteDocument(document: string): string {
  return document.padStart(ORIENTE_DOCUMENT_LENGTH, "0").replace(/(\d{3})(?=\d)/g, "$1.");
}

interface OrienteAffiliation {
  FechaIngreso?: string;
  FechaRetiro?: string;
  TipoAfiliado?: string;
}

/**
 * Adaptador de Caja Oriente (SOAP 1.1). Convierte el documento al formato de
 * 12 dígitos, arma el sobre SOAP con las credenciales en el Header y traduce
 * las fechas DD/MM/YYYY. Nombre, teléfono y dirección se descartan.
 */
export class OrienteSoapGateway implements CajaGateway {
  readonly name: string;
  private readonly parser = new XMLParser({
    removeNSPrefix: true,
    parseTagValue: false,
    ignoreAttributes: true,
    isArray: (tagName) => tagName === "Afiliacion",
  });

  constructor(
    private readonly options: OrienteSoapOptions,
    private readonly clock: Clock,
  ) {
    this.name = options.name;
  }

  async lookup(document: DocumentNumber, signal?: AbortSignal): Promise<CajaLookup> {
    const asOf = this.clock.today();
    if (document.length > ORIENTE_DOCUMENT_LENGTH) {
      // Un documento de más de 12 dígitos no puede existir en Caja Oriente.
      return { source: "ONLINE", asOf, affiliations: [] };
    }

    const response = await fetch(this.options.url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "ConsultarAfiliacion" },
      body: this.envelope(document),
      signal,
    });
    const text = await response.text();
    if (!response.ok) {
      const fault = /<faultstring>([^<]*)<\/faultstring>/.exec(text)?.[1];
      throw new CajaUnavailableError(this.name, fault ? `SOAP Fault: ${fault}` : `respuesta HTTP ${response.status}`);
    }
    return { source: "ONLINE", asOf, affiliations: this.parseAffiliations(text) };
  }

  private envelope(document: string): string {
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ori="${NAMESPACE}">` +
      `<soapenv:Header><ori:Credenciales><ori:Usuario>${escapeXml(this.options.user)}</ori:Usuario>` +
      `<ori:Clave>${escapeXml(this.options.password)}</ori:Clave></ori:Credenciales></soapenv:Header>` +
      `<soapenv:Body><ori:ConsultarAfiliacionRequest><ori:NumeroDocumento>${toOrienteDocument(document)}</ori:NumeroDocumento>` +
      `</ori:ConsultarAfiliacionRequest></soapenv:Body></soapenv:Envelope>`
    );
  }

  private parseAffiliations(xml: string): Affiliation[] {
    let answer: { Encontrado?: string; Persona?: { Afiliaciones?: { Afiliacion?: OrienteAffiliation[] } } } | undefined;
    try {
      answer = this.parser.parse(xml)?.Envelope?.Body?.ConsultarAfiliacionResponse;
    } catch {
      throw new CajaUnavailableError(this.name, "XML de respuesta inválido");
    }
    if (!answer) throw new CajaUnavailableError(this.name, "respuesta SOAP sin ConsultarAfiliacionResponse");
    if (String(answer.Encontrado).trim().toLowerCase() !== "true") return [];

    return (answer.Persona?.Afiliaciones?.Afiliacion ?? []).flatMap((item) => {
      const validFrom = fromDayMonthYear(String(item.FechaIngreso ?? ""));
      if (!validFrom) return [];
      return [{ validFrom, validTo: fromDayMonthYear(String(item.FechaRetiro ?? "")), affiliateType: toAffiliateType(item.TipoAfiliado) }];
    });
  }
}
