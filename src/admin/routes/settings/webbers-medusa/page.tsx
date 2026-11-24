import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Adjustments } from "@medusajs/icons"
import { Badge, Container, Heading, Skeleton, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type FeatureCategory,
  WEBBERS_FEATURES,
} from "../../../../feature-flags"
import { getTranslationSettings, TRANSLATION_SETTINGS_KEY } from "../../../lib/api"
import { sdk } from "../../../lib/sdk"
import { useFeatureFlags, WEBBERS_SETTINGS_QUERY_KEY } from "../../../lib/use-feature-flags"

type FlagsResponse = { flags: Record<string, boolean> }

const CATEGORIES: { key: FeatureCategory; title: string; subtitle: string }[] = [
  {
    key: "reviews_wishlist",
    title: "Reviews & Wishlist",
    subtitle: "Verified-purchase reviews, email invitations, machine translations, external sync, and wishlists.",
  },
  {
    key: "customer_order",
    title: "Customer & Order Tools",
    subtitle: "Admin productivity notes, GDPR anonymization, guest order merging, email editing, and order insights.",
  },
  {
    key: "promotions_pricing",
    title: "Promotions & Pricing",
    subtitle: "Free-shipping promotions, price-list discount protection, and unique single-use coupon code batches.",
  },
]

const StoreExtensionsSettingsPage = () => {
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
      toast.success("Settings saved")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save settings"),
  })

  const flags = data?.flags ?? {}
  const enabledCount = WEBBERS_FEATURES.filter((f) => flags[f.key] ?? f.defaultEnabled).length

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Heading level="h1">Store Extensions</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Enable or disable modules across Reviews, Wishlist, and QoL admin tools. Disabling a feature
              hides its Admin UI and blocks its API routes.
            </Text>
          </div>
          <Badge size="2xsmall" rounded="full" color="green">
            {enabledCount} / {WEBBERS_FEATURES.length} enabled
          </Badge>
        </div>
      </Container>

      {CATEGORIES.map((category) => {
        const items = WEBBERS_FEATURES.filter((f) => f.category === category.key)
        return (
          <Container key={category.key} className="divide-y p-0">
            <div className="flex flex-col gap-y-1 px-6 py-4">
              <Heading level="h2">{category.title}</Heading>
              <Text size="small" leading="compact" className="text-ui-fg-subtle">
                {category.subtitle}
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
                            {feature.label}
                          </Text>
                          {feature.key === "kiyohSync" && (
                            <Badge size="2xsmall" color="grey">
                              Opt-in
                            </Badge>
                          )}
                          {feature.key === "reviewTranslations" && translationConfig && (
                            <Badge
                              size="2xsmall"
                              color={translationConfig.configured ? "green" : "orange"}
                            >
                              {translationConfig.configured
                                ? `API ready (${translationConfig.target_languages.join(", ")})`
                                : "API key not set"}
                            </Badge>
                          )}
                        </div>
                        <Text size="small" leading="compact" className="text-ui-fg-subtle">
                          {feature.description}
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
  label: "Store Extensions",
  icon: Adjustments,
})

export default StoreExtensionsSettingsPage
