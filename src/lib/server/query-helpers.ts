import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeSearchTerm } from '@/lib/utils'

export interface ListParams {
  page?: number
  pageSize?: number
  search?: string
  searchFields?: string[]
  // OR filter PostgREST listo para pasar a `query.or(...)`. Si se proporciona, se
  // usa en lugar del OR automático generado a partir de `searchFields`.
  customSearchOr?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filters?: Record<string, any>
  storeId?: string
  // Por defecto (undefined/true), si la búsqueda estricta contra `search_text`
  // devuelve 0 resultados se intenta un fallback difuso (trigram, tolerante a
  // erratas) vía RPC. Poner `false` para desactivarlo en una llamada concreta.
  fuzzy?: boolean
}

// Tablas con columna `search_text` + índice GIN trigram (mig. 142) sobre las
// que el RPC `fuzzy_search_ids` (mig. 196) puede hacer fallback difuso.
const FUZZY_TABLES = new Set([
  'clients', 'products', 'suppliers', 'vouchers', 'fabrics', 'ap_supplier_invoices',
])

/**
 * Aplica los filtros de `ListParams.filters` a una query PostgREST. Extraído de
 * `queryList` para reutilizarlo en la pasada de fallback difuso. Devuelve la
 * query con los filtros encadenados.
 */
function applyFilters(query: any, filters?: Record<string, any>): any {
  if (!filters) return query
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      query = query.in(key, value)
    } else if (typeof value === 'boolean') {
      query = query.eq(key, value)
    } else if (typeof value === 'string' && value.startsWith('>=')) {
      query = query.gte(key, value.slice(2))
    } else if (typeof value === 'string' && value.startsWith('<=')) {
      query = query.lte(key, value.slice(2))
    } else if (typeof value === 'string' && value.startsWith('!=')) {
      query = query.neq(key, value.slice(2))
    } else if (typeof value === 'object') {
      // Rango sobre la misma columna: { gte?, lte?, gt?, lt? }. Útil para
      // filtrar por fechas (desde/hasta) sin necesitar dos claves distintas.
      const r = value as Record<string, unknown>
      if (r.gte !== undefined && r.gte !== '') query = query.gte(key, r.gte)
      if (r.lte !== undefined && r.lte !== '') query = query.lte(key, r.lte)
      if (r.gt !== undefined && r.gt !== '') query = query.gt(key, r.gt)
      if (r.lt !== undefined && r.lt !== '') query = query.lt(key, r.lt)
    } else {
      query = query.eq(key, value)
    }
  }
  return query
}

/**
 * Resuelve los ids de una tabla difusa que coinciden con `term` por similitud
 * trigram (tolerante a erratas), ordenados por relevancia. Devuelve [] si no hay
 * término o la tabla no admite fuzzy. Usado por el fallback de `queryList` y por
 * la pre-resolución de client_ids en pedidos/arreglos.
 */
