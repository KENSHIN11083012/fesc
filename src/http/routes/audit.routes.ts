import { type Request, type Response, Router } from "express";
import { DEFAULT_AUDIT_LIMIT, type GetAuditLog } from "../../application/get-audit-log.js";
import { requireAdmin } from "../middlewares/auth.js";

/** Auditoría: solo con ADMIN_TOKEN. */
export function auditRouter(getAuditLog: GetAuditLog): Router {
  const router = Router();
  router.get("/v1/audit", requireAdmin, (req: Request, res: Response) => {
    const limit = req.query.limit === undefined ? DEFAULT_AUDIT_LIMIT : Number(req.query.limit);
    const entries = getAuditLog.execute(limit);
    res.setHeader("Cache-Control", "no-store");
    res.json({ count: entries.length, entries });
  });
  return router;
}
