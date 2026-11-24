import {
  ExclamationCircle,
  GlobeEurope,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Users,
} from "@medusajs/icons"
import {
  Alert,
  Button,
  Container,
  Heading,
  IconBadge,
  Input,
  Select,
  Skeleton,
  StatusBadge,
  Text,
} from "@medusajs/ui"
import {useState} from "react"
import {Link} from "react-router-dom"
import type {
  AnalyticsAcquisitionResponse,
  AnalyticsGranularityOption,
  AnalyticsOverviewResponse,
} from "../../lib/api"
import {ComboTrendChart, EmptyState, KpiCard, ShareBarRow} from "./charts"
import {
  build5StepFunnel,
  formatMoney,
  formatNumber,
  generateStoreInsights,
  type TranslateFn,
} from "./formatters"

const GOAL_STORAGE_KEY = "webbers_analytics_revenue_goal"

export function OverviewView({
  data,
  acq,
  initialLoading,
  locale,
  vsLabel,
  granularity,
  onGranularityChange,
  onOpenView,
  t,
}: {
  data: AnalyticsOverviewResponse | undefined
  acq: AnalyticsAcquisitionResponse | undefined
  initialLoading: boolean
  locale: string
  vsLabel: string
  granularity: AnalyticsGranularityOption
  onGranularityChange: (g: AnalyticsGranularityOption) => void
  onOpenView: (
    view: "sales" | "products" | "traffic" | "customers" | "inventory"
  ) => void
  t: TranslateFn
}) {
  const [goalAmount, setGoalAmount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(GOAL_STORAGE_KEY)
      const n = saved ? Number(saved) : 10000
      return Number.isFinite(n) && n > 0 ? n : 10000
    } catch {
      return 10000
    }
  })
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState(() => String(goalAmount))

  const currency = data?.currency_code || "usd"
  const kpis = data?.kpis
  const ops = data?.operations
  const carts = data?.abandoned_carts
  const cust = data?.customers
  const inv = data?.inventory_summary
  const sessions = acq?.summary?.sessions ?? 0
  const visitors = acq?.summary?.visitors ?? 0
  const pageviews = acq?.summary?.pageviews ?? 0
  const storeConv =
    sessions > 0 && kpis
      ? Number(((kpis.orders_count / sessions) * 100).toFixed(2))
      : 0

  const salesSpark = (data?.timeseries || []).map((p) => p.net_sales)
  const ordersSpark = (data?.timeseries || []).map((p) => p.orders)
  const insights = generateStoreInsights(data, acq, locale, t)
  const funnelSteps = build5StepFunnel(acq)
  const goalPct =
    goalAmount > 0
      ? Math.min(100, Math.round(((kpis?.net_sales ?? 0) / goalAmount) * 100))
      : 0

  const saveGoal = () => {
    const parsed = Number(goalDraft)
    if (Number.isFinite(parsed) && parsed > 0) {
      setGoalAmount(parsed)
      try {
        localStorage.setItem(GOAL_STORAGE_KEY, String(parsed))
      } catch {
        // ignore storage restrictions
      }
    }
    setEditingGoal(false)
  }

  return (
    <div className="flex flex-col gap-y-6">
      {/* Core KPIs: sales first, then acquisition, in one consistent grid. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {initialLoading ? (
          Array.from({length: 6}).map((_, i) => (
            <Container key={i} className="min-h-[132px] p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-7 w-28" />
              <Skeleton className="mt-4 h-3 w-36" />
            </Container>
          ))
        ) : (
          <>
            <KpiCard
              label={t("analytics.kpis.netSales")}
              value={formatMoney(kpis?.net_sales ?? 0, currency, locale)}
              delta={kpis?.net_sales_delta ?? null}
              vsLabel={vsLabel}
              sparkValues={salesSpark}
              sub={t("analytics.kpis.grossAndRefundSub", {
                gross: formatMoney(kpis?.gross_sales ?? 0, currency, locale),
                refunds: formatMoney(kpis?.refunds ?? 0, currency, locale),
                rate: (kpis?.refund_rate ?? 0).toFixed(1),
              })}
            />
            <KpiCard
              label={t("analytics.kpis.orders")}
              value={formatNumber(kpis?.orders_count ?? 0, locale)}
              delta={kpis?.orders_delta ?? null}
              vsLabel={vsLabel}
              sparkValues={ordersSpark}
              sub={t("analytics.kpis.ordersSub", {
                canceled: formatNumber(kpis?.canceled_orders ?? 0, locale),
                rate: (kpis?.cancellation_rate ?? 0).toFixed(1),
              })}
            />
            <KpiCard
              label={t("analytics.kpis.aov")}
              value={formatMoney(kpis?.aov ?? 0, currency, locale)}
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
              value={
                acq?.configured && sessions > 0
                  ? `${storeConv.toFixed(2)}%`
                  : "–"
              }
              icon={<Users className="text-ui-fg-muted" />}
              sub={t("analytics.kpis.conversionSub", {
                orders: formatNumber(kpis?.orders_count ?? 0, locale),
                sessions: acq?.configured
                  ? formatNumber(sessions, locale)
                  : "0",
              })}
            />
            <KpiCard
              label={t("analytics.kpis.abandonedCarts")}
              value={formatNumber(carts?.total_carts ?? 0, locale)}
              icon={<ShoppingCart className="text-ui-fg-muted" />}
              sub={t("analytics.kpis.abandonedCartsSub", {
                withEmail: formatNumber(carts?.with_email ?? 0, locale),
                notified: formatNumber(carts?.notified ?? 0, locale),
                value: formatMoney(
                  carts?.potential_value ?? 0,
                  currency,
                  locale
                ),
              })}
            />
          </>
        )}
      </div>

      {/* Combo Trend Chart */}
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Heading level="h2">{t("analytics.chart.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("analytics.chart.subtitle")}
            </Text>
          </div>
          <Select
            size="small"
            value={granularity}
            onValueChange={(v) =>
              onGranularityChange(v as AnalyticsGranularityOption)
            }
          >
            <Select.Trigger className="w-[150px] [&_span]:truncate [&_span]:whitespace-nowrap">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="auto">
                {t("analytics.granularity.auto")}
              </Select.Item>
              <Select.Item value="day">
                {t("analytics.granularity.day")}
              </Select.Item>
              <Select.Item value="week">
                {t("analytics.granularity.week")}
              </Select.Item>
              <Select.Item value="month">
                {t("analytics.granularity.month")}
              </Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div className="px-6 py-6">
          <ComboTrendChart
            data={data?.timeseries || []}
            currencyCode={currency}
            locale={locale}
            ordersLabel={t("analytics.kpis.orders")}
            netSalesLabel={t("analytics.kpis.netSales")}
            refundsLabel={t("analytics.kpis.refunds")}
            emptyLabel={t("analytics.empty")}
          />
        </div>
      </Container>

      {/* Pending Action Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Container className="flex flex-col justify-between gap-y-4 p-6">
          <div className="flex items-center justify-between gap-x-2">
            <Text size="small" weight="plus" className="text-ui-fg-subtle">
              {t("analytics.ops.pendingCapture")}
            </Text>
            <StatusBadge
              color={(ops?.pending_capture_count ?? 0) > 0 ? "orange" : "green"}
            >
              {(ops?.pending_capture_count ?? 0) > 0
                ? t("analytics.ops.needsAction")
                : t("analytics.ops.clear")}
            </StatusBadge>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <Text size="xlarge" weight="plus" className="tabular-nums">
                {formatMoney(
                  ops?.pending_capture_amount ?? 0,
                  currency,
                  locale
                )}
              </Text>
              <Text
                size="xsmall"
                className="mt-1 block tabular-nums text-ui-fg-muted"
              >
                {t("analytics.ops.ordersPendingSub", {
                  count: formatNumber(ops?.pending_capture_count ?? 0, locale),
                })}
              </Text>
            </div>
            <Button variant="transparent" size="small" asChild>
              <Link to="/orders">{t("analytics.view")}</Link>
            </Button>
          </div>
        </Container>

        <Container className="flex flex-col justify-between gap-y-4 p-6">
          <div className="flex items-center justify-between gap-x-2">
            <Text size="small" weight="plus" className="text-ui-fg-subtle">
              {t("analytics.ops.awaitingFulfillment")}
            </Text>
            <IconBadge
              size="base"
              color={
                (ops?.awaiting_fulfillment_count ?? 0) > 0 ? "blue" : "grey"
              }
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
            <Button variant="transparent" size="small" asChild>
              <Link to="/orders">{t("analytics.view")}</Link>
            </Button>
          </div>
        </Container>

        <Container className="flex flex-col justify-between gap-y-4 p-6">
          <div className="flex items-center justify-between gap-x-2">
            <Text size="small" weight="plus" className="text-ui-fg-subtle">
              {t("analytics.ops.lowStock")}
            </Text>
            <IconBadge
              size="base"
              color={(ops?.low_stock_count ?? 0) > 0 ? "red" : "green"}
            >
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
            <Button
              variant="transparent"
              size="small"
              onClick={() => onOpenView("inventory")}
            >
              {t("analytics.view")}
            </Button>
          </div>
        </Container>
      </div>

      {/* Supporting insights follow the operational metrics and trend. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Container className="flex flex-col justify-between gap-y-3 p-6 lg:col-span-2">
          <div className="flex items-center gap-x-2">
            <Sparkles className="text-ui-fg-interactive" />
            <Heading level="h2">{t("analytics.insights.title")}</Heading>
          </div>
          {insights.length === 0 ? (
            <Text size="small" className="text-ui-fg-subtle">
              {t("analytics.insights.empty")}
            </Text>
          ) : (
            <div className="flex flex-col gap-y-2">
              {insights.map((item) => (
                <div key={item.id} className="flex items-start gap-x-2.5">
                  <StatusBadge
                    color={
                      item.tone === "warning"
                        ? "orange"
                        : item.tone === "success"
                          ? "green"
                          : "blue"
                    }
                  >
                    {t(`analytics.insights.tags.${item.tone}`)}
                  </StatusBadge>
                  <Text size="small" className="text-ui-fg-subtle">
                    {item.text}
                  </Text>
                </div>
              ))}
            </div>
          )}
        </Container>

        <Container className="flex flex-col justify-between gap-y-3 p-6">
          <div className="flex items-center justify-between gap-x-2">
            <Heading level="h2">{t("analytics.goal.title")}</Heading>
            <Button
              size="small"
              variant="transparent"
              onClick={() => {
                setGoalDraft(String(goalAmount))
                setEditingGoal((prev) => !prev)
              }}
            >
              {editingGoal
                ? t("analytics.goal.cancel")
                : t("analytics.goal.edit")}
            </Button>
          </div>

          {editingGoal ? (
            <div className="flex items-center gap-x-2">
              <Input
                type="number"
                min={1}
                size="small"
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
              />
              <Button size="small" variant="primary" onClick={saveGoal}>
                {t("analytics.goal.save")}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between tabular-nums">
                <Text size="large" weight="plus">
                  {formatMoney(kpis?.net_sales ?? 0, currency, locale)}
                </Text>
                <Text size="small" className="text-ui-fg-subtle">
                  / {formatMoney(goalAmount, currency, locale)} ({goalPct}%)
                </Text>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
                <div
                  className="h-2.5 rounded-full bg-ui-bg-interactive transition-all"
                  style={{
                    width: `${Math.max(goalPct, (kpis?.net_sales ?? 0) > 0 ? 4 : 0)}%`,
                  }}
                />
              </div>
            </>
          )}
        </Container>
      </div>

      {/* Funnel + Channel Mix Preview */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <Heading level="h2">{t("analytics.traffic.funnelTitle")}</Heading>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("analytics.traffic.funnelHint")}
              </Text>
            </div>
            <Button
              variant="transparent"
              size="small"
              onClick={() => onOpenView("traffic")}
            >
              {t("analytics.viewDetails")}
            </Button>
          </div>
          <div className="px-6 py-5">
            {!acq?.configured ? (
              <Text size="small" className="text-ui-fg-subtle">
                {t("analytics.traffic.hint")}
              </Text>
            ) : acq.error ? (
              <Alert variant="error">{acq.error}</Alert>
            ) : (
              <div className="flex flex-col gap-y-4">
                {funnelSteps.map((step) => (
                  <ShareBarRow
                    key={step.key}
                    label={t(`analytics.traffic.steps.${step.key}`)}
                    valueText={`${formatNumber(step.people, locale)} · ${step.pctOfSessions}%${
                      step.stepConversion !== null
                        ? ` (${step.stepConversion}%)`
                        : ""
                    }`}
                    pct={step.pctOfSessions}
                  />
                ))}
              </div>
            )}
          </div>
        </Container>

        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <Heading level="h2">
                {t("analytics.traffic.channelGroupsTitle")}
              </Heading>
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("analytics.traffic.channelGroupsHint")}
              </Text>
            </div>
            <Button
              variant="transparent"
              size="small"
              onClick={() => onOpenView("traffic")}
            >
              {t("analytics.viewDetails")}
            </Button>
          </div>
          <div className="px-6 py-5">
            {!acq?.configured ? (
              <Text size="small" className="text-ui-fg-subtle">
                {t("analytics.traffic.hint")}
              </Text>
            ) : !acq.channel_groups?.length ? (
              <EmptyState text={t("analytics.empty")} />
            ) : (
              <div className="flex flex-col gap-y-4">
                {(() => {
                  const total = Math.max(
                    acq.channel_groups.reduce((s, c) => s + c.pageviews, 0),
                    1
                  )
                  return acq.channel_groups.map((c) => {
                    const pct = Math.round((c.pageviews / total) * 100)
                    return (
                      <ShareBarRow
                        key={c.channel}
                        label={t(`analytics.traffic.channels.${c.channel}`)}
                        valueText={`${formatNumber(c.visitors, locale)} ${t("analytics.columns.visitors")} · ${pct}%`}
                        pct={pct}
                        barTone="interactive"
                      />
                    )
                  })
                })()}
              </div>
            )}
          </div>
        </Container>
      </div>
    </div>
  )
}
