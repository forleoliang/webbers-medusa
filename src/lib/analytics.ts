export type AnalyticsRange = "7d" | "30d" | "90d" | "12m" | "all"
export type AnalyticsGranularity = "day" | "month"

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

const VALID_RANGES: readonly AnalyticsRange[] = ["7d", "30d", "90d", "12m", "all"]

export function parseAnalyticsRange(value?: string | null): AnalyticsRange {
  if (value && (VALID_RANGES as readonly string[]).includes(value)) {
    return value as AnalyticsRange
  }
  return "all"
}

export function mapRangeToTrafficRange(range: AnalyticsRange): "30d" | "90d" | "12m" | "all" {
  if (range === "7d") return "30d"
  return range
}

const POSTHOG_INTERVAL_MAP: Record<AnalyticsRange, string> = {
  "7d": "7 day",
  "30d": "30 day",
  "90d": "90 day",
  "12m": "12 month",
  all: "12 month",
}

export function mapRangeToPosthogInterval(range: AnalyticsRange): string {
  return POSTHOG_INTERVAL_MAP[range] ?? "12 month"
}

export function isRefreshRequested(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1
}

export function resolveRangeBounds(range: AnalyticsRange, now: Date = new Date()): RangeBounds {
  const end = new Date(now)
  const utcTodayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  if (range === "7d" || range === "30d" || range === "90d") {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90
    const start = new Date(utcTodayStart)
    start.setUTCDate(start.getUTCDate() - (days - 1))
    const prevStart = new Date(start)
    prevStart.setUTCDate(prevStart.getUTCDate() - days)
    return {
      range,
      start,
      end,
      prevStart,
      prevEnd: new Date(start),
      granularity: "day",
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
      granularity: "month",
      bucketCount: 12,
    }
  }

  return {
    range: "all",
    start: null,
    end,
    prevStart: null,
    prevEnd: null,
    granularity: "month",
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
  if (bounds.range === "7d" || bounds.range === "30d" || bounds.range === "90d") {
    if (!bounds.start) return []
    const out: string[] = []
    const cur = new Date(bounds.start)
    for (let i = 0; i < bounds.bucketCount; i++) {
      out.push(cur.toISOString().slice(0, 10))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }
    return out
  }

  if (bounds.range === "12m" && bounds.start) {
    const out: string[] = []
    const cur = new Date(bounds.start)
    for (let i = 0; i < 12; i++) {
      out.push(cur.toISOString().slice(0, 7))
      cur.setUTCMonth(cur.getUTCMonth() + 1)
    }
    return out
  }

  return Array.from(new Set(observedKeys)).filter(Boolean).sort()
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
  const lines = [
    EXPORT_CSV_HEADERS.join(","),
    ...rows.map((r) =>
      [
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
      ]
        .map(sanitizeCsvCell)
        .join(",")
    ),
  ]
  return `\uFEFF${lines.join("\r\n")}\r\n`
}
