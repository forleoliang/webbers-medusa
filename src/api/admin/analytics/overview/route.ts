import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  generateTimeBuckets,
  parseAnalyticsRange,
  pctDelta,
  resolveRangeBounds,
  toInt,
  toNum,
} from "../../../../lib/analytics"
import {
  buildCartWhereClause,
  buildLiveOrderFilterClause,
  buildOrderWhereClause,
  IS_ORDER_CANCELED_EXPR,
  ORDER_GROSS_EXPR,
  ORDER_NET_EXPR,
  ORDER_REFUNDED_EXPR,
  ORDER_SUMMARY_JOIN,
} from "../../../../lib/analytics-queries"
import { CUSTOM_QUERY } from "../../../../modules/custom-query"
import CustomQueryService from "../../../../modules/custom-query/service"
import { WEBBERS_SETTINGS_MODULE } from "../../../../modules/webbers-settings"
import WebbersSettingsService from "../../../../modules/webbers-settings/service"
import type { AdminAnalyticsQueryType } from "../../../validators"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = (req.validatedQuery || req.query || {}) as AdminAnalyticsQueryType
  const range = parseAnalyticsRange(query.range)
  const bounds = resolveRangeBounds(range)

  const channelId = query.channel_id || null
  const regionId = query.region_id || null
  const requestedCurrency = query.currency_code ? query.currency_code.toLowerCase() : null

  const customQuery = req.scope.resolve<CustomQueryService>(CUSTOM_QUERY)
  const settingsService = req.scope.resolve<WebbersSettingsService>(WEBBERS_SETTINGS_MODULE)

  const [featureFlags, channelsRows, regionsRows] = await Promise.all([
    settingsService.getFlags(),
    customQuery.PSQLQuery<{ id: string; name: string }>(
      `SELECT id, name FROM sales_channel WHERE deleted_at IS NULL ORDER BY name ASC`,
      []
    ),
    customQuery.PSQLQuery<{ id: string; name: string; currency_code: string }>(
      `SELECT id, name, LOWER(currency_code) AS currency_code FROM region WHERE deleted_at IS NULL ORDER BY name ASC`,
      []
    ),
  ])

  const baseFilters = { channelId, regionId, currencyCode: requestedCurrency }
  const currentBaseWhere = buildOrderWhereClause("o", { start: bounds.start, end: bounds.end }, baseFilters)

  const currencyRows = await customQuery.PSQLQuery<{
    currency_code: string
    standing_orders: number
    canceled_orders: number
    gross_revenue: number
    refunded_amount: number
    net_revenue: number
  }>(
    `SELECT
       LOWER(o.currency_code) AS currency_code,
       COUNT(*) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")})::integer AS standing_orders,
       COUNT(*) FILTER (WHERE ${IS_ORDER_CANCELED_EXPR("o")})::integer AS canceled_orders,
       COALESCE(SUM(${ORDER_GROSS_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS gross_revenue,
       COALESCE(SUM(${ORDER_REFUNDED_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS refunded_amount,
       COALESCE(SUM(${ORDER_NET_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS net_revenue
     FROM "order" o
     ${ORDER_SUMMARY_JOIN("o", "os")}
     WHERE ${currentBaseWhere.sql}
     GROUP BY LOWER(o.currency_code)
     ORDER BY standing_orders DESC, gross_revenue DESC`,
    currentBaseWhere.params
  )

  const allCurrencyRows = await customQuery.PSQLQuery<{ currency_code: string }>(
    `SELECT DISTINCT LOWER(currency_code) AS currency_code
     FROM (
       SELECT currency_code FROM region WHERE deleted_at IS NULL
       UNION
       SELECT currency_code FROM "order" WHERE deleted_at IS NULL
     ) c
     WHERE currency_code IS NOT NULL
     ORDER BY currency_code ASC`,
    []
  )

  const effectiveCurrency =
    requestedCurrency ||
    currencyRows[0]?.currency_code ||
    regionsRows[0]?.currency_code ||
    "usd"

  const scopedFilters = { channelId, regionId, currencyCode: effectiveCurrency }
  const curWhere = buildOrderWhereClause("o", { start: bounds.start, end: bounds.end }, scopedFilters)
  const prevWhere =
    bounds.prevStart && bounds.prevEnd
      ? buildOrderWhereClause("o", { start: bounds.prevStart, end: bounds.prevEnd }, scopedFilters)
      : null

  const kpiSql = (whereSql: string) => `
    SELECT
      COUNT(*) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")})::integer AS orders_count,
      COUNT(*) FILTER (WHERE ${IS_ORDER_CANCELED_EXPR("o")})::integer AS canceled_orders,
      COALESCE(SUM(${ORDER_GROSS_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS gross_sales,
      COALESCE(SUM(${ORDER_REFUNDED_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS refunds,
      COALESCE(SUM(${ORDER_NET_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS net_sales,
      COUNT(DISTINCT o.customer_id) FILTER (WHERE o.customer_id IS NOT NULL AND NOT ${IS_ORDER_CANCELED_EXPR("o")})::integer AS active_customers
    FROM "order" o
    ${ORDER_SUMMARY_JOIN("o", "os")}
    WHERE ${whereSql}`

  const repeatSql = (whereSql: string, endDateIso: string) => `
    WITH scoped_customers AS (
      SELECT DISTINCT o.customer_id
      FROM "order" o
      WHERE ${whereSql}
        AND o.customer_id IS NOT NULL
        AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
    ),
    customer_totals AS (
      SELECT o2.customer_id, COUNT(*)::integer AS order_total
      FROM "order" o2
      INNER JOIN scoped_customers sc ON sc.customer_id = o2.customer_id
      WHERE o2.deleted_at IS NULL
        AND COALESCE(o2.is_draft_order, false) = false
        AND NOT ${IS_ORDER_CANCELED_EXPR("o2")}
        AND o2.created_at <= CAST(? AS timestamptz)
      GROUP BY o2.customer_id
    )
    SELECT
      COUNT(*)::integer AS total_customers,
      COUNT(*) FILTER (WHERE order_total >= 2)::integer AS repeat_buyers
    FROM customer_totals`

  const liveFilter = buildLiveOrderFilterClause("o", scopedFilters)
  const bucketExpr =
    bounds.granularity === "day"
      ? `TO_CHAR(DATE_TRUNC('day', o.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
      : `TO_CHAR(DATE_TRUNC('month', o.created_at AT TIME ZONE 'UTC'), 'YYYY-MM')`

  const [
    curKpiRows,
    prevKpiRows,
    curRepeatRows,
    prevRepeatRows,
    timeseriesRows,
    pendingCaptureRows,
    awaitingFulfillmentRows,
    topProductsRows,
    topSkusRows,
    topSizesRows,
    channelBreakdownRows,
    regionBreakdownRows,
    lowStockRows,
    abandonedCartRows,
  ] = await Promise.all([
    customQuery.PSQLQuery<Record<string, unknown>>(kpiSql(curWhere.sql), curWhere.params),
    prevWhere
      ? customQuery.PSQLQuery<Record<string, unknown>>(kpiSql(prevWhere.sql), prevWhere.params)
      : Promise.resolve([]),
    customQuery.PSQLQuery<Record<string, unknown>>(repeatSql(curWhere.sql, bounds.end.toISOString()), [
      ...curWhere.params,
      bounds.end.toISOString(),
    ]),
    prevWhere && bounds.prevEnd
      ? customQuery.PSQLQuery<Record<string, unknown>>(
          repeatSql(prevWhere.sql, bounds.prevEnd.toISOString()),
          [...prevWhere.params, bounds.prevEnd.toISOString()]
        )
      : Promise.resolve([]),
    customQuery.PSQLQuery<{
      bucket: string
      orders: number
      gross_sales: number
      refunds: number
      net_sales: number
    }>(
      `SELECT
         ${bucketExpr} AS bucket,
         COUNT(*) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")})::integer AS orders,
         COALESCE(SUM(${ORDER_GROSS_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS gross_sales,
         COALESCE(SUM(${ORDER_REFUNDED_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS refunds,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS net_sales
       FROM "order" o
       ${ORDER_SUMMARY_JOIN("o", "os")}
       WHERE ${curWhere.sql}
       GROUP BY 1
       ORDER BY 1 ASC`,
      curWhere.params
    ),
    customQuery.PSQLQuery<{ count: number; amount: number }>(
      `SELECT
         COUNT(DISTINCT o.id)::integer AS count,
         COALESCE(SUM(p.amount), 0)::numeric AS amount
       FROM "order" o
       INNER JOIN order_payment_collection opc ON opc.order_id = o.id AND opc.deleted_at IS NULL
       INNER JOIN payment p ON p.payment_collection_id = opc.payment_collection_id AND p.deleted_at IS NULL
       WHERE ${liveFilter.sql}
         AND p.captured_at IS NULL
         AND p.canceled_at IS NULL`,
      liveFilter.params
    ),
    customQuery.PSQLQuery<{ count: number }>(
      `SELECT COUNT(*)::integer AS count
       FROM "order" o
       WHERE ${liveFilter.sql}
         AND o.fulfillment_status IN ('not_fulfilled', 'partially_fulfilled')`,
      liveFilter.params
    ),
    customQuery.PSQLQuery<{
      product_id: string
      title: string
      units: number
      revenue: number
      orders: number
    }>(
      `SELECT
         COALESCE(oli.product_id, oli.title) AS product_id,
         COALESCE(NULLIF(BTRIM(pr.title), ''), oli.title, 'Unknown') AS title,
         COALESCE(SUM(oi.quantity), 0)::integer AS units,
         COALESCE(SUM(COALESCE(oi.quantity, 0) * COALESCE(oli.unit_price, oi.unit_price, 0)), 0)::numeric AS revenue,
         COUNT(DISTINCT o.id)::integer AS orders
       FROM "order" o
       INNER JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
       INNER JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
       LEFT JOIN product pr ON pr.id = oli.product_id
       WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       GROUP BY 1, 2
       ORDER BY units DESC, revenue DESC
       LIMIT 10`,
      curWhere.params
    ),
    customQuery.PSQLQuery<{
      sku: string
      product_title: string
      variant_title: string
      units: number
      revenue: number
      orders: number
    }>(
      `SELECT
         COALESCE(NULLIF(BTRIM(oli.variant_sku), ''), oli.variant_id, oli.id) AS sku,
         COALESCE(NULLIF(BTRIM(pr.title), ''), oli.title, 'Unknown') AS product_title,
         COALESCE(NULLIF(BTRIM(oli.variant_title), ''), 'Default') AS variant_title,
         COALESCE(SUM(oi.quantity), 0)::integer AS units,
         COALESCE(SUM(COALESCE(oi.quantity, 0) * COALESCE(oli.unit_price, oi.unit_price, 0)), 0)::numeric AS revenue,
         COUNT(DISTINCT o.id)::integer AS orders
       FROM "order" o
       INNER JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
       INNER JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
       LEFT JOIN product pr ON pr.id = oli.product_id
       WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       GROUP BY 1, 2, 3
       ORDER BY units DESC, revenue DESC
       LIMIT 10`,
      curWhere.params
    ),
    customQuery.PSQLQuery<{
      variant_title: string
      units: number
      revenue: number
      orders: number
    }>(
      `SELECT
         COALESCE(NULLIF(BTRIM(oli.variant_title), ''), 'Default') AS variant_title,
         COALESCE(SUM(oi.quantity), 0)::integer AS units,
         COALESCE(SUM(COALESCE(oi.quantity, 0) * COALESCE(oli.unit_price, oi.unit_price, 0)), 0)::numeric AS revenue,
         COUNT(DISTINCT o.id)::integer AS orders
       FROM "order" o
       INNER JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
       INNER JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
       WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       GROUP BY 1
       ORDER BY units DESC, revenue DESC
       LIMIT 12`,
      curWhere.params
    ),
    customQuery.PSQLQuery<{
      channel_id: string
      name: string
      orders: number
      net_revenue: number
    }>(
      `SELECT
         COALESCE(o.sales_channel_id, 'unassigned') AS channel_id,
         COALESCE(sc.name, 'Unassigned') AS name,
         COUNT(*) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")})::integer AS orders,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS net_revenue
       FROM "order" o
       ${ORDER_SUMMARY_JOIN("o", "os")}
       LEFT JOIN sales_channel sc ON sc.id = o.sales_channel_id
       WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       GROUP BY 1, 2
       ORDER BY net_revenue DESC, orders DESC`,
      curWhere.params
    ),
    customQuery.PSQLQuery<{
      region_id: string
      name: string
      currency_code: string
      orders: number
      net_revenue: number
    }>(
      `SELECT
         COALESCE(o.region_id, 'unassigned') AS region_id,
         COALESCE(r.name, 'Unassigned') AS name,
         LOWER(COALESCE(r.currency_code, o.currency_code, 'usd')) AS currency_code,
         COUNT(*) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")})::integer AS orders,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS net_revenue
       FROM "order" o
       ${ORDER_SUMMARY_JOIN("o", "os")}
       LEFT JOIN region r ON r.id = o.region_id
       WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       GROUP BY 1, 2, 3
       ORDER BY net_revenue DESC, orders DESC`,
      curWhere.params
    ),
    customQuery.PSQLQuery<{
      variant_id: string
      product_id: string
      product_title: string
      variant_title: string
      sku: string | null
      stocked_quantity: number
      reserved_quantity: number
      available_quantity: number
    }>(
      `SELECT
         pv.id AS variant_id,
         pr.id AS product_id,
         pr.title AS product_title,
         pv.title AS variant_title,
         pv.sku AS sku,
         COALESCE(SUM(il.stocked_quantity), 0)::integer AS stocked_quantity,
         COALESCE(SUM(il.reserved_quantity), 0)::integer AS reserved_quantity,
         COALESCE(SUM(il.stocked_quantity - il.reserved_quantity), 0)::integer AS available_quantity
       FROM product_variant pv
       INNER JOIN product pr ON pr.id = pv.product_id AND pr.deleted_at IS NULL
       INNER JOIN product_variant_inventory_item pvii ON pvii.variant_id = pv.id AND pvii.deleted_at IS NULL
       INNER JOIN inventory_item ii ON ii.id = pvii.inventory_item_id AND ii.deleted_at IS NULL
       INNER JOIN inventory_level il ON il.inventory_item_id = ii.id AND il.deleted_at IS NULL
       WHERE pv.deleted_at IS NULL AND pv.manage_inventory = true
       GROUP BY pv.id, pr.id, pr.title, pv.title, pv.sku
       HAVING COALESCE(SUM(il.stocked_quantity - il.reserved_quantity), 0) <= 5
       ORDER BY available_quantity ASC, pr.title ASC
       LIMIT 25`,
      []
    ),
    (() => {
      const cartWhere = buildCartWhereClause("c", bounds, scopedFilters)
      return customQuery.PSQLQuery<{
        total_carts: number
        with_email: number
        notified: number
        potential_value: number
      }>(
        `WITH active_carts AS (
           SELECT
             c.id,
             c.email,
             c.metadata,
             COALESCE(SUM(COALESCE(cli.quantity, 0) * COALESCE(cli.unit_price, 0)), 0)::numeric AS cart_value
           FROM cart c
           INNER JOIN cart_line_item cli ON cli.cart_id = c.id AND cli.deleted_at IS NULL
           WHERE ${cartWhere.sql}
           GROUP BY c.id, c.email, c.metadata
           HAVING COUNT(cli.id) > 0
         )
         SELECT
           COUNT(*)::integer AS total_carts,
           COUNT(*) FILTER (WHERE NULLIF(BTRIM(email), '') IS NOT NULL)::integer AS with_email,
           COUNT(*) FILTER (
             WHERE metadata->>'abandoned_email_sent' = 'true'
                OR metadata->>'abandoned_email_sent_at' IS NOT NULL
           )::integer AS notified,
           COALESCE(SUM(cart_value), 0)::numeric AS potential_value
         FROM active_carts`,
        cartWhere.params
      )
    })(),
  ])

  // Optional engagement sections respecting feature flags & table safety
  let reviewsSummary = {
    enabled: Boolean(featureFlags.reviews),
    approved_total: 0,
    pending_count: 0,
    rejected_count: 0,
    window_new: 0,
    avg_rating: 0,
    requests_sent: 0,
    requests_used: 0,
    request_conversion_rate: 0,
  }

  if (featureFlags.reviews) {
    try {
      const timeCond = bounds.start ? `AND r.created_at >= CAST(? AS timestamptz)` : ""
      const timeParams = bounds.start ? [bounds.start.toISOString(), bounds.end.toISOString()] : [bounds.end.toISOString()]
      const [revRows, reqRows] = await Promise.all([
        customQuery.PSQLQuery<Record<string, unknown>>(
          `SELECT
             COUNT(*) FILTER (WHERE r.status = 'approved')::integer AS approved_total,
             COUNT(*) FILTER (WHERE r.status = 'pending')::integer AS pending_count,
             COUNT(*) FILTER (WHERE r.status = 'rejected')::integer AS rejected_count,
             COALESCE(AVG(r.rating) FILTER (WHERE r.status = 'approved'), 0)::numeric AS avg_rating,
             COUNT(*) FILTER (WHERE r.created_at <= CAST(? AS timestamptz) ${timeCond})::integer AS window_new
           FROM review r
           WHERE r.deleted_at IS NULL`,
          bounds.start ? [bounds.end.toISOString(), bounds.start.toISOString()] : [bounds.end.toISOString()]
        ),
        customQuery.PSQLQuery<Record<string, unknown>>(
          `SELECT
             COUNT(*) FILTER (WHERE rr.sent_at IS NOT NULL AND rr.created_at <= CAST(? AS timestamptz) ${
               bounds.start ? "AND rr.created_at >= CAST(? AS timestamptz)" : ""
             })::integer AS requests_sent,
             COUNT(*) FILTER (WHERE rr.used_at IS NOT NULL AND rr.created_at <= CAST(? AS timestamptz) ${
               bounds.start ? "AND rr.created_at >= CAST(? AS timestamptz)" : ""
             })::integer AS requests_used
           FROM review_request rr
           WHERE rr.deleted_at IS NULL`,
          bounds.start
            ? [timeParams[1], timeParams[0], timeParams[1], timeParams[0]]
            : [timeParams[0], timeParams[0]]
        ),
      ])
      const rRow = revRows[0] || {}
      const qRow = reqRows[0] || {}
      const sent = toInt(qRow.requests_sent)
      const used = toInt(qRow.requests_used)
      reviewsSummary = {
        enabled: true,
        approved_total: toInt(rRow.approved_total),
        pending_count: toInt(rRow.pending_count),
        rejected_count: toInt(rRow.rejected_count),
        window_new: toInt(rRow.window_new),
        avg_rating: Number(toNum(rRow.avg_rating).toFixed(2)),
        requests_sent: sent,
        requests_used: used,
        request_conversion_rate: sent > 0 ? Number(((used / sent) * 100).toFixed(1)) : 0,
      }
    } catch {
      // keep zeroed defaults if review tables are absent
    }
  }

  let wishlistSummary = {
    enabled: Boolean(featureFlags.wishlist),
    total_saved_items: 0,
    window_saved_items: 0,
    customer_wishlists: 0,
    guest_wishlists: 0,
    top_products: [] as { product_id: string; title: string; saves: number }[],
  }

  if (featureFlags.wishlist) {
    try {
      const wiParams = bounds.start ? [bounds.end.toISOString(), bounds.start.toISOString()] : [bounds.end.toISOString()]
      const [wlCounts, topWl] = await Promise.all([
        customQuery.PSQLQuery<Record<string, unknown>>(
          `SELECT
             (SELECT COUNT(*)::integer FROM wishlist_item wi WHERE wi.deleted_at IS NULL) AS total_saved_items,
             (SELECT COUNT(*)::integer FROM wishlist_item wi WHERE wi.deleted_at IS NULL AND wi.created_at <= CAST(? AS timestamptz) ${
               bounds.start ? "AND wi.created_at >= CAST(? AS timestamptz)" : ""
             }) AS window_saved_items,
             (SELECT COUNT(*)::integer FROM wishlist w WHERE w.deleted_at IS NULL AND w.customer_id IS NOT NULL) AS customer_wishlists,
             (SELECT COUNT(*)::integer FROM wishlist w WHERE w.deleted_at IS NULL AND w.customer_id IS NULL) AS guest_wishlists`,
          wiParams
        ),
        customQuery.PSQLQuery<{ product_id: string; title: string; saves: number }>(
          `SELECT
             wi.product_id,
             COALESCE(pr.title, wi.product_id) AS title,
             COUNT(*)::integer AS saves
           FROM wishlist_item wi
           LEFT JOIN product pr ON pr.id = wi.product_id
           WHERE wi.deleted_at IS NULL
           GROUP BY wi.product_id, pr.title
           ORDER BY saves DESC, title ASC
           LIMIT 8`,
          []
        ),
      ])
      const wc = wlCounts[0] || {}
      wishlistSummary = {
        enabled: true,
        total_saved_items: toInt(wc.total_saved_items),
        window_saved_items: toInt(wc.window_saved_items),
        customer_wishlists: toInt(wc.customer_wishlists),
        guest_wishlists: toInt(wc.guest_wishlists),
        top_products: topWl.map((r) => ({
          product_id: r.product_id,
          title: r.title,
          saves: toInt(r.saves),
        })),
      }
    } catch {
      // keep zeroed defaults
    }
  }

  const cur = curKpiRows[0] || {}
  const prev = prevKpiRows[0] || null
  const curRep = curRepeatRows[0] || {}
  const prevRep = prevRepeatRows[0] || null

  const ordersCount = toInt(cur.orders_count)
  const canceledOrders = toInt(cur.canceled_orders)
  const grossSales = toNum(cur.gross_sales)
  const refunds = toNum(cur.refunds)
  const netSales = toNum(cur.net_sales)
  const aov = ordersCount > 0 ? netSales / ordersCount : 0
  const refundRate = grossSales > 0 ? (refunds / grossSales) * 100 : 0
  const totalOrdersAll = ordersCount + canceledOrders
  const cancellationRate = totalOrdersAll > 0 ? (canceledOrders / totalOrdersAll) * 100 : 0

  const prevOrdersCount = prev ? toInt(prev.orders_count) : null
  const prevCanceledOrders = prev ? toInt(prev.canceled_orders) : null
  const prevGrossSales = prev ? toNum(prev.gross_sales) : null
  const prevRefunds = prev ? toNum(prev.refunds) : null
  const prevNetSales = prev ? toNum(prev.net_sales) : null
  const prevAov = prev && prevOrdersCount && prevOrdersCount > 0 ? (prevNetSales ?? 0) / prevOrdersCount : prev ? 0 : null
  const prevRefundRate =
    prev && prevGrossSales && prevGrossSales > 0 ? ((prevRefunds ?? 0) / prevGrossSales) * 100 : prev ? 0 : null
  const prevTotalAll = prev ? (prevOrdersCount ?? 0) + (prevCanceledOrders ?? 0) : null
  const prevCancellationRate =
    prev && prevTotalAll && prevTotalAll > 0 ? ((prevCanceledOrders ?? 0) / prevTotalAll) * 100 : prev ? 0 : null

  const repeatBuyers = toInt(curRep.repeat_buyers)
  const totalCustomers = toInt(curRep.total_customers)
  const repeatRate = totalCustomers > 0 ? (repeatBuyers / totalCustomers) * 100 : 0
  const prevRepeatBuyers = prevRep ? toInt(prevRep.repeat_buyers) : null
  const prevTotalCustomers = prevRep ? toInt(prevRep.total_customers) : null
  const prevRepeatRate =
    prevRep && prevTotalCustomers && prevTotalCustomers > 0
      ? ((prevRepeatBuyers ?? 0) / prevTotalCustomers) * 100
      : prevRep
        ? 0
        : null

  const tsByBucket = new Map<
    string,
    { orders: number; gross_sales: number; refunds: number; net_sales: number }
  >(
    (timeseriesRows as {
      bucket: string
      orders: unknown
      gross_sales: unknown
      refunds: unknown
      net_sales: unknown
    }[]).map((r) => [
      r.bucket,
      {
        orders: toInt(r.orders),
        gross_sales: toNum(r.gross_sales),
        refunds: toNum(r.refunds),
        net_sales: toNum(r.net_sales),
      },
    ])
  )
  const buckets = generateTimeBuckets(
    bounds,
    timeseriesRows.map((r) => r.bucket)
  )
  const timeseries = buckets.map((bucket) => {
    const v = tsByBucket.get(bucket)
    return {
      bucket,
      orders: v?.orders ?? 0,
      gross_sales: v?.gross_sales ?? 0,
      refunds: v?.refunds ?? 0,
      net_sales: v?.net_sales ?? 0,
    }
  })

  const totalSizeUnits = topSizesRows.reduce((sum, row) => sum + toInt(row.units), 0)
  const acRow = abandonedCartRows[0] || {}

  return res.json({
    range,
    granularity: bounds.granularity,
    currency_code: effectiveCurrency,
    multi_currency_warning: !requestedCurrency && currencyRows.length > 1,
    filters: {
      channels: channelsRows,
      regions: regionsRows,
      currencies: allCurrencyRows.map((c) => c.currency_code),
    },
    kpis: {
      net_sales: Number(netSales.toFixed(2)),
      net_sales_delta: pctDelta(netSales, prevNetSales),
      gross_sales: Number(grossSales.toFixed(2)),
      gross_sales_delta: pctDelta(grossSales, prevGrossSales),
      refunds: Number(refunds.toFixed(2)),
      refunds_delta: pctDelta(refunds, prevRefunds),
      refund_rate: Number(refundRate.toFixed(1)),
      refund_rate_delta: pctDelta(refundRate, prevRefundRate),
      orders_count: ordersCount,
      orders_delta: pctDelta(ordersCount, prevOrdersCount),
      canceled_orders: canceledOrders,
      cancellation_rate: Number(cancellationRate.toFixed(1)),
      cancellation_rate_delta: pctDelta(cancellationRate, prevCancellationRate),
      aov: Number(aov.toFixed(2)),
      aov_delta: pctDelta(aov, prevAov),
      repeat_buyers: repeatBuyers,
      total_customers: totalCustomers,
      repeat_rate: Number(repeatRate.toFixed(1)),
      repeat_rate_delta: pctDelta(repeatRate, prevRepeatRate),
    },
    operations: {
      pending_capture_count: toInt(pendingCaptureRows[0]?.count),
      pending_capture_amount: Number(toNum(pendingCaptureRows[0]?.amount).toFixed(2)),
      awaiting_fulfillment_count: toInt(awaitingFulfillmentRows[0]?.count),
      low_stock_count: lowStockRows.length,
    },
    abandoned_carts: {
      total_carts: toInt(acRow.total_carts),
      with_email: toInt(acRow.with_email),
      notified: toInt(acRow.notified),
      potential_value: Number(toNum(acRow.potential_value).toFixed(2)),
    },
    timeseries,
    currency_breakdown: currencyRows.map((r) => ({
      currency_code: r.currency_code,
      standing_orders: toInt(r.standing_orders),
      canceled_orders: toInt(r.canceled_orders),
      gross_revenue: Number(toNum(r.gross_revenue).toFixed(2)),
      refunded_amount: Number(toNum(r.refunded_amount).toFixed(2)),
      net_revenue: Number(toNum(r.net_revenue).toFixed(2)),
    })),
    top_products: topProductsRows.map((r) => ({
      product_id: r.product_id,
      title: r.title,
      units: toInt(r.units),
      revenue: Number(toNum(r.revenue).toFixed(2)),
      orders: toInt(r.orders),
    })),
    top_skus: topSkusRows.map((r) => ({
      sku: r.sku,
      product_title: r.product_title,
      variant_title: r.variant_title,
      units: toInt(r.units),
      revenue: Number(toNum(r.revenue).toFixed(2)),
      orders: toInt(r.orders),
    })),
    top_sizes: topSizesRows.map((r) => {
      const units = toInt(r.units)
      return {
        variant_title: r.variant_title,
        units,
        revenue: Number(toNum(r.revenue).toFixed(2)),
        orders: toInt(r.orders),
        share_pct: totalSizeUnits > 0 ? Number(((units / totalSizeUnits) * 100).toFixed(1)) : 0,
      }
    }),
    channel_breakdown: channelBreakdownRows.map((r) => {
      const orders = toInt(r.orders)
      const net = toNum(r.net_revenue)
      return {
        channel_id: r.channel_id,
        name: r.name,
        orders,
        net_revenue: Number(net.toFixed(2)),
        aov: orders > 0 ? Number((net / orders).toFixed(2)) : 0,
      }
    }),
    region_breakdown: regionBreakdownRows.map((r) => {
      const orders = toInt(r.orders)
      const net = toNum(r.net_revenue)
      return {
        region_id: r.region_id,
        name: r.name,
        currency_code: r.currency_code,
        orders,
        net_revenue: Number(net.toFixed(2)),
        aov: orders > 0 ? Number((net / orders).toFixed(2)) : 0,
      }
    }),
    low_stock: lowStockRows.map((r) => ({
      variant_id: r.variant_id,
      product_id: r.product_id,
      product_title: r.product_title,
      variant_title: r.variant_title,
      sku: r.sku,
      stocked_quantity: toInt(r.stocked_quantity),
      reserved_quantity: toInt(r.reserved_quantity),
      available_quantity: toInt(r.available_quantity),
    })),
    reviews: reviewsSummary,
    wishlist: wishlistSummary,
  })
}
