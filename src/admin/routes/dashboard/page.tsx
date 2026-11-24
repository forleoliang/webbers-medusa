import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowDownTray,
  ArrowPath,
  ChartBar,
  ExclamationCircle,
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
import { useQuery } from "@tanstack/react-query"
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
  getAnalyticsOverview,
  getAnalyticsTraffic,
  toIntlLocale,
} from "../../lib/api"
import { useFeatureEnabled } from "../../lib/use-feature-flags"

const RANGES: AnalyticsRange[] = ["7d", "30d", "90d", "12m", "all"]

function formatMoney(amount: number, currencyCode: string, locale: string): string {
  const code = (currencyCode || "usd").toUpperCase()
  try {
    return new Intl.NumberFormat(toIntlLocale(locale), {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${code} ${amount.toFixed(2)}`
  }
}

function formatNumber(val: number, locale: string): string {
  return new Intl.NumberFormat(toIntlLocale(locale)).format(val)
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
  if (delta === null) {
    return (
      <Text size="xsmall" className="text-ui-fg-muted">
        {vsLabel}
      </Text>
    )
  }
  const positive = delta > 0
  const neutral = delta === 0
  const good = inverse ? delta < 0 : delta > 0
  const color = neutral ? "grey" : good ? "green" : "red"
  const prefix = positive ? "+" : ""
  return (
    <Badge size="2xsmall" color={color}>
      {prefix}
      {delta.toFixed(1)}%
    </Badge>
  )
}

function RevenueChart({
  data,
  currencyCode,
  locale,
  metric,
  ordersLabel,
  netSalesLabel,
  emptyLabel,
}: {
  data: AnalyticsOverviewResponse["timeseries"]
  currencyCode: string
  locale: string
  metric: "net_sales" | "orders"
  ordersLabel: string
  netSalesLabel: string
  emptyLabel: string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const chart = useMemo(() => {
    const width = 760
    const height = 220
    const padL = 12
    const padR = 12
    const padT = 18
    const padB = 26
    const innerW = width - padL - padR
    const innerH = height - padT - padB

    const values = data.map((d) => (metric === "net_sales" ? d.net_sales : d.orders))
    const maxVal = Math.max(...values, 1)

    const points = data.map((d, i) => {
      const x =
        data.length <= 1 ? padL + innerW / 2 : padL + (i / (data.length - 1)) * innerW
      const val = metric === "net_sales" ? d.net_sales : d.orders
      const y = padT + innerH - (val / maxVal) * innerH
      return { x, y, val, d }
    })

    const linePath =
      points.length > 0
        ? points.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
        : ""

    const areaPath =
      points.length > 1
        ? `${linePath} L${points[points.length - 1].x.toFixed(1)},${(padT + innerH).toFixed(
            1
          )} L${points[0].x.toFixed(1)},${(padT + innerH).toFixed(1)} Z`
        : ""

    return { width, height, padT, innerH, points, linePath, areaPath, maxVal }
  }, [data, metric])

  if (!data.length) {
    return (
      <div className="flex h-[220px] items-center justify-center">
        <Text size="small" className="text-ui-fg-subtle">
          {emptyLabel}
        </Text>
      </div>
    )
  }

  const active = hoverIdx !== null ? chart.points[hoverIdx] : null
  const firstLabel = data[0]?.bucket ?? ""
  const midLabel = data[Math.floor(data.length / 2)]?.bucket ?? ""
  const lastLabel = data[data.length - 1]?.bucket ?? ""

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex min-h-[24px] items-center justify-between px-1">
        {active ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Text size="xsmall" weight="plus" className="text-ui-fg-base">
              {active.d.bucket}
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {netSalesLabel}:{" "}
              <span className="font-medium text-ui-fg-base">
                {formatMoney(active.d.net_sales, currencyCode, locale)}
              </span>
            </Text>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {ordersLabel}:{" "}
              <span className="font-medium text-ui-fg-base">
                {formatNumber(active.d.orders, locale)}
              </span>
            </Text>
          </div>
        ) : (
          <Text size="xsmall" className="text-ui-fg-muted">
            {firstLabel} — {lastLabel}
          </Text>
        )}
        <Text size="xsmall" className="text-ui-fg-muted">
          Max:{" "}
          {metric === "net_sales"
            ? formatMoney(chart.maxVal, currencyCode, locale)
            : formatNumber(chart.maxVal, locale)}
        </Text>
      </div>

      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-[220px] w-full overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = chart.padT + chart.innerH * (1 - step)
          return (
            <line
              key={step}
              x1={12}
              x2={chart.width - 12}
              y1={y}
              y2={y}
              className="stroke-ui-border-base"
              strokeDasharray={step === 0 ? undefined : "3 3"}
              strokeWidth={1}
            />
          )
        })}

        {chart.areaPath && (
          <path d={chart.areaPath} className="fill-ui-bg-interactive/10" />
        )}
        {chart.linePath && (
          <path
            d={chart.linePath}
            fill="none"
            className="stroke-ui-fg-interactive"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={chart.padT}
            y2={chart.padT + chart.innerH}
            className="stroke-ui-border-strong"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}

        {chart.points.map((pt, idx) => (
          <g key={pt.d.bucket}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r={hoverIdx === idx ? 4.5 : data.length <= 31 ? 2.5 : 0}
              className="fill-ui-fg-interactive stroke-ui-bg-base"
              strokeWidth={1.5}
            />
            <rect
              x={Math.max(0, pt.x - chart.width / Math.max(data.length * 2, 2))}
              y={0}
              width={chart.width / Math.max(data.length, 1)}
              height={chart.height}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(idx)}
            />
          </g>
        ))}

        <text x={12} y={chart.height - 4} className="fill-ui-fg-muted text-[10px]">
          {firstLabel}
        </text>
        {data.length > 2 && (
          <text
            x={chart.width / 2}
            y={chart.height - 4}
            textAnchor="middle"
            className="fill-ui-fg-muted text-[10px]"
          >
            {midLabel}
          </text>
        )}
        <text
          x={chart.width - 12}
          y={chart.height - 4}
          textAnchor="end"
          className="fill-ui-fg-muted text-[10px]"
        >
          {lastLabel}
        </text>
      </svg>
    </div>
  )
}

const StoreAnalyticsDashboardPage = () => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "en"
  const enabled = useFeatureEnabled("storeAnalytics")

  const [range, setRange] = useState<AnalyticsRange>("30d")
  const [channelId, setChannelId] = useState<string>("all")
  const [regionId, setRegionId] = useState<string>("all")
  const [currencyCode, setCurrencyCode] = useState<string>("auto")
  const [chartMetric, setChartMetric] = useState<"net_sales" | "orders">("net_sales")
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
    queryKey: [...ANALYTICS_KEY, "overview", filters],
    queryFn: () => getAnalyticsOverview(filters),
    enabled,
    staleTime: 30_000,
  })

  const trafficQuery = useQuery({
    queryKey: [...ANALYTICS_KEY, "traffic", range],
    queryFn: () => getAnalyticsTraffic(range),
    enabled,
    staleTime: 60_000,
    retry: false,
  })

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
  const displayCurrency = data?.currency_code || "usd"
  const kpis = data?.kpis
  const ops = data?.operations
  const carts = data?.abandoned_carts
  const traffic = trafficQuery.data

  return (
    <div className="flex flex-col gap-y-3">
      {/* Header & Global Filters */}
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-y-1">
            <div className="flex items-center gap-x-2">
              <Heading level="h1">{t("analytics.title")}</Heading>
              {data && (
                <Badge size="2xsmall" color="blue">
                  {displayCurrency.toUpperCase()}
                </Badge>
              )}
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {t("analytics.subtitle")}
            </Text>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={range} onValueChange={(v) => setRange(v as AnalyticsRange)}>
              <Tabs.List>
                {RANGES.map((r) => (
                  <Tabs.Trigger key={r} value={r}>
                    {t(`analytics.ranges.${r}`)}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Tabs>

            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                overviewQuery.refetch()
                trafficQuery.refetch()
              }}
              isLoading={overviewQuery.isFetching}
            >
              <ArrowPath />
              {t("analytics.refresh")}
            </Button>

            <Button
              variant="secondary"
              size="small"
              onClick={handleExportCsv}
              isLoading={exporting}
            >
              <ArrowDownTray />
              {t("analytics.exportCsv")}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <div className="w-48">
            <Select value={channelId} onValueChange={setChannelId} size="small">
              <Select.Trigger>
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
          </div>

          <div className="w-48">
            <Select value={regionId} onValueChange={setRegionId} size="small">
              <Select.Trigger>
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
          </div>

          <div className="w-40">
            <Select value={currencyCode} onValueChange={setCurrencyCode} size="small">
              <Select.Trigger>
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
          </div>
        </div>
      </Container>

      {overviewQuery.isError && (
        <Alert variant="error">{t("analytics.loadError")}</Alert>
      )}

      {data?.multi_currency_warning && (
        <Alert variant="info">
          {t("analytics.multiCurrencyNotice", { currency: displayCurrency.toUpperCase() })}
        </Alert>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {overviewQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))
        ) : (
          <>
            <Container className="flex flex-col justify-between gap-y-2 p-4">
              <div className="flex items-center justify-between">
                <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
                  {t("analytics.kpis.netSales")}
                </Text>
                <DeltaBadge
                  delta={kpis?.net_sales_delta ?? null}
                  vsLabel={t("analytics.vsPrevious")}
                />
              </div>
              <Heading level="h2">
                {formatMoney(kpis?.net_sales ?? 0, displayCurrency, locale)}
              </Heading>
              <Text size="xsmall" className="text-ui-fg-muted">
                {t("analytics.kpis.netSalesSub", {
                  gross: formatMoney(kpis?.gross_sales ?? 0, displayCurrency, locale),
                  refunds: formatMoney(kpis?.refunds ?? 0, displayCurrency, locale),
                  rate: (kpis?.refund_rate ?? 0).toFixed(1),
                })}
              </Text>
            </Container>

            <Container className="flex flex-col justify-between gap-y-2 p-4">
              <div className="flex items-center justify-between">
                <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
                  {t("analytics.kpis.orders")}
                </Text>
                <DeltaBadge
                  delta={kpis?.orders_delta ?? null}
                  vsLabel={t("analytics.vsPrevious")}
                />
              </div>
              <Heading level="h2">{formatNumber(kpis?.orders_count ?? 0, locale)}</Heading>
              <Text size="xsmall" className="text-ui-fg-muted">
                {t("analytics.kpis.ordersSub", {
                  canceled: formatNumber(kpis?.canceled_orders ?? 0, locale),
                  rate: (kpis?.cancellation_rate ?? 0).toFixed(1),
                })}
              </Text>
            </Container>

            <Container className="flex flex-col justify-between gap-y-2 p-4">
              <div className="flex items-center justify-between">
                <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
                  {t("analytics.kpis.aov")}
                </Text>
                <DeltaBadge
                  delta={kpis?.aov_delta ?? null}
                  vsLabel={t("analytics.vsPrevious")}
                />
              </div>
              <Heading level="h2">
                {formatMoney(kpis?.aov ?? 0, displayCurrency, locale)}
              </Heading>
              <Text size="xsmall" className="text-ui-fg-muted">
                {t("analytics.kpis.aovSub", {
                  repeat: formatNumber(kpis?.repeat_buyers ?? 0, locale),
                  total: formatNumber(kpis?.total_customers ?? 0, locale),
                  rate: (kpis?.repeat_rate ?? 0).toFixed(1),
                })}
              </Text>
            </Container>

            <Container className="flex flex-col justify-between gap-y-2 p-4">
              <div className="flex items-center justify-between">
                <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
                  {t("analytics.kpis.abandonedCarts")}
                </Text>
                <IconBadge size="base" color="orange">
                  <ShoppingCart />
                </IconBadge>
              </div>
              <Heading level="h2">{formatNumber(carts?.total_carts ?? 0, locale)}</Heading>
              <Text size="xsmall" className="text-ui-fg-muted">
                {t("analytics.kpis.abandonedCartsSub", {
                  withEmail: formatNumber(carts?.with_email ?? 0, locale),
                  notified: formatNumber(carts?.notified ?? 0, locale),
                  value: formatMoney(carts?.potential_value ?? 0, displayCurrency, locale),
                })}
              </Text>
            </Container>
          </>
        )}
      </div>

      {/* Live Operational Queue */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Container className="flex items-center justify-between p-4">
          <div className="flex items-center gap-x-3">
            <IconBadge size="large" color={(ops?.pending_capture_count ?? 0) > 0 ? "orange" : "grey"}>
              <ShoppingBag />
            </IconBadge>
            <div className="flex flex-col">
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("analytics.ops.pendingCapture")}
              </Text>
              <Text size="base" weight="plus">
                {formatNumber(ops?.pending_capture_count ?? 0, locale)} ·{" "}
                {formatMoney(ops?.pending_capture_amount ?? 0, displayCurrency, locale)}
              </Text>
            </div>
          </div>
          <Link to="/orders">
            <Button variant="transparent" size="small">
              {t("analytics.view")}
            </Button>
          </Link>
        </Container>

        <Container className="flex items-center justify-between p-4">
          <div className="flex items-center gap-x-3">
            <IconBadge
              size="large"
              color={(ops?.awaiting_fulfillment_count ?? 0) > 0 ? "blue" : "grey"}
            >
              <Users />
            </IconBadge>
            <div className="flex flex-col">
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("analytics.ops.awaitingFulfillment")}
              </Text>
              <Text size="base" weight="plus">
                {formatNumber(ops?.awaiting_fulfillment_count ?? 0, locale)}
              </Text>
            </div>
          </div>
          <Link to="/orders">
            <Button variant="transparent" size="small">
              {t("analytics.view")}
            </Button>
          </Link>
        </Container>

        <Container className="flex items-center justify-between p-4">
          <div className="flex items-center gap-x-3">
            <IconBadge size="large" color={(ops?.low_stock_count ?? 0) > 0 ? "red" : "green"}>
              <ExclamationCircle />
            </IconBadge>
            <div className="flex flex-col">
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("analytics.ops.lowStock")}
              </Text>
              <Text size="base" weight="plus">
                {formatNumber(ops?.low_stock_count ?? 0, locale)}
              </Text>
            </div>
          </div>
          <Link to="/inventory">
            <Button variant="transparent" size="small">
              {t("analytics.view")}
            </Button>
          </Link>
        </Container>
      </div>

      {/* Revenue & Orders Trend */}
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
          {overviewQuery.isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <RevenueChart
              data={data?.timeseries || []}
              currencyCode={displayCurrency}
              locale={locale}
              metric={chartMetric}
              ordersLabel={t("analytics.kpis.orders")}
              netSalesLabel={t("analytics.kpis.netSales")}
              emptyLabel={t("analytics.empty")}
            />
          )}
        </div>
      </Container>

      {/* Product / SKU / Filter Size + Channel / Region / Currency Breakdown */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Container className="p-0 lg:col-span-2">
          <Tabs defaultValue="products">
            <div className="flex flex-col gap-2 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Heading level="h2">{t("analytics.merchandising.title")}</Heading>
              <Tabs.List>
                <Tabs.Trigger value="products">{t("analytics.merchandising.products")}</Tabs.Trigger>
                <Tabs.Trigger value="skus">{t("analytics.merchandising.skus")}</Tabs.Trigger>
                <Tabs.Trigger value="sizes">{t("analytics.merchandising.sizes")}</Tabs.Trigger>
              </Tabs.List>
            </div>

            <Tabs.Content value="products">
              {!(data?.top_products?.length) ? (
                <div className="px-6 py-8 text-center">
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("analytics.empty")}
                  </Text>
                </div>
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.product")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.units")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.orders")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.revenue")}</Table.HeaderCell>
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
                        <Table.Cell className="text-right">{formatNumber(row.units, locale)}</Table.Cell>
                        <Table.Cell className="text-right">{formatNumber(row.orders, locale)}</Table.Cell>
                        <Table.Cell className="text-right">
                          {formatMoney(row.revenue, displayCurrency, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Tabs.Content>

            <Tabs.Content value="skus">
              {!(data?.top_skus?.length) ? (
                <div className="px-6 py-8 text-center">
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("analytics.empty")}
                  </Text>
                </div>
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.sku")}</Table.HeaderCell>
                      <Table.HeaderCell>{t("analytics.columns.product")}</Table.HeaderCell>
                      <Table.HeaderCell>{t("analytics.columns.variant")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.units")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.revenue")}</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {data.top_skus.map((row) => (
                      <Table.Row key={`${row.sku}-${row.variant_title}`}>
                        <Table.Cell className="font-mono text-xs">{row.sku}</Table.Cell>
                        <Table.Cell>{row.product_title}</Table.Cell>
                        <Table.Cell>
                          <Badge size="2xsmall" color="grey">
                            {row.variant_title}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell className="text-right">{formatNumber(row.units, locale)}</Table.Cell>
                        <Table.Cell className="text-right">
                          {formatMoney(row.revenue, displayCurrency, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Tabs.Content>

            <Tabs.Content value="sizes">
              {!(data?.top_sizes?.length) ? (
                <div className="px-6 py-8 text-center">
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("analytics.empty")}
                  </Text>
                </div>
              ) : (
                <div className="flex flex-col gap-y-3 px-6 py-4">
                  {data.top_sizes.map((row) => (
                    <div key={row.variant_title} className="flex flex-col gap-y-1">
                      <div className="flex items-center justify-between text-xs">
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
                          className="h-full rounded-full bg-ui-bg-interactive"
                          style={{ width: `${Math.min(100, Math.max(2, row.share_pct))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Tabs.Content>
          </Tabs>
        </Container>

        <Container className="p-0">
          <Tabs defaultValue="channels">
            <div className="flex flex-col gap-2 border-b px-6 py-4">
              <Heading level="h2">{t("analytics.segments.title")}</Heading>
              <Tabs.List>
                <Tabs.Trigger value="channels">{t("analytics.segments.channels")}</Tabs.Trigger>
                <Tabs.Trigger value="regions">{t("analytics.segments.regions")}</Tabs.Trigger>
                <Tabs.Trigger value="currencies">{t("analytics.segments.currencies")}</Tabs.Trigger>
              </Tabs.List>
            </div>

            <Tabs.Content value="channels">
              {!(data?.channel_breakdown?.length) ? (
                <div className="px-6 py-8 text-center">
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("analytics.empty")}
                  </Text>
                </div>
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.name")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.orders")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.revenue")}</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {data.channel_breakdown.map((c) => (
                      <Table.Row key={c.channel_id}>
                        <Table.Cell>{c.name}</Table.Cell>
                        <Table.Cell className="text-right">{formatNumber(c.orders, locale)}</Table.Cell>
                        <Table.Cell className="text-right">
                          {formatMoney(c.net_revenue, displayCurrency, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Tabs.Content>

            <Tabs.Content value="regions">
              {!(data?.region_breakdown?.length) ? (
                <div className="px-6 py-8 text-center">
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("analytics.empty")}
                  </Text>
                </div>
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.name")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.orders")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.revenue")}</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {data.region_breakdown.map((r) => (
                      <Table.Row key={r.region_id}>
                        <Table.Cell>
                          {r.name}{" "}
                          <span className="text-xs text-ui-fg-muted">
                            ({r.currency_code.toUpperCase()})
                          </span>
                        </Table.Cell>
                        <Table.Cell className="text-right">{formatNumber(r.orders, locale)}</Table.Cell>
                        <Table.Cell className="text-right">
                          {formatMoney(r.net_revenue, r.currency_code, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Tabs.Content>

            <Tabs.Content value="currencies">
              {!(data?.currency_breakdown?.length) ? (
                <div className="px-6 py-8 text-center">
                  <Text size="small" className="text-ui-fg-subtle">
                    {t("analytics.empty")}
                  </Text>
                </div>
              ) : (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>{t("analytics.columns.currency")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.orders")}</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">{t("analytics.columns.revenue")}</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {data.currency_breakdown.map((c) => (
                      <Table.Row key={c.currency_code}>
                        <Table.Cell className="font-medium">
                          {c.currency_code.toUpperCase()}
                        </Table.Cell>
                        <Table.Cell className="text-right">
                          {formatNumber(c.standing_orders, locale)}
                        </Table.Cell>
                        <Table.Cell className="text-right">
                          {formatMoney(c.net_revenue, c.currency_code, locale)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
            </Tabs.Content>
          </Tabs>
        </Container>
      </div>

      {/* Storefront Traffic (PostHog) + Reviews & Wishlist Engagement */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <Heading level="h2">{t("analytics.traffic.title")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {t("analytics.traffic.subtitle")}
              </Text>
            </div>
            <Badge size="2xsmall" color={traffic?.configured ? "green" : "grey"}>
              {traffic?.configured ? "PostHog" : t("analytics.traffic.notConfigured")}
            </Badge>
          </div>
          <div className="px-6 py-4">
            {trafficQuery.isLoading ? (
              <Skeleton className="h-36 w-full" />
            ) : !traffic?.configured ? (
              <Text size="small" className="text-ui-fg-subtle">
                {t("analytics.traffic.hint")}
              </Text>
            ) : (
              <div className="flex flex-col gap-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {t("analytics.traffic.pageviews")}
                    </Text>
                    <Text size="large" weight="plus">
                      {formatNumber(traffic.pageviews ?? 0, locale)}
                    </Text>
                  </div>
                  <div>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {t("analytics.traffic.visitors")}
                    </Text>
                    <Text size="large" weight="plus">
                      {formatNumber(traffic.visitors ?? 0, locale)}
                    </Text>
                  </div>
                  <div>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {t("analytics.traffic.sessions")}
                    </Text>
                    <Text size="large" weight="plus">
                      {formatNumber(traffic.sessions ?? 0, locale)}
                    </Text>
                  </div>
                </div>

                {traffic.funnel && (
                  <div className="flex flex-col gap-y-2">
                    <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
                      {t("analytics.traffic.funnelTitle")}
                    </Text>
                    {(
                      [
                        ["productViewed", traffic.funnel.product_viewed ?? 0],
                        ["addedToCart", traffic.funnel.added_to_cart ?? 0],
                        ["checkoutStarted", traffic.funnel.checkout_started ?? 0],
                        ["orderCompleted", traffic.funnel.order_completed ?? 0],
                      ] as const
                    ).map(([key, count], _i, arr) => {
                      const top = Math.max(arr[0][1], 1)
                      const pct = Math.min(100, Math.round((count / top) * 100))
                      return (
                        <div key={key} className="flex flex-col gap-y-1">
                          <div className="flex justify-between text-xs">
                            <Text size="xsmall">{t(`analytics.traffic.steps.${key}`)}</Text>
                            <Text size="xsmall" weight="plus">
                              {formatNumber(count, locale)} ({pct}%)
                            </Text>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
                            <div
                              className="h-full rounded-full bg-ui-bg-interactive"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {traffic.sources && traffic.sources.length > 0 && (
                  <div className="flex flex-col gap-y-1">
                    <Text size="xsmall" weight="plus" className="text-ui-fg-subtle">
                      {t("analytics.traffic.sourcesTitle")}
                    </Text>
                    <div className="flex flex-wrap gap-2">
                      {traffic.sources.slice(0, 6).map((s) => (
                        <Badge key={s.source} size="2xsmall" color="grey">
                          {s.source || "(direct)"}: {formatNumber(s.visits, locale)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
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
                  <Text size="small" weight="plus">
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
                  {t("analytics.engagement.approved", {
                    count: data.reviews.approved_total,
                  })}
                </StatusBadge>
                <StatusBadge color="orange">
                  {t("analytics.engagement.pending", {
                    count: data.reviews.pending_count,
                  })}
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
                  <Text size="xsmall" className="text-ui-fg-subtle">
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
                    {data.wishlist.top_products.slice(0, 5).map((item) => (
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
                        <Badge size="2xsmall" color="grey">
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

      {/* Low Stock Alerts */}
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading level="h2">{t("analytics.lowStock.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("analytics.lowStock.subtitle")}
            </Text>
          </div>
          <Badge size="2xsmall" color={(data?.low_stock?.length ?? 0) > 0 ? "red" : "green"}>
            {formatNumber(data?.low_stock?.length ?? 0, locale)}
          </Badge>
        </div>

        {!(data?.low_stock?.length) ? (
          <div className="px-6 py-8 text-center">
            <Text size="small" className="text-ui-fg-subtle">
              {t("analytics.lowStock.empty")}
            </Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("analytics.columns.product")}</Table.HeaderCell>
                <Table.HeaderCell>{t("analytics.columns.variant")}</Table.HeaderCell>
                <Table.HeaderCell>{t("analytics.columns.sku")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("analytics.lowStock.stocked")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("analytics.lowStock.reserved")}</Table.HeaderCell>
                <Table.HeaderCell className="text-right">{t("analytics.lowStock.available")}</Table.HeaderCell>
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
                  <Table.Cell className="text-right">
                    {formatNumber(row.stocked_quantity, locale)}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {formatNumber(row.reserved_quantity, locale)}
                  </Table.Cell>
                  <Table.Cell className="text-right">
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
    </div>
  )
}

export const config = defineRouteConfig({
  label: "analytics.navLabel",
  translationNs: "translation",
  icon: ChartBar,
})

export default StoreAnalyticsDashboardPage
