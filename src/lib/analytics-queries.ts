import type { RangeBounds } from "./analytics"

export type AnalyticsFilterInput = {
  channelId?: string | null
  regionId?: string | null
  currencyCode?: string | null
}

export type WhereClause = {
  sql: string
  params: unknown[]
}

export function buildOrderWhereClause(
  alias: string,
  bounds: { start: Date | null; end: Date },
  filters: AnalyticsFilterInput
): WhereClause {
  const parts: string[] = [
    `${alias}.deleted_at IS NULL`,
    `COALESCE(${alias}.is_draft_order, false) = false`,
    `${alias}.created_at <= CAST(? AS timestamptz)`,
  ]
  const params: unknown[] = [bounds.end.toISOString()]

  if (bounds.start) {
    parts.push(`${alias}.created_at >= CAST(? AS timestamptz)`)
    params.push(bounds.start.toISOString())
  }
  if (filters.channelId) {
    parts.push(`${alias}.sales_channel_id = ?`)
    params.push(filters.channelId)
  }
  if (filters.regionId) {
    parts.push(`${alias}.region_id = ?`)
    params.push(filters.regionId)
  }
  if (filters.currencyCode) {
    parts.push(`LOWER(${alias}.currency_code) = LOWER(?)`)
    params.push(filters.currencyCode)
  }

  return { sql: parts.join(" AND "), params }
}

export function buildLiveOrderFilterClause(
  alias: string,
  filters: AnalyticsFilterInput
): WhereClause {
  const parts: string[] = [
    `${alias}.deleted_at IS NULL`,
    `COALESCE(${alias}.is_draft_order, false) = false`,
    `${alias}.status != 'canceled'`,
    `${alias}.canceled_at IS NULL`,
  ]
  const params: unknown[] = []

  if (filters.channelId) {
    parts.push(`${alias}.sales_channel_id = ?`)
    params.push(filters.channelId)
  }
  if (filters.regionId) {
    parts.push(`${alias}.region_id = ?`)
    params.push(filters.regionId)
  }
  if (filters.currencyCode) {
    parts.push(`LOWER(${alias}.currency_code) = LOWER(?)`)
    params.push(filters.currencyCode)
  }

  return { sql: parts.join(" AND "), params }
}

export function buildCartWhereClause(
  alias: string,
  bounds: RangeBounds,
  filters: AnalyticsFilterInput
): WhereClause {
  const parts: string[] = [
    `${alias}.deleted_at IS NULL`,
    `${alias}.completed_at IS NULL`,
    `${alias}.created_at <= CAST(? AS timestamptz)`,
  ]
  const params: unknown[] = [bounds.end.toISOString()]

  if (bounds.start) {
    parts.push(`${alias}.created_at >= CAST(? AS timestamptz)`)
    params.push(bounds.start.toISOString())
  }
  if (filters.channelId) {
    parts.push(`${alias}.sales_channel_id = ?`)
    params.push(filters.channelId)
  }
  if (filters.regionId) {
    parts.push(`${alias}.region_id = ?`)
    params.push(filters.regionId)
  }
  if (filters.currencyCode) {
    parts.push(`LOWER(${alias}.currency_code) = LOWER(?)`)
    params.push(filters.currencyCode)
  }

  return { sql: parts.join(" AND "), params }
}

export const ORDER_SUMMARY_JOIN = (orderAlias: string, summaryAlias = "os") =>
  `LEFT JOIN order_summary ${summaryAlias} ON ${summaryAlias}.order_id = ${orderAlias}.id AND ${summaryAlias}.version = ${orderAlias}.version AND ${summaryAlias}.deleted_at IS NULL`

export const ORDER_GROSS_EXPR = (summaryAlias = "os") =>
  `COALESCE(NULLIF(${summaryAlias}.totals->>'current_order_total', '')::numeric, 0)`

export const ORDER_REFUNDED_EXPR = (summaryAlias = "os") =>
  `COALESCE(NULLIF(${summaryAlias}.totals->>'refunded_total', '')::numeric, 0)`

export const ORDER_NET_EXPR = (summaryAlias = "os") =>
  `(${ORDER_GROSS_EXPR(summaryAlias)} - ${ORDER_REFUNDED_EXPR(summaryAlias)})`

export const IS_ORDER_CANCELED_EXPR = (alias: string) =>
  `(${alias}.status = 'canceled' OR ${alias}.canceled_at IS NOT NULL)`
