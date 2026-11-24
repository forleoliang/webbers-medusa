import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getOptions } from "../../../lib/options"
import { WEBBERS_SETTINGS_MODULE } from "../../../modules/webbers-settings"
import type WebbersSettingsService from "../../../modules/webbers-settings/service"

/** Reports whether review translations are enabled by feature flag and configured with API credentials. */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const settings = req.scope.resolve<WebbersSettingsService>(WEBBERS_SETTINGS_MODULE)
  const featureEnabled = await settings.isEnabled("reviewTranslations")
  const { apiKey, sourceLanguage, targetLanguages } = getOptions(req.scope).reviews.translations
  const configured = Boolean(apiKey && targetLanguages.length > 0)

  res.status(200).json({
    enabled: featureEnabled && configured,
    feature_enabled: featureEnabled,
    configured,
    source_language: sourceLanguage,
    target_languages: targetLanguages,
  })
}
