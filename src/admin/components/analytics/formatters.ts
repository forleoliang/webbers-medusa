import {
  type AnalyticsAcquisitionResponse,
  type AnalyticsOverviewResponse,
  toIntlLocale,
} from "../../lib/api"

export type TranslateFn = (key: string, options?: Record<string, unknown>) => string

export function formatMoney(amount: number, currencyCode: string, locale: string): string {
  const code = (currencyCode || "usd").toUpperCase()
  const safe = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat(toIntlLocale(locale), {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(safe)
  } catch {
    return `${code} ${safe.toFixed(2)}`
  }
}

export function formatNumber(val: number | null | undefined, locale: string): string {
  const safe = typeof val === "number" && Number.isFinite(val) ? val : 0
  return new Intl.NumberFormat(toIntlLocale(locale)).format(safe)
}

export type MergedProductRow = {
  product_id: string
  title: string
  handle: string
  views: number
  visitors: number
  units: number
  orders: number
  revenue: number
  conversion_rate: number | null
}

export function mergeProductPerformance(
  catalogProducts: AnalyticsOverviewResponse["catalog_products"],
  productViews: AnalyticsAcquisitionResponse["product_views"] | undefined
): MergedProductRow[] {
  const viewsByHandle = new Map<string, { views: number; people: number }>()
  for (const pv of productViews || []) {
    if (!pv.handle) continue
    const existing = viewsByHandle.get(pv.handle) ?? { views: 0, people: 0 }
    existing.views += pv.views
    existing.people += pv.people
    viewsByHandle.set(pv.handle, existing)
  }

  return (catalogProducts || [])
    .map((p) => {
      const stats = viewsByHandle.get((p.handle || "").toLowerCase())
      const views = stats?.views ?? 0
      const visitors = stats?.people ?? 0
      const conversion_rate =
        visitors > 0 ? Number(((p.orders / visitors) * 100).toFixed(1)) : null
      return {
        product_id: p.product_id,
        title: p.title,
        handle: p.handle,
        views,
        visitors,
        units: p.units,
        orders: p.orders,
        revenue: p.revenue,
        conversion_rate,
      }
    })
    .filter((r) => r.views > 0 || r.units > 0 || r.orders > 0)
    .sort((a, b) => b.revenue - a.revenue || b.views - a.views || b.units - a.units)
}

export type FiveStepFunnelItem = {
  key: "sessions" | "view_item" | "add_to_cart" | "begin_checkout" | "purchase"
  count: number
  people: number
  pctOfSessions: number
  stepConversion: number | null
}

export function build5StepFunnel(acq?: AnalyticsAcquisitionResponse): FiveStepFunnelItem[] {
  const sessions = acq?.summary?.sessions ?? 0
  const visitors = acq?.summary?.visitors ?? 0
  const map = new Map((acq?.funnel || []).map((f) => [f.event, f]))

  const rawSteps: {
    key: FiveStepFunnelItem["key"]
    people: number
    count: number
  }[] = [
    { key: "sessions", people: visitors || sessions, count: sessions },
    {
      key: "view_item",
      people: map.get("view_item")?.people ?? 0,
      count: map.get("view_item")?.count ?? 0,
    },
    {
      key: "add_to_cart",
      people: map.get("add_to_cart")?.people ?? 0,
      count: map.get("add_to_cart")?.count ?? 0,
    },
    {
      key: "begin_checkout",
      people: map.get("begin_checkout")?.people ?? 0,
      count: map.get("begin_checkout")?.count ?? 0,
    },
    {
      key: "purchase",
      people: map.get("purchase")?.people ?? 0,
      count: map.get("purchase")?.count ?? 0,
    },
  ]

  const base = Math.max(rawSteps[0].people, 1)
  return rawSteps.map((step, i) => {
    const prev = i > 0 ? rawSteps[i - 1].people : null
    const stepConversion =
      prev !== null && prev > 0 ? Number(((step.people / prev) * 100).toFixed(1)) : null
    const pctOfSessions =
      rawSteps[0].people > 0 ? Number(((step.people / base) * 100).toFixed(1)) : 0
    return {
      ...step,
      pctOfSessions,
      stepConversion,
    }
  })
}

export type StoreInsight = {
  id: string
  tone: "info" | "warning" | "success"
  text: string
}

export function generateStoreInsights(
  overview: AnalyticsOverviewResponse | undefined,
  acq: AnalyticsAcquisitionResponse | undefined,
  locale: string,
  t: TranslateFn
): StoreInsight[] {
  if (!overview) return []
  const out: StoreInsight[] = []
  const currency = overview.currency_code || "usd"

  if (overview.abandoned_carts.total_carts > 0 && overview.abandoned_carts.potential_value > 0) {
    out.push({
      id: "abandoned-carts",
      tone: "info",
      text: t("analytics.insights.abandonedCarts", {
        count: formatNumber(overview.abandoned_carts.total_carts, locale),
        value: formatMoney(overview.abandoned_carts.potential_value, currency, locale),
        notified: formatNumber(overview.abandoned_carts.notified, locale),
      }),
    })
  }

  if (overview.inventory_summary.low_stock_count > 0) {
    out.push({
      id: "low-stock",
      tone: "warning",
      text: t("analytics.insights.lowStock", {
        count: formatNumber(overview.inventory_summary.low_stock_count, locale),
        outOfStock: formatNumber(overview.inventory_summary.out_of_stock_count, locale),
      }),
    })
  }

  if (acq?.configured && !acq.error && (acq.summary?.visitors ?? 0) > 0) {
    const steps = build5StepFunnel(acq)
    const viewItem = steps.find((s) => s.key === "view_item")?.people ?? 0
    const atc = steps.find((s) => s.key === "add_to_cart")?.people ?? 0
    if (viewItem > 0) {
      const atcRate = ((atc / viewItem) * 100).toFixed(1)
      out.push({
        id: "funnel-atc",
        tone: Number(atcRate) < 5 ? "warning" : "success",
        text: t("analytics.insights.funnelAtc", {
          views: formatNumber(viewItem, locale),
          atc: formatNumber(atc, locale),
          rate: atcRate,
        }),
      })
    }
  }

  if (overview.top_sizes.length > 0) {
    const leader = overview.top_sizes[0]
    out.push({
      id: "top-size",
      tone: "success",
      text: t("analytics.insights.topSize", {
        size: leader.variant_title,
        share: leader.share_pct,
        units: formatNumber(leader.units, locale),
      }),
    })
  }

  return out.slice(0, 3)
}
