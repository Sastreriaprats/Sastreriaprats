'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import type { ActionResult } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'

export function useList<T>(
  action: (params: ListParams) => Promise<ActionResult<ListResult<T>>>,
  options: {
    pageSize?: number
    defaultSort?: string
    defaultOrder?: 'asc' | 'desc'
    defaultFilters?: Record<string, any>
    autoFetch?: boolean
    syncUrl?: boolean
  } = {},
) {
  const pageSize = options.pageSize || 20
  const sync = options.syncUrl ?? false
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPageState] = useState(() => {
    if (sync) {
      const p = parseInt(searchParams.get('page') || '1')
      return isNaN(p) || p < 1 ? 1 : p
    }
    return 1
  })
  const [search, setSearchState] = useState(() => {
    if (sync) return searchParams.get('search') || ''
    return ''
  })
  const [sortBy, setSortBy] = useState(options.defaultSort || 'created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(options.defaultOrder || 'desc')
  const [filters, setFilters] = useState<Record<string, any>>(options.defaultFilters || {})
  const [isLoading, setIsLoading] = useState(true)
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | undefined>(undefined)
  const [totalAll, setTotalAll] = useState<number | undefined>(undefined)

  const updateUrl = useCallback((params: Record<string, string | null>) => {
    if (!sync) return
    const newParams = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === '' || value === '1') {
        newParams.delete(key)
      } else {
        newParams.set(key, value)
      }
    }
    const qs = newParams.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [sync, router, pathname, searchParams])

  const setPage = useCallback((p: number) => {
    setPageState(p)
    updateUrl({ page: String(p) })
  }, [updateUrl])

  const setSearch = useCallback((s: string) => {
    setSearchState(s)
    updateUrl({ search: s || null, page: null })
  }, [updateUrl])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await action({ page, pageSize, search, sortBy, sortOrder, filters })
      if (result.success) {
        setData(result.data.data)
        setTotal(result.data.total)
        setTotalPages(result.data.totalPages)
        if ('statusCounts' in result.data && result.data.statusCounts != null) {
          setStatusCounts(result.data.statusCounts as Record<string, number>)
        }
        if ('totalAll' in result.data && result.data.totalAll != null) {
          setTotalAll(result.data.totalAll as number)
        }
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Error al cargar datos')
    }
    setIsLoading(false)
  }, [action, page, pageSize, search, sortBy, sortOrder, filters])

  useEffect(() => {
    if (options.autoFetch !== false) fetchData()
  }, [fetchData, options.autoFetch])

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    // Solo resetear el state de página, sin actualizar URL (ya lo hace setSearch/setFilters)
    setPageState(1)
  }, [search, filters])

  // Sincronizar estado con URL cuando el usuario navega con atrás/adelante
  useEffect(() => {
    if (!sync) return
    const urlPage = parseInt(searchParams.get('page') || '1')
    const urlSearch = searchParams.get('search') || ''
    if (!isNaN(urlPage) && urlPage !== page) setPageState(urlPage)
    if (urlSearch !== search) setSearchState(urlSearch)
  }, [searchParams])

  const refresh = useCallback(() => fetchData(), [fetchData])

  const toggleSort = useCallback((field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }, [sortBy])

  return {
    data, total, totalPages, page, setPage,
    search, setSearch, sortBy, sortOrder, toggleSort,
    filters, setFilters, isLoading, refresh, pageSize,
    statusCounts, totalAll,
  }
}
