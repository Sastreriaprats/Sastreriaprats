'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

/**
 * Página de un listado persistida en la query string, para listados que NO usan
 * useList (paginación en useState propio). Restaura la página al montar y
 * reescribe la URL (router.replace, sin scroll) en cada cambio, de modo que al
 * entrar a un detalle y volver atrás el listado conserva la página.
 *
 * - `key`: clave del parámetro. Los tabs que comparten URL (p.ej. /admin/stock)
 *   deben usar claves distintas ('rpage', 'mpage'…) para no contaminarse.
 * - `base`: 0 para estados 0-based (la URL siempre guarda 1-based y se omite
 *   cuando es la primera página).
 */
export function usePageParam(key = 'page', base: 0 | 1 = 1) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [page, setPageState] = useState<number>(() => {
    const raw = parseInt(searchParams.get(key) || '')
    if (isNaN(raw) || raw < 1) return base === 0 ? 0 : 1
    return base === 0 ? raw - 1 : raw
  })
  const pageRef = useRef(page)
  pageRef.current = page

  const setPage = useCallback((p: number | ((prev: number) => number)) => {
    const next = typeof p === 'function' ? p(pageRef.current) : p
    setPageState(next)
    const urlValue = base === 0 ? next + 1 : next
    const params = new URLSearchParams(searchParams.toString())
    if (urlValue <= 1) params.delete(key)
    else params.set(key, String(urlValue))
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [key, base, router, pathname, searchParams])

  return [page, setPage] as const
}
