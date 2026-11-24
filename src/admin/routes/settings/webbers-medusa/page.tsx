import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Adjustments } from "@medusajs/icons"
import { Badge, Container, Heading, Skeleton, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  type FeatureCategory,
  WEBBERS_FEATURES,
} from "../../../../feature-flags"
import { getTranslationSettings, TRANSLATION_SETTINGS_KEY } from "../../../lib/api"
import { sdk } from "../../../lib/sdk"
import { useFeatureFlags, WEBBERS_SETTINGS_QUERY_KEY } from "../../../lib/use-feature-flags"

type FlagsResponse = { flags: Record<string, boolean> }

const CATEGORIES: FeatureCategory[] = [
  "reviews_wishlist",
  "customer_order",
  "promotions_pricing",
]

const StoreExtensionsSettingsPage = () => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isLoading } = useFeatureFlags()
  const { data: translationConfig } = useQuery({
    queryKey: TRANSLATION_SETTINGS_KEY,
    queryFn: getTranslationSettings,
    staleTime: 60_000,
  })

  const { mutate, isPending } = useMutation({
    mutationFn: (flags: Record<string, boolean>) =>
      sdk.client.fetch<FlagsResponse>("/admin/webbers-medusa/settings", {
        method: "POST",
        body: { flags },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WEBBERS_SETTINGS_QUERY_KEY })
      await queryClient.invalidateQueries({ queryKey: TRANSLATION_SETTINGS_KEY })
      toast.success(t("extensions.settings.toastSaved"))
    },
    onError: (err: Error) => toast.error(err.message || t("extensions.settings.toastFailed")),
  })

  const flags = data?.flags ?? {}
  const enabledCount = WEBBERS_FEATURES.filter((f) => flags[f.key] ?? f.defaultEnabled).length

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Heading level="h1">{t("extensions.settings.title")}</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {t("extensions.settings.description")}
            </Text>
          </div>
          <Badge size="2xsmall" rounded="full" color="green">
            {t("extensions.settings.enabledCount", {
              enabled: enabledCount,
              total: WEBBERS_FEATURES.length,
            })}
          </Badge>
        </div>
      </Container>

      {CATEGORIES.map((categoryKey) => {
        const items = WEBBERS_FEATURES.filter((f) => f.category === categoryKey)
        return (
          <Container key={categoryKey} className="divide-y p-0">
            <div className="flex flex-col gap-y-1 px-6 py-4">
              <Heading level="h2">{t(`extensions.settings.categories.${categoryKey}.title`)}</Heading>
              <Text size="small" leading="compact" className="text-ui-fg-subtle">
                {t(`extensions.settings.categories.${categoryKey}.subtitle`)}
              </Text>
            </div>

            {isLoading
              ? items.map((feature) => (
                  <div key={feature.key} className="flex items-center justify-between gap-x-4 px-6 py-4">
                    <div className="flex flex-col gap-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3.5 w-80" />
                    </div>
                    <Skeleton className="h-5 w-9 rounded-full" />
                  </div>
                ))
              : items.map((feature) => {
                  const enabled = flags[feature.key] ?? feature.defaultEnabled
                  return (
                    <div key={feature.key} className="flex items-center justify-between gap-x-4 px-6 py-4">
                      <div className="flex flex-col gap-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Text weight="plus" size="small" leading="compact">
                            {t(`extensions.settings.features.${feature.key}.label`, {
                              defaultValue: feature.label,
                            })}
                          </Text>
                          {feature.key === "kiyohSync" && (
                            <Badge size="2xsmall" color="grey">
                              {t("extensions.settings.optIn")}
                            </Badge>
                          )}
                          {feature.key === "reviewTranslations" && translationConfig && (
                            <Badge
                              size="2xsmall"
                              color={translationConfig.configured ? "green" : "orange"}
                            >
                              {translationConfig.configured
                                ? t("extensions.settings.apiReady", {
                                    languages: translationConfig.target_languages.join(", "),
                                  })
                                : t("extensions.settings.apiKeyNotSet")}
                            </Badge>
                          )}
                        </div>
                        <Text size="small" leading="compact" className="text-ui-fg-subtle">
                          {t(`extensions.settings.features.${feature.key}.description`, {
                            defaultValue: feature.description,
                          })}
                        </Text>
                      </div>
                      <Switch
                        checked={enabled}
                        disabled={isPending}
                        onCheckedChange={(next) => mutate({ [feature.key]: next })}
                      />
                    </div>
                  )
                })}
          </Container>
        )
      })}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "extensions.settings.label",
  translationNs: "translation",
  icon: Adjustments,
})

export default StoreExtensionsSettingsPage
