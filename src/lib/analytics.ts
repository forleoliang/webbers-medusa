export type AnalyticsRange = "all" | "12m" | "90d" | "30d" | "7d" | "custom"
export type AnalyticsGranularity = "day" | "week" | "month"
export type AnalyticsGranularityOption = "auto" | AnalyticsGranularity
export type AnalyticsExportType = "orders" | "products" | "customers" | "inventory"
export type ChannelGroup = "direct" | "organic_search" | "paid_search" | "social" | "referral"

export type RangeBounds = {
  range: AnalyticsRange
  start: Date | null
  end: Date
  prevStart: Date | null
  prevEnd: Date | null
  granularity: AnalyticsGranularity
  bucketCount: number
}

export type AnalyticsExportOrderRow = {
  id: string
  display_id: number | string | null
  created_at: string
  status: string
  payment_status: string | null
  fulfillment_status: string | null
  currency_code: string
  gross_total: number
  refunded_total: number
  net_total: number
  items_count: number
  sales_channel_id: string | null
  sales_channel_name: string | null
  region_id: string | null
  region_name: string | null
  customer_id: string | null
  email: string | null
}

const VALID_RANGES: readonly AnalyticsRange[] = ["all", "12m", "90d", "30d", "7d", "custom"]
const VALID_EXPORT_TYPES: readonly AnalyticsExportType[] = [
  "orders",
  "products",
  "customers",
  "inventory",
]
const DAY_MS = 24 * 60 * 60 * 1000
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseAnalyticsRange(value?: string | null): AnalyticsRange {
  if (value && (VALID_RANGES as readonly string[]).includes(value)) {
    return value as AnalyticsRange
  }
  return "all"
}

export function parseExportType(value?: string | null): AnalyticsExportType {
  if (value && (VALID_EXPORT_TYPES as readonly string[]).includes(value)) {
    return value as AnalyticsExportType
  }
  return "orders"
}

