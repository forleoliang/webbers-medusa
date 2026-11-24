import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  generateTimeBuckets,
  isRefreshRequested,
  parseAnalyticsRange,
  pctDelta,
  resolveRangeBounds,
  toInt,
  toNum,
} from "../../../../lib/analytics"
import { getStaleCached, runSingleFlight, setCached } from "../../../../lib/analytics-cache"
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

const OVERVIEW_FRESH_TTL_MS = 3 * 60_000
const OVERVIEW_STALE_GRACE_MS = 10 * 60_000

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = (req.validatedQuery || req.query || {}) as AdminAnalyticsQueryType
  const range = parseAnalyticsRange(query.range)
  const bounds = resolveRangeBounds(
    range,
    new Date(),
    query.from || null,
    query.to || null,
    query.granularity || null
  )

  const channelId = query.channel_id || null
  const regionId = query.region_id || null
  const requestedCurrency = query.currency_code ? query.currency_code.toLowerCase() : null
  const forceRefresh = isRefreshRequested(query.refresh)

  const customTag =
    range === "custom" && bounds.start
      ? `:${bounds.start.toISOString().slice(0, 10)}:${bounds.end.toISOString().slice(0, 10)}`
      : ""
  const cacheKey = `overview:${range}${customTag}:${bounds.granularity}:${channelId || "all"}:${
    regionId || "all"
  }:${requestedCurrency || "auto"}`

  const refresh = async (): Promise<{ payload: Record<string, unknown>; cachedAt: string }> => {
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

  const [currencyRows, allCurrencyRows] = await Promise.all([
    customQuery.PSQLQuery<{
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
    ),
    customQuery.PSQLQuery<{ currency_code: string }>(
      `SELECT DISTINCT LOWER(currency_code) AS currency_code
       FROM (
         SELECT currency_code FROM region WHERE deleted_at IS NULL
         UNION
         SELECT currency_code FROM "order" WHERE deleted_at IS NULL
       ) c
       WHERE currency_code IS NOT NULL
       ORDER BY currency_code ASC`,
      []
    ),
  ])

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
      COALESCE(SUM(${ORDER_REFUNDED_EXPR("os")}) FILTER (WHERE ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS canceled_refunds,
      COALESCE(SUM(${ORDER_NET_EXPR("os")}) FILTER (WHERE NOT ${IS_ORDER_CANCELED_EXPR("o")}), 0)::numeric AS net_sales,
      COUNT(DISTINCT o.customer_id) FILTER (WHERE o.customer_id IS NOT NULL AND NOT ${IS_ORDER_CANCELED_EXPR("o")})::integer AS active_customers
    FROM "order" o
    ${ORDER_SUMMARY_JOIN("o", "os")}
    WHERE ${whereSql}`

  const windowCustomerStatsSql = (whereSql: string) => `
    WITH customer_orders AS (
      SELECT
        o.customer_id,
        COUNT(*)::integer AS order_count,
        COALESCE(SUM(${ORDER_NET_EXPR("os")}), 0)::numeric AS net_spent
      FROM "order" o
      ${ORDER_SUMMARY_JOIN("o", "os")}
      WHERE ${whereSql}
        AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
        AND o.customer_id IS NOT NULL
      GROUP BY o.customer_id
    )
    SELECT
      COUNT(*)::integer AS buyers,
      COUNT(*) FILTER (WHERE order_count >= 2)::integer AS repeat_customers,
      COALESCE(SUM(order_count), 0)::integer AS total_customer_orders,
      COALESCE(SUM(net_spent), 0)::numeric AS total_customer_spent
    FROM customer_orders`

  const liveFilter = buildLiveOrderFilterClause("o", scopedFilters)
  const bucketExpr =
    bounds.granularity === "day"
      ? `TO_CHAR(DATE_TRUNC('day', o.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
      : bounds.granularity === "week"
        ? `TO_CHAR(DATE_TRUNC('week', o.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
        : `TO_CHAR(DATE_TRUNC('month', o.created_at AT TIME ZONE 'UTC'), 'YYYY-MM')`

  const cartWhere = buildCartWhereClause("c", bounds, scopedFilters)

  const [
    curKpiRows,
    prevKpiRows,
    curCustStatsRows,
    prevCustStatsRows,
    totalCustomersAllTimeRows,
    newCustomersRows,
    guestOrdersRows,
    repeatCustomerRows,
    topCustomerRows,
    firstVsReturningRows,
    cohortRows,
    customersByCountryRows,
    timeseriesRows,
    waterfallProductRows,
    waterfallShippingRows,
    pendingCaptureRows,
    awaitingFulfillmentRows,
    topProductsRows,
    catalogProductsRows,
    topSkusRows,
    topSizesRows,
    collectionBreakdownRows,
    boughtTogetherRows,
    channelBreakdownRows,
    regionBreakdownRows,
    countryBreakdownRows,
    promotionBreakdownRows,
    inventorySummaryRows,
    lowStockRows,
    inventoryVelocityRows,
    fulfillmentSummaryRows,
    fulfillmentTimingRows,
    abandonedCartRows,
    activeCarts30mRows,
    liveOrders30mRows,
  ] = await Promise.all([
    customQuery.PSQLQuery<Record<string, unknown>>(kpiSql(curWhere.sql), curWhere.params),
    prevWhere
      ? customQuery.PSQLQuery<Record<string, unknown>>(kpiSql(prevWhere.sql), prevWhere.params)
      : Promise.resolve([]),
    customQuery.PSQLQuery<Record<string, unknown>>(windowCustomerStatsSql(curWhere.sql), curWhere.params),
    prevWhere
      ? customQuery.PSQLQuery<Record<string, unknown>>(windowCustomerStatsSql(prevWhere.sql), prevWhere.params)
      : Promise.resolve([]),
    customQuery.PSQLQuery<Record<string, unknown>>(
      `SELECT COUNT(*)::integer AS count FROM customer WHERE deleted_at IS NULL`,
      []
    ),
    bounds.start
      ? customQuery.PSQLQuery<Record<string, unknown>>(
          `SELECT COUNT(*)::integer AS count
           FROM customer
           WHERE deleted_at IS NULL
             AND created_at >= CAST(? AS timestamptz)
             AND created_at <= CAST(? AS timestamptz)`,
          [bounds.start.toISOString(), bounds.end.toISOString()]
        )
      : Promise.resolve([]),
    customQuery.PSQLQuery<Record<string, unknown>>(
      `SELECT COUNT(*)::integer AS count
       FROM "order" o
       WHERE ${curWhere.sql}
         AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
         AND o.customer_id IS NULL`,
      curWhere.params
    ),
    customQuery.PSQLQuery<Record<string, unknown>>(
      `SELECT
         co.customer_id,
         c.first_name,
         c.last_name,
         c.email,
         co.order_count,
         co.net_spent,
         co.last_order_at
       FROM (
         SELECT
           o.customer_id,
           COUNT(*)::integer AS order_count,
           COALESCE(SUM(${ORDER_NET_EXPR("os")}), 0)::numeric AS net_spent,
           MAX(o.created_at) AS last_order_at
         FROM "order" o
         ${ORDER_SUMMARY_JOIN("o", "os")}
         WHERE ${curWhere.sql}
           AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
           AND o.customer_id IS NOT NULL
         GROUP BY o.customer_id
       ) co
       LEFT JOIN customer c ON c.id = co.customer_id
       WHERE co.order_count >= 2
       ORDER BY co.order_count DESC, co.net_spent DESC
       LIMIT 20`,
      curWhere.params
    ),
    customQuery.PSQLQuery<Record<string, unknown>>(
      `SELECT
         co.customer_id,
         c.first_name,
         c.last_name,
         c.email,
         co.order_count,
         co.net_spent,
         co.last_order_at
       FROM (
         SELECT
           o.customer_id,
           COUNT(*)::integer AS order_count,
           COALESCE(SUM(${ORDER_NET_EXPR("os")}), 0)::numeric AS net_spent,
           MAX(o.created_at) AS last_order_at
         FROM "order" o
         ${ORDER_SUMMARY_JOIN("o", "os")}
         WHERE ${curWhere.sql}
           AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
           AND o.customer_id IS NOT NULL
         GROUP BY o.customer_id
       ) co
       LEFT JOIN customer c ON c.id = co.customer_id
       ORDER BY co.net_spent DESC, co.order_count DESC
       LIMIT 15`,
      curWhere.params
    ),
    // first-time vs returning orders within current window (based on customer's lifetime order rank)
    customQuery.PSQLQuery<Record<string, unknown>>(
      `WITH ranked_orders AS (
         SELECT
           o.id,
           ROW_NUMBER() OVER (PARTITION BY o.customer_id ORDER BY o.created_at ASC, o.id ASC) AS order_rank
         FROM "order" o
         WHERE o.deleted_at IS NULL
           AND COALESCE(o.is_draft_order, false) = false
           AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
           AND o.customer_id IS NOT NULL
       )
       SELECT
         COUNT(*) FILTER (WHERE ro.order_rank = 1)::integer AS first_time_orders,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}) FILTER (WHERE ro.order_rank = 1), 0)::numeric AS first_time_revenue,
         COUNT(*) FILTER (WHERE ro.order_rank >= 2)::integer AS returning_orders,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}) FILTER (WHERE ro.order_rank >= 2), 0)::numeric AS returning_revenue
       FROM "order" o
       INNER JOIN ranked_orders ro ON ro.id = o.id
       ${ORDER_SUMMARY_JOIN("o", "os")}
       WHERE ${curWhere.sql}
         AND NOT ${IS_ORDER_CANCELED_EXPR("o")}`,
      curWhere.params
    ),
    // cohort retention (last 6 customer acquisition months)
    customQuery.PSQLQuery<Record<string, unknown>>(
      `WITH standing AS (
         SELECT
           o.customer_id,
           DATE_TRUNC('month', o.created_at AT TIME ZONE 'UTC') AS ord_month
         FROM "order" o
         WHERE o.deleted_at IS NULL
           AND COALESCE(o.is_draft_order, false) = false
           AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
           AND o.customer_id IS NOT NULL
       ),
       first_ord AS (
         SELECT customer_id, MIN(ord_month) AS cohort_month
         FROM standing
         GROUP BY customer_id
       ),
       paired AS (
         SELECT DISTINCT
           f.cohort_month,
           s.customer_id,
           (EXTRACT(YEAR FROM AGE(s.ord_month, f.cohort_month)) * 12
            + EXTRACT(MONTH FROM AGE(s.ord_month, f.cohort_month)))::integer AS month_offset
         FROM first_ord f
         INNER JOIN standing s ON s.customer_id = f.customer_id
       )
       SELECT
         TO_CHAR(cohort_month, 'YYYY-MM') AS cohort_month,
         COUNT(DISTINCT customer_id) FILTER (WHERE month_offset = 0)::integer AS cohort_size,
         COUNT(DISTINCT customer_id) FILTER (WHERE month_offset = 1)::integer AS m1,
         COUNT(DISTINCT customer_id) FILTER (WHERE month_offset = 2)::integer AS m2,
         COUNT(DISTINCT customer_id) FILTER (WHERE month_offset = 3)::integer AS m3
       FROM paired
       GROUP BY cohort_month
       ORDER BY cohort_month DESC
       LIMIT 6`,
      []
    ),
    // customers by shipping country
    customQuery.PSQLQuery<Record<string, unknown>>(
      `SELECT
         UPPER(COALESCE(NULLIF(BTRIM(oa.country_code), ''), 'UNKNOWN')) AS country_code,
         COUNT(DISTINCT o.customer_id)::integer AS customers,
         COUNT(*)::integer AS orders,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}), 0)::numeric AS net_spent
       FROM "order" o
       ${ORDER_SUMMARY_JOIN("o", "os")}
       LEFT JOIN order_address oa ON oa.id = o.shipping_address_id AND oa.deleted_at IS NULL
       WHERE ${curWhere.sql}
         AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
         AND o.customer_id IS NOT NULL
       GROUP BY 1
       ORDER BY net_spent DESC, customers DESC
       LIMIT 12`,
      curWhere.params
    ),
    // timeseries
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
    // waterfall product gross & discounts
    customQuery.PSQLQuery<Record<string, unknown>>(
      `WITH scoped_orders AS (
         SELECT o.id, o.version
         FROM "order" o
         WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       ),
       item_gross AS (
         SELECT COALESCE(SUM(COALESCE(oi.quantity, 0) * COALESCE(oli.unit_price, oi.unit_price, 0)), 0)::numeric AS gross_product_sales
         FROM scoped_orders so
         INNER JOIN order_item oi ON oi.order_id = so.id AND oi.version = so.version AND oi.deleted_at IS NULL
         INNER JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
       ),
       item_disc AS (
         SELECT COALESCE(SUM(olia.amount), 0)::numeric AS item_discounts
         FROM scoped_orders so
         INNER JOIN order_item oi ON oi.order_id = so.id AND oi.version = so.version AND oi.deleted_at IS NULL
         INNER JOIN order_line_item_adjustment olia ON olia.item_id = oi.item_id AND olia.deleted_at IS NULL
       )
       SELECT
         (SELECT gross_product_sales FROM item_gross) AS gross_product_sales,
         (SELECT item_discounts FROM item_disc) AS item_discounts`,
      curWhere.params
    ),
    // waterfall shipping & shipping discounts
    customQuery.PSQLQuery<Record<string, unknown>>(
      `WITH scoped_orders AS (
         SELECT o.id, o.version
         FROM "order" o
         WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       )
       SELECT
         COALESCE(SUM(osm.amount), 0)::numeric AS shipping_amount,
         COALESCE(SUM(osma.amount), 0)::numeric AS shipping_discounts
       FROM scoped_orders so
       INNER JOIN order_shipping os2 ON os2.order_id = so.id AND os2.version = so.version AND os2.deleted_at IS NULL
       INNER JOIN order_shipping_method osm ON osm.id = os2.shipping_method_id AND osm.deleted_at IS NULL
       LEFT JOIN order_shipping_method_adjustment osma ON osma.shipping_method_id = osm.id AND osma.deleted_at IS NULL`,
      curWhere.params
    ),
    // pending capture
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
    // awaiting fulfillment
    customQuery.PSQLQuery<{ count: number }>(
      `SELECT COUNT(*)::integer AS count
       FROM "order" o
       WHERE ${liveFilter.sql}
         AND EXISTS (
           SELECT 1
           FROM order_item oi
           WHERE oi.order_id = o.id
             AND oi.version = o.version
             AND oi.deleted_at IS NULL
             AND COALESCE(oi.fulfilled_quantity, 0) < COALESCE(oi.quantity, 0)
         )`,
      liveFilter.params
    ),
    // top products (sales only)
    customQuery.PSQLQuery<{
      product_id: string
      title: string
      handle: string | null
      units: number
      revenue: number
      orders: number
    }>(
      `SELECT
         COALESCE(oli.product_id, oli.title) AS product_id,
         COALESCE(NULLIF(BTRIM(pr.title), ''), oli.title, 'Unknown') AS title,
         COALESCE(pr.handle, oli.product_handle) AS handle,
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
       LIMIT 20`,
      curWhere.params
    ),
    // full catalog merged with windowed product sales (for PostHog handle join)
    customQuery.PSQLQuery<{
      product_id: string
      title: string
      handle: string
      units: number
      revenue: number
      orders: number
    }>(
      `WITH product_sales AS (
         SELECT
           oli.product_id,
           COALESCE(SUM(oi.quantity), 0)::integer AS units,
           COALESCE(SUM(COALESCE(oi.quantity, 0) * COALESCE(oli.unit_price, oi.unit_price, 0)), 0)::numeric AS revenue,
           COUNT(DISTINCT o.id)::integer AS orders
         FROM "order" o
         INNER JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
         INNER JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
         WHERE ${curWhere.sql}
           AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
           AND oli.product_id IS NOT NULL
         GROUP BY oli.product_id
       )
       SELECT
         p.id AS product_id,
         p.title,
         LOWER(p.handle) AS handle,
         COALESCE(ps.units, 0)::integer AS units,
         COALESCE(ps.revenue, 0)::numeric AS revenue,
         COALESCE(ps.orders, 0)::integer AS orders
       FROM product p
       LEFT JOIN product_sales ps ON ps.product_id = p.id
       WHERE p.deleted_at IS NULL AND p.status = 'published'
       ORDER BY COALESCE(ps.revenue, 0) DESC, COALESCE(ps.units, 0) DESC, p.title ASC
       LIMIT 100`,
      curWhere.params
    ),
    // top skus
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
       LIMIT 15`,
      curWhere.params
    ),
    // top filter sizes
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
       LIMIT 15`,
      curWhere.params
    ),
    // collection breakdown
    customQuery.PSQLQuery<{
      collection_id: string
      title: string
      units: number
      orders: number
      revenue: number
    }>(
      `SELECT
         COALESCE(pc.id, 'uncategorized') AS collection_id,
         COALESCE(pc.title, 'Uncategorized') AS title,
         COALESCE(SUM(oi.quantity), 0)::integer AS units,
         COUNT(DISTINCT o.id)::integer AS orders,
         COALESCE(SUM(COALESCE(oi.quantity, 0) * COALESCE(oli.unit_price, oi.unit_price, 0)), 0)::numeric AS revenue
       FROM "order" o
       INNER JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
       INNER JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
       LEFT JOIN product pr ON pr.id = oli.product_id
       LEFT JOIN product_collection pc ON pc.id = pr.collection_id AND pc.deleted_at IS NULL
       WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       GROUP BY 1, 2
       ORDER BY revenue DESC, units DESC
       LIMIT 15`,
      curWhere.params
    ),
    // frequently bought together pairs
    customQuery.PSQLQuery<{
      product_a_id: string
      product_a_title: string
      product_b_id: string
      product_b_title: string
      pair_orders: number
    }>(
      `WITH order_products AS (
         SELECT DISTINCT
           o.id AS order_id,
           oli.product_id,
           COALESCE(NULLIF(BTRIM(pr.title), ''), oli.title, oli.product_id) AS title
         FROM "order" o
         INNER JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
         INNER JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
         LEFT JOIN product pr ON pr.id = oli.product_id
         WHERE ${curWhere.sql}
           AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
           AND oli.product_id IS NOT NULL
       )
       SELECT
         a.product_id AS product_a_id,
         a.title AS product_a_title,
         b.product_id AS product_b_id,
         b.title AS product_b_title,
         COUNT(DISTINCT a.order_id)::integer AS pair_orders
       FROM order_products a
       INNER JOIN order_products b ON a.order_id = b.order_id AND a.product_id < b.product_id
       GROUP BY 1, 2, 3, 4
       ORDER BY pair_orders DESC
       LIMIT 10`,
      curWhere.params
    ),
    // channel breakdown
    customQuery.PSQLQuery<{
      channel_id: string
      name: string
      orders: number
      net_revenue: number
      refunds: number
    }>(
      `SELECT
         COALESCE(o.sales_channel_id, 'unassigned') AS channel_id,
         COALESCE(sc.name, 'Unassigned') AS name,
         COUNT(*)::integer AS orders,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}), 0)::numeric AS net_revenue,
         COALESCE(SUM(${ORDER_REFUNDED_EXPR("os")}), 0)::numeric AS refunds
       FROM "order" o
       ${ORDER_SUMMARY_JOIN("o", "os")}
       LEFT JOIN sales_channel sc ON sc.id = o.sales_channel_id
       WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       GROUP BY 1, 2
       ORDER BY net_revenue DESC, orders DESC`,
      curWhere.params
    ),
    // region breakdown
    customQuery.PSQLQuery<{
      region_id: string
      name: string
      currency_code: string
      orders: number
      net_revenue: number
      refunds: number
    }>(
      `SELECT
         COALESCE(o.region_id, 'unassigned') AS region_id,
         COALESCE(r.name, 'Unassigned') AS name,
         LOWER(COALESCE(r.currency_code, o.currency_code, 'usd')) AS currency_code,
         COUNT(*)::integer AS orders,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}), 0)::numeric AS net_revenue,
         COALESCE(SUM(${ORDER_REFUNDED_EXPR("os")}), 0)::numeric AS refunds
       FROM "order" o
       ${ORDER_SUMMARY_JOIN("o", "os")}
       LEFT JOIN region r ON r.id = o.region_id
       WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       GROUP BY 1, 2, 3
       ORDER BY net_revenue DESC, orders DESC`,
      curWhere.params
    ),
    // country breakdown
    customQuery.PSQLQuery<{
      country_code: string
      orders: number
      net_revenue: number
    }>(
      `SELECT
         UPPER(COALESCE(NULLIF(BTRIM(oa.country_code), ''), 'UNKNOWN')) AS country_code,
         COUNT(*)::integer AS orders,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}), 0)::numeric AS net_revenue
       FROM "order" o
       ${ORDER_SUMMARY_JOIN("o", "os")}
       LEFT JOIN order_address oa ON oa.id = o.shipping_address_id AND oa.deleted_at IS NULL
       WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       GROUP BY 1
       ORDER BY net_revenue DESC, orders DESC
       LIMIT 15`,
      curWhere.params
    ),
    // promotion breakdown
    customQuery.PSQLQuery<{
      promotion_id: string
      code: string
      is_automatic: boolean
      orders: number
      discount_amount: number
      net_revenue: number
    }>(
      `WITH scoped_orders AS (
         SELECT o.id, o.version, ${ORDER_NET_EXPR("os")}::numeric AS net_revenue
         FROM "order" o
         ${ORDER_SUMMARY_JOIN("o", "os")}
         WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
       ),
       promo_orders AS (
         SELECT
           op.promotion_id,
           COUNT(DISTINCT so.id)::integer AS orders,
           COALESCE(SUM(so.net_revenue), 0)::numeric AS net_revenue
         FROM order_promotion op
         INNER JOIN scoped_orders so ON so.id = op.order_id
         WHERE op.deleted_at IS NULL
         GROUP BY op.promotion_id
       ),
       promo_discounts AS (
         SELECT
           olia.promotion_id,
           COALESCE(SUM(olia.amount), 0)::numeric AS discount_amount
         FROM order_line_item_adjustment olia
         INNER JOIN order_item oi ON oi.item_id = olia.item_id AND oi.deleted_at IS NULL
         INNER JOIN scoped_orders so ON so.id = oi.order_id AND so.version = oi.version
         WHERE olia.deleted_at IS NULL AND olia.promotion_id IS NOT NULL
         GROUP BY olia.promotion_id
       )
       SELECT
         p.id AS promotion_id,
         p.code,
         p.is_automatic,
         po.orders,
         COALESCE(pd.discount_amount, 0)::numeric AS discount_amount,
         po.net_revenue
       FROM promo_orders po
       INNER JOIN promotion p ON p.id = po.promotion_id AND p.deleted_at IS NULL
       LEFT JOIN promo_discounts pd ON pd.promotion_id = p.id
       ORDER BY po.orders DESC, po.net_revenue DESC
       LIMIT 15`,
      curWhere.params
    ),
    // inventory summary
    customQuery.PSQLQuery<Record<string, unknown>>(
      `WITH stock_per_variant AS (
         SELECT
           pv.id AS variant_id,
           COALESCE(SUM(il.stocked_quantity), 0)::integer AS stocked_quantity,
           COALESCE(SUM(il.reserved_quantity), 0)::integer AS reserved_quantity,
           COALESCE(SUM(il.stocked_quantity - il.reserved_quantity), 0)::integer AS available_quantity
         FROM product_variant pv
         INNER JOIN product pr ON pr.id = pv.product_id AND pr.deleted_at IS NULL
         INNER JOIN product_variant_inventory_item pvii ON pvii.variant_id = pv.id AND pvii.deleted_at IS NULL
         INNER JOIN inventory_item ii ON ii.id = pvii.inventory_item_id AND ii.deleted_at IS NULL
         INNER JOIN inventory_level il ON il.inventory_item_id = ii.id AND il.deleted_at IS NULL
         WHERE pv.deleted_at IS NULL AND pv.manage_inventory = true
         GROUP BY pv.id
       )
       SELECT
         COUNT(*)::integer AS tracked_variants,
         COALESCE(SUM(stocked_quantity), 0)::integer AS total_stocked,
         COALESCE(SUM(reserved_quantity), 0)::integer AS total_reserved,
         COALESCE(SUM(available_quantity), 0)::integer AS total_available,
         COUNT(*) FILTER (WHERE available_quantity <= 5)::integer AS low_stock_count,
         COUNT(*) FILTER (WHERE available_quantity <= 0)::integer AS out_of_stock_count
       FROM stock_per_variant`,
      []
    ),
    // low stock variants
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
    // inventory velocity + days remaining
    customQuery.PSQLQuery<Record<string, unknown>>(
      `WITH sales_30d AS (
         SELECT
           oli.variant_id,
           COALESCE(SUM(oi.quantity), 0)::integer AS units_30d
         FROM "order" o
         INNER JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
         INNER JOIN order_line_item oli ON oli.id = oi.item_id AND oli.deleted_at IS NULL
         WHERE o.deleted_at IS NULL
           AND COALESCE(o.is_draft_order, false) = false
           AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
           AND o.created_at >= NOW() - INTERVAL '30 days'
           AND oli.variant_id IS NOT NULL
         GROUP BY oli.variant_id
       ),
       stock AS (
         SELECT
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
       )
       SELECT
         s.variant_id,
         s.product_id,
         s.product_title,
         s.variant_title,
         s.sku,
         s.stocked_quantity,
         s.reserved_quantity,
         s.available_quantity,
         COALESCE(s30.units_30d, 0)::integer AS units_30d
       FROM stock s
       LEFT JOIN sales_30d s30 ON s30.variant_id = s.variant_id
       ORDER BY s.available_quantity ASC, COALESCE(s30.units_30d, 0) DESC, s.product_title ASC
       LIMIT 30`,
      []
    ),
    // strictly mutually-exclusive fulfillment stages
    customQuery.PSQLQuery<Record<string, unknown>>(
      `WITH order_states AS (
         SELECT
           o.id,
           COALESCE(SUM(oi.quantity), 0)::integer AS total_qty,
           COALESCE(SUM(oi.fulfilled_quantity), 0)::integer AS fulfilled_qty,
           COALESCE(SUM(oi.shipped_quantity), 0)::integer AS shipped_qty,
           COALESCE(SUM(oi.delivered_quantity), 0)::integer AS delivered_qty
         FROM "order" o
         LEFT JOIN order_item oi ON oi.order_id = o.id AND oi.version = o.version AND oi.deleted_at IS NULL
         WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}
         GROUP BY o.id
       )
       SELECT
         COUNT(*) FILTER (WHERE delivered_qty >= total_qty AND total_qty > 0)::integer AS delivered,
         COUNT(*) FILTER (WHERE shipped_qty >= total_qty AND delivered_qty < total_qty AND total_qty > 0)::integer AS shipped,
         COUNT(*) FILTER (WHERE fulfilled_qty >= total_qty AND shipped_qty < total_qty AND delivered_qty < total_qty AND total_qty > 0)::integer AS fulfilled,
         COUNT(*) FILTER (WHERE fulfilled_qty > 0 AND fulfilled_qty < total_qty AND shipped_qty < total_qty AND delivered_qty < total_qty)::integer AS partially_fulfilled,
         COUNT(*) FILTER (WHERE total_qty = 0 OR (fulfilled_qty = 0 AND shipped_qty = 0 AND delivered_qty = 0))::integer AS awaiting_fulfillment
       FROM order_states`,
      curWhere.params
    ),
    // fulfillment timing
    customQuery.PSQLQuery<Record<string, unknown>>(
      `SELECT
         AVG(EXTRACT(EPOCH FROM (f.shipped_at - o.created_at)) / 3600.0) FILTER (
           WHERE f.shipped_at IS NOT NULL AND f.shipped_at >= o.created_at
         )::numeric AS avg_hours_to_ship,
         AVG(EXTRACT(EPOCH FROM (f.delivered_at - o.created_at)) / 3600.0) FILTER (
           WHERE f.delivered_at IS NOT NULL AND f.delivered_at >= o.created_at
         )::numeric AS avg_hours_to_deliver
       FROM "order" o
       INNER JOIN order_fulfillment ofl ON ofl.order_id = o.id AND ofl.deleted_at IS NULL
       INNER JOIN fulfillment f ON f.id = ofl.fulfillment_id AND f.deleted_at IS NULL AND f.canceled_at IS NULL
       WHERE ${curWhere.sql} AND NOT ${IS_ORDER_CANCELED_EXPR("o")}`,
      curWhere.params
    ),
    // abandoned carts in window
    customQuery.PSQLQuery<{
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
    ),
    // active carts in last 30m
    customQuery.PSQLQuery<{ count: number }>(
      `SELECT COUNT(*)::integer AS count
       FROM cart c
       WHERE c.deleted_at IS NULL
         AND c.completed_at IS NULL
         AND c.updated_at >= NOW() - INTERVAL '30 minutes'
         AND EXISTS (
           SELECT 1 FROM cart_line_item cli WHERE cli.cart_id = c.id AND cli.deleted_at IS NULL
         )`,
      []
    ),
    // orders & sales in last 30m
    customQuery.PSQLQuery<{ orders_30m: number; sales_30m: number }>(
      `SELECT
         COUNT(*)::integer AS orders_30m,
         COALESCE(SUM(${ORDER_NET_EXPR("os")}), 0)::numeric AS sales_30m
       FROM "order" o
       ${ORDER_SUMMARY_JOIN("o", "os")}
       WHERE ${liveFilter.sql}
         AND o.created_at >= NOW() - INTERVAL '30 minutes'`,
      liveFilter.params
    ),
  ])

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
      const timeParams = bounds.start
        ? [bounds.start.toISOString(), bounds.end.toISOString()]
        : [bounds.end.toISOString()]
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
      // keep zeroed defaults
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
      const wiParams = bounds.start
        ? [bounds.end.toISOString(), bounds.start.toISOString()]
        : [bounds.end.toISOString()]
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
  const curCust = curCustStatsRows[0] || {}
  const prevCust = prevCustStatsRows[0] || null

  const ordersCount = toInt(cur.orders_count)
  const canceledOrders = toInt(cur.canceled_orders)
  const grossSales = toNum(cur.gross_sales)
  const refunds = toNum(cur.refunds)
  const canceledRefunds = toNum(cur.canceled_refunds)
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

  const buyers = toInt(curCust.buyers)
  const repeatCustomers = toInt(curCust.repeat_customers)
  const totalCustOrders = toInt(curCust.total_customer_orders)
  const totalCustSpent = toNum(curCust.total_customer_spent)
  const repeatRate = buyers > 0 ? (repeatCustomers / buyers) * 100 : 0
  const avgOrdersPerCustomer = buyers > 0 ? totalCustOrders / buyers : 0
  const avgCustomerValue = buyers > 0 ? totalCustSpent / buyers : 0

  const prevBuyers = prevCust ? toInt(prevCust.buyers) : null
  const prevRepeatCustomers = prevCust ? toInt(prevCust.repeat_customers) : null
  const prevRepeatRate =
    prevCust && prevBuyers && prevBuyers > 0
      ? ((prevRepeatCustomers ?? 0) / prevBuyers) * 100
      : prevCust
        ? 0
        : null

  const wfProd = waterfallProductRows[0] || {}
  const wfShip = waterfallShippingRows[0] || {}
  const wfGrossProduct = toNum(wfProd.gross_product_sales)
  const wfDiscounts = toNum(wfProd.item_discounts) + toNum(wfShip.shipping_discounts)
  const wfShipping = toNum(wfShip.shipping_amount)
  const wfNetProduct = Math.max(0, wfGrossProduct - wfDiscounts - refunds)

  const tsByBucket = new Map<
    string,
    { orders: number; gross_sales: number; refunds: number; net_sales: number }
  >(
    (
      timeseriesRows as {
        bucket: string
        orders: unknown
        gross_sales: unknown
        refunds: unknown
        net_sales: unknown
      }[]
    ).map((r) => [
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
    timeseriesRows.map((r: { bucket: string }) => r.bucket)
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

  const totalSizeUnits = topSizesRows.reduce(
    (sum: number, row: { units: unknown }) => sum + toInt(row.units),
    0
  )
  const acRow = abandonedCartRows[0] || {}
  const invSum = inventorySummaryRows[0] || {}
  const fulSum = fulfillmentSummaryRows[0] || {}
  const fulTiming = fulfillmentTimingRows[0] || {}
  const fvr = firstVsReturningRows[0] || {}
  const liveOrd = liveOrders30mRows[0] || {}

  const formatCustomerName = (r: Record<string, unknown>) => {
    const first = r.first_name ? String(r.first_name).trim() : ""
    const last = r.last_name ? String(r.last_name).trim() : ""
    const full = [first, last].filter(Boolean).join(" ")
    return full || (r.email ? String(r.email) : String(r.customer_id))
  }

  const payload = {
    range,
    granularity: bounds.granularity,
    currency_code: effectiveCurrency,
    multi_currency_warning: !requestedCurrency && currencyRows.length > 1,
    filters: {
      channels: channelsRows,
      regions: regionsRows,
      currencies: allCurrencyRows.map((c: { currency_code: string }) => c.currency_code),
    },
    kpis: {
      net_sales: Number(netSales.toFixed(2)),
      net_sales_delta: pctDelta(netSales, prevNetSales),
      gross_sales: Number(grossSales.toFixed(2)),
      gross_sales_delta: pctDelta(grossSales, prevGrossSales),
      refunds: Number(refunds.toFixed(2)),
      canceled_refunds: Number(canceledRefunds.toFixed(2)),
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
      repeat_buyers: repeatCustomers,
      total_customers: buyers,
      repeat_rate: Number(repeatRate.toFixed(1)),
      repeat_rate_delta: pctDelta(repeatRate, prevRepeatRate),
    },
    finance_waterfall: {
      gross_product_sales: Number(wfGrossProduct.toFixed(2)),
      discounts: Number(wfDiscounts.toFixed(2)),
      refunds: Number(refunds.toFixed(2)),
      net_product_sales: Number(wfNetProduct.toFixed(2)),
      shipping: Number(wfShipping.toFixed(2)),
      total_sales: Number(netSales.toFixed(2)),
    },
    customers: {
      total_customers_all_time: toInt(totalCustomersAllTimeRows[0]?.count),
      new_customers: bounds.start ? toInt(newCustomersRows[0]?.count) : null,
      buyers,
      repeat_customers: repeatCustomers,
      repeat_rate: Number(repeatRate.toFixed(1)),
      avg_orders_per_customer: Number(avgOrdersPerCustomer.toFixed(2)),
      avg_customer_value: Number(avgCustomerValue.toFixed(2)),
      guest_orders: toInt(guestOrdersRows[0]?.count),
      first_vs_returning: {
        first_time_orders: toInt(fvr.first_time_orders),
        first_time_revenue: Number(toNum(fvr.first_time_revenue).toFixed(2)),
        returning_orders: toInt(fvr.returning_orders),
        returning_revenue: Number(toNum(fvr.returning_revenue).toFixed(2)),
      },
      cohorts: cohortRows.map((c: Record<string, unknown>) => ({
        cohort_month: String(c.cohort_month ?? ""),
        cohort_size: toInt(c.cohort_size),
        m1: toInt(c.m1),
        m2: toInt(c.m2),
        m3: toInt(c.m3),
      })),
      by_country: customersByCountryRows.map((r: Record<string, unknown>) => ({
        country_code: String(r.country_code ?? "UNKNOWN"),
        customers: toInt(r.customers),
        orders: toInt(r.orders),
        net_spent: Number(toNum(r.net_spent).toFixed(2)),
      })),
      repeat_rows: repeatCustomerRows.map((r: Record<string, unknown>) => ({
        customer_id: String(r.customer_id ?? ""),
        name: formatCustomerName(r),
        email: r.email ? String(r.email) : null,
        order_count: toInt(r.order_count),
        net_spent: Number(toNum(r.net_spent).toFixed(2)),
        last_order_at:
          r.last_order_at instanceof Date
            ? r.last_order_at.toISOString()
            : r.last_order_at
              ? String(r.last_order_at)
              : null,
      })),
      top_customers: topCustomerRows.map((r: Record<string, unknown>) => ({
        customer_id: String(r.customer_id ?? ""),
        name: formatCustomerName(r),
        email: r.email ? String(r.email) : null,
        order_count: toInt(r.order_count),
        net_spent: Number(toNum(r.net_spent).toFixed(2)),
        last_order_at:
          r.last_order_at instanceof Date
            ? r.last_order_at.toISOString()
            : r.last_order_at
              ? String(r.last_order_at)
              : null,
      })),
    },
    operations: {
      pending_capture_count: toInt(pendingCaptureRows[0]?.count),
      pending_capture_amount: Number(toNum(pendingCaptureRows[0]?.amount).toFixed(2)),
      awaiting_fulfillment_count: toInt(awaitingFulfillmentRows[0]?.count),
      low_stock_count: toInt(invSum.low_stock_count),
    },
    live_orders_30m: {
      orders_30m: toInt(liveOrd.orders_30m),
      sales_30m: Number(toNum(liveOrd.sales_30m).toFixed(2)),
    },
    abandoned_carts: {
      total_carts: toInt(acRow.total_carts),
      with_email: toInt(acRow.with_email),
      notified: toInt(acRow.notified),
      potential_value: Number(toNum(acRow.potential_value).toFixed(2)),
      active_carts_30m: toInt(activeCarts30mRows[0]?.count),
    },
    timeseries,
    currency_breakdown: currencyRows.map((r: Record<string, unknown>) => ({
      currency_code: String(r.currency_code ?? "usd"),
      standing_orders: toInt(r.standing_orders),
      canceled_orders: toInt(r.canceled_orders),
      gross_revenue: Number(toNum(r.gross_revenue).toFixed(2)),
      refunded_amount: Number(toNum(r.refunded_amount).toFixed(2)),
      net_revenue: Number(toNum(r.net_revenue).toFixed(2)),
    })),
    top_products: topProductsRows.map((r: Record<string, unknown>) => ({
      product_id: String(r.product_id ?? ""),
      title: String(r.title ?? ""),
      handle: r.handle ? String(r.handle).toLowerCase() : null,
      units: toInt(r.units),
      revenue: Number(toNum(r.revenue).toFixed(2)),
      orders: toInt(r.orders),
    })),
    catalog_products: catalogProductsRows.map((r: Record<string, unknown>) => ({
      product_id: String(r.product_id ?? ""),
      title: String(r.title ?? ""),
      handle: String(r.handle ?? "").toLowerCase(),
      units: toInt(r.units),
      revenue: Number(toNum(r.revenue).toFixed(2)),
      orders: toInt(r.orders),
    })),
    top_skus: topSkusRows.map((r: Record<string, unknown>) => ({
      sku: String(r.sku ?? ""),
      product_title: String(r.product_title ?? ""),
      variant_title: String(r.variant_title ?? ""),
      units: toInt(r.units),
      revenue: Number(toNum(r.revenue).toFixed(2)),
      orders: toInt(r.orders),
    })),
    top_sizes: topSizesRows.map((r: Record<string, unknown>) => {
      const units = toInt(r.units)
      return {
        variant_title: String(r.variant_title ?? "Default"),
        units,
        revenue: Number(toNum(r.revenue).toFixed(2)),
        orders: toInt(r.orders),
        share_pct: totalSizeUnits > 0 ? Number(((units / totalSizeUnits) * 100).toFixed(1)) : 0,
      }
    }),
    collection_breakdown: collectionBreakdownRows.map((r: Record<string, unknown>) => ({
      collection_id: String(r.collection_id ?? "uncategorized"),
      title: String(r.title ?? "Uncategorized"),
      units: toInt(r.units),
      orders: toInt(r.orders),
      revenue: Number(toNum(r.revenue).toFixed(2)),
    })),
    bought_together: boughtTogetherRows.map((r: Record<string, unknown>) => ({
      product_a_id: String(r.product_a_id ?? ""),
      product_a_title: String(r.product_a_title ?? ""),
      product_b_id: String(r.product_b_id ?? ""),
      product_b_title: String(r.product_b_title ?? ""),
      pair_orders: toInt(r.pair_orders),
    })),
    channel_breakdown: channelBreakdownRows.map((r: Record<string, unknown>) => {
      const orders = toInt(r.orders)
      const net = toNum(r.net_revenue)
      return {
        channel_id: String(r.channel_id ?? "unassigned"),
        name: String(r.name ?? "Unassigned"),
        orders,
        net_revenue: Number(net.toFixed(2)),
        refunds: Number(toNum(r.refunds).toFixed(2)),
        aov: orders > 0 ? Number((net / orders).toFixed(2)) : 0,
      }
    }),
    region_breakdown: regionBreakdownRows.map((r: Record<string, unknown>) => {
      const orders = toInt(r.orders)
      const net = toNum(r.net_revenue)
      return {
        region_id: String(r.region_id ?? "unassigned"),
        name: String(r.name ?? "Unassigned"),
        currency_code: String(r.currency_code ?? "usd"),
        orders,
        net_revenue: Number(net.toFixed(2)),
        refunds: Number(toNum(r.refunds).toFixed(2)),
        aov: orders > 0 ? Number((net / orders).toFixed(2)) : 0,
      }
    }),
    country_breakdown: countryBreakdownRows.map((r: Record<string, unknown>) => {
      const orders = toInt(r.orders)
      const net = toNum(r.net_revenue)
      return {
        country_code: String(r.country_code ?? "UNKNOWN"),
        orders,
        net_revenue: Number(net.toFixed(2)),
        aov: orders > 0 ? Number((net / orders).toFixed(2)) : 0,
      }
    }),
    promotion_breakdown: promotionBreakdownRows.map((r: Record<string, unknown>) => ({
      promotion_id: String(r.promotion_id ?? ""),
      code: String(r.code ?? ""),
      is_automatic: Boolean(r.is_automatic),
      orders: toInt(r.orders),
      discount_amount: Number(toNum(r.discount_amount).toFixed(2)),
      net_revenue: Number(toNum(r.net_revenue).toFixed(2)),
    })),
    inventory_summary: {
      tracked_variants: toInt(invSum.tracked_variants),
      total_stocked: toInt(invSum.total_stocked),
      total_reserved: toInt(invSum.total_reserved),
      total_available: toInt(invSum.total_available),
      low_stock_count: toInt(invSum.low_stock_count),
      out_of_stock_count: toInt(invSum.out_of_stock_count),
    },
    low_stock: lowStockRows.map((r: Record<string, unknown>) => ({
      variant_id: String(r.variant_id ?? ""),
      product_id: String(r.product_id ?? ""),
      product_title: String(r.product_title ?? ""),
      variant_title: String(r.variant_title ?? ""),
      sku: r.sku ? String(r.sku) : null,
      stocked_quantity: toInt(r.stocked_quantity),
      reserved_quantity: toInt(r.reserved_quantity),
      available_quantity: toInt(r.available_quantity),
    })),
    inventory_velocity: inventoryVelocityRows.map((r: Record<string, unknown>) => {
      const available = toInt(r.available_quantity)
      const units30 = toInt(r.units_30d)
      const dailyVelocity = Number((units30 / 30).toFixed(2))
      const daysRemaining =
        available <= 0 ? 0 : dailyVelocity > 0 ? Math.round(available / dailyVelocity) : null
      return {
        variant_id: String(r.variant_id ?? ""),
        product_id: String(r.product_id ?? ""),
        product_title: String(r.product_title ?? ""),
        variant_title: String(r.variant_title ?? ""),
        sku: r.sku ? String(r.sku) : null,
        stocked_quantity: toInt(r.stocked_quantity),
        reserved_quantity: toInt(r.reserved_quantity),
        available_quantity: available,
        units_30d: units30,
        daily_velocity: dailyVelocity,
        days_remaining: daysRemaining,
      }
    }),
    fulfillment_summary: {
      awaiting_fulfillment: toInt(fulSum.awaiting_fulfillment),
      partially_fulfilled: toInt(fulSum.partially_fulfilled),
      fulfilled: toInt(fulSum.fulfilled),
      shipped: toInt(fulSum.shipped),
      delivered: toInt(fulSum.delivered),
      avg_hours_to_ship:
        fulTiming.avg_hours_to_ship !== null && fulTiming.avg_hours_to_ship !== undefined
          ? Number(toNum(fulTiming.avg_hours_to_ship).toFixed(1))
          : null,
      avg_hours_to_deliver:
        fulTiming.avg_hours_to_deliver !== null && fulTiming.avg_hours_to_deliver !== undefined
          ? Number(toNum(fulTiming.avg_hours_to_deliver).toFixed(1))
          : null,
    },
    reviews: reviewsSummary,
    wishlist: wishlistSummary,
  }

  const entry = setCached(cacheKey, payload, OVERVIEW_FRESH_TTL_MS)
  return { payload, cachedAt: entry.cachedAt }
  }

  if (!forceRefresh) {
    const hit = getStaleCached<Record<string, unknown>>(cacheKey, OVERVIEW_STALE_GRACE_MS)
    if (hit && !hit.isStale) {
      return res.json({ ...hit.entry.value, cached: true, cached_at: hit.entry.cachedAt })
    }
    if (hit && hit.isStale) {
      void runSingleFlight(cacheKey, refresh).catch(() => {})
      return res.json({ ...hit.entry.value, cached: true, stale: true, cached_at: hit.entry.cachedAt })
    }
  }

  const flightKey = forceRefresh ? `${cacheKey}:force` : cacheKey
  const result = await runSingleFlight(flightKey, refresh)
  return res.json({ ...result.payload, cached: false, cached_at: result.cachedAt })
}
