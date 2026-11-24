import { Star, StarSolid } from "@medusajs/icons"
import { Text } from "@medusajs/ui"

/** Five stars, filled up to `rating` using Medusa UI semantic orange icon token. */
export const Stars = ({ rating, size = 14 }: { rating: number; size?: number }) => {
  const full = Math.round(rating)
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5"
      aria-label={`${rating} / 5`}
      title={`${rating} / 5`}
    >
      {[1, 2, 3, 4, 5].map((n) =>
        n <= full ? (
          <StarSolid
            key={n}
            width={size}
            height={size}
            className="text-ui-tag-orange-icon shrink-0"
          />
        ) : (
          <Star
            key={n}
            width={size}
            height={size}
            className="text-ui-fg-muted shrink-0 opacity-30"
          />
        )
      )}
    </span>
  )
}

export const RatingBars = ({
  distribution,
  count,
}: {
  distribution: Record<number, number>
  count: number
}) => (
  <div className="flex w-full flex-col gap-1.5">
    {[5, 4, 3, 2, 1].map((n) => {
      const c = distribution[n] ?? 0
      const pct = count ? Math.round((c / count) * 100) : 0
      return (
        <div key={n} className="flex items-center gap-2.5">
          <Text
            as="span"
            size="xsmall"
            leading="compact"
            weight="plus"
            className="text-ui-fg-subtle w-3 text-right tabular-nums"
          >
            {n}
          </Text>
          <div className="bg-ui-bg-subtle h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-ui-tag-orange-icon h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <Text
            as="span"
            size="xsmall"
            leading="compact"
            family="mono"
            className="text-ui-fg-muted w-7 text-right tabular-nums"
          >
            {c}
          </Text>
        </div>
      )
    })}
  </div>
)
