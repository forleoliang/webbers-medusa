import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminPriceList, DetailWidgetProps, MetadataType } from "@medusajs/framework/types"
import { Container, Heading, Skeleton, Switch, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

type PriceListExtResponse = {
  price_list_ext: { id: string; metadata?: MetadataType }
}

const PriceListExtWidget = ({ data }: DetailWidgetProps<AdminPriceList>) => {
  const { t } = useTranslation()
  const { id } = data
  const enabled = useFeatureEnabled("disallowPriceListDiscounts")
  const queryClient = useQueryClient()
  const queryKey = ["price-list-ext", id]

  const { data: extendedPriceList, isLoading } = useQuery<PriceListExtResponse>({
    queryFn: () =>
      sdk.client.fetch(`/admin/price-lists/${id}/ext`, {
        headers: { cache: "no-cache" },
      }),
    queryKey,
    enabled,
  })

  const priceListExt = extendedPriceList?.price_list_ext

  const { mutate, isPending } = useMutation({
    mutationFn: (body: { id: string; metadata: MetadataType }) =>
      sdk.client.fetch(`/admin/price-lists/${id}/ext`, {
        method: "PATCH",
        body,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      toast.success(t("extensions.priceListExt.toastSaved"))
    },
    onError: (err: Error) => {
      toast.error(err.message || t("extensions.priceListExt.toastFailed"))
    },
  })

  if (!enabled) {
    return null
  }

  const handleToggle = () => {
    if (!priceListExt?.id) return
    const nextMetadata: MetadataType = {
      ...(priceListExt.metadata ?? {}),
      disallow_discounts: !priceListExt.metadata?.disallow_discounts,
    }
    mutate({ id: priceListExt.id, metadata: nextMetadata })
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("extensions.priceListExt.title")}</Heading>
        {isLoading ? (
          <Skeleton className="h-5 w-9 rounded-full" />
        ) : (
          <Switch
            checked={!!priceListExt?.metadata?.disallow_discounts}
            onCheckedChange={handleToggle}
            disabled={isPending || !priceListExt?.id}
          />
        )}
      </div>
      <div className="px-6 py-4">
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {t("extensions.priceListExt.description")}
        </Text>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "price_list.details.side",
})

export default PriceListExtWidget
