import { ArrowDownTray } from "@medusajs/icons"
import {
  Alert,
  Badge,
  Button,
  Container,
  Heading,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui"
import { Link } from "react-router-dom"
import {
  type AnalyticsAcquisitionResponse,
  type AnalyticsExportType,
  type AnalyticsOverviewResponse,
  type AnalyticsRange,
  formatDateTime,
} from "../../lib/api"
import { EmptyState, KpiCard, ShareBarRow } from "./charts"
import { build5StepFunnel, formatMoney, formatNumber, type TranslateFn } from "./formatters"

export function TrafficView({
  acq,
  locale,
  t,
}: {
  acq: AnalyticsAcquisitionResponse | undefined
  locale: string
  t: TranslateFn
}) {
  if (!acq?.configured) {
    return <Alert variant="info">{t("analytics.traffic.hint")}</Alert>
  }
  if (acq.error) {
    return <Alert variant="error">{acq.error}</Alert>
  }

  const steps = build5StepFunnel(acq)
  const sessionsPeople = Math.max(steps[0]?.people ?? 0, 1)
  const viewPeople = steps.find((s) => s.key === "view_item")?.people ?? 0
  const atcPeople = steps.find((s) => s.key === "add_to_cart")?.people ?? 0
  const checkoutPeople = steps.find((s) => s.key === "begin_checkout")?.people ?? 0
  const purchasePeople = steps.find((s) => s.key === "purchase")?.people ?? 0

  const atcRate = viewPeople > 0 ? ((atcPeople / viewPeople) * 100).toFixed(1) : "0.0"
  const checkoutRate =
    checkoutPeople > 0 ? ((purchasePeople / checkoutPeople) * 100).toFixed(1) : "0.0"

  const sources = acq.sources || []
  const sourcesTotal = Math.max(
    sources.reduce((sum, s) => sum + s.count, 0),
    1
  )
  const channelGroups = acq.channel_groups || []
  const channelsTotal = Math.max(
    channelGroups.reduce((sum, c) => sum + c.pageviews, 0),
    1
  )

  return (
    <div className="flex flex-col gap-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("analytics.traffic.visitors")}
          value={formatNumber(acq.summary?.visitors ?? 0, locale)}
          sub={t("analytics.traffic.sessionsSub", {
            sessions: formatNumber(acq.summary?.sessions ?? 0, locale),
          })}
        />
        <KpiCard
          label={t("analytics.traffic.pageviews")}
          value={formatNumber(acq.summary?.pageviews ?? 0, locale)}
          sub={t("analytics.traffic.productViewsCount", {
            views: formatNumber(viewPeople, locale),
          })}
        />
        <KpiCard
          label={t("analytics.traffic.atcRate")}
          value={`${atcRate}%`}
          sub={`${formatNumber(atcPeople, locale)} / ${formatNumber(viewPeople, locale)}`}
        />
        <KpiCard
          label={t("analytics.traffic.checkoutConv")}
          value={`${checkoutRate}%`}
          sub={`${formatNumber(purchasePeople, locale)} / ${formatNumber(checkoutPeople, locale)}`}
        />
      </div>

      {/* 5-Step Funnel + Smart Channel Mix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("analytics.traffic.funnelTitle")}</Heading>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("analytics.traffic.funnelHint")}
            </Text>
          </div>
          <div className="flex flex-col gap-y-4 px-6 py-5">
            {steps.map((step) => {
              const pct = step.key === "sessions" && sessionsPeople > 0 ? 100 : step.pctOfSessions
              return (
                <ShareBarRow
                  key={step.key}
                  label={t(`analytics.traffic.steps.${step.key}`)}
                  valueText={`${formatNumber(step.people, locale)} ${t(
                    "analytics.traffic.peopleUnit"
                  )} · ${pct}%${step.stepConversion !== null ? ` (${step.stepConversion}%)` : ""}`}
                  pct={pct}
                />
              )
            })}
          </div>
        </Container>

        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("analytics.traffic.channelGroupsTitle")}</Heading>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("analytics.traffic.channelGroupsHint")}
            </Text>
          </div>
          <div className="px-6 py-5">
            {channelGroups.length === 0 ? (
              <EmptyState text={t("analytics.empty")} />
            ) : (
              <div className="flex flex-col gap-y-4">
                {channelGroups.map((c) => {
                  const pct = Math.round((c.pageviews / channelsTotal) * 100)
                  return (
                    <ShareBarRow
                      key={c.channel}
                      label={t(`analytics.traffic.channels.${c.channel}`)}
                      valueText={`${formatNumber(c.visitors, locale)} ${t(
                        "analytics.columns.visitors"
                      )} · ${formatNumber(c.sessions, locale)} ${t(
                        "analytics.traffic.sessions"
                      )} · ${pct}%`}
                      pct={pct}
                      barTone="interactive"
                    />
                  )
                })}
              </div>
            )}
          </div>
        </Container>
      </div>

      {/* Sources + Countries + Devices */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("analytics.traffic.sourcesTitle")}</Heading>
          </div>
          <div className="px-6 py-5">
            {sources.length === 0 ? (
              <EmptyState text={t("analytics.empty")} />
            ) : (
              <div className="flex flex-col gap-y-3">
                {sources.map((s) => {
                  const pct = Math.round((s.count / sourcesTotal) * 100)
                  return (
                    <ShareBarRow
                      key={s.domain}
                      label={s.domain}
                      valueText={`${formatNumber(s.count, locale)} · ${pct}%`}
                      pct={pct}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </Container>

        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("analytics.traffic.countriesTitle")}</Heading>
          </div>
          {!(acq.countries?.length) ? (
            <EmptyState text={t("analytics.empty")} />
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
            <EmptyState text={t("analytics.empty")} />
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

      {/* Landing Pages + Exit Pages */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("analytics.traffic.landingPagesTitle")}</Heading>
          </div>
          {!(acq.landing_pages?.length) ? (
            <EmptyState text={t("analytics.empty")} />
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
            <Heading level="h2">{t("analytics.traffic.exitPagesTitle")}</Heading>
          </div>
          {!(acq.exit_pages?.length) ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("analytics.columns.path")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.exits")}
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {acq.exit_pages.map((p) => (
                  <Table.Row key={p.path}>
                    <Table.Cell className="max-w-[300px] truncate font-mono text-xs">
                      {p.path}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(p.exits, locale)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      </div>

      {/* UTM Campaigns */}
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("analytics.traffic.utmTitle")}</Heading>
        </div>
        {!(acq.utm_campaigns?.length) ? (
          <EmptyState text={t("analytics.traffic.utmEmpty")} />
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
  )
}

export function CustomersView({
  data,
  range,
  locale,
  t,
}: {
  data: AnalyticsOverviewResponse | undefined
  range: AnalyticsRange
  locale: string
  t: TranslateFn
}) {
  const currency = data?.currency_code || "usd"
  const cust = data?.customers
  const fvr = cust?.first_vs_returning
  const fvrTotalRev = Math.max((fvr?.first_time_revenue ?? 0) + (fvr?.returning_revenue ?? 0), 1)
  const firstPct = Math.round(((fvr?.first_time_revenue ?? 0) / fvrTotalRev) * 100)
  const returningPct = Math.max(0, 100 - firstPct)

  return (
    <div className="flex flex-col gap-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          sub={`${t("analytics.customers.repeatRate")}: ${(cust?.repeat_rate ?? 0).toFixed(1)}%`}
        />
        <KpiCard
          label={t("analytics.customers.avgOrdersPerCustomer")}
          value={(cust?.avg_orders_per_customer ?? 0).toFixed(2)}
          sub={t(`analytics.ranges.${range}`)}
        />
        <KpiCard
          label={t("analytics.customers.avgCustomerValue")}
          value={formatMoney(cust?.avg_customer_value ?? 0, currency, locale)}
          sub={t(`analytics.ranges.${range}`)}
        />
      </div>

      {/* First-Time vs Returning Split */}
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("analytics.customers.firstVsReturningTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("analytics.customers.firstVsReturningSubtitle")}
          </Text>
        </div>
        <div className="grid grid-cols-1 gap-6 px-6 py-5 md:grid-cols-2">
          <ShareBarRow
            label={t("analytics.customers.firstTime")}
            valueText={`${formatNumber(fvr?.first_time_orders ?? 0, locale)} ${t(
              "analytics.columns.orders"
            )} · ${formatMoney(fvr?.first_time_revenue ?? 0, currency, locale)} (${firstPct}%)`}
            pct={firstPct}
          />
          <ShareBarRow
            label={t("analytics.customers.returning")}
            valueText={`${formatNumber(fvr?.returning_orders ?? 0, locale)} ${t(
              "analytics.columns.orders"
            )} · ${formatMoney(fvr?.returning_revenue ?? 0, currency, locale)} (${returningPct}%)`}
            pct={returningPct}
            barTone="interactive"
          />
        </div>
      </Container>

      {/* Cohort Retention + Customers by Country */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("analytics.customers.cohortTitle")}</Heading>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("analytics.customers.cohortSubtitle")}
            </Text>
          </div>
          {!(cust?.cohorts?.length) ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("analytics.customers.cohortMonth")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.customers.cohortSize")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">+1m</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">+2m</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">+3m</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {cust.cohorts.map((c) => {
                  const pctCell = (n: number) =>
                    c.cohort_size > 0 ? `${n} (${Math.round((n / c.cohort_size) * 100)}%)` : "0"
                  return (
                    <Table.Row key={c.cohort_month}>
                      <Table.Cell className="font-mono text-xs">{c.cohort_month}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatNumber(c.cohort_size, locale)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{pctCell(c.m1)}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{pctCell(c.m2)}</Table.Cell>
                      <Table.Cell className="text-right tabular-nums">{pctCell(c.m3)}</Table.Cell>
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table>
          )}
        </Container>

        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("analytics.customers.byCountryTitle")}</Heading>
          </div>
          {!(cust?.by_country?.length) ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("analytics.columns.country")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.customers.buyers")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.orders")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.spent")}
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {cust.by_country.map((r) => (
                  <Table.Row key={r.country_code}>
                    <Table.Cell className="font-medium">{r.country_code}</Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(r.customers, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(r.orders, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatMoney(r.net_spent, currency, locale)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Container>
      </div>

      {/* Repeat & Top Customer Lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <Heading level="h2">{t("analytics.customers.repeatListTitle")}</Heading>
            <Badge size="2xsmall" color="grey" className="tabular-nums">
              {formatNumber(cust?.repeat_customers ?? 0, locale)}
            </Badge>
          </div>
          {!(cust?.repeat_rows?.length) ? (
            <EmptyState text={t("analytics.customers.noRepeatYet")} />
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
                      {formatMoney(row.net_spent, currency, locale)}
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
            <EmptyState text={t("analytics.empty")} />
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
                      {formatMoney(row.net_spent, currency, locale)}
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
    </div>
  )
}

export function InventoryReportsView({
  data,
  locale,
  exportingType,
  onExport,
  t,
}: {
  data: AnalyticsOverviewResponse | undefined
  locale: string
  exportingType: AnalyticsExportType | null
  onExport: (type: AnalyticsExportType) => void
  t: TranslateFn
}) {
  const inv = data?.inventory_summary
  const ful = data?.fulfillment_summary

  return (
    <div className="flex flex-col gap-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            label:
              (inv?.low_stock_count ?? 0) > 0
                ? t("analytics.ops.needsAction")
                : t("analytics.ops.clear"),
            color: (inv?.low_stock_count ?? 0) > 0 ? "orange" : "green",
          }}
        />
        <KpiCard
          label={t("analytics.inventory.outOfStock")}
          value={formatNumber(inv?.out_of_stock_count ?? 0, locale)}
          status={{
            label:
              (inv?.out_of_stock_count ?? 0) > 0
                ? t("analytics.ops.needsAction")
                : t("analytics.ops.clear"),
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

      {/* Mutually Exclusive Fulfillment Pipeline */}
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("analytics.inventory.fulfillmentTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("analytics.inventory.fulfillmentSubtitle")}
          </Text>
        </div>
        <div className="grid grid-cols-2 gap-6 px-6 py-5 sm:grid-cols-5">
          {(
            [
              ["awaiting", ful?.awaiting_fulfillment ?? 0, "orange"],
              ["partiallyFulfilled", ful?.partially_fulfilled ?? 0, "blue"],
              ["fulfilled", ful?.fulfilled ?? 0, "purple"],
              ["shipped", ful?.shipped ?? 0, "blue"],
              ["delivered", ful?.delivered ?? 0, "green"],
            ] as const
          ).map(([key, count, color]) => (
            <div key={key} className="flex flex-col gap-y-2">
              <StatusBadge color={color}>{t(`analytics.inventory.stages.${key}`)}</StatusBadge>
              <Text size="xlarge" weight="plus" className="tabular-nums">
                {formatNumber(count, locale)}
              </Text>
            </div>
          ))}
        </div>
      </Container>

      {/* Inventory Velocity & Est Days Remaining */}
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading level="h2">{t("analytics.inventory.velocityTitle")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("analytics.inventory.velocitySubtitle")}
            </Text>
          </div>
          <Badge size="2xsmall" color="grey" className="tabular-nums">
            {formatNumber(data?.inventory_velocity?.length ?? 0, locale)}
          </Badge>
        </div>

        {!(data?.inventory_velocity?.length) ? (
          <EmptyState text={t("analytics.inventory.noTracked")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>{t("analytics.columns.product")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("analytics.columns.variant")}</Table.HeaderCell>
                  <Table.HeaderCell>{t("analytics.columns.sku")}</Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.lowStock.available")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.inventory.units30d")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.inventory.daysRemaining")}
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.inventory_velocity.map((row) => (
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
                      <StatusBadge
                        color={
                          row.available_quantity <= 0
                            ? "red"
                            : row.available_quantity <= 5
                              ? "orange"
                              : "green"
                        }
                      >
                        {formatNumber(row.available_quantity, locale)}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(row.units_30d, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {row.days_remaining === null ? "∞" : `${row.days_remaining}d`}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>

      {/* 4-Report Export Center */}
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("analytics.reports.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("analytics.reports.subtitle")}
          </Text>
        </div>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
          {(["orders", "products", "customers", "inventory"] as const).map((type) => (
            <div
              key={type}
              className="flex flex-col justify-between gap-y-3 rounded-lg border border-ui-border-base p-4"
            >
              <div>
                <Text size="small" weight="plus">
                  {t(`analytics.reports.types.${type}.title`)}
                </Text>
                <Text size="xsmall" className="mt-1 block text-ui-fg-subtle">
                  {t(`analytics.reports.types.${type}.description`)}
                </Text>
              </div>
              <Button
                size="small"
                variant="secondary"
                onClick={() => onExport(type)}
                isLoading={exportingType === type}
              >
                <ArrowDownTray />
                {t("analytics.exportCsv")}
              </Button>
            </div>
          ))}
        </div>
      </Container>
    </div>
  )
}
