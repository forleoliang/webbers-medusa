import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Heart } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Skeleton, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { RatingBars, Stars } from "../components/stars"
import { CONFIG_KEY, getConfig, getStats, STATS_KEY } from "../lib/api"
import { useFeatureEnabled } from "../lib/use-feature-flags"

/** Product page: rating summary, pending count, wishlist count, link to the moderation list. */
const ProductReviewsWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const { t } = useTranslation()
  const reviewsEnabled = useFeatureEnabled("reviews")
  const wishlistEnabled = useFeatureEnabled("wishlist")

  const { data: config } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: getConfig,
    staleTime: 60_000,
    enabled: reviewsEnabled,
  })
  const { data, isLoading } = useQuery({
    queryKey: [...STATS_KEY, product.id],
    queryFn: () => getStats(product.id),
    refetchInterval: 60_000,
    enabled: reviewsEnabled,
  })

  if (!reviewsEnabled) return null

  if (isLoading) {
    return (
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">{t("reviews.widget.product.title")}</Heading>
        </div>
        <div className="flex flex-col gap-3 px-6 py-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-20 w-full" />
        </div>
      </Container>
    )
  }

  if (!data) return null
  const rating = data.rating

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("reviews.widget.product.title")}</Heading>
        {data.pending > 0 && (
          <Badge size="2xsmall" color="orange">
            {t("reviews.widget.product.pending", { count: data.pending })}
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-3 px-6 py-4">
        {rating && rating.count > 0 ? (
          <>
            <div className="flex items-center gap-3">
              <Heading level="h1" className="font-mono tabular-nums">
                {rating.average.toFixed(1)}
              </Heading>
              <div className="flex flex-col gap-0.5">
                <Stars rating={rating.average} size={15} />
                <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
                  {t("reviews.widget.product.count", { count: rating.count })}
                </Text>
              </div>
            </div>
            <RatingBars distribution={rating.distribution} count={rating.count} />
          </>
        ) : (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {t("reviews.widget.product.none")}
          </Text>
        )}
        {wishlistEnabled && config?.wishlist.enabled && (
          <div className="border-ui-border-base flex items-center gap-2 border-t pt-3">
            <Heart width={14} height={14} className="text-ui-fg-muted shrink-0" />
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {t("reviews.widget.product.wishlisted", { count: data.wishlist_count ?? 0 })}
            </Text>
          </div>
        )}
        <Button size="small" variant="secondary" asChild className="w-full justify-center">
          <Link to={`/reviews?product_id=${product.id}`}>
            {t("reviews.widget.product.open", { count: data.total })}
          </Link>
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "product.details.side.after" })

export default ProductReviewsWidget