export function parseIsoDateOnly(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!ISO_DATE_RE.test(trimmed)) return null
  const parsed = new Date(`${trimmed}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    return null
  }
  return trimmed
}

export function mapRangeToTrafficRange(range: AnalyticsRange): "30d" | "90d" | "12m" | "all" {
  if (range === "7d") return "30d"
  if (range === "custom") return "90d"
  return range
}

const POSTHOG_INTERVAL_MAP: Record<Exclude<AnalyticsRange, "custom">, string> = {
  "7d": "7 day",
  "30d": "30 day",
  "90d": "90 day",
  "12m": "12 month",
  all: "12 month",
}

export function mapRangeToPosthogInterval(range: AnalyticsRange): string {
  if (range === "custom") return "90 day"
  return POSTHOG_INTERVAL_MAP[range] ?? "12 month"
}

export function isRefreshRequested(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1
}

function getUtcMonday(date: Date): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = copy.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setUTCDate(copy.getUTCDate() + diff)
  return copy
}

function resolveGranularity(
  defaultGranularity: AnalyticsGranularity,
  override?: AnalyticsGranularityOption | null
): AnalyticsGranularity {
  if (override === "day" || override === "week" || override === "month") {
    return override
  }
  return defaultGranularity
}

export function resolveRangeBounds(
  range: AnalyticsRange,
  now: Date = new Date(),
  customFrom?: string | null,
  customTo?: string | null,
  granularityOverride?: AnalyticsGranularityOption | null
): RangeBounds {
  const end = new Date(now)
  const utcTodayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  if (range === "custom") {
    const validFrom = parseIsoDateOnly(customFrom)
    const validTo = parseIsoDateOnly(customTo)
    if (validFrom && validTo) {
      const [fromStr, toStr] = validFrom <= validTo ? [validFrom, validTo] : [validTo, validFrom]
      const start = new Date(`${fromStr}T00:00:00.000Z`)
      const customEnd = new Date(`${toStr}T23:59:59.999Z`)
      const spanDays = Math.max(1, Math.round((customEnd.getTime() - start.getTime() + 1) / DAY_MS))
      const prevEnd = new Date(start.getTime())
      const prevStart = new Date(start.getTime() - spanDays * DAY_MS)
      const autoGranularity: AnalyticsGranularity =
        spanDays <= 90 ? "day" : spanDays <= 270 ? "week" : "month"
      const granularity = resolveGranularity(autoGranularity, granularityOverride)
      return {
        range: "custom",
        start,
        end: customEnd,
        prevStart,
        prevEnd,
        granularity,
        bucketCount: spanDays,
      }
    }
  }

  if (range === "7d" || range === "30d" || range === "90d") {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90
    const start = new Date(utcTodayStart)
    start.setUTCDate(start.getUTCDate() - (days - 1))
    const prevStart = new Date(start)
    prevStart.setUTCDate(prevStart.getUTCDate() - days)
    const defaultGran: AnalyticsGranularity = days === 90 ? "day" : "day"
    return {
      range,
      start,
      end,
      prevStart,
      prevEnd: new Date(start),
      granularity: resolveGranularity(defaultGran, granularityOverride),
      bucketCount: days,
    }
  }

  if (range === "12m") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
    const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1))
    return {
      range,
      start,
      end,
      prevStart,
      prevEnd: new Date(start),
      granularity: resolveGranularity("month", granularityOverride),
      bucketCount: 12,
    }
  }

  return {
    range: "all",
    start: null,
    end,
    prevStart: null,
    prevEnd: null,
    granularity: resolveGranularity("month", granularityOverride),
    bucketCount: 0,
  }
}

export function toNum(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

export function toInt(value: unknown, fallback = 0): number {
  return Math.trunc(toNum(value, fallback))
}

export function pctDelta(current: number, previous: number | null): number | null {
  if (previous === null || !Number.isFinite(previous)) return null
  if (previous === 0) {
    return current === 0 ? 0 : 100
  }
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1))
}

export function generateTimeBuckets(
  bounds: RangeBounds,
  observedKeys: Iterable<string> = []
): string[] {
  if (!bounds.start) {
    return Array.from(new Set(observedKeys)).filter(Boolean).sort()
  }

  if (bounds.granularity === "day") {
    const out: string[] = []
    const cur = new Date(
      Date.UTC(
        bounds.start.getUTCFullYear(),
        bounds.start.getUTCMonth(),
        bounds.start.getUTCDate()
      )
    )
    const endDay = new Date(
      Date.UTC(bounds.end.getUTCFullYear(), bounds.end.getUTCMonth(), bounds.end.getUTCDate())
    )
    let guard = 0
    while (cur <= endDay && guard < 400) {
      out.push(cur.toISOString().slice(0, 10))
      cur.setUTCDate(cur.getUTCDate() + 1)
      guard += 1
    }
    return out
  }

  if (bounds.granularity === "week") {
    const out: string[] = []
    const cur = getUtcMonday(bounds.start)
    const endMonday = getUtcMonday(bounds.end)
    let guard = 0
    while (cur <= endMonday && guard < 200) {
      out.push(cur.toISOString().slice(0, 10))
      cur.setUTCDate(cur.getUTCDate() + 7)
      guard += 1
    }
    return out
  }

  // month granularity
  const out: string[] = []
  const cur = new Date(Date.UTC(bounds.start.getUTCFullYear(), bounds.start.getUTCMonth(), 1))
  const endMonth = new Date(Date.UTC(bounds.end.getUTCFullYear(), bounds.end.getUTCMonth(), 1))
  let guard = 0
  while (cur <= endMonth && guard < 120) {
    out.push(cur.toISOString().slice(0, 7))
    cur.setUTCMonth(cur.getUTCMonth() + 1)
    guard += 1
  }
  return out
}

const SEARCH_DOMAINS = [
  "google.",
  "bing.",
  "yahoo.",
  "duckduckgo.",
  "baidu.",
  "yandex.",
  "ecosia.",
]
const SOCIAL_DOMAINS = [
  "facebook.",
  "fb.",
  "l.facebook.",
  "m.facebook.",
  "instagram.",
  "l.instagram.",
  "t.co",
  "twitter.",
  "x.com",
  "youtube.",
  "youtu.be",
  "tiktok.",
  "pinterest.",
  "reddit.",
  "linkedin.",
  "threads.net",
]

export function classifyReferrerChannel(
  domain: string | null | undefined,
  utmMedium?: string | null
): ChannelGroup {
  const medium = (utmMedium || "").trim().toLowerCase()
  if (medium === "cpc" || medium === "ppc" || medium === "paid" || medium === "paid_search") {
    return "paid_search"
  }
  if (medium === "social" || medium === "paid_social") {
    return "social"
  }
  if (medium === "organic") {
    return "organic_search"
  }

  const host = (domain || "").trim().toLowerCase()
  if (!host || host === "direct" || host === "$direct" || host === "(direct)") {
    return "direct"
  }
  if (SEARCH_DOMAINS.some((s) => host === s.slice(0, -1) || host.includes(s))) {
    return "organic_search"
  }
  if (SOCIAL_DOMAINS.some((s) => host === s || host.includes(s))) {
    return "social"
  }
  return "referral"
}

export function extractProductHandle(pathOrKey: string | null | undefined): string | null {
  if (!pathOrKey) return null
  const clean = pathOrKey.split("?")[0].split("#")[0].trim()
  const match = clean.match(/\/products\/([^/]+)\/?$/)
  if (match?.[1]) {
    return decodeURIComponent(match[1]).toLowerCase()
  }
  return null
}

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  let str = String(value)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildGenericCsv(headers: readonly string[], rows: unknown[][]): string {
  const lines = [
    headers.map(sanitizeCsvCell).join(","),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(",")),
  ]
  return `\uFEFF${lines.join("\r\n")}\r\n`
}

export const EXPORT_CSV_HEADERS = [
  "Order ID",
  "Display ID",
  "Created At",
  "Status",
  "Payment Status",
  "Fulfillment Status",
  "Currency",
  "Gross Total",
  "Refunded Total",
  "Net Total",
  "Items Count",
  "Sales Channel ID",
  "Sales Channel",
  "Region ID",
  "Region",
  "Customer ID",
  "Customer Email",
] as const

export function buildAnalyticsCsv(rows: AnalyticsExportOrderRow[]): string {
  return buildGenericCsv(
    EXPORT_CSV_HEADERS,
    rows.map((r) => [
      r.id,
      r.display_id ?? "",
      r.created_at,
      r.status,
      r.payment_status ?? "",
      r.fulfillment_status ?? "",
      r.currency_code,
      r.gross_total.toFixed(2),
      r.refunded_total.toFixed(2),
      r.net_total.toFixed(2),
      r.items_count,
      r.sales_channel_id ?? "",
      r.sales_channel_name ?? "",
      r.region_id ?? "",
      r.region_name ?? "",
      r.customer_id ?? "",
      r.email ?? "",
    ])
  )
}
