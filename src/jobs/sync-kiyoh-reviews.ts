import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { storePrivateImage } from "../lib/images"
import { getOptions } from "../lib/options"
import { displayName, pickLocale, sanitizeText, splitName } from "../lib/text"
import { REVIEWS_MODULE } from "../modules/reviews"
import type ReviewsModuleService from "../modules/reviews/service"
import { WEBBERS_SETTINGS_MODULE } from "../modules/webbers-settings"
import type WebbersSettingsService from "../modules/webbers-settings/service"
import type { KiyohResponse, KiyohReview } from "../types/kiyoh"
import { createReviewsWorkflow } from "../workflows/reviews/create-reviews"
import type { CreateReviewInput } from "../workflows/reviews/steps/create-reviews"

const KIYOH_ASSET_URL = "https://www.kiyoh.com"
const MAPPED_QUESTION_GROUPS = ["DEFAULT_OVERALL", "DEFAULT_ONELINER", "DEFAULT_OPINION", "DEFAULT_RECOMMEND"]
const PHOTO_QUESTION_TYPE = "IMAGE"

const getUnmappedKiyohAnswers = (review: KiyohReview) =>
  Object.fromEntries(
    review.reviewContent
      .filter(
        (rc) =>
          !MAPPED_QUESTION_GROUPS.includes(rc.questionGroup) &&
          rc.questionType !== PHOTO_QUESTION_TYPE &&
          !rc.notApplicable &&
          rc.rating != null
      )
      .map((rc) => [rc.questionTranslation, rc.rating])
  )

const getKiyohPhotoUrl = (review: KiyohReview) => {
  const photoAnswer = review.reviewContent.find(
    (rc) => rc.questionType === PHOTO_QUESTION_TYPE && !rc.notApplicable
  )?.rating
  if (!photoAnswer) return null
  try {
    const { imagePath } = JSON.parse(photoAnswer) as { imagePath?: string }
    return imagePath ? `${KIYOH_ASSET_URL}${imagePath}` : null
  } catch {
    return null
  }
}

async function uploadKiyohPhotoToReviewUpload(
  container: MedusaContainer,
  service: ReviewsModuleService,
  review: KiyohReview
): Promise<string | null> {
  const photoUrl = getKiyohPhotoUrl(review)
  if (!photoUrl) return null
  try {
    const response = await fetch(photoUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buf = Buffer.from(await response.arrayBuffer())
    const mime = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim()
    const fileId = await storePrivateImage(container, buf, mime)
    const upload = await service.createReviewUploads({
      file_id: fileId,
      mime_type: mime,
      size: buf.length,
      owner: `kiyoh:${review.reviewId}`,
    })
    return upload.id
  } catch (err) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    logger.warn(`[kiyoh] skipping photo for review ${review.reviewId}: ${(err as Error).message}`)
    return null
  }
}

/** Daily job: imports new Kiyoh external reviews matched by order reference into the unified Reviews module. */
export default async function syncKiyohReviewsJob(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const settings = container.resolve<WebbersSettingsService>(WEBBERS_SETTINGS_MODULE)

  if (!(await settings.isEnabled("reviews")) || !(await settings.isEnabled("kiyohSync"))) {
    return
  }

  if (!process.env.KIYOH_LOCATION_ID || !process.env.KIYOH_API_TOKEN || process.env.KIYOH_SYNC_ENABLE !== "true") {
    logger.debug("[kiyoh] missing KIYOH_* environment variables; skipping sync")
    return
  }

  const options = getOptions(container)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const reviewService = container.resolve<ReviewsModuleService>(REVIEWS_MODULE)

  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0]
    const url = `https://www.kiyoh.com/v1/publication/review/external?locationId=${encodeURIComponent(process.env.KIYOH_LOCATION_ID)}&dateSince=${yesterday}`

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Publication-Api-Token": process.env.KIYOH_API_TOKEN,
      },
    })
    if (!response.ok) throw new Error(`Kiyoh API responded ${response.status}`)

    const data = (await response.json()) as KiyohResponse
    const referencedReviews = (data.reviews ?? []).filter((r) => !!r.referenceCode)
    if (!referencedReviews.length) return

    const toCreate: CreateReviewInput[] = []

    for (const review of referencedReviews) {
      const refCode = review.referenceCode!.replace("#", "")
      const { data: orders } = await query.graph({
        entity: "order",
        fields: ["id", "email", "customer_id", "items.id", "items.product_id", "items.variant_id"],
        filters: { display_id: refCode },
      })

      const order = orders?.[0] as
        | {
            id: string
            email?: string | null
            customer_id?: string | null
            items?: { id: string; product_id?: string | null; variant_id?: string | null }[]
          }
        | undefined
      if (!order?.items?.length) continue

      const seenProducts = new Set<string>()
      const rawTitle = review.reviewContent.find((rc) => rc.questionGroup === "DEFAULT_ONELINER")?.rating ?? ""
      const rawBody = review.reviewContent.find((rc) => rc.questionGroup === "DEFAULT_OPINION")?.rating ?? ""
      const title = sanitizeText(rawTitle, options.reviews.max_title_length) || null
      const body = sanitizeText(rawBody, options.reviews.max_body_length) || title || "Imported review"
      const [first, last] = splitName(review.reviewAuthor)
      const authorDisplayName = displayName(first, last, options.display_name)
      const normalizedRating = Math.max(1, Math.min(5, Math.ceil(review.rating / 2)))
      const locale = pickLocale(review.reviewLanguage, undefined)

      let uploadedPhotoId: string | null = null
      if (options.reviews.max_photos > 0) {
        uploadedPhotoId = await uploadKiyohPhotoToReviewUpload(container, reviewService, review)
      }

      for (const item of order.items) {
        if (!item.product_id || seenProducts.has(item.product_id)) continue
        seenProducts.add(item.product_id)

        const syntheticOrderItemId = `kiyoh:${review.reviewId}:${item.product_id}`
        const existing = await reviewService.listReviews(
          { order_item_id: syntheticOrderItemId },
          { select: ["id"], take: 1 }
        )
        if (existing.length) continue

        toCreate.push({
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          order_id: order.id,
          order_item_id: syntheticOrderItemId,
          customer_id: order.customer_id ?? null,
          email: order.email ?? null,
          display_name: authorDisplayName,
          rating: normalizedRating,
          title,
          body,
          locale,
          ip_hash: null,
          source: "kiyoh",
          upload_ids: uploadedPhotoId ? [uploadedPhotoId] : [],
          metadata: {
            kiyoh_review_id: review.reviewId,
            kiyoh_rating: review.rating,
            kiyoh_reference_code: review.referenceCode,
            kiyoh_language: review.reviewLanguage,
            kiyoh_city: review.city ?? null,
            kiyoh_recommend:
              review.reviewContent.find((rc) => rc.questionGroup === "DEFAULT_RECOMMEND")?.rating === "true",
            kiyoh_answers: getUnmappedKiyohAnswers(review),
          },
        })
        // Consume upload_id on the first product item so each ReviewUpload maps to one ReviewImage row.
        uploadedPhotoId = null
      }
    }

    if (!toCreate.length) return

    const { result: createdIds } = await createReviewsWorkflow(container).run({
      input: { reviews: toCreate, auto_approve: options.auto_approve },
    })
    logger.info(`[kiyoh] imported ${createdIds.length} review(s) from Kiyoh`)
  } catch (err) {
    logger.error(`[kiyoh] sync failed: ${(err as Error).message}`)
  }
}

export const config = {
  name: "sync-kiyoh-reviews",
  schedule: "03 01 * * *",
}
