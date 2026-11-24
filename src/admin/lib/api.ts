import { sdk } from "./sdk"

export type ReviewStatus = "pending" | "approved" | "rejected"

/** `available` is false once the file was deleted (rejected review): only the record of a photo remains. */
export type AdminImage = { id: string; url: string | null; mime_type: string; size: number | null; position: number; published: boolean; available: boolean }
export type AdminReply = { id: string; body: string; author_id: string | null; author_name: string | null; created_at: string | null; updated_at: string | null }

export type AdminReview = {
  id: string
  product_id: string
  variant_id: string | null
  order_id: string
  order_item_id: string
  customer_id: string | null
  email: string | null
  display_name: string
  rating: number
  title: string | null
  body: string
  locale: string | null
  status: ReviewStatus
  verified: boolean
  source: string
  approved_at: string | null
  rejected_at: string | null
  moderated_by: string | null
  reject_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  product_title: string | null
  order_display_id: number | null
  images: AdminImage[]
  reply: AdminReply | null
}

export type Rating = { product_id: string; average: number; count: number; distribution: Record<1 | 2 | 3 | 4 | 5, number>; last_review_at: string | null }
export type Stats = { pending: number; approved: number; rejected: number; total: number; rating?: Rating; wishlist_count?: number }

export type ReviewRequest = {
  id: string
  order_id: string
  customer_id: string | null
  email: string
  has_token: boolean
  trigger: string
  delay_days: number
  scheduled_at: string
  sent_at: string | null
  expires_at: string | null
  used_at: string | null
  status: "scheduled" | "sent" | "used" | "expired" | "skipped" | "failed" | "opted_out"
  locale: string | null
  attempts: number
  last_error: string | null
  created_at: string
}

export type ReviewTranslationSettings = {
  enabled: boolean
  feature_enabled: boolean
  configured: boolean
  source_language: string
  target_languages: string[]
}

export type Config = {
  show_credit: boolean
  auto_approve: boolean
  display_name: string
  max_photos: number
  review_requests: { enabled: boolean; trigger: string; delay_days: number; token_ttl_days: number; link_url_configured: boolean; rules: number }
  wishlist: { enabled: boolean; counts: boolean; share: boolean }
  translations?: { enabled: boolean; configured: boolean; source_language: string; target_languages: string[] }
}

export type ReviewFilters = { status?: ReviewStatus; product_id?: string; order_id?: string; rating?: number; has_images?: boolean; q?: string; order?: string }

export const KEY = ["reviews-wishlist"]
export const CONFIG_KEY = [...KEY, "config"]
export const TRANSLATION_SETTINGS_KEY = [...KEY, "translation-settings"]
export const REVIEWS_KEY = [...KEY, "reviews"]
export const REQUESTS_KEY = [...KEY, "requests"]
export const STATS_KEY = [...KEY, "stats"]

const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && v !== null && v !== false))

export const getConfig = () => sdk.client.fetch<Config>("/admin/reviews/config")
export const getTranslationSettings = () => sdk.client.fetch<ReviewTranslationSettings>("/admin/review-translations")
export const getStats = (product_id?: string) => sdk.client.fetch<Stats>("/admin/reviews/stats", { query: clean({ product_id }) })

export const listReviews = (f: ReviewFilters, offset: number, limit: number) =>
  sdk.client.fetch<{ reviews: AdminReview[]; count: number }>("/admin/reviews", { query: { ...clean(f), offset, limit } })
export const getReview = (id: string) => sdk.client.fetch<{ review: AdminReview }>(`/admin/reviews/${id}`)
export const moderateReview = (id: string, status: "approved" | "rejected", reject_reason?: string) =>
  sdk.client.fetch<{ review: AdminReview }>(`/admin/reviews/${id}`, { method: "POST", body: clean({ status, reject_reason }) })
