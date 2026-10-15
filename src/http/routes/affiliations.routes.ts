import { type Request, type Response, Router } from "express";
import type { AffiliationReport, CheckAffiliation } from "../../application/check-affiliation.js";
import { PURPOSES, isPurpose } from "../../domain/purpose.js";
import { HttpError } from "../http-error.js";
import { consumerOf } from "../middlewares/auth.js";
import { presentV1, presentV2 } from "../presenters/affiliation.presenter.js";

/** Rutas de consulta en línea: v1 (congelada) y v2 (agrega affiliateType). */
export function affiliationsRouter(checkAffiliation: CheckAffiliation): Router {
  const router = Router();

  const handler = (present: (report: AffiliationReport) => unknown) => async (req: Request, res: Response) => {
    const purpose = req.query.purpose;
    if (!isPurpose(purpose)) {
      throw new HttpError(400, "FINALIDAD_INVALIDA", `El parámetro purpose es obligatorio y debe ser uno de: ${PURPOSES.join(", ")}`);
    }
    const report = await checkAffiliation.execute({
      document: String(req.params.document ?? ""),
      purpose,
      requester: consumerOf(res).caja,
    });
    res.setHeader("Cache-Control", "no-store");
    res.json(present(report));
  };

  router.get("/v1/affiliations/:document", handler(presentV1));
  router.get("/v2/affiliations/:document", handler(presentV2));
  return router;
}
