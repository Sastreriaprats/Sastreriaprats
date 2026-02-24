import { createAdminClient } from '@/lib/supabase/admin'

export interface ListParams {
  page?: number
  pageSize?: number
  search?: string
  searchFields?: string[]
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filters?: Record<string, any>
  storeId?: string
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

  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
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
      } else {
        query = query.eq(key, value)
      }
    }
  }

  if (params.search && params.searchFields && params.searchFields.length > 0) {
    const searchConditions = params.searchFields
      .map(field => `${field}.ilike.%${params.search}%`)
      .join(',')
    query = query.or(searchConditions)
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

  return {
    data: (data || []) as T[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
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
