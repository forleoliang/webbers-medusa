import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Skeleton, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { formatDateTime } from "../lib/api"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

type NotificationGroup = {
  template: string
  recipients: string[]
  sent_at: string
}

type NotificationsResponse = {
  notifications: NotificationGroup[]
}

const OrderNotificationsWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const { t, i18n } = useTranslation()
  const enabled = useFeatureEnabled("orderNotifications")

  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryFn: () => sdk.client.fetch<NotificationsResponse>(`/admin/orders/${order.id}/notifications`),
    queryKey: ["order-notifications", order.id],
    enabled,
  })

  if (!enabled) return null

  const notifications = data?.notifications ?? []

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("extensions.orderNotifications.title")}</Heading>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {t("extensions.orderNotifications.empty")}
          </Text>
        </div>
      ) : (
        notifications.map((notification, i) => (
          <div key={i} className="grid grid-cols-2 items-start gap-x-4 px-6 py-4">
            <div className="flex flex-col gap-y-1">
              <Text size="small" leading="compact" className="text-ui-fg-base">
                {t(`extensions.orderNotifications.templates.${notification.template}`, {
                  defaultValue: notification.template,
                })}
              </Text>
              {notification.recipients.map((recipient) => (
                <Text key={recipient} size="xsmall" leading="compact" className="text-ui-fg-muted break-all">
                  {recipient}
                </Text>
              ))}
            </div>
            <Text size="small" leading="compact" className="text-ui-fg-subtle text-right">
              {formatDateTime(notification.sent_at, i18n.language)}
            </Text>
          </div>
        ))
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side",
})

export default OrderNotificationsWidget
