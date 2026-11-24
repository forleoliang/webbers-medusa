import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { deleteFilesQuietly } from "../lib/images"
import { REVIEWS_MODULE } from "../modules/reviews"
import type ReviewsModuleService from "../modules/reviews/service"
import { WEBBERS_SETTINGS_MODULE } from "../modules/webbers-settings"
import type WebbersSettingsService from "../modules/webbers-settings/service"

const MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Daily: photos uploaded for a review that was never submitted are deleted (file and row). */
export default async function cleanupReviewUploadsJob(container: MedusaContainer) {
  const settings = container.resolve<WebbersSettingsService>(WEBBERS_SETTINGS_MODULE)
  if (!(await settings.isEnabled("reviews"))) return

  const service = container.resolve<ReviewsModuleService>(REVIEWS_MODULE)
  const old = await service.listReviewUploads({ created_at: { $lt: new Date(Date.now() - MAX_AGE_MS) } }, { take: 500 })
  if (!old.length) return
  await deleteFilesQuietly(container, old.map((u) => u.file_id))
  await service.deleteReviewUploads(old.map((u) => u.id))
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`[reviews] removed ${old.length} abandoned review upload(s)`)
}

export const config = {
  name: "reviews-cleanup-uploads",
  schedule: "17 3 * * *",
}
