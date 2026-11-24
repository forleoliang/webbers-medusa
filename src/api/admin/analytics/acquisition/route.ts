import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  type ChannelGroup,
  classifyReferrerChannel,
  extractProductHandle,
  isRefreshRequested,
  mapRangeToPosthogInterval,
  parseAnalyticsRange,
  parseIsoDateOnly,
  toInt,
} from "../../../../lib/analytics"
import { getCached, setCached } from "../../../../lib/analytics-cache"
import type { AdminAnalyticsAcquisitionQueryType } from "../../../validators"

const OWNER_DISTINCT_ID = "01a191b1-2856-7a78-a25b-de3f4f3b008f"
const OWNER_PERSON_ID = "9309e250-3e82-5033-8215-86b2ad7d4db2"

const BASE_FILTER = [
  "properties.$host in ('xtfilters.com', 'www.xtfilters.com')",
  "(properties.$pathname is null or properties.$pathname not like '/dev/%')",
  `distinct_id != '${OWNER_DISTINCT_ID}'`,
  `toString(person_id) != '${OWNER_PERSON_ID}'`,
].join(" and ")

async function hogql(host: string, projectId: string, apiKey: string, query: string): Promise<any[][]> {
  const res = await fetch(`${host}/api/projects/${projectId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  })
  const data = (await res.json().catch(() => ({}))) as {
    results?: any[][]
    detail?: string
    error?: string
  }
  if (!res.ok) {
    throw new Error(`PostHog ${res.status}: ${data.detail || data.error || "query failed"}`)
  }
  return Array.isArray(data.results) ? data.results : []
}

function settledRows(r: PromiseSettledResult<any[][]>): any[][] {
  return r.status === "fulfilled" ? r.value : []
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = (req.validatedQuery || req.query || {}) as AdminAnalyticsAcquisitionQueryType
  const range = parseAnalyticsRange(query.range)
  const validFrom = parseIsoDateOnly(query.from)
  const validTo = parseIsoDateOnly(query.to)
  const forceRefresh = isRefreshRequested(query.refresh)

  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY
  if (!apiKey) {
    return res.json({
      configured: false,
      range,
      cached_at: new Date().toISOString(),
    })
  }

  let timeFilter = `timestamp > now() - interval ${mapRangeToPosthogInterval(range)}`
  let customTag = ""
  if (range === "custom" && validFrom && validTo) {
    const [fromStr, toStr] = validFrom <= validTo ? [validFrom, validTo] : [validTo, validFrom]
    timeFilter = `timestamp >= toDateTime('${fromStr} 00:00:00') and timestamp <= toDateTime('${toStr} 23:59:59')`
    customTag = `:${fromStr}:${toStr}`
  }

  const cacheKey = `acquisition:${range}${customTag}`
  if (!forceRefresh) {
    const hit = getCached<Record<string, unknown>>(cacheKey)
    if (hit) {
      return res.json({ ...hit.value, cached: true, cached_at: hit.cachedAt })
    }
  }

  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "")
  const projectId = process.env.POSTHOG_PROJECT_ID || "696001"
  const run = (q: string) => hogql(host, projectId, apiKey, q)

  const results = await Promise.allSettled([
    // 0: summary
    run(
      `select count() as pageviews, count(distinct person_id) as visitors, count(distinct properties.$session_id) as sessions from events where ${BASE_FILTER} and event = '$pageview' and ${timeFilter}`
    ),
    // 1: funnel
    run(
      `select event, count() as c, count(distinct person_id) as people from events where ${BASE_FILTER} and event in ('view_item','add_to_cart','begin_checkout','purchase') and ${timeFilter} group by event`
    ),
    // 2: sources (domain + utm_medium for channel grouping)
    run(
      `select if(properties.$referring_domain = '$direct' or properties.$referring_domain is null or properties.$referring_domain = '', 'direct', properties.$referring_domain) as ref, coalesce(nullIf(properties.utm_medium, ''), '') as med, count() as c, count(distinct properties.$session_id) as sessions, count(distinct person_id) as visitors from events where ${BASE_FILTER} and event = '$pageview' and ${timeFilter} group by ref, med order by c desc limit 40`
    ),
    // 3: live 30m summary
    run(
      `select count(distinct person_id) as visitors, count(distinct properties.$session_id) as sessions, countIf(event = '$pageview') as pageviews, countIf(event = 'add_to_cart') as add_to_cart, countIf(event = 'begin_checkout') as checkout from events where ${BASE_FILTER} and timestamp > now() - interval 30 minute`
    ),
    // 4: countries
    run(
      `select coalesce(nullIf(properties.$geoip_country_code, ''), 'Unknown') as country, count(distinct person_id) as visitors, count() as pageviews from events where ${BASE_FILTER} and event = '$pageview' and ${timeFilter} group by country order by visitors desc, pageviews desc limit 10`
    ),
    // 5: devices
    run(
      `select coalesce(nullIf(properties.$device_type, ''), 'Unknown') as device, count(distinct person_id) as visitors, count(distinct properties.$session_id) as sessions from events where ${BASE_FILTER} and event = '$pageview' and ${timeFilter} group by device order by visitors desc limit 6`
    ),
    // 6: landing pages
    run(
      `select coalesce(nullIf(properties.$pathname, ''), '/') as path, count() as pageviews, count(distinct person_id) as visitors from events where ${BASE_FILTER} and event = '$pageview' and ${timeFilter} group by path order by pageviews desc limit 10`
    ),
    // 7: utm campaigns
    run(
      `select coalesce(nullIf(properties.utm_source, ''), '(none)') as source, coalesce(nullIf(properties.utm_medium, ''), '(none)') as medium, coalesce(nullIf(properties.utm_campaign, ''), '(none)') as campaign, count(distinct properties.$session_id) as sessions, count(distinct person_id) as visitors from events where ${BASE_FILTER} and (properties.utm_source is not null or properties.utm_campaign is not null) and ${timeFilter} group by source, medium, campaign order by sessions desc limit 10`
    ),
    // 8: product views
    run(
      `select coalesce(properties.item_id, properties.product_id, properties.item_name, properties.$pathname, 'unknown') as key, coalesce(properties.item_name, properties.title, properties.$pathname, 'unknown') as name, count() as views, count(distinct person_id) as people from events where ${BASE_FILTER} and event = 'view_item' and ${timeFilter} group by key, name order by views desc limit 20`
    ),
    // 9: exit pages
    run(
      `select exit_path, count() as exits from (select properties.$session_id as sid, argMax(coalesce(nullIf(properties.$pathname, ''), '/'), timestamp) as exit_path from events where ${BASE_FILTER} and event = '$pageview' and ${timeFilter} and properties.$session_id is not null group by sid) group by exit_path order by exits desc limit 10`
    ),
    // 10: live 30m locations
    run(
      `select coalesce(nullIf(properties.$geoip_country_code, ''), 'Unknown') as country, coalesce(nullIf(properties.$geoip_city_name, ''), '') as city, count(distinct person_id) as visitors, count() as pageviews from events where ${BASE_FILTER} and timestamp > now() - interval 30 minute group by country, city order by visitors desc, pageviews desc limit 8`
    ),
    // 11: live 30m active pages
    run(
      `select coalesce(nullIf(properties.$pathname, ''), '/') as path, count() as views, count(distinct person_id) as visitors from events where ${BASE_FILTER} and event = '$pageview' and timestamp > now() - interval 30 minute group by path order by views desc limit 8`
    ),
  ])

  if (results[0].status === "rejected") {
    return res.json({
      configured: true,
      range,
      cached_at: new Date().toISOString(),
      error: results[0].reason instanceof Error ? results[0].reason.message : "PostHog query failed",
    })
  }

  const summaryRow = settledRows(results[0])[0] || []
  const funnelRows = settledRows(results[1])
  const rawSourceRows = settledRows(results[2])
  const liveRow = settledRows(results[3])[0] || []
  const countryRows = settledRows(results[4])
  const deviceRows = settledRows(results[5])
  const landingRows = settledRows(results[6])
  const utmRows = settledRows(results[7])
  const productViewRows = settledRows(results[8])
  const exitRows = settledRows(results[9])
  const liveLocRows = settledRows(results[10])
  const livePageRows = settledRows(results[11])

  const funnelMap = new Map(
    funnelRows.map((row) => [String(row[0] ?? ""), { count: toInt(row[1]), people: toInt(row[2]) }])
  )

  const domainMap = new Map<string, number>()
  const channelMap = new Map<
    ChannelGroup,
    { channel: ChannelGroup; pageviews: number; sessions: number; visitors: number }
  >()

  for (const row of rawSourceRows) {
    const domain = String(row[0] || "direct")
    const medium = String(row[1] || "")
    const count = toInt(row[2])
    const sessions = toInt(row[3])
    const visitors = toInt(row[4])

    domainMap.set(domain, (domainMap.get(domain) ?? 0) + count)
    const ch = classifyReferrerChannel(domain, medium)
    const cur = channelMap.get(ch) ?? { channel: ch, pageviews: 0, sessions: 0, visitors: 0 }
    cur.pageviews += count
    cur.sessions += sessions
    cur.visitors += visitors
    channelMap.set(ch, cur)
  }

  const sources = Array.from(domainMap.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const channel_groups = Array.from(channelMap.values()).sort((a, b) => b.pageviews - a.pageviews)

  const payload = {
    configured: true,
    range,
    summary: {
      pageviews: toInt(summaryRow[0]),
      visitors: toInt(summaryRow[1]),
      sessions: toInt(summaryRow[2]),
    },
    live: {
      window_minutes: 30,
      active_visitors: toInt(liveRow[0]),
      active_sessions: toInt(liveRow[1]),
      active_pageviews: toInt(liveRow[2]),
      recent_add_to_cart: toInt(liveRow[3]),
      recent_checkout: toInt(liveRow[4]),
      locations: liveLocRows.map((row) => ({
        country: String(row[0] || "Unknown"),
        city: String(row[1] || ""),
        visitors: toInt(row[2]),
        pageviews: toInt(row[3]),
      })),
      active_pages: livePageRows.map((row) => ({
        path: String(row[0] || "/"),
        views: toInt(row[1]),
        visitors: toInt(row[2]),
      })),
    },
    funnel: (["view_item", "add_to_cart", "begin_checkout", "purchase"] as const).map((event) => ({
      event,
      count: funnelMap.get(event)?.count ?? 0,
      people: funnelMap.get(event)?.people ?? 0,
    })),
    sources,
    channel_groups,
    countries: countryRows.map((row) => ({
      country: String(row[0] || "Unknown"),
      visitors: toInt(row[1]),
      pageviews: toInt(row[2]),
    })),
    devices: deviceRows.map((row) => ({
      device: String(row[0] || "Unknown"),
      visitors: toInt(row[1]),
      sessions: toInt(row[2]),
    })),
    landing_pages: landingRows.map((row) => ({
      path: String(row[0] || "/"),
      pageviews: toInt(row[1]),
      visitors: toInt(row[2]),
    })),
    exit_pages: exitRows.map((row) => ({
      path: String(row[0] || "/"),
      exits: toInt(row[1]),
    })),
    utm_campaigns: utmRows.map((row) => ({
      source: String(row[0] || "(none)"),
      medium: String(row[1] || "(none)"),
      campaign: String(row[2] || "(none)"),
      sessions: toInt(row[3]),
      visitors: toInt(row[4]),
    })),
    product_views: productViewRows.map((row) => {
      const key = String(row[0] || "unknown")
      return {
        key,
        handle: extractProductHandle(key),
        name: String(row[1] || "unknown"),
        views: toInt(row[2]),
        people: toInt(row[3]),
      }
    }),
  }

  const entry = setCached(cacheKey, payload)
  return res.json({ ...payload, cached: false, cached_at: entry.cachedAt })
}
