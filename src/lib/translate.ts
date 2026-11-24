import type { ReviewTranslation, TranslatableReview } from "../review-translations"
import type { ResolvedTranslationsOptions } from "./options"

const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2"

type GoogleTranslateResponse = {
  data?: { translations: { translatedText: string }[] }
  error?: { message?: string }
}

export async function translateTextsWithGoogle(
  texts: string[],
  targetLanguage: string,
  options: ResolvedTranslationsOptions
): Promise<string[]> {
  if (!options.apiKey) {
    throw new Error("Review translations are not configured (missing Google Translate API key)")
  }
  if (!texts.length) return []

  const response = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(options.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: texts,
      source: options.sourceLanguage,
      target: targetLanguage,
      format: "text",
    }),
  })
  const payload = (await response.json().catch(() => ({}))) as GoogleTranslateResponse
  if (!response.ok || !payload.data?.translations) {
    throw new Error(`Google Translate request failed (${response.status}): ${payload.error?.message ?? "unknown error"}`)
  }
  return payload.data.translations.map((t) => t.translatedText)
}

export async function translateReviewContent(
  review: TranslatableReview,
  options: ResolvedTranslationsOptions
): Promise<Record<string, ReviewTranslation>> {
  const sourceTitle = review.title ?? null
  const sourceBody = review.body ?? null
  const texts = [sourceTitle, sourceBody].filter((t): t is string => !!t?.trim())

  const titleIndex = sourceTitle?.trim() ? texts.indexOf(sourceTitle) : -1
  const bodyIndex = sourceBody?.trim() ? texts.indexOf(sourceBody) : -1
  const now = new Date().toISOString()

  const entries = await Promise.all(
    options.targetLanguages.map(async (language) => {
      const translated = await translateTextsWithGoogle(texts, language, options)
      const entry: ReviewTranslation = {
        title: titleIndex >= 0 ? (translated[titleIndex] ?? sourceTitle) : sourceTitle,
        body: bodyIndex >= 0 ? (translated[bodyIndex] ?? sourceBody) : sourceBody,
        source_title: sourceTitle,
        source_body: sourceBody,
        translated_at: now,
      }
      return [language, entry] as const
    })
  )

  return Object.fromEntries(entries)
}
