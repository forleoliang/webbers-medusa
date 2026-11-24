import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { toAdminReview } from "../../../../../lib/serialize"
import { REVIEWS_MODULE } from "../../../../../modules/reviews"
import type ReviewsModuleService from "../../../../../modules/reviews/service"
import { translateReviewsWorkflow } from "../../../../../workflows/reviews/translate-reviews"
import { decorate } from "../../route"

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const [existing] = await service.listReviews({ id: req.params.id }, { take: 1 })
  if (!existing) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Review ${req.params.id} not found`)
  }

  await translateReviewsWorkflow(req.scope).run({
    input: { ids: [req.params.id] },
  })

  const [review] = await service.listReviews({ id: req.params.id }, { relations: ["images", "reply"], take: 1 })
  const { titles, displayIds } = await decorate(req, [review])
  res.status(200).json({
    review: toAdminReview(review, {
      product_title: titles.get(review.product_id) ?? null,
      order_display_id: displayIds.get(review.order_id) ?? null,
    }),
  })
}
