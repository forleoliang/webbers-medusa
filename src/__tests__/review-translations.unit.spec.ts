import { toStoreReview } from "../lib/serialize"
import { getReviewTranslation, isReviewTranslationCurrent } from "../review-translations"

describe("review-translations", () => {
  const baseReview = {
    title: "Sharp glass",
    body: "Very neutral color cast across long exposures.",
    metadata: {
      translations: {
        de: {
          title: "Scharfes Glas",
          body: "Sehr neutrale Farbwiedergabe bei Langzeitbelichtungen.",
          source_title: "Sharp glass",
          source_body: "Very neutral color cast across long exposures.",
        },
      },
    },
  }

  it("detects up-to-date and outdated translations", () => {
    expect(getReviewTranslation(baseReview, "de")?.title).toBe("Scharfes Glas")
    expect(getReviewTranslation(baseReview, "fr")).toBeUndefined()
    expect(isReviewTranslationCurrent(baseReview, "de")).toBe(true)
    expect(isReviewTranslationCurrent({ ...baseReview, body: "Edited text" }, "de")).toBe(false)
  })

  it("exposes sanitized translations on store reviews without source_* metadata", () => {
    const store = toStoreReview({
      id: "rev_1",
      product_id: "prod_1",
      variant_id: null,
      order_id: "order_1",
      order_item_id: "item_1",
      customer_id: "cus_1",
      email: "buyer@example.com",
      display_name: "Alice B.",
      rating: 5,
      title: baseReview.title,
      body: baseReview.body,
      locale: "en",
      status: "approved",
      verified: true,
      source: "store",
      approved_at: "2026-11-24T00:00:00.000Z",
      rejected_at: null,
      moderated_by: null,
      reject_reason: null,
      metadata: baseReview.metadata,
      created_at: "2026-11-24T00:00:00.000Z",
      updated_at: "2026-11-24T00:00:00.000Z",
      images: [],
      reply: null,
    })

    expect(store.translations).toEqual({
      de: {
        title: "Scharfes Glas",
        body: "Sehr neutrale Farbwiedergabe bei Langzeitbelichtungen.",
      },
    })
  })
})
