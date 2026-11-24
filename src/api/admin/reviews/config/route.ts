import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getOptions } from "../../../../lib/options"
import { WEBBERS_SETTINGS_MODULE } from "../../../../modules/webbers-settings"
import type WebbersSettingsService from "../../../../modules/webbers-settings/service"

/** Non-secret plugin settings the Admin pages adapt to. */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const o = getOptions(req.scope)
  const settings = req.scope.resolve<WebbersSettingsService>(WEBBERS_SETTINGS_MODULE)
  const flags = await settings.getFlags()

  res.json({
    show_credit: o.showCredit,
    auto_approve: o.auto_approve,
    display_name: o.display_name,
    max_photos: o.reviews.max_photos,
    review_requests: {
      enabled: o.review_requests.enabled && (flags.reviewRequests ?? true),
      trigger: o.review_requests.trigger,
      delay_days: o.review_requests.delay_days,
      token_ttl_days: o.review_requests.token_ttl_days,
      link_url_configured: !!o.review_requests.link_url,
      rules: o.review_requests.rules.length,
    },
    wishlist: {
      enabled: flags.wishlist ?? true,
      counts: o.wishlist.counts,
      share: o.wishlist.share,
    },
    translations: {
      enabled: (flags.reviewTranslations ?? true) && Boolean(o.reviews.translations.apiKey && o.reviews.translations.targetLanguages.length),
      configured: Boolean(o.reviews.translations.apiKey && o.reviews.translations.targetLanguages.length),
      source_language: o.reviews.translations.sourceLanguage,
      target_languages: o.reviews.translations.targetLanguages,
    },
  })
}
