import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { getOptions } from "../../../lib/options"
import { translateReviewContent } from "../../../lib/translate"
import { REVIEWS_MODULE } from "../../../modules/reviews"
import type ReviewsModuleService from "../../../modules/reviews/service"
import { getReviewTranslationsMap, isReviewTranslationCurrent } from "../../../review-translations"

export type TranslateReviewsInput = {
  ids?: string[]
  only_outdated?: boolean
}

type PreviousMetadata = {
  id: string
  metadata: Record<string, unknown> | null
}

export const translateReviewsStepId = "translate-reviews-step"

/** Translates reviews into configured target languages and persists them under `review.metadata.translations`. */
export const translateReviewsStep = createStep(
  translateReviewsStepId,
  async ({ ids, only_outdated }: TranslateReviewsInput, { container }) => {
    const translationOptions = getOptions(container).reviews.translations
    if (!translationOptions.apiKey || !translationOptions.targetLanguages.length) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Review translations are not configured")
    }

    const service = container.resolve<ReviewsModuleService>(REVIEWS_MODULE)
    const filters = ids?.length ? { id: ids } : {}
    const reviews = await service.listReviews(filters, {
      select: ["id", "title", "body", "metadata"],
      take: ids?.length ? ids.length : 100,
    })

    const targets = only_outdated
      ? reviews.filter(
          (review) =>
            !translationOptions.targetLanguages.every((lang) => isReviewTranslationCurrent(review, lang))
        )
      : reviews

    if (!targets.length) {
      return new StepResponse([] as string[], [] as PreviousMetadata[])
    }

    const previous: PreviousMetadata[] = targets.map((r) => ({
      id: r.id,
      metadata: r.metadata ? { ...r.metadata } : null,
    }))

    const updates = await Promise.all(
      targets.map(async (review) => {
        const translated = await translateReviewContent(review, translationOptions)
        const existingTranslations = getReviewTranslationsMap(review)
        return {
          id: review.id,
          metadata: {
            ...(review.metadata ?? {}),
            translations: {
              ...existingTranslations,
              ...translated,
            },
          },
        }
      })
    )

    await service.updateReviews(updates)
    return new StepResponse(
      updates.map((u) => u.id),
      previous
    )
  },
  async (previous, { container }) => {
    if (!previous?.length) return
    const service = container.resolve<ReviewsModuleService>(REVIEWS_MODULE)
    await service.updateReviews(previous)
  }
)