export const deleteReview = (id: string) => sdk.client.fetch<{ deleted: boolean }>(`/admin/reviews/${id}`, { method: "DELETE" })
export const batchReviews = (body: { ids: string[]; status?: "approved" | "rejected"; delete?: boolean; reject_reason?: string }) =>
  sdk.client.fetch<{ changed?: string[]; deleted?: string[] }>("/admin/reviews/batch", { method: "POST", body: clean(body) })
export const replyReview = (id: string, body: string) => sdk.client.fetch<{ review: AdminReview }>(`/admin/reviews/${id}/reply`, { method: "POST", body: { body } })
export const deleteReply = (id: string) => sdk.client.fetch<{ review: AdminReview }>(`/admin/reviews/${id}/reply`, { method: "DELETE" })
export const translateReview = (id: string) => sdk.client.fetch<{ review: AdminReview }>(`/admin/reviews/${id}/translate`, { method: "POST", body: {} })
export const translateReviews = (body: { ids?: string[]; only_outdated?: boolean }) =>
  sdk.client.fetch<{ translated_ids: string[] }>("/admin/reviews/translate", { method: "POST", body })
export const refreshRatings = (product_ids: string[]) => sdk.client.fetch<{ ratings: Rating[] }>("/admin/reviews/ratings/refresh", { method: "POST", body: { product_ids } })

export const listRequests = (f: { status?: string; order_id?: string }, offset: number, limit: number) =>
  sdk.client.fetch<{ review_requests: ReviewRequest[]; count: number }>("/admin/review-requests", { query: { ...clean(f), offset, limit } })
export const sendRequest = (id: string) =>
  sdk.client.fetch<{ review_request: ReviewRequest; summary: { sent: number; failed: number; skipped: number } }>(`/admin/review-requests/${id}/send`, { method: "POST", body: {} })
export const scheduleRequest = (order_id: string, send_now: boolean) =>
  sdk.client.fetch<{ status: string; request_id?: string; summary: { sent: number; failed: number; skipped: number } | null }>("/admin/review-requests/schedule", {
    method: "POST",
    body: { order_id, send_now },
  })

export const backendUrl = (path: string) => `${(import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "")}${path}`
/** Photo for moderation: pending ones are private and streamed through the Admin session. */
export const photoUrl = (reviewId: string, imageId: string) => backendUrl(`/admin/reviews/${reviewId}/images/${imageId}`)

export function toIntlLocale(l: string): string {
  const normalized = (l || "").toLowerCase()
  if (normalized === "zhcn" || normalized === "zh-cn" || normalized === "zh-hans" || normalized === "zh") {
    return "zh-CN"
  }
  if (normalized === "zhtw" || normalized === "zh-tw" || normalized === "zh-hant" || normalized === "zh-hk") {
    return "zh-TW"
  }
  if (normalized.startsWith("id")) return "id-ID"
  if (normalized.startsWith("nl")) return "nl-NL"
  return "en-US"
}

export const lang = (l: string) => toIntlLocale(l)

