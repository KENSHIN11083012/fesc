import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../http-error.js";

/** Quién hace la petición: la caja dueña del token, o administración. */
export interface Consumer {
  readonly caja: string;
  readonly isAdmin: boolean;
}

export const ADMIN_CONSUMER = "ADMIN";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Registro de tokens de las cajas consumidoras. Compara en tiempo constante
 * (sobre el hash del token) para no filtrar información por tiempos de respuesta.
 */
export class TokenRegistry {
  private readonly entries: { hash: Buffer; consumer: Consumer }[] = [];

  constructor(cajaTokens: readonly { caja: string; token: string }[], adminToken: string) {
    for (const { caja, token } of cajaTokens) {
      if (token) this.entries.push({ hash: digest(token), consumer: { caja, isAdmin: false } });
    }
    this.entries.push({ hash: digest(adminToken), consumer: { caja: ADMIN_CONSUMER, isAdmin: true } });
  }

  identify(token: string): Consumer | null {
    const candidate = digest(token);
    let found: Consumer | null = null;
    for (const entry of this.entries) {
      if (timingSafeEqual(entry.hash, candidate)) found = entry.consumer;
    }
    return found;
  }
}

/** Exige `Authorization: Bearer <token>` válido; si no, responde 401. */
export function authenticate(registry: TokenRegistry) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const match = /^Bearer\s+(.+)$/i.exec(req.header("authorization") ?? "");
    const consumer = match?.[1] ? registry.identify(match[1].trim()) : null;
    if (!consumer) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="caja-link"');
      throw new HttpError(401, "NO_AUTENTICADO", "Se requiere un token Bearer válido de una caja consumidora");
    }
    res.locals.consumer = consumer;
    next();
  };
}

/** Solo permite el token de administración; otra caja autenticada recibe 403. */
export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (!consumerOf(res).isAdmin) throw new HttpError(403, "PROHIBIDO", "Solo el token de administración puede consultar la auditoría");
  next();
}

export function consumerOf(res: Response): Consumer {
  return res.locals.consumer as Consumer;
}
