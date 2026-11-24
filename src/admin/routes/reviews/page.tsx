import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CheckCircle, Eye, Photo, Star, Trash, XCircle } from "@medusajs/icons"
import {
  Alert,
  Badge,
  Button,
  Container,
  createDataTableColumnHelper,
  createDataTableCommandHelper,
  createDataTableFilterHelper,
  DataTable,
  type DataTableFilteringState,
  type DataTablePaginationState,
  type DataTableRowSelectionState,
  type DataTableSortingState,
  FocusModal,
  Heading,
  Hint,
  Input,
  Label,
  Prompt,
  Tabs,
  Text,
  toast,
  useDataTable,
} from "@medusajs/ui"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"
import { CreditFooter } from "../../components/credit-footer"
import { ReviewDrawer } from "../../components/review-drawer"
import { Stars } from "../../components/stars"
import { StatusBadge } from "../../components/status-badge"
import { useFeatureEnabled } from "../../lib/use-feature-flags"
import {
  type AdminReview,
  batchReviews,
  CONFIG_KEY,
  formatDateTime,
  getConfig,
  getStats,
  KEY,
  lang,
  listRequests,
  listReviews,
  REQUESTS_KEY,
  type ReviewFilters,
  type ReviewRequest,
  REVIEWS_KEY,
  type ReviewStatus,
  scheduleRequest,
  sendRequest,
  STATS_KEY,
} from "../../lib/api"

const PAGE_SIZE = 20

const reviewColumnHelper = createDataTableColumnHelper<AdminReview>()
const reviewFilterHelper = createDataTableFilterHelper<AdminReview>()
const reviewCommandHelper = createDataTableCommandHelper()

const requestColumnHelper = createDataTableColumnHelper<ReviewRequest>()
const requestFilterHelper = createDataTableFilterHelper<ReviewRequest>()

function sortParamToState(sortParam: string | null): DataTableSortingState | null {
  if (!sortParam || sortParam === "-created_at") {
    return { id: "created_at", desc: true }
  }
  if (sortParam === "created_at") {
    return { id: "created_at", desc: false }
  }
  if (sortParam === "-rating") {
    return { id: "rating", desc: true }
  }
  if (sortParam === "rating") {
    return { id: "rating", desc: false }
  }
  return { id: "created_at", desc: true }
}

function sortStateToParam(state: DataTableSortingState): string | null {
  if (state.id === "rating") {
    return state.desc ? "-rating" : "rating"
  }
  if (state.id === "created_at") {
    return state.desc ? null : "created_at"
  }
  return null
}

const ReviewsPage = () => {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const reviewsEnabled = useFeatureEnabled("reviews")
  const requestsEnabled = useFeatureEnabled("reviewRequests")

  if (!reviewsEnabled) {
    return (
      <Container className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div className="flex flex-col gap-y-1">
            <Heading level="h1">{t("reviews.featureDisabled.title")}</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {t("reviews.featureDisabled.description")}
            </Text>
          </div>
          <Button size="small" variant="secondary" asChild>
            <Link to="/settings/webbers-medusa">{t("reviews.featureDisabled.action")}</Link>
          </Button>
        </div>
      </Container>
    )
  }

  const tab = requestsEnabled && params.get("tab") === "requests" ? "requests" : "reviews"
  const setTab = (v: string) => {
    const next = new URLSearchParams(params)
    if (v === "requests") next.set("tab", "requests")
    else next.delete("tab")
    setParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Tabs value={tab} onValueChange={setTab}>
        <Container className="divide-y p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div className="flex flex-col gap-y-1">
              <Heading level="h1">{t("reviews.title")}</Heading>
              <Text size="small" leading="compact" className="text-ui-fg-subtle">
                {t("reviews.description")}
              </Text>
            </div>
            {requestsEnabled && (
              <Tabs.List>
                <Tabs.Trigger value="reviews">{t("reviews.tabs.reviews")}</Tabs.Trigger>
                <Tabs.Trigger value="requests">{t("reviews.tabs.requests")}</Tabs.Trigger>
              </Tabs.List>
            )}
          </div>

          <Tabs.Content value="reviews">
            <ReviewsTab />
          </Tabs.Content>
          {requestsEnabled && (
            <Tabs.Content value="requests">
              <RequestsTab />
            </Tabs.Content>
          )}
        </Container>
      </Tabs>
      <CreditFooter />
    </div>
  )
}

