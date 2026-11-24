import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  buildAnalyticsCsv,
  parseAnalyticsRange,
  resolveRangeBounds,
  toInt,
  toNum,
} from "../../../../lib/analytics"
import {
  buildOrderWhereClause,
  ORDER_GROSS_EXPR,
  ORDER_NET_EXPR,
  ORDER_REFUNDED_EXPR,
  ORDER_SUMMARY_JOIN,
} from "../../../../lib/analytics-queries"
import { CUSTOM_QUERY } from "../../../../modules/custom-query"
import CustomQueryService from "../../../../modules/custom-query/service"
import type { AdminAnalyticsQueryType } from "../../../validators"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = (req.validatedQuery || req.query || {}) as AdminAnalyticsQueryType
  const range = parseAnalyticsRange(query.range)
  const bounds = resolveRangeBounds(range)

  const where = buildOrderWhereClause(
    "o",
    { start: bounds.start, end: bounds.end },
    {
      channelId: query.channel_id || null,
      regionId: query.region_id || null,
      currencyCode: query.currency_code ? query.currency_code.toLowerCase() : null,
    }
  )

  const customQuery = req.scope.resolve<CustomQueryService>(CUSTOM_QUERY)

  const rows = await customQuery.PSQLQuery<Record<string, unknown>>(
    `SELECT
       o.id,
       o.display_id,
       o.created_at,
       o.status,
       COALESCE((
         SELECT pc.status
         FROM order_payment_collection opc
         INNER JOIN payment_collection pc ON pc.id = opc.payment_collection_id AND pc.deleted_at IS NULL
         WHERE opc.order_id = o.id AND opc.deleted_at IS NULL
         ORDER BY pc.created_at DESC
         LIMIT 1
       ), 'not_paid') AS payment_status,
       CASE
         WHEN COALESCE(item_agg.total_qty, 0) = 0 THEN 'not_fulfilled'
         WHEN COALESCE(item_agg.delivered_qty, 0) >= item_agg.total_qty THEN 'delivered'
         WHEN COALESCE(item_agg.shipped_qty, 0) >= item_agg.total_qty THEN 'shipped'
         WHEN COALESCE(item_agg.fulfilled_qty, 0) >= item_agg.total_qty THEN 'fulfilled'
         WHEN COALESCE(item_agg.fulfilled_qty, 0) > 0 THEN 'partially_fulfilled'
         ELSE 'not_fulfilled'
       END AS fulfillment_status,
       LOWER(o.currency_code) AS currency_code,
       ${ORDER_GROSS_EXPR("os")}::numeric AS gross_total,
       ${ORDER_REFUNDED_EXPR("os")}::numeric AS refunded_total,
       ${ORDER_NET_EXPR("os")}::numeric AS net_total,
       COALESCE(item_agg.total_qty, 0)::integer AS items_count,
       o.sales_channel_id,
       sc.name AS sales_channel_name,
       o.region_id,
       r.name AS region_name,
       o.customer_id,
       o.email
     FROM "order" o
     ${ORDER_SUMMARY_JOIN("o", "os")}
     LEFT JOIN LATERAL (
       SELECT
         COALESCE(SUM(oi.quantity), 0)::integer AS total_qty,
         COALESCE(SUM(oi.fulfilled_quantity), 0)::integer AS fulfilled_qty,
         COALESCE(SUM(oi.shipped_quantity), 0)::integer AS shipped_qty,
         COALESCE(SUM(oi.delivered_quantity), 0)::integer AS delivered_qty
       FROM order_item oi
       WHERE oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
     ) item_agg ON true
     LEFT JOIN sales_channel sc ON sc.id = o.sales_channel_id
     LEFT JOIN region r ON r.id = o.region_id
     WHERE ${where.sql}
     ORDER BY o.created_at DESC
     LIMIT 10000`,
    where.params
  )

  const csv = buildAnalyticsCsv(
    rows.map((r) => ({
      id: String(r.id ?? ""),
      display_id: (r.display_id as number | string | null) ?? null,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      status: String(r.status ?? ""),
      payment_status: r.payment_status ? String(r.payment_status) : null,
      fulfillment_status: r.fulfillment_status ? String(r.fulfillment_status) : null,
      currency_code: String(r.currency_code ?? "usd").toUpperCase(),
      gross_total: toNum(r.gross_total),
      refunded_total: toNum(r.refunded_total),
      net_total: toNum(r.net_total),
      items_count: toInt(r.items_count),
      sales_channel_id: r.sales_channel_id ? String(r.sales_channel_id) : null,
      sales_channel_name: r.sales_channel_name ? String(r.sales_channel_name) : null,
      region_id: r.region_id ? String(r.region_id) : null,
      region_name: r.region_name ? String(r.region_name) : null,
      customer_id: r.customer_id ? String(r.customer_id) : null,
      email: r.email ? String(r.email) : null,
    }))
  )

  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="store-analytics-${range}-${stamp}.csv"`)
  return res.status(200).send(csv)
}
