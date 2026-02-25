/**
 * Convierte un valor a uno serializable para Server Actions (JSON-safe).
 * - Date → ISO string
 * - undefined se omite en objetos
 * - function/symbol y referencias circulares → se evitan para no romper serialización
 */
function serializeValue<T>(value: T, seenSet: WeakSet<object>): T {
  if (value === null || value === undefined) {
    return value
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined as unknown as T
  }
  if (value instanceof Date) {
    return value.toISOString() as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map(item => serializeValue(item, seenSet)) as unknown as T
  }
  if (typeof value === 'object') {
    if (seenSet.has(value as object)) return null as unknown as T
    seenSet.add(value as object)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue
      try {
        out[k] = serializeValue(v, seenSet)
      } catch {
        out[k] = null
      }
    }
    return out as unknown as T
  }
  return value
}

export function serializeForServerAction<T>(value: T): T {
  const seenSet = new WeakSet<object>()
  try {
    return serializeValue(value, seenSet)
  } catch {
    return JSON.parse(JSON.stringify(value, (_, v) => (v instanceof Date ? v.toISOString() : v)))
  }
}
