'use client'

import { useState, useEffect, useCallback } from 'react'
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
  } = {},
) {
  const pageSize = options.pageSize || 20
  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState(options.defaultSort || 'created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(options.defaultOrder || 'desc')
  const [filters, setFilters] = useState<Record<string, any>>(options.defaultFilters || {})
  const [isLoading, setIsLoading] = useState(true)
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | undefined>(undefined)
  const [totalAll, setTotalAll] = useState<number | undefined>(undefined)

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

  useEffect(() => { setPage(1) }, [search, filters])

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
