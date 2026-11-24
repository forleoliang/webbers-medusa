import { ArrowUpRightOnBox, Trash } from "@medusajs/icons"
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Heading,
  Hint,
  Label,
  Prompt,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import {
  deleteReply,
  deleteReview,
  formatDateTime,
  getReview,
  getTranslationSettings,
  KEY,
  lang,
  moderateReview,
  photoUrl,
  replyReview,
  REVIEWS_KEY,
  TRANSLATION_SETTINGS_KEY,
  translateReview,
} from "../lib/api"
import { useFeatureEnabled } from "../lib/use-feature-flags"
import { getReviewTranslation, isReviewTranslationCurrent } from "../../review-translations"
import { Stars } from "./stars"
import { Loading } from "./states"
import { StatusBadge as PluginStatusBadge } from "./status-badge"
import { StatusBadge as UiStatusBadge } from "@medusajs/ui"

/** Full review for moderation: text, photos (pending ones streamed privately), approve / reject / delete, public reply. */
export const ReviewDrawer = ({
  id,
  onClose,
}: {
  id: string | null
  onClose: () => void
}) => {
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const qc = useQueryClient()
  const translationsFeatureEnabled = useFeatureEnabled("reviewTranslations")
  const { data, isLoading } = useQuery({
    queryKey: [...REVIEWS_KEY, "one", id],
    queryFn: () => getReview(id as string),
    enabled: !!id,
  })
  const { data: translationSettings } = useQuery({
    queryKey: TRANSLATION_SETTINGS_KEY,
    queryFn: getTranslationSettings,
    staleTime: 60_000,
    enabled: !!id && translationsFeatureEnabled,
  })
  const review = data?.review
  const [reason, setReason] = useState("")
  const [reply, setReply] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setReply(review?.reply?.body ?? "")
    setReason(review?.reject_reason ?? "")
  }, [review?.id, review?.reply?.body, review?.reject_reason])

  const refresh = () => qc.invalidateQueries({ queryKey: KEY })
  const onError = (e: Error) => toast.error(e.message)

  const moderate = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      moderateReview(
        id as string,
        status,
        status === "rejected" ? reason.trim() || undefined : undefined
      ),
    onSuccess: (r) => {
      toast.success(t(`reviews.toast.${r.review.status}`))
      refresh()
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: () => deleteReview(id as string),
    onSuccess: () => {
      toast.success(t("reviews.toast.deleted"))
      refresh()
      onClose()
    },
    onError,
  })

  const saveReply = useMutation({
    mutationFn: () => replyReview(id as string, reply.trim()),
    onSuccess: () => {
      toast.success(t("reviews.toast.replied"))
      refresh()
    },
    onError,
  })

  const removeReply = useMutation({
    mutationFn: () => deleteReply(id as string),
    onSuccess: () => {
      toast.success(t("reviews.toast.replyRemoved"))
      refresh()
    },
    onError,
  })

  const translateMutation = useMutation({
    mutationFn: () => translateReview(id as string),
    onSuccess: () => {
      toast.success(t("reviews.toast.translated"))
      refresh()
    },
    onError,
  })

  const isBusy =
    moderate.isPending ||
    remove.isPending ||
    saveReply.isPending ||
    removeReply.isPending ||
    translateMutation.isPending

  return (
    <Drawer open={!!id} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title asChild>
            <Heading>{t("reviews.drawer.title")}</Heading>
          </Drawer.Title>
        </Drawer.Header>

        <Drawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
          {isLoading || !review ? (
            <Loading />
          ) : (
            <>
              {/* Review Overview Card */}
              <div className="bg-ui-bg-component shadow-elevation-card-rest flex flex-col gap-3 rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars rating={review.rating} size={16} />
                    <Text
                      as="span"
                      size="xsmall"
                      leading="compact"
                      weight="plus"
                      family="mono"
                      className="text-ui-fg-base tabular-nums"
                    >
                      {review.rating}.0 / 5
                    </Text>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <PluginStatusBadge status={review.status} />
                    {review.verified && (
                      <Badge size="2xsmall" color="green">
                        {t("reviews.verified")}
                      </Badge>
                    )}
                    {review.source !== "store" && (
                      <Badge size="2xsmall" color="grey">
                        {t("reviews.source", { source: review.source })}
                      </Badge>
                    )}
                  </div>
                </div>

                {review.title && (
                  <Text size="small" leading="compact" weight="plus" className="text-ui-fg-base">
                    {review.title}
                  </Text>
                )}

                <Text size="small" className="text-ui-fg-subtle whitespace-pre-wrap">
                  {review.body}
                </Text>

                <div className="border-ui-border-base flex flex-wrap items-center justify-between gap-1 border-t pt-2">
                  <Text as="span" size="xsmall" leading="compact" className="text-ui-fg-muted">
                    {review.display_name} {review.email ? `(${review.email})` : ""}
                  </Text>
                  <Text as="span" size="xsmall" leading="compact" className="text-ui-fg-muted">
                    {formatDateTime(review.created_at, l)}
                  </Text>
                </div>
              </div>

              {/* Linked Product & Order */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border-ui-border-base bg-ui-bg-subtle flex flex-col gap-1 rounded-lg border p-3">
                  <Text size="xsmall" leading="compact" weight="plus" className="text-ui-fg-subtle">
                    {t("reviews.columns.product")}
                  </Text>
                  <Link
                    to={`/products/${review.product_id}`}
                    className="txt-compact-small text-ui-fg-interactive flex items-center gap-1.5 truncate hover:underline"
                  >
                    <ArrowUpRightOnBox width={14} height={14} className="shrink-0" />
                    <span className="truncate">{review.product_title ?? review.product_id}</span>
                  </Link>
                </div>
                <div className="border-ui-border-base bg-ui-bg-subtle flex flex-col gap-1 rounded-lg border p-3">
                  <Text size="xsmall" leading="compact" weight="plus" className="text-ui-fg-subtle">
                    {t("reviews.columns.order")}
                  </Text>
                  <Link
                    to={`/orders/${review.order_id}`}
                    className="txt-compact-small text-ui-fg-interactive flex items-center gap-1.5 truncate hover:underline"
                  >
                    <ArrowUpRightOnBox width={14} height={14} className="shrink-0" />
                    <span className="truncate">
                      {review.order_display_id ? `#${review.order_display_id}` : review.order_id}
                    </span>
                  </Link>
                </div>
              </div>

              {/* Customer Photos */}
              {review.images.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Text size="small" leading="compact" weight="plus" className="text-ui-fg-base">
                    {t("reviews.drawer.photos", { count: review.images.length })}
                  </Text>
                  <div className="grid grid-cols-3 gap-2.5">
                    {review.images.map((img) =>
                      !img.available ? (
                        <div
                          key={img.id}
                          className="border-ui-border-base bg-ui-bg-subtle flex aspect-square items-center justify-center rounded-lg border border-dashed p-2 text-center"
                        >
                          <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
                            {t("reviews.drawer.deletedPhoto")}
                          </Text>
                        </div>
                      ) : (
                        <a
                          key={img.id}
                          href={photoUrl(review.id, img.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border-ui-border-base bg-ui-bg-subtle group relative block aspect-square overflow-hidden rounded-lg border"
                        >
                          <img
                            src={photoUrl(review.id, img.id)}
                            alt=""
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                          {!img.published && (
                            <span className="absolute bottom-1.5 left-1.5">
                              <Badge size="2xsmall" color="orange">
                                {t("reviews.drawer.private")}
                              </Badge>
                            </span>
                          )}
                        </a>
                      )
                    )}
                  </div>
                  {review.images.some((i) => i.available && !i.published) && (
                    <Hint>{t("reviews.drawer.photosHint")}</Hint>
                  )}
                </div>
              )}

              {/* Moderation Notes / History */}
              {review.status === "rejected" && review.reject_reason && (
                <Alert variant="error">
                  {t("reviews.drawer.rejectedWith", { reason: review.reject_reason })}
                </Alert>
              )}

              {review.moderated_by && (
                <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
                  {t("reviews.drawer.moderatedAt", {
                    date: formatDateTime(review.approved_at ?? review.rejected_at, l),
                  })}
                </Text>
              )}

              {/* Moderation Actions Box */}
              <div className="border-ui-border-base bg-ui-bg-subtle flex flex-col gap-3 rounded-lg border p-4">
                <Label htmlFor="review-reject-reason" size="small" weight="plus">
                  {t("reviews.drawer.moderation")}
                </Label>
                <Textarea
                  id="review-reject-reason"
                  rows={2}
                  placeholder={t("reviews.drawer.rejectReason")}
                  value={reason}
                  disabled={isBusy}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {review.status !== "approved" && (
                    <Button
                      size="small"
                      disabled={isBusy}
                      isLoading={moderate.isPending && moderate.variables === "approved"}
                      onClick={() => moderate.mutate("approved")}
                    >
                      {t("reviews.actions.approve")}
                    </Button>
                  )}
                  {review.status !== "rejected" && (
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={isBusy}
                      isLoading={moderate.isPending && moderate.variables === "rejected"}
                      onClick={() => moderate.mutate("rejected")}
                    >
                      {t("reviews.actions.reject")}
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="danger"
                    disabled={isBusy}
                    onClick={() => setConfirmDelete(true)}
                    className="ml-auto"
                  >
                    <Trash width={14} height={14} />
                    <span>{t("reviews.actions.delete")}</span>
                  </Button>
                </div>
              </div>

              {/* Store Reply Box */}
              <div className="border-ui-border-base bg-ui-bg-subtle flex flex-col gap-3 rounded-lg border p-4">
                <div className="flex flex-col gap-y-1">
                  <Label htmlFor="review-store-reply" size="small" weight="plus">
                    {t("reviews.drawer.reply")}
                  </Label>
                  <Hint>{t("reviews.drawer.replyHint")}</Hint>
                </div>
                <Textarea
                  id="review-store-reply"
                  rows={3}
                  value={reply}
                  disabled={isBusy}
                  onChange={(e) => setReply(e.target.value)}
                  maxLength={5000}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      size="small"
                      disabled={isBusy || !reply.trim() || reply.trim() === (review.reply?.body ?? "")}
                      isLoading={saveReply.isPending}
                      onClick={() => saveReply.mutate()}
                    >
                      {t("reviews.actions.saveReply")}
                    </Button>
                    {review.reply && (
                      <Button
                        size="small"
                        variant="transparent"
                        disabled={isBusy}
                        isLoading={removeReply.isPending}
                        onClick={() => removeReply.mutate()}
                      >
                        {t("reviews.actions.removeReply")}
                      </Button>
                    )}
                  </div>
                  {review.reply && (
                    <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
                      {review.reply.author_name ?? ""} ·{" "}
                      {formatDateTime(review.reply.updated_at ?? review.reply.created_at, l)}
                    </Text>
                  )}
                </div>
              </div>

              {/* Translations Box */}
              {translationsFeatureEnabled && (
                <div className="border-ui-border-base bg-ui-bg-subtle flex flex-col gap-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Text size="small" leading="compact" weight="plus" className="text-ui-fg-base">
                      {t("reviews.drawer.translations")}
                    </Text>
                    {translationSettings?.configured && (
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={isBusy}
                        isLoading={translateMutation.isPending}
                        onClick={() => translateMutation.mutate()}
                      >
                        {t("reviews.drawer.translate")}
                      </Button>
                    )}
                  </div>

                  {!translationSettings?.configured ? (
                    <Alert variant="info">{t("reviews.drawer.translationNotConfigured")}</Alert>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {translationSettings.target_languages.map((language) => {
                        const translation = getReviewTranslation(review, language)
                        const statusMeta = !translation
                          ? { color: "grey" as const, label: t("reviews.drawer.translationStatus.missing") }
                          : isReviewTranslationCurrent(review, language)
                            ? { color: "green" as const, label: t("reviews.drawer.translationStatus.current") }
                            : { color: "orange" as const, label: t("reviews.drawer.translationStatus.outdated") }
                        return (
                          <div
                            key={language}
                            className="border-ui-border-base bg-ui-bg-base flex flex-col gap-1.5 rounded-md border p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Text size="xsmall" leading="compact" weight="plus" family="mono">
                                {language.toUpperCase()}
                              </Text>
                              <UiStatusBadge color={statusMeta.color}>{statusMeta.label}</UiStatusBadge>
                            </div>
                            {translation ? (
                              <>
                                {translation.title && (
                                  <Text size="small" leading="compact" weight="plus" className="text-ui-fg-base">
                                    {translation.title}
                                  </Text>
                                )}
                                <Text size="small" className="text-ui-fg-subtle whitespace-pre-wrap">
                                  {translation.body ?? "–"}
                                </Text>
                              </>
                            ) : (
                              <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
                                –
                              </Text>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Drawer.Body>

        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button variant="secondary" size="small">
              {t("reviews.actions.close")}
            </Button>
          </Drawer.Close>
        </Drawer.Footer>
      </Drawer.Content>

      <Prompt open={confirmDelete} onOpenChange={setConfirmDelete}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>{t("reviews.confirmDelete.title")}</Prompt.Title>
            <Prompt.Description>
              {t("reviews.confirmDelete.body", { count: 1 })}
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel disabled={remove.isPending}>{t("reviews.actions.cancel")}</Prompt.Cancel>
            <Prompt.Action disabled={remove.isPending} onClick={() => remove.mutate()}>
              {t("reviews.actions.delete")}
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </Drawer>
  )
}
