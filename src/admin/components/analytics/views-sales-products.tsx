import {Badge, Container, Heading, Select, Table, Text} from "@medusajs/ui"
import {Link} from "react-router-dom"
import type {
  AnalyticsAcquisitionResponse,
  AnalyticsGranularityOption,
  AnalyticsOverviewResponse,
} from "../../lib/api"
import {ComboTrendChart, EmptyState, KpiCard, ShareBarRow} from "./charts"
import {
  formatMoney,
  formatNumber,
  mergeProductPerformance,
  type TranslateFn,
} from "./formatters"

export function SalesView({
  data,
  locale,
  vsLabel,
  granularity,
  onGranularityChange,
  t,
}: {
  data: AnalyticsOverviewResponse | undefined
  locale: string
  vsLabel: string
  granularity: AnalyticsGranularityOption
  onGranularityChange: (g: AnalyticsGranularityOption) => void
  t: TranslateFn
}) {
  const currency = data?.currency_code || "usd"
  const kpis = data?.kpis
  const wf = data?.finance_waterfall

  const waterfallRows = [
    {
      label: t("analytics.waterfall.grossProduct"),
      amount: wf?.gross_product_sales ?? 0,
      negative: false,
    },
    {
      label: t("analytics.waterfall.discounts"),
      amount: -(wf?.discounts ?? 0),
      negative: true,
    },
    {
      label: t("analytics.waterfall.refunds"),
      amount: -(wf?.refunds ?? 0),
      negative: true,
    },
    {
      label: t("analytics.waterfall.netProduct"),
      amount: wf?.net_product_sales ?? 0,
      bold: true,
    },
    {
      label: t("analytics.waterfall.shipping"),
      amount: wf?.shipping ?? 0,
      negative: false,
    },
    {
      label: t("analytics.waterfall.totalSales"),
      amount: wf?.total_sales ?? 0,
      bold: true,
    },
  ]

  return (
    <div className="flex flex-col gap-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("analytics.kpis.netSales")}
          value={formatMoney(kpis?.net_sales ?? 0, currency, locale)}
          delta={kpis?.net_sales_delta ?? null}
          vsLabel={vsLabel}
          sub={t("analytics.kpis.grossSub", {
            gross: formatMoney(kpis?.gross_sales ?? 0, currency, locale),
          })}
        />
        <KpiCard
          label={t("analytics.kpis.refunds")}
          value={formatMoney(kpis?.refunds ?? 0, currency, locale)}
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
          value={formatMoney(kpis?.aov ?? 0, currency, locale)}
          delta={kpis?.aov_delta ?? null}
          vsLabel={vsLabel}
          sub={t("analytics.kpis.canceledRefundLabel", {
            amount: formatMoney(kpis?.canceled_refunds ?? 0, currency, locale),
          })}
        />
      </div>

      {/* Financial Waterfall + Trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("analytics.waterfall.title")}</Heading>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("analytics.waterfall.subtitle")}
            </Text>
          </div>
          <div className="divide-y">
            {waterfallRows.map((row) => (
              <div
                key={row.label}
                className={`flex items-center justify-between px-6 py-3 tabular-nums ${
                  row.bold ? "bg-ui-bg-subtle/50 font-medium" : ""
                }`}
              >
                <Text size="small" weight={row.bold ? "plus" : "regular"}>
                  {row.label}
                </Text>
                <Text
                  size="small"
                  weight={row.bold ? "plus" : "regular"}
                  className={
                    row.negative && row.amount < 0
                      ? "text-ui-fg-muted"
                      : "text-ui-fg-base"
                  }
                >
                  {formatMoney(row.amount, currency, locale)}
                </Text>
              </div>
            ))}
          </div>
        </Container>

        <Container className="divide-y p-0 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 px-6 py-4">
            <div>
              <Heading level="h2">{t("analytics.chart.title")}</Heading>
              <Text size="xsmall" className="text-ui-fg-subtle">
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
              <Select.Trigger className="w-[140px] [&_span]:truncate [&_span]:whitespace-nowrap">
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
          <div className="px-6 py-5">
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
      </div>

      {/* Channels & Markets */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">
              {t("analytics.segments.channelsTitle")}
            </Heading>
          </div>
          {!data?.channel_breakdown?.length ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>
                      {t("analytics.columns.name")}
                    </Table.HeaderCell>
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
                      <Table.Cell className="font-medium">
                        {c.name}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatNumber(c.orders, locale)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatMoney(c.net_revenue, currency, locale)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatMoney(c.refunds, currency, locale)}
                      </Table.Cell>
                      <Table.Cell className="text-right tabular-nums">
                        {formatMoney(c.aov, currency, locale)}
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
          {!data?.region_breakdown?.length ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>
                      {t("analytics.columns.name")}
                    </Table.HeaderCell>
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
                        <Text
                          as="span"
                          size="xsmall"
                          leading="compact"
                          className="text-ui-fg-muted"
                        >
                          ({r.currency_code.toUpperCase()})
                        </Text>
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

      {/* Collections & Countries */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">
              {t("analytics.segments.collectionsTitle")}
            </Heading>
          </div>
          {!data?.collection_breakdown?.length ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    {t("analytics.columns.collection")}
                  </Table.HeaderCell>
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
                {data.collection_breakdown.map((col) => (
                  <Table.Row key={col.collection_id}>
                    <Table.Cell className="font-medium">
                      {col.title}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(col.units, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(col.orders, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatMoney(col.revenue, currency, locale)}
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
            <Heading level="h2">
              {t("analytics.segments.countriesTitle")}
            </Heading>
          </div>
          {!data?.country_breakdown?.length ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    {t("analytics.columns.country")}
                  </Table.HeaderCell>
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
                    <Table.Cell className="font-medium">
                      {c.country_code}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(c.orders, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatMoney(c.net_revenue, currency, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatMoney(c.aov, currency, locale)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
              </Table>
            </div>
          )}
        </Container>
      </div>

      {/* Promotions & Currencies */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">
              {t("analytics.segments.promotionsTitle")}
            </Heading>
          </div>
          {!data?.promotion_breakdown?.length ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    {t("analytics.columns.promoCode")}
                  </Table.HeaderCell>
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
                        <Text
                          as="span"
                          size="xsmall"
                          leading="compact"
                          weight="plus"
                          family="mono"
                        >
                          {p.code}
                        </Text>
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
                      {formatMoney(p.discount_amount, currency, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatMoney(p.net_revenue, currency, locale)}
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
            <Heading level="h2">
              {t("analytics.segments.currenciesTitle")}
            </Heading>
          </div>
          {!data?.currency_breakdown?.length ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    {t("analytics.columns.currency")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.orders")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.canceled")}
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
                      {formatMoney(c.refunded_amount, c.currency_code, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums font-medium">
                      {formatMoney(c.net_revenue, c.currency_code, locale)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
              </Table>
            </div>
          )}
        </Container>
      </div>
    </div>
  )
}

export function ProductsView({
  data,
  acq,
  locale,
  t,
}: {
  data: AnalyticsOverviewResponse | undefined
  acq: AnalyticsAcquisitionResponse | undefined
  locale: string
  t: TranslateFn
}) {
  const currency = data?.currency_code || "usd"
  const mergedProducts = mergeProductPerformance(
    data?.catalog_products || [],
    acq?.product_views
  )

  return (
    <div className="flex flex-col gap-y-6">
      {/* Unified Views -> Orders -> Revenue -> Conv% Product Matrix */}
      <Container className="divide-y p-0">
        <div className="px-6 py-5">
          <Heading level="h2">
            {t("analytics.merchandising.matrixTitle")}
          </Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("analytics.merchandising.matrixSubtitle")}
          </Text>
        </div>
        {!mergedProducts.length ? (
          <EmptyState text={t("analytics.empty")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    {t("analytics.columns.product")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.views")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.visitors")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.units")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.orders")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.revenue")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.conversion")}
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {mergedProducts.slice(0, 20).map((row) => (
                  <Table.Row key={row.product_id}>
                    <Table.Cell className="font-medium">
                      <Link
                        to={`/products/${row.product_id}`}
                        className="text-ui-fg-interactive hover:underline"
                      >
                        {row.title}
                      </Link>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(row.views, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(row.visitors, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(row.units, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(row.orders, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatMoney(row.revenue, currency, locale)}
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {row.conversion_rate !== null
                        ? `${row.conversion_rate}%`
                        : "–"}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>

      {/* Filter Sizes Share */}
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">{t("analytics.merchandising.sizes")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("analytics.merchandising.sizesSubtitle")}
          </Text>
        </div>
        {!data?.top_sizes?.length ? (
          <EmptyState text={t("analytics.empty")} />
        ) : (
          <div className="grid grid-cols-1 gap-5 px-6 py-5 md:grid-cols-2">
            {data.top_sizes.map((row) => (
              <ShareBarRow
                key={row.variant_title}
                label={row.variant_title}
                valueText={`${formatNumber(row.units, locale)} ${t("analytics.columns.units")} · ${
                  row.share_pct
                }% · ${formatMoney(row.revenue, currency, locale)}`}
                pct={row.share_pct}
                barTone="interactive"
              />
            ))}
          </div>
        )}
      </Container>

      {/* Top SKUs + Frequently Bought Together */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">{t("analytics.merchandising.skus")}</Heading>
          </div>
          {!data?.top_skus?.length ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    {t("analytics.columns.sku")}
                  </Table.HeaderCell>
                  <Table.HeaderCell>
                    {t("analytics.columns.variant")}
                  </Table.HeaderCell>
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
                        <Text size="xsmall" leading="compact" family="mono">
                          {row.sku}
                        </Text>
                        <Text
                          size="xsmall"
                          leading="compact"
                          className="text-ui-fg-subtle"
                        >
                          {row.product_title}
                        </Text>
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
                      {formatMoney(row.revenue, currency, locale)}
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
            <Heading level="h2">
              {t("analytics.merchandising.boughtTogetherTitle")}
            </Heading>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("analytics.merchandising.boughtTogetherSubtitle")}
            </Text>
          </div>
          {!data?.bought_together?.length ? (
            <EmptyState text={t("analytics.empty")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>
                    {t("analytics.columns.pair")}
                  </Table.HeaderCell>
                  <Table.HeaderCell className="text-right">
                    {t("analytics.columns.orders")}
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.bought_together.map((pair) => (
                  <Table.Row
                    key={`${pair.product_a_id}-${pair.product_b_id}`}
                  >
                    <Table.Cell>
                      <div className="flex flex-col">
                        <Text size="small" leading="compact" weight="plus">
                          {pair.product_a_title}
                        </Text>
                        <Text
                          size="xsmall"
                          leading="compact"
                          className="text-ui-fg-subtle"
                        >
                          + {pair.product_b_title}
                        </Text>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-right tabular-nums">
                      {formatNumber(pair.pair_orders, locale)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
              </Table>
            </div>
          )}
        </Container>
      </div>
    </div>
  )
}
