import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowDownTray,
  ArrowPath,
  ChartBar,
  ExclamationCircle,
  GlobeEurope,
  Heart,
  ShoppingBag,
  ShoppingCart,
  Star,
  Users,
} from "@medusajs/icons"
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  IconBadge,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  Tabs,
  Text,
  Tooltip,
  toast,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { Stars } from "../../components/stars"
import {
  ANALYTICS_KEY,
  type AnalyticsFilters,
  type AnalyticsOverviewResponse,
  type AnalyticsRange,
  analyticsExportUrl,
  formatDateTime,
  getAnalyticsAcquisition,
  getAnalyticsOverview,
  toIntlLocale,
} from "../../lib/api"
import { useFeatureEnabled } from "../../lib/use-feature-flags"

type DashboardView = "overview" | "sales" | "products" | "traffic" | "customers" | "inventory"

const RANGES: AnalyticsRange[] = ["all", "12m", "90d", "30d", "7d"]
const VIEWS: DashboardView[] = ["overview", "sales", "products", "traffic", "customers", "inventory"]

function formatMoney(amount: number, currencyCode: string, locale: string): string {
  const code = (currencyCode || "usd").toUpperCase()
  try {
    return new Intl.NumberFormat(toIntlLocale(locale), {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0)
  } catch {
    return `${code} ${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`
  }
}

function formatNumber(val: number | null | undefined, locale: string): string {
  const safe = typeof val === "number" && Number.isFinite(val) ? val : 0
  return new Intl.NumberFormat(toIntlLocale(locale)).format(safe)
}

function DeltaBadge({
  delta,
  inverse = false,
  vsLabel,
}: {
  delta: number | null
  inverse?: boolean
  vsLabel: string
}) {
  if (delta === null || !Number.isFinite(delta)) {
    return (
      <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
        {vsLabel}
      </Text>
    )
  }
  const positive = delta > 0
  const neutral = delta === 0
  const good = inverse ? delta < 0 : delta > 0
  const color = neutral ? "grey" : good ? "green" : "red"
  return (
    <Badge size="2xsmall" color={color} className="tabular-nums">
      {positive ? "+" : ""}
      {delta.toFixed(1)}%
    </Badge>
  )
}

function KpiCard({
  label,
  value,
  sub,
  delta,
  inverseDelta,
  vsLabel,
  attention = false,
  status,
  icon,
}: {
  label: string
  value: string
  sub?: string
  delta?: number | null
  inverseDelta?: boolean
  vsLabel?: string
  attention?: boolean
  status?: { label: string; color: "green" | "orange" | "red" | "grey" | "blue" }
  icon?: React.ReactNode
}) {
  return (
    <Container
      className={`flex min-h-[112px] flex-col justify-between gap-y-2 p-4 ${
        attention ? "bg-ui-tag-orange-bg" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-x-2">
        <Text size="xsmall" leading="compact" weight="plus" className="text-ui-fg-subtle">
          {label}
        </Text>
        {status ? (
          <StatusBadge color={status.color}>{status.label}</StatusBadge>
        ) : delta !== undefined && vsLabel ? (
          <DeltaBadge delta={delta} inverse={inverseDelta} vsLabel={vsLabel} />
        ) : icon ? (
          icon
        ) : null}
      </div>
      <Text size="xlarge" leading="compact" weight="plus" className="tabular-nums text-ui-fg-base">
        {value}
      </Text>
      {sub ? (
        <Text size="xsmall" leading="compact" className="tabular-nums text-ui-fg-muted">
          {sub}
        </Text>
      ) : null}
    </Container>
  )
}

function SalesTrendChart({
  data,
  currencyCode,
  locale,
  metric,
  ordersLabel,
  netSalesLabel,
  refundsLabel,
  emptyLabel,
}: {
  data: AnalyticsOverviewResponse["timeseries"]
  currencyCode: string
  locale: string
  metric: "net_sales" | "orders"
  ordersLabel: string
  netSalesLabel: string
  refundsLabel: string
  emptyLabel: string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const { actualMax, scaleMax } = useMemo(() => {
    const vals = data.map((d) => (metric === "net_sales" ? d.net_sales : d.orders))
    const max = vals.length > 0 ? Math.max(...vals, 0) : 0
    return { actualMax: max, scaleMax: max > 0 ? max : 1 }
  }, [data, metric])

  if (!data.length) {
    return (
      <div className="flex h-[184px] items-center justify-center">
        <Text size="small" className="text-ui-fg-subtle">
          {emptyLabel}
        </Text>
      </div>
    )
  }

  const active = hoverIdx !== null ? data[hoverIdx] : null
  const firstLabel = data[0]?.bucket ?? ""
  const midLabel = data[Math.floor(data.length / 2)]?.bucket ?? ""
  const lastLabel = data[data.length - 1]?.bucket ?? ""

  return (
    <div className="flex flex-col gap-y-3">
      <div className="flex min-h-[24px] flex-wrap items-center justify-between gap-2">
        {active ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
            <Text size="xsmall" weight="plus" className="text-ui-fg-base">
              {active.bucket}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {netSalesLabel}:{" "}
              <span className="font-medium text-ui-fg-base">
                {formatMoney(active.net_sales, currencyCode, locale)}
              </span>
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {ordersLabel}:{" "}
              <span className="font-medium text-ui-fg-base">
                {formatNumber(active.orders, locale)}
              </span>
            </Text>
            {active.refunds > 0 && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                {refundsLabel}:{" "}
                <span className="font-medium text-ui-fg-base">
                  {formatMoney(active.refunds, currencyCode, locale)}
                </span>
              </Text>
            )}
          </div>
        ) : (
          <Text size="xsmall" className="tabular-nums text-ui-fg-muted">
            {firstLabel} — {lastLabel}
          </Text>
        )}
        <Text size="xsmall" className="tabular-nums text-ui-fg-muted">
          Max:{" "}
          {metric === "net_sales"
            ? formatMoney(actualMax, currencyCode, locale)
            : formatNumber(actualMax, locale)}
        </Text>
      </div>

      <div
        className="flex h-36 items-end gap-[2px] border-b border-ui-border-base pb-1"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {data.map((pt, idx) => {
          const val = metric === "net_sales" ? pt.net_sales : pt.orders
          const heightPct = val > 0 ? Math.max((val / scaleMax) * 100, 6) : 3
          const isHovered = hoverIdx === idx
          return (
            <div
              key={pt.bucket}
              onMouseEnter={() => setHoverIdx(idx)}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${pt.bucket} · ${formatMoney(pt.net_sales, currencyCode, locale)} · ${pt.orders}`}
            >
              <div
                className={`w-full rounded-t-xs transition-colors ${
                  val > 0
                    ? isHovered
                      ? "bg-ui-fg-interactive"
                      : "bg-ui-fg-base"
                    : isHovered
                      ? "bg-ui-border-strong"
                      : "bg-ui-bg-subtle"
                }`}
                style={{ height: `${heightPct}%` }}
              />
            </div>
          )
        })}
      </div>

      <div className="flex justify-between tabular-nums">
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
          {firstLabel}
        </Text>
        {data.length > 2 && (
          <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
            {midLabel}
          </Text>
        )}
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
          {lastLabel}
        </Text>
      </div>
    </div>
  )
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center px-6 py-6 text-center">
      <Text size="small" className="text-ui-fg-subtle">
        {text}
      </Text>
    </div>
  )
}

