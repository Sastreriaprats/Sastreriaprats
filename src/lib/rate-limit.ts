/**
 * In-memory rate limiter for API routes.
 * Uses a Map to track request counts per IP within a sliding window.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const ipMap = new Map<string, RateLimitEntry>()

// Limpieza periódica de entradas expiradas (cada 60s)
let cleanupInterval: ReturnType<typeof setInterval> | null = null

function ensureCleanup() {
  if (cleanupInterval) return
  cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of ipMap) {
      if (now > entry.resetAt) ipMap.delete(key)
    }
  }, 60_000)
  // No bloquear el proceso de Node si este es el último timer
  if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref()
  }
}

/**
 * Comprueba si la IP ha superado el límite de requests.
 * @returns `true` si debe bloquearse (429), `false` si pasa.
 */
export function isRateLimited(
  ip: string,
  route: string,
  maxRequests: number,
  windowSeconds: number,
): boolean {
  ensureCleanup()

  const key = `${route}:${ip}`
  const now = Date.now()
  const entry = ipMap.get(key)

  if (!entry || now > entry.resetAt) {
    ipMap.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return false
  }

  entry.count++
  if (entry.count > maxRequests) return true

  return false
}
