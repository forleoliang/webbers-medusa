import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminCustomer, DetailWidgetProps } from "@medusajs/framework/types"
import { Badge, Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

type GuestOrdersResponse = { count: number; email: string }
type MergeResponse = { transferred_count: number }

const CustomerMergeGuestOrdersWidget = ({ data }: DetailWidgetProps<AdminCustomer>) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const featureEnabled = useFeatureEnabled("transferGuestOrders")

  const { data: guestData, isLoading } = useQuery<GuestOrdersResponse>({
    queryKey: ["customer-guest-orders", data.id],
    queryFn: () => sdk.client.fetch(`/admin/customers/${data.id}/merge-guest-orders`),
    enabled: data.has_account && featureEnabled,
  })

  const mergeMutation = useMutation<MergeResponse>({
    mutationFn: () =>
      sdk.client.fetch(`/admin/customers/${data.id}/merge-guest-orders`, {
        method: "POST",
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      toast.success(t("extensions.mergeGuestOrders.toastSuccess", { count: result.transferred_count }))
    },
    onError: (error: Error) => {
      toast.error(error.message || t("extensions.mergeGuestOrders.toastFailed"))
    },
  })

  if (!featureEnabled || !data.has_account || isLoading) return null

  const count = guestData?.count ?? 0
  if (count === 0) return null

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("extensions.mergeGuestOrders.title")}</Heading>
        <Badge size="2xsmall" color="orange">
          {count}
        </Badge>
      </div>
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {t("extensions.mergeGuestOrders.description", { count, email: guestData?.email ?? "" })}
        </Text>
        <div>
          <Button
            size="small"
            variant="primary"
            isLoading={mergeMutation.isPending}
            disabled={mergeMutation.isPending}
            onClick={() => mergeMutation.mutate()}
          >
            {t("extensions.mergeGuestOrders.action")}
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "customer.details.side.before",
})

export default CustomerMergeGuestOrdersWidget
