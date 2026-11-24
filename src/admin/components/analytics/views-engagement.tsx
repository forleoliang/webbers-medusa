import {Heart, Star} from "@medusajs/icons"
import {
  Badge,
  Button,
  Heading,
  StatusBadge,
  Text,
  Tooltip,
} from "@medusajs/ui"
import {AnalyticsCard} from "./primitives"
import {Link} from "react-router-dom"
import type {AnalyticsOverviewResponse} from "../../lib/api"
import {Stars} from "../stars"
import {formatNumber, type TranslateFn} from "./formatters"

export function EngagementView({
  data,
  locale,
  t,
}: {
  data: AnalyticsOverviewResponse | undefined
  locale: string
  t: TranslateFn
}) {
  return (
    <div className="flex flex-col gap-y-6">
      <AnalyticsCard className="p-0">
        <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-5">
          <div>
            <Heading level="h2">{t("analytics.engagement.title")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("analytics.engagement.subtitle")}
            </Text>
          </div>
          <Link to="/reviews" className="shrink-0">
            <Button
              variant="secondary"
              size="small"
              className="whitespace-nowrap"
            >
              {t("analytics.engagement.manageReviews")}
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-8 px-6 pb-5 pt-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-y-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Star className="text-ui-fg-interactive" />
              <Text size="small" weight="plus">
                {t("analytics.engagement.reviewsHeading")}
              </Text>
              {!data?.reviews.enabled && (
                <Badge size="2xsmall" color="grey">
                  {t("analytics.engagement.disabled")}
                </Badge>
              )}
            </div>
            {data?.reviews.enabled && (
              <>
                <div className="flex items-center gap-x-2">
                  <Stars rating={data.reviews.avg_rating} size={14} />
                  <Text size="small" weight="plus" className="tabular-nums">
                    {data.reviews.avg_rating.toFixed(1)}
                  </Text>
                </div>
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
                  <Tooltip
                    content={t("analytics.engagement.requestConversionHint")}
                  >
                    <StatusBadge color="blue">
                      {t("analytics.engagement.requestConversion", {
                        used: data.reviews.requests_used,
                        sent: data.reviews.requests_sent,
                        rate: data.reviews.request_conversion_rate.toFixed(1),
                      })}
                    </StatusBadge>
                  </Tooltip>
                </div>
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-y-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Heart className="text-ui-fg-subtle" />
              <Text size="small" weight="plus">
                {t("analytics.engagement.wishlistHeading")}
              </Text>
              {!data?.wishlist.enabled && (
                <Badge size="2xsmall" color="grey">
                  {t("analytics.engagement.disabled")}
                </Badge>
              )}
            </div>
            {data?.wishlist.enabled && (
              <Text size="small" className="tabular-nums text-ui-fg-subtle">
                {t("analytics.engagement.wishlistSummary", {
                  items: formatNumber(data.wishlist.total_saved_items, locale),
                  customers: formatNumber(
                    data.wishlist.customer_wishlists,
                    locale
                  ),
                  guests: formatNumber(data.wishlist.guest_wishlists, locale),
                })}
              </Text>
            )}
            {data?.wishlist.enabled &&
              (data.wishlist.top_products.length > 0 ? (
                <div className="flex flex-col gap-y-2">
                  {data.wishlist.top_products.slice(0, 5).map((item) => (
                    <div
                      key={item.product_id}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <Link
                        to={`/products/${item.product_id}`}
                        className="truncate text-ui-fg-interactive hover:underline"
                      >
                        {item.title}
                      </Link>
                      <Badge
                        size="2xsmall"
                        color="grey"
                        className="shrink-0 tabular-nums"
                      >
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
      </AnalyticsCard>
    </div>
  )
}
