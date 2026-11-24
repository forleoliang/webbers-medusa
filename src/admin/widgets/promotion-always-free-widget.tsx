import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminPromotion, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Skeleton, Switch, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

type AdminPromotionAlwaysFree = AdminPromotion & {
  always_free?: {
    id: string
    always_free: boolean
  }
}

const PromotionAlwaysFreeWidget = ({ data: promotion }: DetailWidgetProps<AdminPromotion>) => {
  const { t } = useTranslation()
  const dialog = usePrompt()
  const enabled = useFeatureEnabled("alwaysFreePromotion")
  const queryClient = useQueryClient()
  const queryKey = ["promotion-always-free", promotion.id]

  const { data: queryResult, isLoading } = useQuery({
    queryFn: () =>
      sdk.admin.promotion.retrieve(promotion.id, {
        fields: "+always_free.*",
      }),
    queryKey,
    enabled,
  })

  const alwaysFree = !!(queryResult?.promotion as AdminPromotionAlwaysFree | undefined)?.always_free?.always_free

  const mutation = useMutation({
    mutationFn: (nextValue: boolean) =>
      sdk.admin.promotion.update(promotion.id, {
        // @ts-expect-error additional_data extension
        additional_data: { always_free: nextValue },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ["promotion", promotion.id] })
      toast.success(t("extensions.alwaysFree.toastSaved"))
    },
    onError: (error: Error) => {
      toast.error(error.message || t("extensions.alwaysFree.toastFailed"))
    },
  })

  if (!enabled) {
    return null
  }

  const handleChange = async () => {
    const confirmed = await dialog({
      title: t("extensions.alwaysFree.confirmTitle"),
      description: t("extensions.alwaysFree.confirmDescription"),
      variant: "confirmation",
      confirmText: t("extensions.alwaysFree.confirm"),
      cancelText: t("extensions.alwaysFree.cancel"),
    })

    if (confirmed) {
      mutation.mutate(!alwaysFree)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("extensions.alwaysFree.title")}</Heading>
        {isLoading ? (
          <Skeleton className="h-5 w-9 rounded-full" />
        ) : (
          <Switch
            id="always-free"
            checked={alwaysFree}
            disabled={mutation.isPending}
            onCheckedChange={handleChange}
          />
        )}
      </div>
      <div className="px-6 py-4">
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {t("extensions.alwaysFree.description")}
        </Text>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "promotion.details.side",
})

export default PromotionAlwaysFreeWidget
