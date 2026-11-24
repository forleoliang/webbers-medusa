import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { translateReviewsWorkflow } from "../../../../workflows/reviews/translate-reviews"
import type { AdminTranslateReviewsType } from "../../../validators"

export const POST = async (
  req: AuthenticatedMedusaRequest<AdminTranslateReviewsType>,
  res: MedusaResponse
) => {
  const { ids, only_outdated } = req.validatedBody
  const { result } = await translateReviewsWorkflow(req.scope).run({
    input: { ids, only_outdated },
  })
  res.status(200).json({ translated_ids: result })
}
