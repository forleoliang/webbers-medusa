// Review translations live inside the review's `metadata.translations` JSON object, keyed by language.
// Pure helpers only (no imports) so they can be shared by both the server build and the admin (vite) build.

/** The `source_*` fields record the exact text translated so edited reviews show up as outdated. */
export type ReviewTranslation = {
  title: string | null;
  body: string | null;
  source_title: string | null;
  source_body: string | null;
  translated_at?: string;
};

export type TranslatableReview = {
  title?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const getReviewTranslationsMap = (
  review: TranslatableReview | null | undefined
): Record<string, ReviewTranslation> => {
  const raw = review?.metadata?.translations;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, ReviewTranslation>;
};

export const getReviewTranslation = (
  review: TranslatableReview | null | undefined,
  language: string
): ReviewTranslation | undefined => getReviewTranslationsMap(review)[language];

export const isReviewTranslationCurrent = (
  review: TranslatableReview | null | undefined,
  language: string
): boolean => {
  const translation = getReviewTranslation(review, language);
  return (
    !!translation &&
    translation.source_title === (review?.title ?? null) &&
    translation.source_body === (review?.body ?? null)
  );
};
