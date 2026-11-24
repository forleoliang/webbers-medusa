import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ArrowDownTray, ChartBar } from "@medusajs/icons"
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Select,
  StatusBadge,
  Tabs,
  Text,
  toast,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { formatNumber, type TranslateFn } from "../../components/analytics/formatters"
import { CustomersView, InventoryReportsView, TrafficView } from "../../components/analytics/views-traffic-customers-inventory"
import { LiveView, OverviewView } from "../../components/analytics/views-overview-live"
import { ProductsView, SalesView } from "../../components/analytics/views-sales-products"
import {
  ANALYTICS_KEY,
  type AnalyticsExportType,
  type AnalyticsFilters,
  type AnalyticsGranularityOption,
  type AnalyticsRange,
  analyticsExportUrl,
  formatDateTime,
  getAnalyticsAcquisition,
  getAnalyticsOverview,
} from "../../lib/api"
import { useFeatureEnabled } from "../../lib/use-feature-flags"

type DashboardView =
  | "overview"
  | "live"
  | "sales"
  | "products"
  | "traffic"
  | "customers"
  | "inventory"

const AUTO_REFRESH_MS = 30 * 60 * 1000
const RANGES: AnalyticsRange[] = ["all", "12m", "90d", "30d", "7d", "custom"]
const VIEWS: DashboardView[] = [
  "overview",
  "live",
  "sales",
  "products",
  "traffic",
  "customers",
  "inventory",
]

function defaultCustomFrom(): string {
  const d = new Date(Date.now() - 29 * 86400_000)
  return d.toISOString().slice(0, 10)
}

function defaultCustomTo(): string {
  return new Date().toISOString().slice(0, 10)
}

const StoreAnalyticsDashboardPage = () => {
  const { t: rawT, i18n } = useTranslation()
  const t = rawT as unknown as TranslateFn
  const locale = i18n.language || "en"
  const enabled = useFeatureEnabled("storeAnalytics")

  const [activeView, setActiveView] = useState<DashboardView>("overview")
  const [range, setRange] = useState<AnalyticsRange>("all")
  const [customFrom, setCustomFrom] = useState<string>(defaultCustomFrom)
  const [customTo, setCustomTo] = useState<string>(defaultCustomTo)
  const [granularity, setGranularity] = useState<AnalyticsGranularityOption>("auto")
  const [channelId, setChannelId] = useState<string>("all")
  const [regionId, setRegionId] = useState<string>("all")
  const [currencyCode, setCurrencyCode] = useState<string>("auto")
  const [exportingType, setExportingType] = useState<AnalyticsExportType | null>(null)

  const filters: AnalyticsFilters = useMemo(
    () => ({
      range,
      from: range === "custom" ? customFrom : undefined,
      to: range === "custom" ? customTo : undefined,
      granularity,
      channel_id: channelId === "all" ? undefined : channelId,
      region_id: regionId === "all" ? undefined : regionId,
      currency_code: currencyCode === "auto" ? undefined : currencyCode,
    }),
    [range, customFrom, customTo, granularity, channelId, regionId, currencyCode]
  )

  const overviewQuery = useQuery({
    queryKey: [...ANALYTICS_KEY, "overview", filters],
    queryFn: () => getAnalyticsOverview(filters),
    enabled,
    staleTime: 60_000,
    refetchInterval: AUTO_REFRESH_MS,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  })

  const acquisitionQuery = useQuery({
    queryKey: [
      ...ANALYTICS_KEY,
      "acquisition",
      range,
      range === "custom" ? customFrom : "",
      range === "custom" ? customTo : "",
    ],
    queryFn: () =>
      getAnalyticsAcquisition({
        range,
        from: range === "custom" ? customFrom : undefined,
        to: range === "custom" ? customTo : undefined,
      }),
    enabled,
    staleTime: 60_000,
    refetchInterval: AUTO_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: false,
    placeholderData: keepPreviousData,
  })

  const handleExportCsv = async (type: AnalyticsExportType = "orders") => {
    setExportingType(type)
    try {
      const url = analyticsExportUrl(filters, type)
      const resp = await fetch(url, { credentials: "include" })
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
      }
      const blob = await resp.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = `store-analytics-${type}-${range}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
      toast.success(t("analytics.exportSuccess"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("analytics.exportError"))
    } finally {
      setExportingType(null)
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
  const cust = data?.customers
  const vsLabel = range === "all" ? t("analytics.allTimeBaseline") : t("analytics.vsPrevious")
  const initialLoading = overviewQuery.isLoading && !data

  return (
    <div className="flex flex-col gap-y-6">
      {/* Spacious Header, Filters & 7-View Navigation (Zero manual Refresh button) */}
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Heading level="h1">{t("analytics.title")}</Heading>
              <Badge size="2xsmall" color="blue">
                {displayCurrency.toUpperCase()}
              </Badge>
              <StatusBadge color="grey">
                {t("analytics.autoRefreshBadge", {
                  time: data?.cached_at ? formatDateTime(data.cached_at, locale) : "–",
                })}
              </StatusBadge>
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {t("analytics.subtitle")}
            </Text>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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

            {range === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  size="small"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-[145px]"
                />
                <Text size="xsmall" className="text-ui-fg-muted">
                  –
                </Text>
                <Input
                  type="date"
                  size="small"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-[145px]"
                />
              </div>
            )}

            <Select value={channelId} onValueChange={setChannelId} size="small">
              <Select.Trigger className="w-[165px] [&_span]:truncate [&_span]:whitespace-nowrap">
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
              <Select.Trigger className="w-[165px] [&_span]:truncate [&_span]:whitespace-nowrap">
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
              onClick={() => handleExportCsv("orders")}
              isLoading={exportingType === "orders"}
            >
              <ArrowDownTray />
              {t("analytics.exportCsv")}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto px-6 py-3">
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

      {activeView === "overview" && (
        <OverviewView
          data={data}
          acq={acq}
          initialLoading={initialLoading}
          locale={locale}
          vsLabel={vsLabel}
          granularity={granularity}
          onGranularityChange={setGranularity}
          onOpenView={setActiveView}
          t={t}
        />
      )}

      {activeView === "live" && <LiveView data={data} acq={acq} locale={locale} t={t} />}

      {activeView === "sales" && (
        <SalesView
          data={data}
          locale={locale}
          vsLabel={vsLabel}
          granularity={granularity}
          onGranularityChange={setGranularity}
          t={t}
        />
      )}

      {activeView === "products" && <ProductsView data={data} acq={acq} locale={locale} t={t} />}

      {activeView === "traffic" && <TrafficView acq={acq} locale={locale} t={t} />}

      {activeView === "customers" && (
        <CustomersView data={data} range={range} locale={locale} t={t} />
      )}

      {activeView === "inventory" && (
        <InventoryReportsView
          data={data}
          locale={locale}
          exportingType={exportingType}
          onExport={handleExportCsv}
          t={t}
        />
      )}

      {/* Accounting Footnotes */}
      <div className="flex flex-col gap-y-1.5 px-1 pb-2">
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
