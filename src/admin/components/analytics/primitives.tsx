import {Container, Table} from "@medusajs/ui"
import type {ComponentProps} from "react"

type AnalyticsCardProps = ComponentProps<typeof Container> & {
  /** Opt in to separators between direct card sections. */
  divided?: boolean
}

export function AnalyticsCard({
  divided = false,
  className,
  ...props
}: AnalyticsCardProps) {
  return (
    <Container
      {...props}
      className={[divided ? "divide-y" : undefined, className]
        .filter(Boolean)
        .join(" ")}
    />
  )
}

type AnalyticsTableProps = ComponentProps<typeof Table> & {
  /** Opt in to Medusa's header and row borders for denser datasets. */
  divided?: boolean
}

function AnalyticsTableRoot({
  divided = false,
  className,
  ...props
}: AnalyticsTableProps) {
  return (
    <Table
      {...props}
      className={[
        divided ? undefined : "[&_thead]:border-y-0 [&_tr]:border-b-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  )
}

export const AnalyticsTable = Object.assign(AnalyticsTableRoot, {
  Header: Table.Header,
  Body: Table.Body,
  Row: Table.Row,
  Cell: Table.Cell,
  HeaderCell: Table.HeaderCell,
})
