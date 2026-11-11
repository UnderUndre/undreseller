/**
 * In-memory TTL cache for availability slot computation (spec 008 T841 / SEC-B-05):
 * protects against heavy availability compute loop flooding on public GET /api/availability.
 * Bounded registry (max 1,000 keys) with 20s TTL.
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const MAX_CACHE_ENTRIES = 1_000
const DEFAULT_TTL_MS = 20_000 // 20s TTL

export function getCachedSlots<T>(key: string, now = Date.now()): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (now > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

export function setCachedSlots<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS, now = Date.now()): void {
  if (cache.size > MAX_CACHE_ENTRIES) {
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k)
    }
  }
  cache.set(key, { data, expiresAt: now + ttlMs })
}

export function clearSlotCache(): void {
  cache.clear()
}
