import {
  clearAnalyticsCache,
  getCached,
  MAX_ANALYTICS_CACHE_ENTRIES,
  setCached,
} from "../analytics-cache"
import {
  buildAnalyticsCsv,
  generateTimeBuckets,
  isRefreshRequested,
  mapRangeToPosthogInterval,
  mapRangeToTrafficRange,
  parseAnalyticsRange,
  pctDelta,
  resolveRangeBounds,
  sanitizeCsvCell,
  toInt,
  toNum,
} from "../analytics"

describe("analytics helpers", () => {
  afterEach(() => {
    clearAnalyticsCache()
  })

  test("parseAnalyticsRange accepts valid values and defaults to all", () => {
    expect(parseAnalyticsRange("7d")).toBe("7d")
    expect(parseAnalyticsRange("30d")).toBe("30d")
    expect(parseAnalyticsRange("90d")).toBe("90d")
    expect(parseAnalyticsRange("12m")).toBe("12m")
    expect(parseAnalyticsRange("all")).toBe("all")
    expect(parseAnalyticsRange("invalid")).toBe("all")
    expect(parseAnalyticsRange(undefined)).toBe("all")
  })

  test("mapRangeToTrafficRange maps 7d to 30d and keeps others", () => {
    expect(mapRangeToTrafficRange("7d")).toBe("30d")
    expect(mapRangeToTrafficRange("30d")).toBe("30d")
    expect(mapRangeToTrafficRange("90d")).toBe("90d")
    expect(mapRangeToTrafficRange("12m")).toBe("12m")
    expect(mapRangeToTrafficRange("all")).toBe("all")
  })

  test("mapRangeToPosthogInterval maps whitelisted ranges cleanly", () => {
    expect(mapRangeToPosthogInterval("7d")).toBe("7 day")
    expect(mapRangeToPosthogInterval("30d")).toBe("30 day")
    expect(mapRangeToPosthogInterval("90d")).toBe("90 day")
    expect(mapRangeToPosthogInterval("12m")).toBe("12 month")
    expect(mapRangeToPosthogInterval("all")).toBe("12 month")
    expect(isRefreshRequested("1")).toBe(true)
    expect(isRefreshRequested(true)).toBe(true)
    expect(isRefreshRequested("0")).toBe(false)
  })

  test("analytics-cache supports hit, expiry, and bounded eviction", () => {
    setCached("k1", { v: 1 }, 1000, 100)
    expect(getCached<{ v: number }>("k1", 500)?.value).toEqual({ v: 1 })
    expect(getCached<{ v: number }>("k1", 1100)).toBeNull()

    for (let i = 0; i < MAX_ANALYTICS_CACHE_ENTRIES + 5; i++) {
      setCached(`item-${i}`, i, 60_000, 1000 + i)
    }
    expect(getCached("item-0", 2000)).toBeNull()
    expect(getCached(`item-${MAX_ANALYTICS_CACHE_ENTRIES + 4}`, 2000)?.value).toBe(
      MAX_ANALYTICS_CACHE_ENTRIES + 4
    )
  })

  test("resolveRangeBounds computes exact UTC day and month windows with previous period", () => {
    const now = new Date("2026-11-24T12:34:56.000Z")

    const b7 = resolveRangeBounds("7d", now)
    expect(b7.granularity).toBe("day")
    expect(b7.bucketCount).toBe(7)
    expect(b7.start?.toISOString()).toBe("2026-11-18T00:00:00.000Z")
    expect(b7.prevStart?.toISOString()).toBe("2026-11-11T00:00:00.000Z")
    expect(b7.prevEnd?.toISOString()).toBe("2026-11-18T00:00:00.000Z")

    const b12 = resolveRangeBounds("12m", now)
    expect(b12.granularity).toBe("month")
    expect(b12.start?.toISOString()).toBe("2025-12-01T00:00:00.000Z")
    expect(b12.prevStart?.toISOString()).toBe("2024-12-01T00:00:00.000Z")
    expect(generateTimeBuckets(b12)).toHaveLength(12)

    const ball = resolveRangeBounds("all", now)
    expect(ball.start).toBeNull()
    expect(ball.prevStart).toBeNull()
    expect(generateTimeBuckets(ball, ["2026-11", "2026-09", "2026-11"])).toEqual(["2026-09", "2026-11"])
  })

  test("pctDelta handles zero, null, positive and negative changes cleanly", () => {
    expect(pctDelta(100, null)).toBeNull()
    expect(pctDelta(0, 0)).toBe(0)
    expect(pctDelta(50, 0)).toBe(100)
    expect(pctDelta(150, 100)).toBe(50)
    expect(pctDelta(75, 100)).toBe(-25)
  })

  test("toNum and toInt parse strings and ignore NaN", () => {
    expect(toNum("79.99")).toBe(79.99)
    expect(toNum(null)).toBe(0)
    expect(toNum("abc", 5)).toBe(5)
    expect(toInt("12.9")).toBe(12)
  })

  test("sanitizeCsvCell and buildAnalyticsCsv emit UTF-8 BOM and neutralize formulas", () => {
    expect(sanitizeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)")
    expect(sanitizeCsvCell('Filter "82mm", Pro')).toBe('"Filter ""82mm"", Pro"')

    const csv = buildAnalyticsCsv([
      {
        id: "ord_1",
        display_id: 1001,
        created_at: "2026-11-24T01:00:00.000Z",
        status: "pending",
        payment_status: "captured",
        fulfillment_status: "not_fulfilled",
        currency_code: "usd",
        gross_total: 100,
        refunded_total: 20,
        net_total: 80,
        items_count: 2,
        sales_channel_id: "sc_1",
        sales_channel_name: "Default Sales Channel",
        region_id: "reg_1",
        region_name: "US",
        customer_id: "cus_1",
        email: "=cmd@example.com",
      },
    ])

    expect(csv.startsWith("\uFEFFOrder ID,Display ID")).toBe(true)
    expect(csv).toContain("ord_1,1001")
    expect(csv).toContain("100.00,20.00,80.00,2")
    expect(csv).toContain("'=cmd@example.com")
  })
})
