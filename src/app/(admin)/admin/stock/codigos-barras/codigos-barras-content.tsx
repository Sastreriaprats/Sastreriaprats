'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Barcode, Copy, Loader2, Pencil, Printer, Save, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import {
  getProductsWithVariantsForBarcodes,
  generateBarcodesForAllVariants,
  updateVariantBarcode,
} from '@/actions/products'
import { formatCurrency } from '@/lib/utils'

type FilterBarcode = 'all' | 'with' | 'without' | 'partial'

type ProductGroup = {
  product_id: string
  product_name: string
  product_sku: string
  base_price: number
  tax_rate_pct?: number
  variants: Array<{
    variant_id: string
    variant_sku: string
    size: string | null
    color: string | null
    barcode: string | null
    price_with_tax: number
    has_barcode: boolean
  }>
}

export function CodigosBarrasContent() {
  const router = useRouter()
  const { can } = usePermissions()
  const [filter, setFilter] = useState<FilterBarcode>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [products, setProducts] = useState<ProductGroup[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [withoutBarcodeCount, setWithoutBarcodeCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [editingBarcode, setEditingBarcode] = useState<Record<string, string>>({})
  const [editableRows, setEditableRows] = useState<Set<string>>(new Set())
  const [savingId, setSavingId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const pageSize = 50

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getProductsWithVariantsForBarcodes({
        page,
        pageSize,
        search: search || undefined,
        filter,
      })
      if (result.success && result.data) {
        setProducts(result.data.data)
        setTotal(result.data.total)
        setTotalPages(result.data.totalPages)
        setWithoutBarcodeCount(result.data.withoutBarcodeCount ?? 0)
        if (search.trim()) {
          setExpanded((prev) => {
            const next = new Set(prev)
            result.data.data.forEach((p: ProductGroup) => next.add(p.product_id))
            return next
          })
        }
      }
    } catch {
      toast.error('Error al cargar datos')
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize, search, filter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setPage(1)
  }, [search, filter])

  const handleGenerateAll = useCallback(async () => {
    if (!can('products.edit')) return
    setGenerating(true)
    try {
      const result = await generateBarcodesForAllVariants()
      if (result.success && result.data) {
        toast.success(`Generados ${result.data.generated} códigos`)
        if (result.data.errors?.length) {
          result.data.errors.slice(0, 5).forEach((e: string) => toast.error(e))
        }
        fetchData()
      } else {
        toast.error((result as { error?: string }).error || 'Error al generar')
      }
    } finally {
      setGenerating(false)
    }
  }, [can, fetchData])

  const handleSaveBarcode = useCallback(async (variantId: string, currentBarcode?: string | null) => {
    const value = (editingBarcode[variantId] ?? '').trim()
    if (!value && (currentBarcode || '').trim()) {
      const confirmed = window.confirm('¿Seguro que quieres eliminar el código EAN de esta variante?')
      if (!confirmed) return
    }
    setSavingId(variantId)
    try {
      const result = await updateVariantBarcode({ variantId, barcode: value })
      if (result.success) {
        toast.success('Código actualizado')
        setEditingBarcode((prev) => {
          const next = { ...prev }
          delete next[variantId]
          return next
        })
        setEditableRows((prev) => {
          const next = new Set(prev)
          next.delete(variantId)
          return next
        })
        fetchData()
      } else {
        toast.error((result as { error?: string }).error)
      }
    } finally {
      setSavingId(null)
    }
  }, [editingBarcode, fetchData])

  const selectedCount = checked.size

  const handlePrintSelected = useCallback(() => {
    const ids = Array.from(checked)
    if (ids.length === 0) {
      toast.error('Selecciona al menos una variante con código')
      return
    }
    router.push(`/admin/stock/codigos-barras/imprimir?variantIds=${ids.join(',')}`)
  }, [checked, router])

  const handleCopyBarcode = useCallback(async (barcode?: string | null) => {
    const code = (barcode || '').trim()
    if (!code) {
      toast.error('La variante no tiene código EAN')
      return
    }
    try {
      await navigator.clipboard.writeText(code)
      toast.success('EAN copiado al portapapeles')
    } catch {
      toast.error('No se pudo copiar el código')
    }
  }, [])

  const toggleExpand = (productId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const toggleCheckVariant = (variantId: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(variantId)) next.delete(variantId)
      else next.add(variantId)
      return next
    })
  }

  const toggleCheckProduct = (prod: ProductGroup) => {
    const withBarcode = prod.variants.filter((v) => v.has_barcode).map((v) => v.variant_id)
    const allChecked = withBarcode.every((id) => checked.has(id))
    setChecked((prev) => {
      const next = new Set(prev)
      if (allChecked) {
        withBarcode.forEach((id) => next.delete(id))
      } else {
        withBarcode.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const getProductCheckState = (prod: ProductGroup): 'checked' | 'unchecked' | 'indeterminate' => {
    const withBarcode = prod.variants.filter((v) => v.has_barcode).map((v) => v.variant_id)
    if (withBarcode.length === 0) return 'unchecked'
    const selected = withBarcode.filter((id) => checked.has(id)).length
    if (selected === 0) return 'unchecked'
    if (selected === withBarcode.length) return 'checked'
    return 'indeterminate'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Códigos de barras EAN-13</h1>
          <p className="text-muted-foreground">Cada variante (producto + talla) tiene su propio código EAN-13. Etiquetas Brother QL-700 (29x68mm)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('products.edit') && (
            <Button onClick={handleGenerateAll} disabled={generating} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Barcode className="h-4 w-4" />}
              Generar códigos para variantes sin código ({withoutBarcodeCount})
            </Button>
          )}
          <Button variant="outline" onClick={handlePrintSelected} className="gap-2" disabled={selectedCount === 0}>
            <Printer className="h-4 w-4" /> Imprimir etiquetas seleccionadas ({selectedCount})
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Input
            placeholder="Buscar por nombre, SKU o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterBarcode)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="with">Con código</SelectItem>
            <SelectItem value="without">Sin código</SelectItem>
            <SelectItem value="partial">Parcial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border overflow-hidden">
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : products.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            No hay productos
          </div>
        ) : (
          <div className="divide-y">
            {products.map((prod) => {
              const isExpanded = expanded.has(prod.product_id)
              const firstPrice = prod.variants[0]?.price_with_tax ?? prod.base_price * (1 + (prod.tax_rate_pct ?? 21) / 100)
              const checkState = getProductCheckState(prod)
              const hasAnyBarcode = prod.variants.some((v) => v.has_barcode)

              return (
                <div key={prod.product_id}>
                  {/* Fila producto */}
                  <div
                    className="min-h-[48px] flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleExpand(prod.product_id)}
                  >
                    <button
                      type="button"
                      className="p-1 shrink-0 -ml-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpand(prod.product_id)
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    <div
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={checkState === 'checked' ? true : checkState === 'indeterminate' ? 'indeterminate' : false}
                        onCheckedChange={() => toggleCheckProduct(prod)}
                        disabled={!hasAnyBarcode}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{prod.product_name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {prod.variants.length} variante{prod.variants.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-medium shrink-0 w-20 text-right">
                      {formatCurrency(firstPrice)}
                    </span>
                  </div>

                  {/* Filas variantes (expandido) */}
                  {isExpanded &&
                    prod.variants.map((v) => {
                      const isEditable = !v.has_barcode || editableRows.has(v.variant_id)
                      const value = editingBarcode[v.variant_id] ?? v.barcode ?? ''
                      const isRemoving = value.trim() === ''

                      return (
                        <div
                          key={v.variant_id}
                          className="min-h-[40px] flex items-center gap-3 px-4 py-2 pl-14 bg-background border-t border-muted/50 hover:bg-muted/20"
                        >
                          <div className="shrink-0 w-6">
                            {v.has_barcode && (
                              <Checkbox
                                checked={checked.has(v.variant_id)}
                                onCheckedChange={() => toggleCheckVariant(v.variant_id)}
                              />
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground w-20 shrink-0">
                            Talla {v.size || '-'}
                          </span>
                          <span className="font-mono text-sm w-44 truncate shrink-0">
                            {v.variant_sku}
                          </span>
                          <div className="flex-1 min-w-0 flex items-center gap-1">
                            {can('products.edit') ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  className="font-mono h-8 w-32 text-xs"
                                  value={value}
                                  onChange={(e) => setEditingBarcode((prev) => ({ ...prev, [v.variant_id]: e.target.value }))}
                                  placeholder="13 dígitos"
                                  maxLength={13}
                                  disabled={!isEditable}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                {v.has_barcode && !isEditable ? (
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditableRows((prev) => new Set([...prev, v.variant_id]))
                                      setEditingBarcode((prev) => ({ ...prev, [v.variant_id]: v.barcode || '' }))
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleSaveBarcode(v.variant_id, v.barcode)
                                    }}
                                    disabled={savingId === v.variant_id}
                                  >
                                    {savingId === v.variant_id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : isRemoving ? (
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    ) : (
                                      <Save className="h-4 w-4 text-green-600" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="font-mono text-sm">{v.barcode || '-'}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 h-8"
                              disabled={!v.barcode}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopyBarcode(v.barcode)
                              }}
                            >
                              <Copy className="h-3 w-3" /> Copiar
                            </Button>
                            {v.barcode && (
                              <Button variant="ghost" size="sm" className="gap-1 h-8" asChild>
                                <Link
                                  href={`/admin/stock/codigos-barras/imprimir?variantIds=${v.variant_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Printer className="h-3 w-3" /> Imprimir
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} de {total} productos
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-sm py-2">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
