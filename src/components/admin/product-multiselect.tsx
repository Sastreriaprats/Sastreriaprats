'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchProductsForNewsletter, type ProductSearchResult } from '@/actions/products'

interface ProductMultiSelectProps {
  value: ProductSearchResult[]
  onChange: (products: ProductSearchResult[]) => void
  max?: number
  label?: string
  helpText?: string
}

export function ProductMultiSelect({
  value,
  onChange,
  max = 3,
  label = 'Productos del grid',
  helpText,
}: ProductMultiSelectProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const atLimit = value.length >= max
  const selectedIds = new Set(value.map((p) => p.id))

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await searchProductsForNewsletter({ query: q, limit: 10 })
      if (res.success && res.data) {
        // Filtrar los que ya están seleccionados
        setResults(res.data.filter((p) => !selectedIds.has(p.id)))
      } else {
        setResults([])
      }
    } finally {
      setLoading(false)
    }
    // selectedIds derivado de value: lo reflejamos al ejecutarse
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (atLimit) return
    const t = setTimeout(() => runSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, atLimit, runSearch])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleAdd = (product: ProductSearchResult) => {
    if (atLimit) return
    if (selectedIds.has(product.id)) return
    onChange([...value, product])
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const handleRemove = (id: string) => {
    onChange(value.filter((p) => p.id !== id))
  }

  return (
    <div ref={wrapperRef} className="space-y-2">
      {label && <Label>{label}</Label>}
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}

      {/* Lista de seleccionados */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((p, idx) => (
            <div
              key={p.id}
              className="flex items-center gap-3 rounded border bg-muted/30 px-3 py-2"
            >
              <span className="text-xs text-muted-foreground font-mono w-5">{idx + 1}.</span>
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="h-10 w-10 object-cover rounded bg-white border"
                />
              ) : (
                <div className="h-10 w-10 rounded bg-muted" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.price.toFixed(2)} €</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(p.id)}
                className="text-muted-foreground hover:text-red-600 p-1"
                title="Eliminar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={atLimit ? `Has alcanzado el límite de ${max} productos` : 'Buscar producto...'}
          disabled={atLimit}
          className="pl-9"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {/* Dropdown de resultados */}
        {open && !atLimit && query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-md border bg-popover shadow-md">
            {loading && results.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">Buscando…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">Sin resultados</p>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAdd(p)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-accent transition-colors"
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-12 w-12 object-cover rounded bg-white border"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded bg-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.price.toFixed(2)} €</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