const StoreAnalyticsDashboardPage = () => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "en"
  const enabled = useFeatureEnabled("storeAnalytics")

  const [activeView, setActiveView] = useState<DashboardView>("overview")
  const [range, setRange] = useState<AnalyticsRange>("all")
  const [channelId, setChannelId] = useState<string>("all")
  const [regionId, setRegionId] = useState<string>("all")
  const [currencyCode, setCurrencyCode] = useState<string>("auto")
  const [chartMetric, setChartMetric] = useState<"net_sales" | "orders">("net_sales")
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [exporting, setExporting] = useState(false)

  const filters: AnalyticsFilters = useMemo(
    () => ({
      range,
      channel_id: channelId === "all" ? undefined : channelId,
      region_id: regionId === "all" ? undefined : regionId,
      currency_code: currencyCode === "auto" ? undefined : currencyCode,
    }),
    [range, channelId, regionId, currencyCode]
  )

  const overviewQuery = useQuery({
    queryKey: [...ANALYTICS_KEY, "overview", filters, refreshNonce],
    queryFn: () => getAnalyticsOverview(filters, refreshNonce > 0),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })

  const acquisitionQuery = useQuery({
    queryKey: [...ANALYTICS_KEY, "acquisition", range, refreshNonce],
    queryFn: () => getAnalyticsAcquisition(range, refreshNonce > 0),
    enabled,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  })

  const handleForceRefresh = () => {
    setRefreshNonce((n) => n + 1)
  }

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const url = analyticsExportUrl(filters)
      const resp = await fetch(url, { credentials: "include" })
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
      }
      const blob = await resp.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = `store-analytics-${range}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      toast.success(t("analytics.exportSuccess"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("analytics.exportError"))
    } finally {
      setExporting(false)
    }
  }

  if (!enabled) {
    return (
      <Container className="flex flex-col items-start gap-y-3 p-6">
        <Heading level="h1">{t("analytics.disabledHeading")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("analytics.disabledDescription")}
        </Text>
        <Link to="/settings/webbers-medusa">
          <Button variant="secondary" size="small">
            {t("extensions.settings.label")}
          </Button>
        </Link>
      </Container>
    )
  }

  const data = overviewQuery.data
  const acq = acquisitionQuery.data
  const displayCurrency = data?.currency_code || "usd"
  const kpis = data?.kpis
  const ops = data?.operations
  const carts = data?.abandoned_carts
  const cust = data?.customers
  const inv = data?.inventory_summary
  const ful = data?.fulfillment_summary

  const visitors = acq?.summary?.visitors ?? 0
  const sessions = acq?.summary?.sessions ?? 0
  const pageviews = acq?.summary?.pageviews ?? 0
  const storeConvRate =
    sessions > 0 && kpis ? Number(((kpis.orders_count / sessions) * 100).toFixed(2)) : 0

  const funnelSteps = acq?.funnel ?? []
  const funnelMaxPeople = Math.max(...funnelSteps.map((s) => s.people), 1)
  const sources = acq?.sources ?? []
  const sourcesTotal = Math.max(
    sources.reduce((sum, s) => sum + s.count, 0),
    1
  )

  const vsLabel = range === "all" ? t("analytics.allTimeBaseline") : t("analytics.vsPrevious")
  const initialLoading = overviewQuery.isLoading && !data

  return (
    <div className="flex flex-col gap-y-3">
      {/* Unified Header, Filters & 6-View Navigation */}
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level="h1">{t("analytics.title")}</Heading>
              <Badge size="2xsmall" color="blue">
                {displayCurrency.toUpperCase()}
              </Badge>
              {data?.cached_at && (
                <Text size="xsmall" className="tabular-nums text-ui-fg-muted">
                  {t("analytics.updatedAt", {
                    time: formatDateTime(data.cached_at, locale),
                  })}
                </Text>
              )}
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {t("analytics.subtitle")}
            </Text>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as AnalyticsRange)} size="small">
              <Select.Trigger className="w-[140px] [&_span]:truncate [&_span]:whitespace-nowrap">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {RANGES.map((r) => (
                  <Select.Item key={r} value={r}>
                    {t(`analytics.ranges.${r}`)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>

            <Select value={channelId} onValueChange={setChannelId} size="small">
              <Select.Trigger className="w-[170px] [&_span]:truncate [&_span]:whitespace-nowrap">
                <Select.Value placeholder={t("analytics.filters.allChannels")} />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">{t("analytics.filters.allChannels")}</Select.Item>
                {(data?.filters.channels || []).map((c) => (
                  <Select.Item key={c.id} value={c.id}>
                    {c.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>

            <Select value={regionId} onValueChange={setRegionId} size="small">
              <Select.Trigger className="w-[170px] [&_span]:truncate [&_span]:whitespace-nowrap">
                <Select.Value placeholder={t("analytics.filters.allRegions")} />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">{t("analytics.filters.allRegions")}</Select.Item>
                {(data?.filters.regions || []).map((r) => (
                  <Select.Item key={r.id} value={r.id}>
                    {r.name} ({r.currency_code.toUpperCase()})
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>

            <Select value={currencyCode} onValueChange={setCurrencyCode} size="small">
              <Select.Trigger className="w-[130px] [&_span]:truncate [&_span]:whitespace-nowrap">
                <Select.Value placeholder={t("analytics.filters.autoCurrency")} />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="auto">{t("analytics.filters.autoCurrency")}</Select.Item>
                {(data?.filters.currencies || []).map((c) => (
                  <Select.Item key={c} value={c}>
                    {c.toUpperCase()}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>

            <Button
              variant="secondary"
              size="small"
              onClick={handleForceRefresh}
              isLoading={overviewQuery.isFetching || acquisitionQuery.isFetching}
            >
              <ArrowPath />
              {t("analytics.refresh")}
            </Button>

            <Button variant="secondary" size="small" onClick={handleExportCsv} isLoading={exporting}>
              <ArrowDownTray />
              {t("analytics.exportCsv")}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto px-6 py-2.5">
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as DashboardView)}>
            <Tabs.List>
              {VIEWS.map((view) => (
                <Tabs.Trigger key={view} value={view}>
                  {t(`analytics.views.${view}`)}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </Tabs>
        </div>
      </Container>

      {overviewQuery.isError && <Alert variant="error">{t("analytics.loadError")}</Alert>}

      {data?.multi_currency_warning && (
        <Alert variant="info">
          {t("analytics.multiCurrencyNotice", { currency: displayCurrency.toUpperCase() })}
        </Alert>
      )}

      {/* VIEW 1: OVERVIEW */}
      {activeView === "overview" && (
        <>
          {/* Live 30m Snapshot Strip */}
          <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="flex items-center gap-x-2">
              <StatusBadge color={acq?.configured ? "green" : "grey"}>
                {t("analytics.live.badge")}
              </StatusBadge>
              <Text size="small" weight="plus">
                {t("analytics.live.title")}
              </Text>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 tabular-nums">
              <Text size="small" className="text-ui-fg-subtle">
                {t("analytics.live.visitors")}:{" "}
                <span className="font-medium text-ui-fg-base">
                  {acq?.configured ? formatNumber(acq.live?.active_visitors, locale) : "–"}
                </span>
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {t("analytics.live.activeCarts")}:{" "}
                <span className="font-medium text-ui-fg-base">
                  {formatNumber(carts?.active_carts_30m, locale)}
                </span>
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {t("analytics.live.recentAtc")}:{" "}
                <span className="font-medium text-ui-fg-base">
                  {acq?.configured ? formatNumber(acq.live?.recent_add_to_cart, locale) : "–"}
                </span>
              </Text>
              <Text size="small" className="text-ui-fg-subtle">
                {t("analytics.live.recentCheckout")}:{" "}
                <span className="font-medium text-ui-fg-base">
                  {acq?.configured ? formatNumber(acq.live?.recent_checkout, locale) : "–"}
                </span>
              </Text>
            </div>
          </Container>

          {/* 6 Core Overview KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {initialLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Container key={i} className="min-h-[112px] p-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="mt-3 h-7 w-24" />
                  <Skeleton className="mt-3 h-3 w-32" />
                </Container>
              ))
            ) : (
              <>
                <KpiCard
                  label={t("analytics.kpis.netSales")}
                  value={formatMoney(kpis?.net_sales ?? 0, displayCurrency, locale)}
                  delta={kpis?.net_sales_delta ?? null}
                  vsLabel={vsLabel}
                  sub={t("analytics.kpis.grossSub", {
                    gross: formatMoney(kpis?.gross_sales ?? 0, displayCurrency, locale),
                  })}
                />
                <KpiCard
                  label={t("analytics.kpis.refunds")}
                  value={formatMoney(kpis?.refunds ?? 0, displayCurrency, locale)}
                  delta={kpis?.refunds_delta ?? null}
                  inverseDelta
                  vsLabel={vsLabel}
                  sub={
                    (kpis?.canceled_refunds ?? 0) > 0
                      ? t("analytics.kpis.refundsCanceledSub", {
                          rate: (kpis?.refund_rate ?? 0).toFixed(1),
                          canceled: formatMoney(
                            kpis?.canceled_refunds ?? 0,
                            displayCurrency,
                            locale
                          ),
                        })
                      : t("analytics.kpis.refundsSub", {
                          rate: (kpis?.refund_rate ?? 0).toFixed(1),
                        })
                  }
                />
                <KpiCard
                  label={t("analytics.kpis.orders")}
                  value={formatNumber(kpis?.orders_count ?? 0, locale)}
                  delta={kpis?.orders_delta ?? null}
                  vsLabel={vsLabel}
                  sub={t("analytics.kpis.ordersSub", {
                    canceled: formatNumber(kpis?.canceled_orders ?? 0, locale),
                    rate: (kpis?.cancellation_rate ?? 0).toFixed(1),
                  })}
                />
                <KpiCard
                  label={t("analytics.kpis.aov")}
                  value={formatMoney(kpis?.aov ?? 0, displayCurrency, locale)}
                  delta={kpis?.aov_delta ?? null}
                  vsLabel={vsLabel}
                  sub={t("analytics.kpis.aovSub", {
                    repeat: formatNumber(cust?.repeat_customers ?? 0, locale),
                    total: formatNumber(cust?.buyers ?? 0, locale),
                    rate: (cust?.repeat_rate ?? 0).toFixed(1),
                  })}
                />
                <KpiCard
                  label={t("analytics.traffic.sessions")}
                  value={acq?.configured ? formatNumber(sessions, locale) : "–"}
                  icon={<GlobeEurope className="text-ui-fg-muted" />}
                  sub={
                    acq?.configured
                      ? t("analytics.traffic.visitorsPvSub", {
                          visitors: formatNumber(visitors, locale),
                          pageviews: formatNumber(pageviews, locale),
                        })
                      : t("analytics.traffic.notConfigured")
                  }
                />
                <KpiCard
                  label={t("analytics.kpis.conversionRate")}
                  value={acq?.configured && sessions > 0 ? `${storeConvRate.toFixed(2)}%` : "–"}
                  icon={<Users className="text-ui-fg-muted" />}
                  sub={t("analytics.kpis.conversionSub", {
                    orders: formatNumber(kpis?.orders_count ?? 0, locale),
                    sessions: acq?.configured ? formatNumber(sessions, locale) : "0",
                  })}
                />
              </>
            )}
          </div>

          {/* Trend Bar Chart */}
          <Container className="divide-y p-0">
            <div className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Heading level="h2">{t("analytics.chart.title")}</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  {t("analytics.chart.subtitle")}
                </Text>
              </div>
              <Tabs
                value={chartMetric}
                onValueChange={(v) => setChartMetric(v as "net_sales" | "orders")}
              >
                <Tabs.List>
                  <Tabs.Trigger value="net_sales">{t("analytics.kpis.netSales")}</Tabs.Trigger>
                  <Tabs.Trigger value="orders">{t("analytics.kpis.orders")}</Tabs.Trigger>
                </Tabs.List>
              </Tabs>
            </div>
            <div className="px-6 py-4">
              {initialLoading ? (
                <Skeleton className="h-[184px] w-full" />
              ) : (
                <SalesTrendChart
                  data={data?.timeseries || []}
                  currencyCode={displayCurrency}
                  locale={locale}
                  metric={chartMetric}
                  ordersLabel={t("analytics.kpis.orders")}
                  netSalesLabel={t("analytics.kpis.netSales")}
                  refundsLabel={t("analytics.kpis.refunds")}
                  emptyLabel={t("analytics.empty")}
                />
              )}
            </div>
          </Container>

          {/* Pending Operations & Abandoned Carts (4 Equal Cards) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Container
              className={`flex flex-col justify-between gap-y-3 p-4 ${
                (ops?.pending_capture_count ?? 0) > 0 ? "bg-ui-tag-orange-bg" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-x-2">
                <Text size="small" className="text-ui-fg-subtle">
                  {t("analytics.ops.pendingCapture")}
                </Text>
                <StatusBadge color={(ops?.pending_capture_count ?? 0) > 0 ? "orange" : "green"}>
                  {(ops?.pending_capture_count ?? 0) > 0
                    ? t("analytics.ops.needsAction")
                    : t("analytics.ops.clear")}
                </StatusBadge>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <Text size="xlarge" weight="plus" className="tabular-nums">
                    {formatMoney(ops?.pending_capture_amount ?? 0, displayCurrency, locale)}
                  </Text>
                  <Text size="xsmall" className="mt-1 block tabular-nums text-ui-fg-muted">
                    {t("analytics.ops.ordersPendingSub", {
                      count: formatNumber(ops?.pending_capture_count ?? 0, locale),
                    })}
                  </Text>
                </div>
                <Link to="/orders">
                  <Button variant="transparent" size="small">
                    {t("analytics.view")}
                  </Button>
                </Link>
              </div>
            </Container>

            <Container className="flex flex-col justify-between gap-y-3 p-4">
              <div className="flex items-center justify-between gap-x-2">
                <Text size="small" className="text-ui-fg-subtle">
                  {t("analytics.ops.awaitingFulfillment")}
                </Text>
                <IconBadge
                  size="base"
                  color={(ops?.awaiting_fulfillment_count ?? 0) > 0 ? "blue" : "grey"}
                >
                  <ShoppingBag />
                </IconBadge>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <Text size="xlarge" weight="plus" className="tabular-nums">
                    {formatNumber(ops?.awaiting_fulfillment_count ?? 0, locale)}
                  </Text>
                  <Text size="xsmall" className="mt-1 block text-ui-fg-muted">
                    {t("analytics.ops.currentStateHint")}
                  </Text>
                </div>
                <Link to="/orders">
                  <Button variant="transparent" size="small">
                    {t("analytics.view")}
                  </Button>
                </Link>
              </div>
            </Container>

            <Container className="flex flex-col justify-between gap-y-3 p-4">
              <div className="flex items-center justify-between gap-x-2">
                <Text size="small" className="text-ui-fg-subtle">
                  {t("analytics.ops.lowStock")}
                </Text>
                <IconBadge size="base" color={(ops?.low_stock_count ?? 0) > 0 ? "red" : "green"}>
                  <ExclamationCircle />
                </IconBadge>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <Text size="xlarge" weight="plus" className="tabular-nums">
                    {formatNumber(ops?.low_stock_count ?? 0, locale)}
                  </Text>
                  <Text size="xsmall" className="mt-1 block text-ui-fg-muted">
                    {t("analytics.ops.trackedVariantsSub", {
                      count: formatNumber(inv?.tracked_variants ?? 0, locale),
                    })}
                  </Text>
                </div>
                <Button variant="transparent" size="small" onClick={() => setActiveView("inventory")}>
                  {t("analytics.view")}
                </Button>
              </div>
            </Container>

            <Container className="flex flex-col justify-between gap-y-3 p-4">
              <div className="flex items-center justify-between gap-x-2">
                <Text size="small" className="text-ui-fg-subtle">
                  {t("analytics.kpis.abandonedCarts")}
                </Text>
                <IconBadge size="base" color="orange">
                  <ShoppingCart />
                </IconBadge>
              </div>
              <div>
                <Text size="xlarge" weight="plus" className="tabular-nums">
                  {formatNumber(carts?.total_carts ?? 0, locale)}
                </Text>
                <Text size="xsmall" className="mt-1 block tabular-nums text-ui-fg-muted">
                  {t("analytics.kpis.abandonedCartsSub", {
                    withEmail: formatNumber(carts?.with_email ?? 0, locale),
                    notified: formatNumber(carts?.notified ?? 0, locale),
                    value: formatMoney(carts?.potential_value ?? 0, displayCurrency, locale),
                  })}
                </Text>
              </div>
            </Container>
          </div>

          {/* Overview Side-by-Side Funnel & Sources Preview */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Container className="divide-y p-0">
              <div className="flex items-center justify-between px-6 py-4">
                <div>
                  <Heading level="h2">{t("analytics.traffic.funnelTitle")}</Heading>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {t("analytics.traffic.funnelHint")}
                  </Text>
                </div>
                <Button variant="transparent" size="small" onClick={() => setActiveView("traffic")}>
                  {t("analytics.viewDetails")}
                </Button>
              </div>
              <div className="px-6 py-4">
                {!acq?.configured ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("analytics.traffic.hint")}
                  </Text>
                ) : acq.error ? (
                  <Alert variant="error">{acq.error}</Alert>
                ) : (
                  <div className="flex flex-col gap-y-3.5">
                    {funnelSteps.map((step, i) => {
                      const prev = i > 0 ? funnelSteps[i - 1].people : null
                      const stepRate =
                        prev && prev > 0 ? Math.round((step.people / prev) * 100) : null
                      const width = Math.max(
                        (step.people / funnelMaxPeople) * 100,
                        step.people > 0 ? 4 : 0
                      )
                      return (
                        <div key={step.event} className="flex flex-col gap-y-1">
                          <div className="flex items-baseline justify-between">
                            <Text size="small" weight="plus">
                              {t(`analytics.traffic.steps.${step.event}`)}
                            </Text>
                            <Text size="small" className="tabular-nums text-ui-fg-subtle">
                              {t("analytics.traffic.peopleCount", {
                                people: formatNumber(step.people, locale),
                                count: formatNumber(step.count, locale),
                              })}
                              {stepRate !== null ? ` · ${stepRate}%` : ""}
                            </Text>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
                            <div
                              className="h-2 rounded-full bg-ui-fg-base transition-all"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Container>

            <Container className="divide-y p-0">
              <div className="flex items-center justify-between px-6 py-4">
                <div>
                  <Heading level="h2">{t("analytics.traffic.sourcesTitle")}</Heading>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {t("analytics.traffic.sourcesHint")}
                  </Text>
                </div>
                <Button variant="transparent" size="small" onClick={() => setActiveView("traffic")}>
                  {t("analytics.viewDetails")}
                </Button>
              </div>
              <div className="px-6 py-4">
                {!acq?.configured ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("analytics.traffic.hint")}
                  </Text>
                ) : sources.length === 0 ? (
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("analytics.empty")}
                  </Text>
                ) : (
                  <div className="flex flex-col gap-y-3">
                    {sources.slice(0, 6).map((source) => {
                      const pct = Math.round((source.count / sourcesTotal) * 100)
                      return (
                        <div key={source.domain} className="flex flex-col gap-y-1">
                          <div className="flex items-baseline justify-between">
                            <Text size="small" weight="plus" className="truncate">
                              {source.domain}
                            </Text>
                            <Text size="small" className="tabular-nums text-ui-fg-subtle">
                              {formatNumber(source.count, locale)} · {pct}%
                            </Text>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
                            <div
                              className="h-2 rounded-full bg-ui-fg-base transition-all"
                              style={{ width: `${Math.max(pct, 3)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </Container>
          </div>
        </>
      )}

      {/* VIEW 2: SALES ANALYTICS */}
      {activeView === "sales" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={t("analytics.kpis.netSales")}
              value={formatMoney(kpis?.net_sales ?? 0, displayCurrency, locale)}
              delta={kpis?.net_sales_delta ?? null}
              vsLabel={vsLabel}
              sub={t("analytics.kpis.grossSub", {
                gross: formatMoney(kpis?.gross_sales ?? 0, displayCurrency, locale),
              })}
            />
            <KpiCard
              label={t("analytics.kpis.refunds")}
              value={formatMoney(kpis?.refunds ?? 0, displayCurrency, locale)}
              delta={kpis?.refunds_delta ?? null}
              inverseDelta
              vsLabel={vsLabel}
              sub={t("analytics.kpis.refundsSub", {
                rate: (kpis?.refund_rate ?? 0).toFixed(1),
              })}
            />
            <KpiCard
              label={t("analytics.kpis.orders")}
              value={formatNumber(kpis?.orders_count ?? 0, locale)}
              delta={kpis?.orders_delta ?? null}
              vsLabel={vsLabel}
              sub={t("analytics.kpis.ordersSub", {
                canceled: formatNumber(kpis?.canceled_orders ?? 0, locale),
                rate: (kpis?.cancellation_rate ?? 0).toFixed(1),
              })}
            />
            <KpiCard
              label={t("analytics.kpis.aov")}
              value={formatMoney(kpis?.aov ?? 0, displayCurrency, locale)}
              delta={kpis?.aov_delta ?? null}
              vsLabel={vsLabel}
              sub={t("analytics.kpis.canceledRefundLabel", {
                amount: formatMoney(kpis?.canceled_refunds ?? 0, displayCurrency, locale),
              })}
            />
          </div>

          <Container className="divide-y p-0">
            <div className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Heading level="h2">{t("analytics.chart.title")}</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  {t("analytics.chart.subtitle")}
                </Text>
              </div>
              <Tabs
                value={chartMetric}
                onValueChange={(v) => setChartMetric(v as "net_sales" | "orders")}
              >
                <Tabs.List>
                  <Tabs.Trigger value="net_sales">{t("analytics.kpis.netSales")}</Tabs.Trigger>
                  <Tabs.Trigger value="orders">{t("analytics.kpis.orders")}</Tabs.Trigger>
                </Tabs.List>
              </Tabs>
            </div>
            <div className="px-6 py-4">
              <SalesTrendChart
                data={data?.timeseries || []}
                currencyCode={displayCurrency}
                locale={locale}
                metric={chartMetric}
                ordersLabel={t("analytics.kpis.orders")}
                netSalesLabel={t("analytics.kpis.netSales")}
                refundsLabel={t("analytics.kpis.refunds")}
                emptyLabel={t("analytics.empty")}
              />
            </div>
          </Container>

          {/* Side-by-side Channel & Market Tables (Restored full width + Refunds column) */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Container className="divide-y p-0">
              <div className="px-6 py-4">
                <Heading level="h2">{t("analytics.segments.channelsTitle")}</Heading>
              </div>
              {!(data?.channel_breakdown?.length) ? (
                <EmptyBlock text={t("analytics.empty")} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>{t("analytics.columns.name")}</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">
                          {t("analytics.columns.orders")}
                        </Table.HeaderCell>
                        <Table.HeaderCell className="text-right">
                          {t("analytics.columns.revenue")}
                        </Table.HeaderCell>
                        <Table.HeaderCell className="text-right">
                          {t("analytics.kpis.refunds")}
                        </Table.HeaderCell>
                        <Table.HeaderCell className="text-right">
                          {t("analytics.columns.aov")}
                        </Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {data.channel_breakdown.map((c) => (
                        <Table.Row key={c.channel_id}>
                          <Table.Cell className="font-medium">{c.name}</Table.Cell>
                          <Table.Cell className="text-right tabular-nums">
                            {formatNumber(c.orders, locale)}
                          </Table.Cell>
                          <Table.Cell className="text-right tabular-nums">
                            {formatMoney(c.net_revenue, displayCurrency, locale)}
                          </Table.Cell>
                          <Table.Cell className="text-right tabular-nums">
                            {formatMoney(c.refunds, displayCurrency, locale)}
                          </Table.Cell>
                          <Table.Cell className="text-right tabular-nums">
                            {formatMoney(c.aov, displayCurrency, locale)}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
              )}
            </Container>

            <Container className="divide-y p-0">
              <div className="px-6 py-4">
                <Heading level="h2">{t("analytics.segments.regionsTitle")}</Heading>
              </div>
              {!(data?.region_breakdown?.length) ? (
                <EmptyBlock text={t("analytics.empty")} />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <Table.Header>
                      <Table.Row>
                        <Table.HeaderCell>{t("analytics.columns.name")}</Table.HeaderCell>
                        <Table.HeaderCell className="text-right">
                          {t("analytics.columns.orders")}
                        </Table.HeaderCell>
                        <Table.HeaderCell className="text-right">
                          {t("analytics.columns.revenue")}
                        </Table.HeaderCell>
                        <Table.HeaderCell className="text-right">
                          {t("analytics.kpis.refunds")}
                        </Table.HeaderCell>
                        <Table.HeaderCell className="text-right">
                          {t("analytics.columns.aov")}
                        </Table.HeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {data.region_breakdown.map((r) => (
                        <Table.Row key={r.region_id}>
                          <Table.Cell className="font-medium">
                            {r.name}{" "}
                            <span className="text-xs text-ui-fg-muted">
                              ({r.currency_code.toUpperCase()})
                            </span>
                          </Table.Cell>
                          <Table.Cell className="text-right tabular-nums">
                            {formatNumber(r.orders, locale)}
                          </Table.Cell>
                          <Table.Cell className="text-right tabular-nums">
                            {formatMoney(r.net_revenue, r.currency_code, locale)}
                          </Table.Cell>
                          <Table.Cell className="text-right tabular-nums">
                            {formatMoney(r.refunds, r.currency_code, locale)}
                          </Table.Cell>
                          <Table.Cell className="text-right tabular-nums">
                            {formatMoney(r.aov, r.currency_code, locale)}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table>
                </div>
              )}
            </Container>
          </div>

          {/* Country + Promotion Code + Currency Breakdown */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Container className="divide-y p-0">
              <div className="px-6 py-4">
                <Heading level="h2">{t("analytics.segments.countriesTitle")}</Heading>
              </div>
              {!(data?.country_breakdown?.length) ? (
                <EmptyBlock text={t("analytics.empty")} />
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.country")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.orders")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.revenue")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.aov")}
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {data.country_breakdown.map((c) => (
                      <Table.Row key={c.country_code}>
                        <Table.Cell className="font-medium">{c.country_code}</Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatNumber(c.orders, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatMoney(c.net_revenue, displayCurrency, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatMoney(c.aov, displayCurrency, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Container>

            <Container className="divide-y p-0">
              <div className="px-6 py-4">
                <Heading level="h2">{t("analytics.segments.promotionsTitle")}</Heading>
              </div>
              {!(data?.promotion_breakdown?.length) ? (
                <EmptyBlock text={t("analytics.empty")} />
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.promoCode")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.orders")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.discount")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.revenue")}
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {data.promotion_breakdown.map((p) => (
                      <Table.Row key={p.promotion_id}>
                        <Table.Cell>
                          <div className="flex items-center gap-x-2">
                            <span className="font-mono text-xs font-medium">{p.code}</span>
                            {p.is_automatic && (
                              <Badge size="2xsmall" color="grey">
                                {t("analytics.segments.automaticPromo")}
                              </Badge>
                            )}
                          </div>
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatNumber(p.orders, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatMoney(p.discount_amount, displayCurrency, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatMoney(p.net_revenue, displayCurrency, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Container>
          </div>

          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">{t("analytics.segments.currenciesTitle")}</Heading>
            </div>
            {!(data?.currency_breakdown?.length) ? (
              <EmptyBlock text={t("analytics.empty")} />
            ) : (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>{t("analytics.columns.currency")}</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("analytics.columns.orders")}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("analytics.columns.canceled")}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("analytics.columns.gross")}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("analytics.kpis.refunds")}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("analytics.kpis.netSales")}
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.currency_breakdown.map((c) => (
                    <Table.Row key={c.currency_code}>
                      <Table.Cell className="font-medium">
                        {c.currency_code.toUpperCase()}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatNumber(c.standing_orders, locale)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatNumber(c.canceled_orders, locale)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatMoney(c.gross_revenue, c.currency_code, locale)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatMoney(c.refunded_amount, c.currency_code, locale)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums font-medium">
                        {formatMoney(c.net_revenue, c.currency_code, locale)}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}
          </Container>
        </>
      )}

      {/* VIEW 3: PRODUCTS & FILTER SIZES */}
      {activeView === "products" && (
        <>
          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">{t("analytics.merchandising.sizes")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("analytics.merchandising.sizesSubtitle")}
              </Text>
            </div>
            {!(data?.top_sizes?.length) ? (
              <EmptyBlock text={t("analytics.empty")} />
            ) : (
              <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
                {data.top_sizes.map((row) => (
                  <div key={row.variant_title} className="flex flex-col gap-y-1.5">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <div className="flex items-center gap-x-2">
                        <Badge size="2xsmall" color="blue">
                          {row.variant_title}
                        </Badge>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {formatNumber(row.units, locale)} {t("analytics.columns.units")} ·{" "}
                          {row.share_pct}%
                        </Text>
                      </div>
                      <Text size="xsmall" weight="plus">
                        {formatMoney(row.revenue, displayCurrency, locale)}
                      </Text>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
                      <div
                        className="h-full rounded-full bg-ui-fg-base"
                        style={{ width: `${Math.min(100, Math.max(3, row.share_pct))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Container>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Container className="divide-y p-0">
              <div className="px-6 py-4">
                <Heading level="h2">{t("analytics.merchandising.products")}</Heading>
              </div>
              {!(data?.top_products?.length) ? (
                <EmptyBlock text={t("analytics.empty")} />
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.product")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.units")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.orders")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.revenue")}
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {data.top_products.map((row) => (
                      <Table.Row key={row.product_id}>
                        <Table.Cell className="font-medium">
                          {row.product_id.startsWith("prod_") ? (
                            <Link
                              to={`/products/${row.product_id}`}
                              className="text-ui-fg-interactive hover:underline"
                            >
                              {row.title}
                            </Link>
                          ) : (
                            row.title
                          )}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatNumber(row.units, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatNumber(row.orders, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatMoney(row.revenue, displayCurrency, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Container>

            <Container className="divide-y p-0">
              <div className="px-6 py-4">
                <Heading level="h2">{t("analytics.merchandising.skus")}</Heading>
              </div>
              {!(data?.top_skus?.length) ? (
                <EmptyBlock text={t("analytics.empty")} />
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.sku")}</Table.HeaderCell>
                      <Table.HeaderCell>{t("analytics.columns.variant")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.units")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.revenue")}
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {data.top_skus.map((row) => (
                      <Table.Row key={`${row.sku}-${row.variant_title}`}>
                        <Table.Cell>
                          <div className="flex flex-col">
                            <span className="font-mono text-xs">{row.sku}</span>
                            <span className="text-xs text-ui-fg-subtle">{row.product_title}</span>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge size="2xsmall" color="grey">
                            {row.variant_title}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatNumber(row.units, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatMoney(row.revenue, displayCurrency, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Container>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Container className="divide-y p-0">
              <div className="px-6 py-4">
                <Heading level="h2">{t("analytics.merchandising.viewedTitle")}</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  {t("analytics.merchandising.viewedSubtitle")}
                </Text>
              </div>
              {!(acq?.product_views?.length) ? (
                <EmptyBlock text={t("analytics.empty")} />
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.product")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.views")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.visitors")}
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {acq.product_views.map((pv) => (
                      <Table.Row key={pv.key}>
                        <Table.Cell className="font-medium">{pv.name}</Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatNumber(pv.views, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatNumber(pv.people, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Container>

            <Container className="divide-y p-0">
              <div className="flex items-center justify-between px-6 py-4">
                <div>
                  <Heading level="h2">{t("analytics.engagement.title")}</Heading>
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("analytics.engagement.subtitle")}
                  </Text>
                </div>
                <Link to="/reviews">
                  <Button variant="secondary" size="small">
                    {t("analytics.engagement.manageReviews")}
                  </Button>
                </Link>
              </div>
              <div className="flex flex-col gap-y-4 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-x-2">
                    <Star className="text-ui-fg-interactive" />
                    <Text size="small" weight="plus">
                      {t("analytics.engagement.reviewsHeading")}
                    </Text>
                  </div>
                  {data?.reviews.enabled ? (
                    <div className="flex items-center gap-x-2">
                      <Stars rating={data.reviews.avg_rating} size={14} />
                      <Text size="small" weight="plus" className="tabular-nums">
                        {data.reviews.avg_rating.toFixed(1)}
                      </Text>
                    </div>
                  ) : (
                    <Badge size="2xsmall" color="grey">
                      {t("analytics.engagement.disabled")}
                    </Badge>
                  )}
                </div>

                {data?.reviews.enabled && (
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge color="green">
                      {t("analytics.engagement.approved", { count: data.reviews.approved_total })}
                    </StatusBadge>
                    <StatusBadge color="orange">
                      {t("analytics.engagement.pending", { count: data.reviews.pending_count })}
                    </StatusBadge>
                    <Tooltip content={t("analytics.engagement.requestConversionHint")}>
                      <StatusBadge color="blue">
                        {t("analytics.engagement.requestConversion", {
                          used: data.reviews.requests_used,
                          sent: data.reviews.requests_sent,
                          rate: data.reviews.request_conversion_rate.toFixed(1),
                        })}
                      </StatusBadge>
                    </Tooltip>
                  </div>
                )}

                <div className="border-t pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-x-2">
                      <Heart className="text-ui-fg-subtle" />
                      <Text size="small" weight="plus">
                        {t("analytics.engagement.wishlistHeading")}
                      </Text>
                    </div>
                    {data?.wishlist.enabled ? (
                      <Text size="xsmall" className="tabular-nums text-ui-fg-subtle">
                        {t("analytics.engagement.wishlistSummary", {
                          items: formatNumber(data.wishlist.total_saved_items, locale),
                          customers: formatNumber(data.wishlist.customer_wishlists, locale),
                          guests: formatNumber(data.wishlist.guest_wishlists, locale),
                        })}
                      </Text>
                    ) : (
                      <Badge size="2xsmall" color="grey">
                        {t("analytics.engagement.disabled")}
                      </Badge>
                    )}
                  </div>

                  {data?.wishlist.enabled &&
                    (data.wishlist.top_products.length > 0 ? (
                      <div className="flex flex-col gap-y-1.5">
                        {data.wishlist.top_products.slice(0, 6).map((item) => (
                          <div
                            key={item.product_id}
                            className="flex items-center justify-between text-xs"
                          >
                            <Link
                              to={`/products/${item.product_id}`}
                              className="truncate text-ui-fg-interactive hover:underline"
                            >
                              {item.title}
                            </Link>
                            <Badge size="2xsmall" color="grey" className="tabular-nums">
                              {item.saves}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Text size="xsmall" className="text-ui-fg-muted">
                        {t("analytics.empty")}
                      </Text>
                    ))}
                </div>
              </div>
            </Container>
          </div>
        </>
      )}

      {/* VIEW 4: TRAFFIC, ACQUISITION & FUNNEL */}
      {activeView === "traffic" && (
        <>
          {!acq?.configured ? (
            <Alert variant="info">{t("analytics.traffic.hint")}</Alert>
          ) : acq.error ? (
            <Alert variant="error">{acq.error}</Alert>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label={t("analytics.traffic.visitors")}
                  value={formatNumber(visitors, locale)}
                  sub={t("analytics.live.visitorsWindowSub", {
                    count: formatNumber(acq.live?.active_visitors, locale),
                  })}
                />
                <KpiCard
                  label={t("analytics.traffic.sessions")}
                  value={formatNumber(sessions, locale)}
                  sub={t("analytics.live.sessionsWindowSub", {
                    count: formatNumber(acq.live?.active_sessions, locale),
                  })}
                />
                <KpiCard
                  label={t("analytics.traffic.pageviews")}
                  value={formatNumber(pageviews, locale)}
                  sub={t("analytics.live.pageviewsWindowSub", {
                    count: formatNumber(acq.live?.active_pageviews, locale),
                  })}
                />
                <KpiCard
                  label={t("analytics.kpis.conversionRate")}
                  value={sessions > 0 ? `${storeConvRate.toFixed(2)}%` : "0.00%"}
                  sub={t("analytics.kpis.conversionSub", {
                    orders: formatNumber(kpis?.orders_count ?? 0, locale),
                    sessions: formatNumber(sessions, locale),
                  })}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Container className="divide-y p-0">
                  <div className="px-6 py-4">
                    <Heading level="h2">{t("analytics.traffic.funnelTitle")}</Heading>
                    <Text size="small" className="text-ui-fg-subtle">
                      {t("analytics.traffic.funnelHint")}
                    </Text>
                  </div>
                  <div className="flex flex-col gap-y-4 px-6 py-4">
                    {funnelSteps.map((step, i) => {
                      const prev = i > 0 ? funnelSteps[i - 1].people : null
                      const stepRate =
                        prev && prev > 0 ? Math.round((step.people / prev) * 100) : null
                      const width = Math.max(
                        (step.people / funnelMaxPeople) * 100,
                        step.people > 0 ? 4 : 0
                      )
                      return (
                        <div key={step.event} className="flex flex-col gap-y-1">
                          <div className="flex items-baseline justify-between">
                            <Text size="small" weight="plus">
                              {t(`analytics.traffic.steps.${step.event}`)}
                            </Text>
                            <Text size="small" className="tabular-nums text-ui-fg-subtle">
                              {t("analytics.traffic.peopleCount", {
                                people: formatNumber(step.people, locale),
                                count: formatNumber(step.count, locale),
                              })}
                              {stepRate !== null ? ` · ${stepRate}%` : ""}
                            </Text>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
                            <div
                              className="h-2 rounded-full bg-ui-fg-base transition-all"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Container>

                <Container className="divide-y p-0">
                  <div className="px-6 py-4">
                    <Heading level="h2">{t("analytics.traffic.sourcesTitle")}</Heading>
                    <Text size="small" className="text-ui-fg-subtle">
                      {t("analytics.traffic.sourcesHint")}
                    </Text>
                  </div>
                  <div className="px-6 py-4">
                    {sources.length === 0 ? (
                      <Text size="small" className="text-ui-fg-subtle">
                        {t("analytics.empty")}
                      </Text>
                    ) : (
                      <div className="flex flex-col gap-y-3">
                        {sources.map((source) => {
                          const pct = Math.round((source.count / sourcesTotal) * 100)
                          return (
                            <div key={source.domain} className="flex flex-col gap-y-1">
                              <div className="flex items-baseline justify-between">
                                <Text size="small" weight="plus" className="truncate">
                                  {source.domain}
                                </Text>
                                <Text size="small" className="tabular-nums text-ui-fg-subtle">
                                  {formatNumber(source.count, locale)} · {pct}%
                                </Text>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
                                <div
                                  className="h-2 rounded-full bg-ui-fg-base transition-all"
                                  style={{ width: `${Math.max(pct, 3)}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </Container>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Container className="divide-y p-0">
                  <div className="px-6 py-4">
                    <Heading level="h2">{t("analytics.traffic.countriesTitle")}</Heading>
                  </div>
                  {!(acq.countries?.length) ? (
                    <EmptyBlock text={t("analytics.empty")} />
                  ) : (
                    <Table>
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell>{t("analytics.columns.country")}</Table.HeaderCell>
                          <Table.HeaderCell className="text-right">
                            {t("analytics.columns.visitors")}
                          </Table.HeaderCell>
                          <Table.HeaderCell className="text-right">
                            {t("analytics.columns.views")}
                          </Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {acq.countries.map((c) => (
                          <Table.Row key={c.country}>
                            <Table.Cell className="font-medium">{c.country}</Table.Cell>
                            <Table.Cell className="text-right tabular-nums">
                              {formatNumber(c.visitors, locale)}
                            </Table.Cell>
                            <Table.Cell className="text-right tabular-nums">
                              {formatNumber(c.pageviews, locale)}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </Container>

                <Container className="divide-y p-0">
                  <div className="px-6 py-4">
                    <Heading level="h2">{t("analytics.traffic.devicesTitle")}</Heading>
                  </div>
                  {!(acq.devices?.length) ? (
                    <EmptyBlock text={t("analytics.empty")} />
                  ) : (
                    <Table>
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell>{t("analytics.columns.device")}</Table.HeaderCell>
                          <Table.HeaderCell className="text-right">
                            {t("analytics.columns.visitors")}
                          </Table.HeaderCell>
                          <Table.HeaderCell className="text-right">
                            {t("analytics.traffic.sessions")}
                          </Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {acq.devices.map((d) => (
                          <Table.Row key={d.device}>
                            <Table.Cell className="font-medium">{d.device}</Table.Cell>
                            <Table.Cell className="text-right tabular-nums">
                              {formatNumber(d.visitors, locale)}
                            </Table.Cell>
                            <Table.Cell className="text-right tabular-nums">
                              {formatNumber(d.sessions, locale)}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </Container>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Container className="divide-y p-0">
                  <div className="px-6 py-4">
                    <Heading level="h2">{t("analytics.traffic.landingPagesTitle")}</Heading>
                  </div>
                  {!(acq.landing_pages?.length) ? (
                    <EmptyBlock text={t("analytics.empty")} />
                  ) : (
                    <Table>
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell>{t("analytics.columns.path")}</Table.HeaderCell>
                          <Table.HeaderCell className="text-right">
                            {t("analytics.columns.views")}
                          </Table.HeaderCell>
                          <Table.HeaderCell className="text-right">
                            {t("analytics.columns.visitors")}
                          </Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {acq.landing_pages.map((p) => (
                          <Table.Row key={p.path}>
                            <Table.Cell className="max-w-[260px] truncate font-mono text-xs">
                              {p.path}
                            </Table.Cell>
                            <Table.Cell className="text-right tabular-nums">
                              {formatNumber(p.pageviews, locale)}
                            </Table.Cell>
                            <Table.Cell className="text-right tabular-nums">
                              {formatNumber(p.visitors, locale)}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </Container>

                <Container className="divide-y p-0">
                  <div className="px-6 py-4">
                    <Heading level="h2">{t("analytics.traffic.utmTitle")}</Heading>
                  </div>
                  {!(acq.utm_campaigns?.length) ? (
                    <EmptyBlock text={t("analytics.traffic.utmEmpty")} />
                  ) : (
                    <Table>
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell>{t("analytics.columns.campaign")}</Table.HeaderCell>
                          <Table.HeaderCell>{t("analytics.columns.sourceMedium")}</Table.HeaderCell>
                          <Table.HeaderCell className="text-right">
                            {t("analytics.traffic.sessions")}
                          </Table.HeaderCell>
                          <Table.HeaderCell className="text-right">
                            {t("analytics.columns.visitors")}
                          </Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {acq.utm_campaigns.map((u, idx) => (
                          <Table.Row key={`${u.source}-${u.medium}-${u.campaign}-${idx}`}>
                            <Table.Cell className="font-medium">{u.campaign}</Table.Cell>
                            <Table.Cell className="text-xs text-ui-fg-subtle">
                              {u.source} / {u.medium}
                            </Table.Cell>
                            <Table.Cell className="text-right tabular-nums">
                              {formatNumber(u.sessions, locale)}
                            </Table.Cell>
                            <Table.Cell className="text-right tabular-nums">
                              {formatNumber(u.visitors, locale)}
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  )}
                </Container>
              </div>
            </>
          )}
        </>
      )}

      {/* VIEW 5: CUSTOMERS */}
      {activeView === "customers" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <KpiCard
              label={t("analytics.customers.totalAllTime")}
              value={formatNumber(cust?.total_customers_all_time ?? 0, locale)}
              sub={t("analytics.ranges.all")}
            />
            {cust?.new_customers !== null && cust?.new_customers !== undefined && (
              <KpiCard
                label={t("analytics.customers.newCustomers")}
                value={formatNumber(cust.new_customers, locale)}
                sub={t(`analytics.ranges.${range}`)}
              />
            )}
            <KpiCard
              label={t("analytics.customers.buyers")}
              value={formatNumber(cust?.buyers ?? 0, locale)}
              sub={t(`analytics.ranges.${range}`)}
            />
            <KpiCard
              label={t("analytics.customers.repeatCustomers")}
              value={formatNumber(cust?.repeat_customers ?? 0, locale)}
              sub={t("analytics.customers.repeatSub")}
            />
            <KpiCard
              label={t("analytics.customers.repeatRate")}
              value={`${(cust?.repeat_rate ?? 0).toFixed(1)}%`}
              sub={t(`analytics.ranges.${range}`)}
            />
            <KpiCard
              label={t("analytics.customers.avgOrdersPerCustomer")}
              value={(cust?.avg_orders_per_customer ?? 0).toFixed(2)}
              sub={t(`analytics.ranges.${range}`)}
            />
            <KpiCard
              label={t("analytics.customers.avgCustomerValue")}
              value={formatMoney(cust?.avg_customer_value ?? 0, displayCurrency, locale)}
              sub={t(`analytics.ranges.${range}`)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Container className="divide-y p-0">
              <div className="flex items-center justify-between px-6 py-4">
                <Heading level="h2">{t("analytics.customers.repeatListTitle")}</Heading>
                <Badge size="2xsmall" color="grey" className="tabular-nums">
                  {formatNumber(cust?.repeat_customers ?? 0, locale)}
                </Badge>
              </div>
              {!(cust?.repeat_rows?.length) ? (
                <EmptyBlock text={t("analytics.customers.noRepeatYet")} />
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.customer")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.orders")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.spent")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.lastOrder")}
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {cust.repeat_rows.map((row) => (
                      <Table.Row key={row.customer_id}>
                        <Table.Cell className="font-medium">
                          <Link
                            to={`/customers/${row.customer_id}`}
                            className="text-ui-fg-interactive hover:underline"
                          >
                            {row.name}
                          </Link>
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatNumber(row.order_count, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatMoney(row.net_spent, displayCurrency, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums text-xs text-ui-fg-muted">
                          {formatDateTime(row.last_order_at, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Container>

            <Container className="divide-y p-0">
              <div className="flex items-center justify-between px-6 py-4">
                <Heading level="h2">{t("analytics.customers.topListTitle")}</Heading>
                <Badge size="2xsmall" color="grey" className="tabular-nums">
                  {formatNumber(cust?.top_customers?.length ?? 0, locale)}
                </Badge>
              </div>
              {!(cust?.top_customers?.length) ? (
                <EmptyBlock text={t("analytics.empty")} />
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.customer")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.orders")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.spent")}
                      </Table.HeaderCell>
                      <Table.HeaderCell className="text-right">
                        {t("analytics.columns.lastOrder")}
                      </Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {cust.top_customers.map((row) => (
                      <Table.Row key={row.customer_id}>
                        <Table.Cell className="font-medium">
                          <Link
                            to={`/customers/${row.customer_id}`}
                            className="text-ui-fg-interactive hover:underline"
                          >
                            {row.name}
                          </Link>
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatNumber(row.order_count, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums">
                          {formatMoney(row.net_spent, displayCurrency, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right tabular-nums text-xs text-ui-fg-muted">
                          {formatDateTime(row.last_order_at, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Container>
          </div>
        </>
      )}

      {/* VIEW 6: INVENTORY & FULFILLMENT */}
      {activeView === "inventory" && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label={t("analytics.inventory.trackedVariants")}
              value={formatNumber(inv?.tracked_variants ?? 0, locale)}
            />
            <KpiCard
              label={t("analytics.inventory.totalStocked")}
              value={formatNumber(inv?.total_stocked ?? 0, locale)}
            />
            <KpiCard
              label={t("analytics.inventory.totalReserved")}
              value={formatNumber(inv?.total_reserved ?? 0, locale)}
            />
            <KpiCard
              label={t("analytics.ops.lowStock")}
              value={formatNumber(inv?.low_stock_count ?? 0, locale)}
              status={{
                label: (inv?.low_stock_count ?? 0) > 0 ? t("analytics.ops.needsAction") : t("analytics.ops.clear"),
                color: (inv?.low_stock_count ?? 0) > 0 ? "orange" : "green",
              }}
            />
            <KpiCard
              label={t("analytics.inventory.outOfStock")}
              value={formatNumber(inv?.out_of_stock_count ?? 0, locale)}
              status={{
                label: (inv?.out_of_stock_count ?? 0) > 0 ? t("analytics.ops.needsAction") : t("analytics.ops.clear"),
                color: (inv?.out_of_stock_count ?? 0) > 0 ? "red" : "green",
              }}
            />
            <KpiCard
              label={t("analytics.inventory.avgShipHours")}
              value={
                ful?.avg_hours_to_ship !== null && ful?.avg_hours_to_ship !== undefined
                  ? `${ful.avg_hours_to_ship}h`
                  : "–"
              }
              sub={
                ful?.avg_hours_to_deliver !== null && ful?.avg_hours_to_deliver !== undefined
                  ? t("analytics.inventory.avgDeliverSub", { hours: ful.avg_hours_to_deliver })
                  : t("analytics.inventory.noFulfillmentTiming")
              }
            />
          </div>

          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">{t("analytics.inventory.fulfillmentTitle")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("analytics.inventory.fulfillmentSubtitle")}
              </Text>
            </div>
            <div className="grid grid-cols-2 gap-4 px-6 py-4 sm:grid-cols-5">
              {(
                [
                  ["awaiting", ful?.awaiting_fulfillment ?? 0, "orange"],
                  ["partiallyFulfilled", ful?.partially_fulfilled ?? 0, "blue"],
                  ["fulfilled", ful?.fulfilled ?? 0, "purple"],
                  ["shipped", ful?.shipped ?? 0, "blue"],
                  ["delivered", ful?.delivered ?? 0, "green"],
                ] as const
              ).map(([key, count, color]) => (
                <div key={key} className="flex flex-col gap-y-1.5">
                  <StatusBadge color={color}>
                    {t(`analytics.inventory.stages.${key}`)}
                  </StatusBadge>
                  <Text size="xlarge" weight="plus" className="tabular-nums">
                    {formatNumber(count, locale)}
                  </Text>
                </div>
              ))}
            </div>
          </Container>

          <Container className="divide-y p-0">
            <div className="flex items-center justify-between px-6 py-4">
              <div>
                <Heading level="h2">{t("analytics.lowStock.title")}</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  {t("analytics.lowStock.subtitle")}
                </Text>
              </div>
              <Badge
                size="2xsmall"
                color={(data?.low_stock?.length ?? 0) > 0 ? "red" : "green"}
                className="tabular-nums"
              >
                {formatNumber(data?.low_stock?.length ?? 0, locale)}
              </Badge>
            </div>

            {!(data?.low_stock?.length) ? (
              <EmptyBlock text={t("analytics.lowStock.empty")} />
            ) : (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>{t("analytics.columns.product")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("analytics.columns.variant")}</Table.HeaderCell>
                    <Table.HeaderCell>{t("analytics.columns.sku")}</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("analytics.lowStock.stocked")}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("analytics.lowStock.reserved")}
                    </Table.HeaderCell>
                    <Table.HeaderCell className="text-right">
                      {t("analytics.lowStock.available")}
                    </Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.low_stock.map((row) => (
                    <Table.Row key={row.variant_id}>
                      <Table.Cell className="font-medium">
                        <Link
                          to={`/products/${row.product_id}`}
                          className="text-ui-fg-interactive hover:underline"
                        >
                          {row.product_title}
                        </Link>
                      </Table.Cell>
                      <Table.Cell>{row.variant_title}</Table.Cell>
                      <Table.Cell className="font-mono text-xs">{row.sku || "–"}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatNumber(row.stocked_quantity, locale)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatNumber(row.reserved_quantity, locale)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        <StatusBadge color={row.available_quantity <= 0 ? "red" : "orange"}>
                          {formatNumber(row.available_quantity, locale)}
                        </StatusBadge>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}
          </Container>
        </>
      )}

      {/* Accounting Footnotes */}
      <div className="flex flex-col gap-y-1 px-1">
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
          {t("analytics.footnotes.accounting")}
        </Text>
        <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
          {t("analytics.footnotes.customers")}
          {(cust?.guest_orders ?? 0) > 0
            ? ` ${t("analytics.footnotes.guestOrders", {
                count: formatNumber(cust?.guest_orders ?? 0, locale),
              })}`
            : ""}
        </Text>
      </div>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "analytics.navLabel",
  translationNs: "translation",
  icon: ChartBar,
})

export default StoreAnalyticsDashboardPage
