import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Container, Heading, Skeleton, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toIntlLocale } from "../lib/api"
import { sdk } from "../lib/sdk"
import { useFeatureEnabled } from "../lib/use-feature-flags"

type AdjustmentLike = { code?: string | null; amount?: number | string | null }
type LineItemLike = { adjustments?: AdjustmentLike[] | null }
type PromotionLike = {
  code?: string | null
  application_method?: { type?: string | null; value?: number | string | null } | null
}
type OrderWithCartPromotions = { cart?: { promotions?: PromotionLike[] | null } | null }
type DiscountCodeBreakdownEntry = { code: string; total: number; percentage?: number }

const buildDiscountCodeBreakdown = (
  items?: LineItemLike[] | null,
  promotions?: PromotionLike[] | null
): DiscountCodeBreakdownEntry[] => {
  if (!items?.length) return []
  const totals = new Map<string, number>()

  items.forEach((item) => {
    ;(item.adjustments ?? []).forEach((adj) => {
      if (!adj?.code) return
      totals.set(adj.code, (totals.get(adj.code) ?? 0) + (Number(adj.amount) || 0))
    })
  })

  const percentages = new Map<string, number>()
  ;(promotions ?? []).forEach((p) => {
    if (!p?.code || p.application_method?.type !== "percentage") return
    const raw = p.application_method?.value
    const val = typeof raw === "string" ? parseFloat(raw) : raw
    if (typeof val === "number" && !Number.isNaN(val)) percentages.set(p.code, val)
  })

  return Array.from(totals.entries())
    .map(([code, total]) => ({ code, total, percentage: percentages.get(code) }))
    .sort((a, b) => b.total - a.total)
}

const formatAmount = (amount: number, currencyCode: string, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currencyDisplay: "narrowSymbol",
    currency: currencyCode,
  }).format(amount)

const OrderDiscountBreakdownWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const { t, i18n } = useTranslation()
  const enabled = useFeatureEnabled("orderDiscountBreakdown")

  const { data, isLoading } = useQuery({
    queryKey: ["order-discount-breakdown", order.id],
    queryFn: () =>
      sdk.admin.order.retrieve(order.id, {
        fields:
          "*items.adjustments,*cart.promotions,+cart.promotions.application_method.type,+cart.promotions.application_method.value",
      }),
    enabled,
  })

  if (!enabled) return null

  const enriched = data?.order
  const promotions = (enriched as unknown as OrderWithCartPromotions | undefined)?.cart?.promotions
  const breakdown = buildDiscountCodeBreakdown(enriched?.items, promotions)

  if (!isLoading && breakdown.length === 0) {
    return null
  }

  const locale = toIntlLocale(i18n.language)

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("extensions.discountBreakdown.title")}</Heading>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : (
        <div className="divide-y">
          {breakdown.map(({ code, total, percentage }) => (
            <div key={code} className="flex items-center justify-between gap-x-4 px-6 py-3">
              <Text size="small" leading="compact" className="text-ui-fg-subtle">
                <span className="font-mono">{code}</span>
                {typeof percentage === "number" ? ` (${percentage}%)` : ""}
              </Text>
              <Text size="small" leading="compact" family="mono" className="text-ui-fg-base tabular-nums">
                {formatAmount(total, order.currency_code, locale)}
              </Text>
            </div>
          ))}
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.after",
})

export default OrderDiscountBreakdownWidget
