import { Badge, Container, StatusBadge, Text } from "@medusajs/ui"
import { useMemo, useState } from "react"
import type { AnalyticsOverviewResponse } from "../../lib/api"
import { formatMoney, formatNumber } from "./formatters"

export function DeltaBadge({
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

export function Sparkline({
  values,
  height = 28,
}: {
  values: number[]
  height?: number
}) {
  const path = useMemo(() => {
    if (!values.length) return ""
    const width = 120
    const max = Math.max(...values, 0)
    const min = Math.min(...values, 0)
    const span = max - min
    return values
      .map((v, i) => {
        const x = values.length === 1 ? width : (i / (values.length - 1)) * width
        const norm = span > 0 ? (v - min) / span : 0
        const y = height - 3 - norm * (height - 6)
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(" ")
  }, [values, height])

  if (values.length < 2) return null

  return (
    <svg viewBox={`0 0 120 ${height}`} className="h-7 w-24 shrink-0 overflow-visible">
      <path
        d={path}
        fill="none"
        className="stroke-ui-fg-interactive"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function KpiCard({
  label,
  value,
  sub,
  delta,
  inverseDelta,
  vsLabel,
  sparkValues,
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
  sparkValues?: number[]
  attention?: boolean
  status?: { label: string; color: "green" | "orange" | "red" | "grey" | "blue" }
  icon?: React.ReactNode
}) {
  return (
    <Container
      className={`flex min-h-[132px] flex-col justify-between gap-y-3 p-6 ${
        attention ? "bg-ui-tag-orange-bg" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-x-2">
        <Text size="small" leading="compact" weight="plus" className="text-ui-fg-subtle">
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

      <div className="flex items-end justify-between gap-x-3">
        <Text
          size="xlarge"
          leading="compact"
          weight="plus"
          className="tabular-nums tracking-tight text-ui-fg-base"
        >
          {value}
        </Text>
        {sparkValues && sparkValues.length >= 2 ? <Sparkline values={sparkValues} /> : null}
      </div>

      {sub ? (
        <Text size="xsmall" leading="compact" className="tabular-nums text-ui-fg-muted">
          {sub}
        </Text>
      ) : null}
    </Container>
  )
}

export function ComboTrendChart({
  data,
  currencyCode,
  locale,
  ordersLabel,
  netSalesLabel,
  refundsLabel,
  emptyLabel,
}: {
  data: AnalyticsOverviewResponse["timeseries"]
  currencyCode: string
  locale: string
  ordersLabel: string
  netSalesLabel: string
  refundsLabel: string
  emptyLabel: string
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const { maxSales, maxOrders, ordersPolyline } = useMemo(() => {
    const sVals = data.map((d) => d.net_sales)
    const oVals = data.map((d) => d.orders)
    const mSales = sVals.length ? Math.max(...sVals, 0) : 0
    const mOrders = oVals.length ? Math.max(...oVals, 0) : 0
    const width = 800
    const height = 140
    const poly =
      data.length > 1
        ? data
            .map((d, i) => {
              const x = (i / (data.length - 1)) * width
              const norm = mOrders > 0 ? d.orders / mOrders : 0
              const y = height - 8 - norm * (height - 20)
              return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
            })
            .join(" ")
        : ""
    return { maxSales: mSales, maxOrders: mOrders, ordersPolyline: poly }
  }, [data])

  if (!data.length) {
    return (
      <div className="flex h-[200px] items-center justify-center">
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
  const scaleSales = maxSales > 0 ? maxSales : 1

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex min-h-[24px] flex-wrap items-center justify-between gap-3">
        {active ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 tabular-nums">
            <Text size="small" weight="plus" className="text-ui-fg-base">
              {active.bucket}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {netSalesLabel}:{" "}
              <span className="font-medium text-ui-fg-base">
                {formatMoney(active.net_sales, currencyCode, locale)}
              </span>
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {ordersLabel}:{" "}
              <span className="font-medium text-ui-fg-interactive">
                {formatNumber(active.orders, locale)}
              </span>
            </Text>
            {active.refunds > 0 && (
              <Text size="small" className="text-ui-fg-subtle">
                {refundsLabel}:{" "}
                <span className="font-medium text-ui-fg-base">
                  {formatMoney(active.refunds, currencyCode, locale)}
                </span>
              </Text>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-x-4 text-xs">
            <div className="flex items-center gap-x-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-ui-fg-base" />
              <Text size="xsmall" className="text-ui-fg-subtle">
                {netSalesLabel}
              </Text>
            </div>
            <div className="flex items-center gap-x-1.5">
              <span className="inline-block h-0.5 w-3.5 bg-ui-fg-interactive" />
              <Text size="xsmall" className="text-ui-fg-subtle">
                {ordersLabel}
              </Text>
            </div>
          </div>
        )}
        <Text size="xsmall" className="tabular-nums text-ui-fg-muted">
          Max: {formatMoney(maxSales, currencyCode, locale)} · {formatNumber(maxOrders, locale)}{" "}
          {ordersLabel}
        </Text>
      </div>

      <div
        className="relative h-44 border-b border-ui-border-base pb-1"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <div className="flex h-full items-end gap-[3px]">
          {data.map((pt, idx) => {
            const heightPct = pt.net_sales > 0 ? Math.max((pt.net_sales / scaleSales) * 100, 6) : 3
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
                    pt.net_sales > 0
                      ? isHovered
                        ? "bg-ui-fg-subtle"
                        : "bg-ui-fg-base/80"
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

        {ordersPolyline ? (
          <svg
            viewBox="0 0 800 140"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <path
              d={ordersPolyline}
              fill="none"
              className="stroke-ui-fg-interactive"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ) : null}
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

export function ShareBarRow({
  label,
  valueText,
  pct,
  barTone = "base",
}: {
  label: string
  valueText: string
  pct: number
  barTone?: "base" | "interactive"
}) {
  return (
    <div className="flex flex-col gap-y-1.5">
      <div className="flex items-baseline justify-between gap-x-3">
        <Text size="small" weight="plus" className="truncate">
          {label}
        </Text>
        <Text size="small" className="shrink-0 tabular-nums text-ui-fg-subtle">
          {valueText}
        </Text>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ui-bg-subtle">
        <div
          className={`h-2 rounded-full transition-all ${
            barTone === "interactive" ? "bg-ui-bg-interactive" : "bg-ui-fg-base"
          }`}
          style={{ width: `${Math.min(100, Math.max(pct, pct > 0 ? 4 : 0))}%` }}
        />
      </div>
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[140px] items-center justify-center px-6 py-8 text-center">
      <Text size="small" className="text-ui-fg-subtle">
        {text}
      </Text>
    </div>
  )
}
