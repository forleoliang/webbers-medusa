import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  buildAnalyticsCsv,
  buildGenericCsv,
  parseAnalyticsRange,
  parseExportType,
  resolveRangeBounds,
  toInt,
  toNum,
} from "../../../../lib/analytics"
import {
  buildOrderWhereClause,
  IS_ORDER_CANCELED_EXPR,
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
  const exportType = parseExportType(query.type)
  const range = parseAnalyticsRange(query.range)
  const bounds = resolveRangeBounds(range, new Date(), query.from || null, query.to || null)

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
  const stamp = new Date().toISOString().slice(0, 10)
  let csv = ""

  if (exportType === "products") {
    const rows = await customQuery.PSQLQuery<Record<string, unknown>>(
      `SELECT
         COALESCE(oli.product_id, '') AS product_id,
         COALESCE(NULLIF(BTRIM(pr.title), ''), oli.title, 'Unknown') AS product_title,
         COALESCE(NULLIF(BTRIM(oli.variant_title), ''), 'Default') AS variant_title,
         COALESCE(NULLIF(BTRIM(oli.variant_sku), ''), oli.variant_id, '') AS sku,
         COALESCE(SUM(oi.quantity), 0)::integer AS units,
         COUNT(DISTINCT o.id)::integer AS orders,
         COALESCE(SUM(COALESCE(oi.quantity, 0) * COALESCE(oli.unit_price, oi.unit_price, 0)), 0)::numeric AS revenue
       FROM "order" o
       INNER JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
       INNER JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
       LEFT JOIN product pr ON pr.id = oli.product_id
       WHERE ${where.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       GROUP BY 1, 2, 3, 4
       ORDER BY units DESC, revenue DESC
       LIMIT 10000`,
      where.params
    )
    csv = buildGenericCsv(
      ["Product ID", "Product", "Variant / Size", "SKU", "Units Sold", "Orders", "Revenue"],
      rows.map((r) => [
        r.product_id ?? "",
        r.product_title ?? "",
        r.variant_title ?? "",
        r.sku ?? "",
        toInt(r.units),
        toInt(r.orders),
        toNum(r.revenue).toFixed(2),
      ])
    )
  } else if (exportType === "customers") {
    const rows = await customQuery.PSQLQuery<Record<string, unknown>>(
      `SELECT
         o.customer_id,
         COALESCE(c.first_name, '') AS first_name,
         COALESCE(c.last_name, '') AS last_name,
         COALESCE(c.email, MAX(o.email), '') AS email,
         COUNT(*)::integer AS orders_count,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}), 0)::numeric AS net_spent,
         MAX(o.created_at) AS last_order_at
       FROM "order" o
       ${ORDER_SUMMARY_JOIN("o", "os")}
       LEFT JOIN customer c ON c.id = o.customer_id
       WHERE ${where.sql}
         AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
         AND o.customer_id IS NOT NULL
       GROUP BY o.customer_id, c.first_name, c.last_name, c.email
       ORDER BY net_spent DESC, orders_count DESC
       LIMIT 10000`,
      where.params
    )
    csv = buildGenericCsv(
      ["Customer ID", "First Name", "Last Name", "Email", "Standing Orders", "Net Spent", "Last Order At"],
      rows.map((r) => [
        r.customer_id ?? "",
        r.first_name ?? "",
        r.last_name ?? "",
        r.email ?? "",
        toInt(r.orders_count),
        toNum(r.net_spent).toFixed(2),
        r.last_order_at instanceof Date ? r.last_order_at.toISOString() : String(r.last_order_at ?? ""),
      ])
    )
  } else if (exportType === "inventory") {
    const rows = await customQuery.PSQLQuery<Record<string, unknown>>(
      `WITH sales_30d AS (
         SELECT oli.variant_id, COALESCE(SUM(oi.quantity), 0)::integer AS units_30d
         FROM "order" o
         INNER JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
         INNER JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
         WHERE o.deleted_at IS NULL
           AND COALESCE(o.is_draft_order, false) = false
           AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
           AND o.created_at >= NOW() - INTERVAL '30 days'
           AND oli.variant_id IS NOT NULL
         GROUP BY oli.variant_id
       )
       SELECT
         pv.id AS variant_id,
         pr.id AS product_id,
         pr.title AS product_title,
         pv.title AS variant_title,
         COALESCE(pv.sku, '') AS sku,
         COALESCE(SUM(il.stocked_quantity), 0)::integer AS stocked_quantity,
         COALESCE(SUM(il.reserved_quantity), 0)::integer AS reserved_quantity,
         COALESCE(SUM(il.stocked_quantity - il.reserved_quantity), 0)::integer AS available_quantity,
         COALESCE(MAX(s30.units_30d), 0)::integer AS units_30d
       FROM product_variant pv
       INNER JOIN product pr ON pr.id = pv.product_id AND pr.deleted_at IS NULL
       INNER JOIN product_variant_inventory_item pvii ON pvii.variant_id = pv.id AND pvii.deleted_at IS NULL
       INNER JOIN inventory_item ii ON ii.id = pvii.inventory_item_id AND ii.deleted_at IS NULL
       INNER JOIN inventory_level il ON il.inventory_item_id = ii.id AND il.deleted_at IS NULL
       LEFT JOIN sales_30d s30 ON s30.variant_id = pv.id
       WHERE pv.deleted_at IS NULL AND pv.manage_inventory = true
       GROUP BY pv.id, pr.id, pr.title, pv.title, pv.sku
       ORDER BY available_quantity ASC, pr.title ASC
       LIMIT 10000`,
      []
    )
    csv = buildGenericCsv(
      [
        "Variant ID",
        "Product ID",
        "Product",
        "Variant",
        "SKU",
        "Stocked",
        "Reserved",
        "Available",
        "30d Units Sold",
        "Est. Days Remaining",
      ],
      rows.map((r) => {
        const available = toInt(r.available_quantity)
        const units30 = toInt(r.units_30d)
        const days = available <= 0 ? 0 : units30 > 0 ? Math.round(available / (units30 / 30)) : ""
        return [
          r.variant_id ?? "",
          r.product_id ?? "",
          r.product_title ?? "",
          r.variant_title ?? "",
          r.sku ?? "",
          toInt(r.stocked_quantity),
          toInt(r.reserved_quantity),
          available,
          units30,
          days,
        ]
      })
    )
  } else {
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

    csv = buildAnalyticsCsv(
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
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="store-analytics-${exportType}-${range}-${stamp}.csv"`
  )
  return res.status(200).send(csv)
}