const ReviewsTab = () => {
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()

  const filters: ReviewFilters = {
    status: (params.get("status") as ReviewStatus) || undefined,
    product_id: params.get("product_id") ?? undefined,
    order_id: params.get("order_id") ?? undefined,
    rating: params.get("rating") ? Number(params.get("rating")) : undefined,
    has_images: params.get("photos") === "1" ? true : undefined,
    q: params.get("q") ?? undefined,
    order: params.get("sort") ?? undefined,
  }

  const [search, setSearch] = useState(filters.q ?? "")
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })
  const [rowSelection, setRowSelection] = useState<DataTableRowSelectionState>({})
  const [open, setOpen] = useState<string | null>(params.get("review"))
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null)

  const offset = pagination.pageIndex * pagination.pageSize

  const setFilter = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
    setRowSelection({})
  }

  useEffect(() => {
    const qParam = params.get("q") ?? ""
    if (search === qParam) return
    const handle = setTimeout(() => {
      setFilter("q", search.trim() || null)
    }, 300)
    return () => clearTimeout(handle)
  }, [search])

  const { data: config } = useQuery({ queryKey: CONFIG_KEY, queryFn: getConfig, staleTime: Infinity })
  const { data: stats } = useQuery({
    queryKey: [...STATS_KEY, filters.product_id],
    queryFn: () => getStats(filters.product_id),
    refetchInterval: 30_000,
  })
  const { data, isLoading, isError } = useQuery({
    queryKey: [...REVIEWS_KEY, "list", filters, offset],
    queryFn: () => listReviews(filters, offset, pagination.pageSize),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })

  const rows = data?.reviews ?? []
  const count = data?.count ?? 0

  const bulk = useMutation({
    mutationFn: (body: { ids: string[]; status?: "approved" | "rejected"; delete?: boolean }) =>
      batchReviews(body),
    onSuccess: (_r, body) => {
      toast.success(
        body.delete
          ? t("reviews.toast.deletedMany", { count: body.ids.length })
          : t(`reviews.toast.${body.status}Many`, { count: body.ids.length })
      )
      setRowSelection({})
      setDeleteIds(null)
      qc.invalidateQueries({ queryKey: KEY })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const filteringState = useMemo<DataTableFilteringState>(() => {
    const state: DataTableFilteringState = {}
    if (filters.rating) state.rating = String(filters.rating)
    if (filters.has_images) state.photos = "1"
    return state
  }, [filters.rating, filters.has_images])

  const handleFilteringChange = (nextState: DataTableFilteringState) => {
    const next = new URLSearchParams(params)
    const nextRating = typeof nextState.rating === "string" && nextState.rating ? nextState.rating : null
    const nextPhotos = nextState.photos === "1" ? "1" : null
    if (nextRating) next.set("rating", nextRating)
    else next.delete("rating")
    if (nextPhotos) next.set("photos", nextPhotos)
    else next.delete("photos")
    setParams(next, { replace: true })
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
    setRowSelection({})
  }

  const sortingState = useMemo(
    () => sortParamToState(params.get("sort")),
    [params]
  )

  const handleSortingChange = (nextSort: DataTableSortingState) => {
    setFilter("sort", sortStateToParam(nextSort))
  }

  const columns = useMemo(
    () => [
      reviewColumnHelper.select(),
      reviewColumnHelper.accessor("status", {
        header: t("reviews.columns.status"),
        cell: ({ getValue }) => <StatusBadge status={getValue()} />,
      }),
      reviewColumnHelper.accessor("rating", {
        header: t("reviews.columns.rating"),
        enableSorting: true,
        sortLabel: t("reviews.columns.rating"),
        sortAscLabel: t("reviews.sort.lowest"),
        sortDescLabel: t("reviews.sort.highest"),
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex items-center gap-1.5">
              <Stars rating={r.rating} />
              {r.images.length > 0 && (
                <Badge size="2xsmall" color="grey" title={`${r.images.length} photos`}>
                  <Photo className="h-3 w-3" />
                  <span>{r.images.length}</span>
                </Badge>
              )}
            </div>
          )
        },
      }),
      reviewColumnHelper.accessor("body", {
        header: t("reviews.columns.review"),
        truncateTooltip: false,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex max-w-md flex-col gap-0.5 py-1.5">
              {r.title && (
                <Text size="small" leading="compact" weight="plus" className="text-ui-fg-base truncate">
                  {r.title}
                </Text>
              )}
              <Text size="small" leading="compact" className="text-ui-fg-subtle truncate">
                {r.body}
              </Text>
              {r.reply && (
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge size="2xsmall" color="grey">
                    {t("reviews.replied")}
                  </Badge>
                  <Text as="span" size="xsmall" leading="compact" className="text-ui-fg-muted truncate italic">
                    "{r.reply.body}"
                  </Text>
                </div>
              )}
            </div>
          )
        },
      }),
      reviewColumnHelper.accessor((r) => r.product_title ?? r.product_id, {
        id: "product",
        header: t("reviews.columns.product"),
        cell: ({ getValue }) => getValue(),
      }),
      reviewColumnHelper.accessor("display_name", {
        header: t("reviews.columns.customer"),
        truncateTooltip: false,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex flex-col">
              <Text size="small" leading="compact" weight="plus" className="text-ui-fg-base truncate">
                {r.display_name}
              </Text>
              {r.email && (
                <Text size="xsmall" leading="compact" className="text-ui-fg-muted truncate">
                  {r.email}
                </Text>
              )}
            </div>
          )
        },
      }),
      reviewColumnHelper.accessor("created_at", {
        header: t("reviews.columns.date"),
        align: "right",
        enableSorting: true,
        sortLabel: t("reviews.columns.date"),
        sortAscLabel: t("reviews.sort.oldest"),
        sortDescLabel: t("reviews.sort.newest"),
        cell: ({ getValue }) => (
          <Text as="span" size="xsmall" leading="compact" className="text-ui-fg-muted whitespace-nowrap">
            {formatDateTime(getValue(), l)}
          </Text>
        ),
      }),
      reviewColumnHelper.action({
        actions: ({ row }) => {
          const r = row.original
          const moderationActions = [
            {
              label: t("reviews.actions.view"),
              icon: <Eye />,
              onClick: () => setOpen(r.id),
            },
            ...(r.status !== "approved"
              ? [
                  {
                    label: t("reviews.actions.approve"),
                    icon: <CheckCircle />,
                    onClick: () => bulk.mutate({ ids: [r.id], status: "approved" }),
                  },
                ]
              : []),
            ...(r.status !== "rejected"
              ? [
                  {
                    label: t("reviews.actions.reject"),
                    icon: <XCircle />,
                    onClick: () => bulk.mutate({ ids: [r.id], status: "rejected" }),
                  },
                ]
              : []),
          ]
          return [
            moderationActions,
            [
              {
                label: t("reviews.actions.delete"),
                icon: <Trash />,
                onClick: () => setDeleteIds([r.id]),
              },
            ],
          ]
        },
      }),
    ],
    [t, l, bulk]
  )

  const tableFilters = useMemo(
    () => [
      reviewFilterHelper.accessor("rating", {
        type: "radio",
        label: t("reviews.filters.rating"),
        options: [5, 4, 3, 2, 1].map((n) => ({
          label: t("reviews.filters.stars", { count: n }),
          value: String(n),
        })),
      }),
      reviewFilterHelper.custom({
        id: "photos",
        type: "radio",
        label: t("reviews.filters.photos"),
        options: [{ label: t("reviews.filters.withPhotos"), value: "1" }],
      }),
    ],
    [t]
  )

  const commands = useMemo(
    () => [
      reviewCommandHelper.command({
        label: t("reviews.actions.approve"),
        shortcut: "a",
        action: async (selection) => {
          const ids = Object.keys(selection)
          if (ids.length) await bulk.mutateAsync({ ids, status: "approved" })
        },
      }),
      reviewCommandHelper.command({
        label: t("reviews.actions.reject"),
        shortcut: "r",
        action: async (selection) => {
          const ids = Object.keys(selection)
          if (ids.length) await bulk.mutateAsync({ ids, status: "rejected" })
        },
      }),
      reviewCommandHelper.command({
        label: t("reviews.actions.delete"),
        shortcut: "d",
        action: (selection) => {
          const ids = Object.keys(selection)
          if (ids.length) setDeleteIds(ids)
        },
      }),
    ],
    [t, bulk]
  )

  const table = useDataTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    rowCount: count,
    isLoading,
    autoResetPageIndex: false,
    filters: tableFilters,
    commands,
    filtering: {
      state: filteringState,
      onFilteringChange: handleFilteringChange,
    },
    sorting: {
      state: sortingState,
      onSortingChange: handleSortingChange,
    },
    search: {
      state: search,
      onSearchChange: (val) => {
        setSearch(val)
        setPagination((prev) => ({ ...prev, pageIndex: 0 }))
        setRowSelection({})
      },
    },
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
    rowSelection: {
      state: rowSelection,
      onRowSelectionChange: setRowSelection,
    },
    onRowClick: (_e, row) => setOpen(row.id),
  })

  const STATUS_ITEMS = [
    { key: "all", label: t("reviews.summary.all") },
    { key: "pending", label: t("reviews.summary.pending") },
    { key: "approved", label: t("reviews.summary.approved") },
    { key: "rejected", label: t("reviews.summary.rejected") },
  ] as const

  const activeStatus = filters.status ?? "all"

  return (
    <div className="divide-y">
      {/* Status Summary Tabs & Scoped Context */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3">
        <Tabs
          value={activeStatus}
          onValueChange={(v) => setFilter("status", v === "all" ? null : v)}
        >
          <Tabs.List>
            {STATUS_ITEMS.map((item) => {
              const countVal = item.key === "all" ? stats?.total ?? 0 : stats?.[item.key] ?? 0
              const color = item.key === "pending" && countVal > 0 ? "orange" : "grey"
              return (
                <Tabs.Trigger key={item.key} value={item.key} className="gap-x-1.5">
                  <span>{item.label}</span>
                  <Badge size="2xsmall" rounded="full" color={color}>
                    {countVal}
                  </Badge>
                </Tabs.Trigger>
              )
            })}
          </Tabs.List>
        </Tabs>

        <div className="flex items-center gap-2">
          {config?.auto_approve && (
            <Badge size="2xsmall" color="blue">
              {t("reviews.autoApproveOn")}
            </Badge>
          )}
          {(filters.product_id || filters.order_id) && (
            <Button
              size="small"
              variant="secondary"
              onClick={() => {
                setFilter("product_id", null)
                setFilter("order_id", null)
              }}
            >
              {filters.product_id ? t("reviews.filters.clearProduct") : t("reviews.filters.clearOrder")}
            </Button>
          )}
        </div>
      </div>

      {/* Official DataTable */}
      <DataTable instance={table}>
        <DataTable.Toolbar
          className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center"
          translations={{ clearAll: t("reviews.filters.clearAll") }}
        >
          <DataTable.FilterMenu tooltip={t("reviews.filters.tooltip")} />
          <div className="flex w-full items-center gap-x-2 md:w-auto">
            <DataTable.Search placeholder={t("reviews.search")} />
            <DataTable.SortingMenu tooltip={t("reviews.sort.tooltip")} />
          </div>
        </DataTable.Toolbar>

        {isError ? (
          <div className="px-6 py-6">
            <Alert variant="error">{t("reviews.loadError")}</Alert>
          </div>
        ) : (
          <DataTable.Table
            emptyState={{
              empty: {
                heading: t("reviews.emptyHeading"),
                description: t("reviews.emptyDescription"),
              },
              filtered: {
                heading: t("reviews.emptyFilteredHeading"),
                description: t("reviews.emptyFilteredDescription"),
              },
            }}
          />
        )}

        <DataTable.CommandBar selectedLabel={(n) => t("reviews.selected", { count: n })} />
        <DataTable.Pagination
          translations={{
            of: t("reviews.paginationLabels.of"),
            results: t("reviews.paginationLabels.results"),
            pages: t("reviews.paginationLabels.pages"),
            prev: t("reviews.prev"),
            next: t("reviews.next"),
          }}
        />
      </DataTable>

      <ReviewDrawer id={open} onClose={() => setOpen(null)} />
      <Prompt open={!!deleteIds} onOpenChange={(v) => !v && setDeleteIds(null)}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>{t("reviews.confirmDelete.title")}</Prompt.Title>
            <Prompt.Description>
              {t("reviews.confirmDelete.body", { count: deleteIds?.length ?? 0 })}
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel disabled={bulk.isPending}>{t("reviews.actions.cancel")}</Prompt.Cancel>
            <Prompt.Action
              disabled={bulk.isPending}
              onClick={() => deleteIds && bulk.mutate({ ids: deleteIds, delete: true })}
            >
              {t("reviews.actions.delete")}
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </div>
  )
}

