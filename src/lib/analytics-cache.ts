export const DEFAULT_ANALYTICS_CACHE_TTL_MS = 60_000
export const MAX_ANALYTICS_CACHE_ENTRIES = 120

export type CacheEntry<T> = {
  value: T
  cachedAt: string
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()
const inFlight = new Map<string, Promise<unknown>>()

export function getCached<T>(key: string, now = Date.now()): CacheEntry<T> | null {
  const entry = store.get(key)
  if (!entry) return null
  if (now >= entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry as CacheEntry<T>
}

export function getStaleCached<T>(
  key: string,
  staleGraceMs: number,
  now = Date.now()
): { entry: CacheEntry<T>; isStale: boolean } | null {
  const entry = store.get(key)
  if (!entry) return null
  if (now < entry.expiresAt) {
    return { entry: entry as CacheEntry<T>, isStale: false }
  }
  if (now < entry.expiresAt + Math.max(0, staleGraceMs)) {
    return { entry: entry as CacheEntry<T>, isStale: true }
  }
  store.delete(key)
  return null
}

export function runSingleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) {
    return existing as Promise<T>
  }
  const promise = (async () => fn())().finally(() => {
    if (inFlight.get(key) === promise) {
      inFlight.delete(key)
    }
  })
  inFlight.set(key, promise)
  return promise
}

export function setCached<T>(
  key: string,
  value: T,
  ttlMs = DEFAULT_ANALYTICS_CACHE_TTL_MS,
  now = Date.now()
): CacheEntry<T> {
  if (store.has(key)) {
    store.delete(key)
  } else if (store.size >= MAX_ANALYTICS_CACHE_ENTRIES) {
    const oldestKey = store.keys().next().value
    if (oldestKey !== undefined) {
      store.delete(oldestKey)
    }
  }

  const entry: CacheEntry<T> = {
    value,
    cachedAt: new Date(now).toISOString(),
    expiresAt: now + Math.max(0, ttlMs),
  }
  store.set(key, entry)
  return entry
}

export function clearAnalyticsCache(): void {
  store.clear()
  inFlight.clear()
}