export async function fuzzySearchIds(
  table: string,
  term: string,
  limit = 200,
): Promise<string[]> {
  if (!FUZZY_TABLES.has(table)) return []
  if (normalizeSearchTerm(term).length < 2) return []
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('fuzzy_search_ids', {
    p_table: table,
    p_term: term,
    p_limit: limit,
  })
  if (error) {
    console.error(`[fuzzySearchIds] ${table}:`, error)
    return []
  }
  // El RPC ya devuelve ordenado por score desc.
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

export interface ListResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function queryList<T>(
  table: string,
  params: ListParams,
  selectFields: string = '*',
): Promise<ListResult<T>> {
  const admin = createAdminClient()
  const page = params.page || 1
  const pageSize = params.pageSize || 20
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = admin.from(table).select(selectFields, { count: 'exact' })

  query = applyFilters(query, params.filters)

  if (params.customSearchOr) {
    query = query.or(params.customSearchOr)
  } else if (params.search && params.searchFields && params.searchFields.length > 0) {
    if (params.searchFields.includes('search_text')) {
      // Búsqueda contra columna generada normalizada (unaccent + lower).
      // Normalizamos el término en JS para que case y acentos coincidan.
      // Multi-palabra: cada token debe estar presente (AND), no la cadena completa.
      // Así "jorge ll" encuentra a "Jorge Llavona" aunque el orden interno sea
      // "apellido nombre" o haya nombres compuestos.
      const normalized = normalizeSearchTerm(params.search)
      if (normalized) {
        const tokens = normalized.split(/\s+/).filter(Boolean)
        for (const token of tokens) {
          query = query.ilike('search_text', `%${token}%`)
        }
      }
    } else {
      // Fallback sin search_text: cada token aplica un OR sobre todos los
      // searchFields, y los tokens se combinan con AND.
      const tokens = params.search.split(/\s+/).filter(Boolean)
      for (const token of tokens) {
        const conditions = params.searchFields
          .map(field => `${field}.ilike.%${token}%`)
          .join(',')
        query = query.or(conditions)
      }
    }
  }

  if (params.storeId) {
    query = query.eq('store_id', params.storeId)
  }

  if (params.sortBy) {
    query = query.order(params.sortBy, { ascending: params.sortOrder === 'asc' })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  query = query.range(from, to)

  const { data, count, error } = await query

  if (error) {
    console.error(`[queryList] Error querying ${table}:`, error)
    return { data: [], total: 0, page, pageSize, totalPages: 0 }
  }

  const total = count || 0

  // Fallback difuso: si la búsqueda estricta (substring) no encontró nada pero
  // hay término, reintentamos con similitud trigram (tolerante a erratas) vía
  // RPC. Solo aplica a tablas con `search_text` y cuando no se usó un OR custom.
  // Mantiene el camino feliz intacto: el 99% acierta en la pasada estricta.
  if (
    total === 0 &&
    params.fuzzy !== false &&
    params.search &&
    !params.customSearchOr &&
    params.searchFields?.includes('search_text') &&
    FUZZY_TABLES.has(table)
  ) {
    const fuzzy = await fuzzyFallback<T>(table, params, selectFields, page, pageSize, from, to)
    if (fuzzy) return fuzzy
  }

  return {
    data: (data || []) as T[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Reintento difuso de `queryList`: pide ids candidatos rankeados por similitud
 * trigram (RPC) y reaplica los MISMOS filtros + storeId. Reordena en JS por el
 * ranking del RPC (`.in()` no respeta el orden del array) y pagina en memoria.
 * El `sortBy` se ignora aquí a propósito: el orden es la relevancia.
 */
async function fuzzyFallback<T>(
  table: string,
  params: ListParams,
  selectFields: string,
  page: number,
  pageSize: number,
  from: number,
  to: number,
): Promise<ListResult<T> | null> {
  const ids = await fuzzySearchIds(table, params.search!, 200)
  if (ids.length === 0) return null

  const admin = createAdminClient()
  let q = admin.from(table).select(selectFields).in('id', ids)
  q = applyFilters(q, params.filters)
  if (params.storeId) q = q.eq('store_id', params.storeId)

  const { data, error } = await q
  if (error || !data) return null

  // Reordenar por el ranking del RPC (mejor coincidencia primero).
  const rank = new Map(ids.map((id, i) => [id, i]))
  const rows = (data as unknown as { id: string }[])
    .slice()
    .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))

  const total = rows.length
  return {
    data: rows.slice(from, to + 1) as T[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Resuelve los `client_id` que coinciden con un término de búsqueda, para los
 * listados que filtran por cliente a través de una tabla embebida (pedidos,
 * arreglos): PostgREST no permite ilike sobre tablas embebidas, así que se
 * pre-buscan los ids aquí. Primero por substring (`clients.search_text`) y, si
 * no hay ninguno, fallback difuso (trigram) para tolerar erratas en el nombre.
 * `safeTerm` debe venir ya normalizado/saneado por el caller.
 */
export async function resolveClientIdsForSearch(
  admin: ReturnType<typeof createAdminClient>,
  safeTerm: string,
): Promise<string[]> {
  if (!safeTerm) return []
  const { data } = await admin
    .from('clients')
    .select('id')
    .ilike('search_text', `%${safeTerm}%`)
    .limit(500)
  const ids = (data ?? []).map((r: { id: string }) => r.id)
  if (ids.length > 0) return ids
  // Sin coincidencias exactas → reintento difuso (p.ej. "jorje llavona").
  return fuzzySearchIds('clients', safeTerm, 200)
}

export async function queryById<T>(
  table: string,
  id: string,
  selectFields: string = '*',
): Promise<T | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(table)
    .select(selectFields)
    .eq('id', id)
    .single()

  if (error) return null
  return data as T
}

export async function getNextNumber(
  table: string,
  numberField: string,
  prefix: string,
  year?: number,
): Promise<string> {
  const admin = createAdminClient()
  const currentYear = year || new Date().getFullYear()
  const pattern = `${prefix}-${currentYear}-%`

  const { data } = await admin
    .from(table)
    .select(numberField)
    .like(numberField, pattern)
    .order(numberField, { ascending: false })
    .limit(1)

  let nextNum = 1
  if (data && data.length > 0) {
    const lastNumber = (data[0] as unknown as Record<string, unknown>)[numberField] as string
    const parts = lastNumber.split('-')
    const lastSeq = parseInt(parts[parts.length - 1], 10)
    nextNum = lastSeq + 1
  }

  return `${prefix}-${currentYear}-${nextNum.toString().padStart(4, '0')}`
}

export async function verifyOwnership(
  table: string,
  id: string,
  storeId?: string,
): Promise<boolean> {
  const admin = createAdminClient()
  let query = admin.from(table).select('id').eq('id', id)
  if (storeId) query = query.eq('store_id', storeId)
  const { data } = await query.single()
  return !!data
}
