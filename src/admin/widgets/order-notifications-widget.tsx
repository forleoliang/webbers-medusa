import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Skeleton, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

const formatDateTime = (date: string | Date) => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat([], { dateStyle: "medium", timeStyle: "short" }).format(d)
}

type NotificationGroup = {
  template: string
  recipients: string[]
  sent_at: string
}

type NotificationsResponse = {
  notifications: NotificationGroup[]
}

const TEMPLATE_LABELS: Record<string, string> = {
  "order-invoice": "Invoice email",
  "order-placed": "Order confirmation",
  "order-shipped": "Shipping notification",
  "abandoned-cart": "Abandoned cart reminder",
  "review-request": "Review request email",
}

const OrderNotificationsWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
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
        <Heading level="h2">Notifications</Heading>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            No notifications sent
          </Text>
        </div>
      ) : (
        notifications.map((notification, i) => (
          <div key={i} className="grid grid-cols-2 items-start gap-x-4 px-6 py-4">
            <div className="flex flex-col gap-y-1">
              <Text size="small" leading="compact" className="text-ui-fg-base">
                {TEMPLATE_LABELS[notification.template] ?? notification.template}
              </Text>
              {notification.recipients.map((recipient) => (
                <Text key={recipient} size="xsmall" leading="compact" className="text-ui-fg-muted break-all">
                  {recipient}
                </Text>
              ))}
            </div>
            <Text size="small" leading="compact" className="text-ui-fg-subtle text-right">
              {formatDateTime(notification.sent_at)}
            </Text>
          </div>
        ))
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default OrderNotificationsWidget
