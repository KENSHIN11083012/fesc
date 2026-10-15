import type { NextFunction, Request, Response } from "express";
import { InvalidDocumentError } from "../../domain/document.js";
import { HttpError } from "../http-error.js";

/** Traduce los errores a respuestas JSON uniformes sin exponer detalles internos. */
export function errorHandler(log: (message: string, error: unknown) => void) {
  return (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    if (error instanceof InvalidDocumentError) {
      res.status(400).json({ error: "DOCUMENTO_INVALIDO", message: error.message });
      return;
    }
    const status = (error as { status?: number; type?: string }).status;
    if (status === 400 || status === 413 || status === 415) {
      res.status(status).json({ error: "PETICION_INVALIDA", message: "El cuerpo de la petición no es válido" });
      return;
    }
    log("Error no controlado", error);
    res.status(500).json({ error: "ERROR_INTERNO", message: "Ocurrió un error inesperado" });
  };
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "RUTA_NO_ENCONTRADA", message: "La ruta solicitada no existe" });
}