export function formatDateTime(iso: string | null | undefined, l: string) {
  if (!iso) return "–"
  return new Intl.DateTimeFormat(toIntlLocale(l), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
}
export const STATUS_COLOR: Record<string, "grey" | "blue" | "orange" | "green" | "red" | "purple"> = {
  pending: "orange",
  approved: "green",
  rejected: "red",
  scheduled: "blue",
  sent: "purple",
  used: "green",
  expired: "grey",
  skipped: "grey",
  failed: "red",
  opted_out: "grey",
}

export type AnalyticsRange = "7d" | "30d" | "90d" | "12m" | "all" | "custom"
export type AnalyticsGranularityOption = "auto" | "day" | "week" | "month"
export type AnalyticsExportType = "orders" | "products" | "customers" | "inventory"
export type ChannelGroup = "direct" | "organic_search" | "paid_search" | "social" | "referral"

export type AnalyticsFilters = {
  range: AnalyticsRange
  from?: string
  to?: string
  granularity?: AnalyticsGranularityOption
  channel_id?: string
  region_id?: string
  currency_code?: string
}

export type AnalyticsCustomerRow = {
  customer_id: string
  name: string
  email: string | null
  order_count: number
  net_spent: number
  last_order_at: string | null
}

export type AnalyticsOverviewResponse = {
  range: AnalyticsRange
  granularity: "day" | "week" | "month"
  currency_code: string
  multi_currency_warning: boolean
  cached?: boolean
  cached_at?: string
  filters: {
    channels: { id: string; name: string }[]
    regions: { id: string; name: string; currency_code: string }[]
    currencies: string[]
  }
  kpis: {
    net_sales: number
    net_sales_delta: number | null
    gross_sales: number
    gross_sales_delta: number | null
    refunds: number
    canceled_refunds: number
    refunds_delta: number | null
    refund_rate: number
    refund_rate_delta: number | null
    orders_count: number
    orders_delta: number | null
    canceled_orders: number
    cancellation_rate: number
    cancellation_rate_delta: number | null
    aov: number
    aov_delta: number | null
    repeat_buyers: number
    total_customers: number
    repeat_rate: number
    repeat_rate_delta: number | null
  }
  finance_waterfall: {
    gross_product_sales: number
    discounts: number
    refunds: number
    net_product_sales: number
    shipping: number
    total_sales: number
  }
  customers: {
    total_customers_all_time: number
    new_customers: number | null
    buyers: number
    repeat_customers: number
    repeat_rate: number
    avg_orders_per_customer: number
    avg_customer_value: number
    guest_orders: number
    first_vs_returning: {
      first_time_orders: number
      first_time_revenue: number
      returning_orders: number
      returning_revenue: number
    }
    cohorts: {
      cohort_month: string
      cohort_size: number
      m1: number
      m2: number
      m3: number
    }[]
    by_country: {
      country_code: string
      customers: number
      orders: number
      net_spent: number
    }[]
    repeat_rows: AnalyticsCustomerRow[]
    top_customers: AnalyticsCustomerRow[]
  }
  operations: {
    pending_capture_count: number
    pending_capture_amount: number
    awaiting_fulfillment_count: number
    low_stock_count: number
  }
  live_orders_30m: {
    orders_30m: number
    sales_30m: number
  }
  abandoned_carts: {
    total_carts: number
    with_email: number
    notified: number
    potential_value: number
    active_carts_30m: number
  }
  timeseries: {
    bucket: string
    orders: number
    gross_sales: number
    refunds: number
    net_sales: number
  }[]
  currency_breakdown: {
    currency_code: string
    standing_orders: number
    canceled_orders: number
    gross_revenue: number
    refunded_amount: number
    net_revenue: number
  }[]
  top_products: {
    product_id: string
    title: string
    handle: string | null
    units: number
    revenue: number
    orders: number
  }[]
  catalog_products: {
    product_id: string
    title: string
    handle: string
    units: number
    revenue: number
    orders: number
  }[]
  top_skus: {
    sku: string
    product_title: string
    variant_title: string
    units: number
    revenue: number
    orders: number
  }[]
  top_sizes: {
    variant_title: string
    units: number
    revenue: number
    orders: number
    share_pct: number
  }[]
  collection_breakdown: {
    collection_id: string
    title: string
    units: number
    orders: number
    revenue: number
  }[]
  bought_together: {
    product_a_id: string
    product_a_title: string
    product_b_id: string
    product_b_title: string
    pair_orders: number
  }[]
  channel_breakdown: {
    channel_id: string
    name: string
    orders: number
    net_revenue: number
    refunds: number
    aov: number
  }[]
  region_breakdown: {
    region_id: string
    name: string
    currency_code: string
    orders: number
    net_revenue: number
    refunds: number
    aov: number
  }[]
  country_breakdown: {
    country_code: string
    orders: number
    net_revenue: number
    aov: number
  }[]
  promotion_breakdown: {
    promotion_id: string
    code: string
    is_automatic: boolean
    orders: number
    discount_amount: number
    net_revenue: number
  }[]
  inventory_summary: {
    tracked_variants: number
    total_stocked: number
    total_reserved: number
    total_available: number
    low_stock_count: number
    out_of_stock_count: number
  }
  low_stock: {
    variant_id: string
    product_id: string
    product_title: string
    variant_title: string
    sku: string | null
    stocked_quantity: number
    reserved_quantity: number
    available_quantity: number
  }[]
  inventory_velocity: {
    variant_id: string
    product_id: string
    product_title: string
    variant_title: string
    sku: string | null
    stocked_quantity: number
    reserved_quantity: number
    available_quantity: number
    units_30d: number
    daily_velocity: number
    days_remaining: number | null
  }[]
  fulfillment_summary: {
    awaiting_fulfillment: number
    partially_fulfilled: number
    fulfilled: number
    shipped: number
    delivered: number
    avg_hours_to_ship: number | null
    avg_hours_to_deliver: number | null
  }
  reviews: {
    enabled: boolean
    approved_total: number
    pending_count: number
    rejected_count: number
    window_new: number
    avg_rating: number
    requests_sent: number
    requests_used: number
    request_conversion_rate: number
  }
  wishlist: {
    enabled: boolean
    total_saved_items: number
    window_saved_items: number
    customer_wishlists: number
    guest_wishlists: number
    top_products: { product_id: string; title: string; saves: number }[]
  }
}

export type AnalyticsAcquisitionResponse = {
  configured: boolean
  range: string
  cached?: boolean
  cached_at?: string
  error?: string
  summary?: {
    pageviews: number
    visitors: number
    sessions: number
  }
  live?: {
    window_minutes: number
    active_visitors: number
    active_sessions: number
    active_pageviews: number
    recent_add_to_cart: number
    recent_checkout: number
    locations?: {
      country: string
      city: string
      visitors: number
      pageviews: number
    }[]
    active_pages?: {
      path: string
      views: number
      visitors: number
    }[]
  }
  funnel?: {
    event: string
    count: number
    people: number
  }[]
  sources?: {
    domain: string
    count: number
  }[]
  channel_groups?: {
    channel: ChannelGroup
    pageviews: number
    sessions: number
    visitors: number
  }[]
  countries?: {
    country: string
    visitors: number
    pageviews: number
  }[]
  devices?: {
    device: string
    visitors: number
    sessions: number
  }[]
  landing_pages?: {
    path: string
    pageviews: number
    visitors: number
  }[]
  exit_pages?: {
    path: string
    exits: number
  }[]
  utm_campaigns?: {
    source: string
    medium: string
    campaign: string
    sessions: number
    visitors: number
  }[]
  product_views?: {
    key: string
    handle: string | null
    name: string
    views: number
    people: number
  }[]
}

export const ANALYTICS_KEY = ["webbers-analytics"]

export const getAnalyticsOverview = (f: AnalyticsFilters) =>
  sdk.client.fetch<AnalyticsOverviewResponse>("/admin/analytics/overview", {
    query: clean({
      range: f.range,
      from: f.from,
      to: f.to,
      granularity: f.granularity && f.granularity !== "auto" ? f.granularity : undefined,
      channel_id: f.channel_id,
      region_id: f.region_id,
      currency_code: f.currency_code,
    }),
  })

export const getAnalyticsAcquisition = (f: { range: AnalyticsRange; from?: string; to?: string }) =>
  sdk.client.fetch<AnalyticsAcquisitionResponse>("/admin/analytics/acquisition", {
    query: clean({
      range: f.range,
      from: f.from,
      to: f.to,
    }),
  })

export const analyticsExportUrl = (f: AnalyticsFilters, type: AnalyticsExportType = "orders") => {
  const params = new URLSearchParams()
  params.set("range", f.range)
  params.set("type", type)
  if (f.from) params.set("from", f.from)
  if (f.to) params.set("to", f.to)
  if (f.channel_id) params.set("channel_id", f.channel_id)
  if (f.region_id) params.set("region_id", f.region_id)
  if (f.currency_code) params.set("currency_code", f.currency_code)
  return backendUrl(`/admin/analytics/export?${params.toString()}`)
}
