import {
  clearAnalyticsCache,
  getCached,
  MAX_ANALYTICS_CACHE_ENTRIES,
  setCached,
} from "../analytics-cache"
import {
  buildAnalyticsCsv,
  buildGenericCsv,
  classifyReferrerChannel,
  extractProductHandle,
  generateTimeBuckets,
  isRefreshRequested,
  mapRangeToPosthogInterval,
  mapRangeToTrafficRange,
  parseAnalyticsRange,
  parseExportType,
  parseIsoDateOnly,
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

  test("parseAnalyticsRange and parseExportType validate inputs with safe defaults", () => {
    expect(parseAnalyticsRange("7d")).toBe("7d")
    expect(parseAnalyticsRange("custom")).toBe("custom")
    expect(parseAnalyticsRange("invalid")).toBe("all")
    expect(parseAnalyticsRange(undefined)).toBe("all")

    expect(parseExportType("products")).toBe("products")
    expect(parseExportType("customers")).toBe("customers")
    expect(parseExportType("inventory")).toBe("inventory")
    expect(parseExportType("other")).toBe("orders")
  })

  test("mapRangeToTrafficRange and mapRangeToPosthogInterval map all ranges cleanly", () => {
    expect(mapRangeToTrafficRange("7d")).toBe("30d")
    expect(mapRangeToTrafficRange("custom")).toBe("90d")
    expect(mapRangeToPosthogInterval("7d")).toBe("7 day")
    expect(mapRangeToPosthogInterval("all")).toBe("12 month")
    expect(isRefreshRequested("1")).toBe(true)
    expect(isRefreshRequested("0")).toBe(false)
  })

  test("resolveRangeBounds handles custom dates and week granularity", () => {
    const now = new Date("2026-11-24T12:34:56.000Z")

    const custom = resolveRangeBounds("custom", now, "2026-10-01", "2026-10-14", "week")
    expect(custom.granularity).toBe("week")
    expect(custom.start?.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(custom.end.toISOString()).toBe("2026-10-14T23:59:59.999Z")
    expect(custom.prevStart?.toISOString()).toBe("2026-09-17T00:00:00.000Z")
    expect(generateTimeBuckets(custom)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"])

    expect(parseIsoDateOnly("2026-02-30")).toBeNull()
    expect(parseIsoDateOnly("2026-11-24")).toBe("2026-11-24")
  })

  test("classifyReferrerChannel and extractProductHandle classify traffic and paths accurately", () => {
    expect(classifyReferrerChannel("direct")).toBe("direct")
    expect(classifyReferrerChannel("www.google.com")).toBe("organic_search")
    expect(classifyReferrerChannel("www.google.com", "cpc")).toBe("paid_search")
    expect(classifyReferrerChannel("www.instagram.com")).toBe("social")
    expect(classifyReferrerChannel("dpreview.com")).toBe("referral")

    expect(extractProductHandle("/products/xt996s-lens-protection-filter")).toBe(
      "xt996s-lens-protection-filter"
    )
    expect(extractProductHandle("/us/products/xt925-black-mist-filter?variant=77mm")).toBe(
      "xt925-black-mist-filter"
    )
    expect(extractProductHandle("/collections/filters")).toBeNull()
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

  test("resolveRangeBounds computes exact UTC day and month windows", () => {
    const now = new Date("2026-11-24T12:34:56.000Z")
    const b7 = resolveRangeBounds("7d", now)
    expect(b7.granularity).toBe("day")
    expect(generateTimeBuckets(b7)).toHaveLength(7)

    const b12 = resolveRangeBounds("12m", now)
    expect(b12.granularity).toBe("month")
    expect(generateTimeBuckets(b12)).toHaveLength(12)

    const ball = resolveRangeBounds("all", now)
    expect(ball.start).toBeNull()
    expect(generateTimeBuckets(ball, ["2026-11", "2026-09", "2026-11"])).toEqual(["2026-09", "2026-11"])
  })

  test("pctDelta and numeric parsers behave safely", () => {
    expect(pctDelta(100, null)).toBeNull()
    expect(pctDelta(0, 0)).toBe(0)
    expect(pctDelta(50, 0)).toBe(100)
    expect(pctDelta(150, 100)).toBe(50)
    expect(pctDelta(75, 100)).toBe(-25)
    expect(toNum("79.99")).toBe(79.99)
    expect(toInt("12.9")).toBe(12)
  })

  test("CSV builders emit UTF-8 BOM and neutralize formulas", () => {
    expect(sanitizeCsvCell("=SUM(A1)")).toBe("'=SUM(A1)")
    const generic = buildGenericCsv(["Product", "Units"], [["=EVIL()", 3]])
    expect(generic.startsWith("\uFEFFProduct,Units")).toBe(true)
    expect(generic).toContain("'=EVIL(),3")

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
    expect(csv).toContain("'=cmd@example.com")
  })
})