const SENDABLE = new Set(["scheduled", "sent", "failed", "expired", "skipped"])

const RequestsTab = () => {
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const qc = useQueryClient()
  const [filtering, setFiltering] = useState<DataTableFilteringState>({})
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [orderId, setOrderId] = useState("")
  const [sendMode, setSendMode] = useState<"schedule" | "send" | null>(null)

  const statusFilter =
    typeof filtering.status === "string" && filtering.status ? filtering.status : undefined
  const offset = pagination.pageIndex * pagination.pageSize

  const { data: config } = useQuery({ queryKey: CONFIG_KEY, queryFn: getConfig, staleTime: Infinity })
  const { data, isLoading, isError } = useQuery({
    queryKey: [...REQUESTS_KEY, statusFilter ?? "all", offset],
    queryFn: () => listRequests({ status: statusFilter }, offset, pagination.pageSize),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })

  const rows = data?.review_requests ?? []
  const count = data?.count ?? 0
  const onError = (e: Error) => toast.error(e.message)

  const send = useMutation({
    mutationFn: (id: string) => sendRequest(id),
    onSuccess: (r) => {
      toast[r.summary.sent ? "success" : "warning"](
        t(`reviews.requests.sendResult.${r.summary.sent ? "sent" : r.summary.skipped ? "skipped" : "failed"}`)
      )
      qc.invalidateQueries({ queryKey: REQUESTS_KEY })
    },
    onError,
  })

  const schedule = useMutation({
    mutationFn: (sendNow: boolean) => {
      setSendMode(sendNow ? "send" : "schedule")
      return scheduleRequest(orderId.trim(), sendNow)
    },
    onSuccess: (r) => {
      toast[r.status === "scheduled" || r.status === "exists" ? "success" : "warning"](
        t(`reviews.requests.scheduleResult.${r.status}`, { defaultValue: r.status })
      )
      setOrderId("")
      setScheduleOpen(false)
      setSendMode(null)
      qc.invalidateQueries({ queryKey: REQUESTS_KEY })
    },
    onError: (e: Error) => {
      setSendMode(null)
      toast.error(e.message)
    },
  })

  const columns = useMemo(
    () => [
      requestColumnHelper.accessor("status", {
        header: t("reviews.columns.status"),
        cell: ({ getValue }) => <StatusBadge status={getValue()} kind="request" />,
      }),
      requestColumnHelper.accessor("email", {
        header: t("reviews.columns.recipient"),
        truncateTooltip: false,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex flex-col py-1">
              <Text size="small" leading="compact" weight="plus" className="text-ui-fg-base truncate">
                {r.email}
              </Text>
              {r.last_error && (
                <Text size="xsmall" leading="compact" className="text-ui-fg-error truncate">
                  {r.last_error}
                </Text>
              )}
            </div>
          )
        },
      }),
      requestColumnHelper.accessor("order_id", {
        header: t("reviews.columns.order"),
        truncateTooltip: false,
        cell: ({ getValue }) => {
          const id = getValue()
          return (
            <Link to={`/orders/${id}`} className="txt-compact-small text-ui-fg-interactive hover:underline">
              {id}
            </Link>
          )
        },
      }),
      requestColumnHelper.accessor("trigger", {
        header: t("reviews.columns.trigger"),
        cell: ({ row }) => {
          const r = row.original
          return `${t(`reviews.requests.trigger.${r.trigger}`, { defaultValue: r.trigger })} +${r.delay_days}d`
        },
      }),
      requestColumnHelper.accessor("scheduled_at", {
        header: t("reviews.columns.timeline"),
        truncateTooltip: false,
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex flex-col">
              <Text as="span" size="xsmall" leading="compact" className="text-ui-fg-muted">
                {t("reviews.requests.scheduledAt", { date: formatDateTime(r.scheduled_at, l) })}
              </Text>
              {r.sent_at && (
                <Text as="span" size="xsmall" leading="compact" className="text-ui-fg-muted">
                  {t("reviews.requests.sentAt", { date: formatDateTime(r.sent_at, l) })}
                </Text>
              )}
            </div>
          )
        },
      }),
      requestColumnHelper.display({
        id: "actions",
        header: () => <div className="text-right">{t("reviews.columns.actions")}</div>,
        cell: ({ row }) => {
          const r = row.original
          if (!SENDABLE.has(r.status)) return null
          return (
            <div className="flex justify-end">
              <Button
                size="small"
                variant="secondary"
                disabled={send.isPending && send.variables === r.id}
                isLoading={send.isPending && send.variables === r.id}
                onClick={() => send.mutate(r.id)}
              >
                {r.status === "sent" ? t("reviews.requests.resend") : t("reviews.requests.sendNow")}
              </Button>
            </div>
          )
        },
      }),
    ],
    [t, l, send]
  )

  const tableFilters = useMemo(
    () => [
      requestFilterHelper.accessor("status", {
        type: "radio",
        label: t("reviews.requests.statusFilter"),
        options: ["scheduled", "sent", "used", "expired", "skipped", "failed", "opted_out"].map((s) => ({
          label: t(`reviews.requestStatus.${s}`),
          value: s,
        })),
      }),
    ],
    [t]
  )

  const table = useDataTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    rowCount: count,
    isLoading,
    autoResetPageIndex: false,
    filters: tableFilters,
    filtering: {
      state: filtering,
      onFilteringChange: (next) => {
        setFiltering(next)
        setPagination((prev) => ({ ...prev, pageIndex: 0 }))
      },
    },
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
  })

  const rr = config?.review_requests

  return (
    <div className="divide-y">
      {rr && !rr.enabled ? (
        <div className="px-6 py-3">
          <Alert variant="warning">{t("reviews.requests.disabled")}</Alert>
        </div>
      ) : rr && !rr.link_url_configured ? (
        <div className="px-6 py-3">
          <Alert variant="error">{t("reviews.requests.noLinkUrl")}</Alert>
        </div>
      ) : null}

      {rr && (
        <div className="px-6 py-3">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {t("reviews.requests.settings", {
              trigger: t(`reviews.requests.trigger.${rr.trigger}`),
              days: rr.delay_days,
              ttl: rr.token_ttl_days,
            })}
            {rr.rules > 0 ? ` ${t("reviews.requests.rules", { count: rr.rules })}` : ""}
          </Text>
        </div>
      )}

      <DataTable instance={table}>
        <DataTable.Toolbar
          className="flex flex-wrap items-center justify-between gap-2"
          translations={{ clearAll: t("reviews.filters.clearAll") }}
        >
          <DataTable.FilterMenu tooltip={t("reviews.filters.tooltip")} />
          <Button size="small" variant="secondary" onClick={() => setScheduleOpen(true)}>
            {t("reviews.requests.scheduleButton")}
          </Button>
        </DataTable.Toolbar>

        {isError ? (
          <div className="px-6 py-6">
            <Alert variant="error">{t("reviews.loadError")}</Alert>
          </div>
        ) : (
          <DataTable.Table
            emptyState={{
              empty: {
                heading: t("reviews.requests.emptyHeading"),
                description: t("reviews.requests.emptyDescription"),
              },
              filtered: {
                heading: t("reviews.requests.emptyFilteredHeading"),
                description: t("reviews.requests.emptyFilteredDescription"),
              },
            }}
          />
        )}

        <DataTable.Pagination
          translations={{
            of: t("reviews.paginationLabels.of"),
            results: t("reviews.paginationLabels.results"),
            pages: t("reviews.paginationLabels.pages"),
            prev: t("reviews.prev"),
            next: t("reviews.next"),
          }}
        />
      </DataTable>

      <FocusModal
        open={scheduleOpen}
        onOpenChange={(v) => {
          if (!schedule.isPending) {
            setScheduleOpen(v)
            if (!v) setOrderId("")
          }
        }}
      >
        <FocusModal.Content>
          <FocusModal.Header>
            <div className="flex items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button size="small" variant="secondary" disabled={schedule.isPending}>
                  {t("reviews.actions.cancel")}
                </Button>
              </FocusModal.Close>
              <Button
                size="small"
                variant="secondary"
                disabled={!orderId.trim() || schedule.isPending}
                isLoading={schedule.isPending && sendMode === "schedule"}
                onClick={() => schedule.mutate(false)}
              >
                {t("reviews.requests.schedule")}
              </Button>
              <Button
                size="small"
                disabled={!orderId.trim() || schedule.isPending}
                isLoading={schedule.isPending && sendMode === "send"}
                onClick={() => schedule.mutate(true)}
              >
                {t("reviews.requests.scheduleAndSend")}
              </Button>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col items-center py-16">
            <div className="flex w-full max-w-lg flex-col gap-y-6">
              <div className="flex flex-col gap-y-1">
                <Heading level="h1">{t("reviews.requests.modalTitle")}</Heading>
                <Text size="small" leading="compact" className="text-ui-fg-subtle">
                  {t("reviews.requests.modalDescription")}
                </Text>
              </div>
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="review-request-order-id" size="small" weight="plus">
                  {t("reviews.requests.orderIdLabel")}
                </Label>
                <Input
                  id="review-request-order-id"
                  placeholder={t("reviews.requests.orderIdPlaceholder")}
                  value={orderId}
                  disabled={schedule.isPending}
                  onChange={(e) => setOrderId(e.target.value)}
                />
                <Hint>{t("reviews.requests.orderIdHint")}</Hint>
              </div>
            </div>
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "reviews.label",
  translationNs: "translation",
  icon: Star,
})

export const handle = {
  breadcrumb: () => <Breadcrumb />,
}

const Breadcrumb = () => {
  const { t } = useTranslation()
  return <>{t("reviews.label")}</>
}

export default ReviewsPage
