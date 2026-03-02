'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Barcode, Loader2, Printer, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useList } from '@/hooks/use-list'
import { usePermissions } from '@/hooks/use-permissions'
import {
  listVariantsForBarcodes,
  generateBarcodesForAllVariants,
  updateVariantBarcode,
} from '@/actions/products'
import { formatCurrency } from '@/lib/utils'

type FilterBarcode = 'all' | 'with' | 'without'

export function CodigosBarrasContent() {
  const router = useRouter()
  const { can } = usePermissions()
  const [filter, setFilter] = useState<FilterBarcode>('all')
  const [editingBarcode, setEditingBarcode] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const {
    data: variants,
    total,
    totalPages,
    page,
    setPage,
    search,
    setSearch,
    isLoading,
    refresh,
    pageSize,
  } = useList(listVariantsForBarcodes, { pageSize: 50, defaultSort: 'product_name', defaultOrder: 'asc' })

  const filtered = variants.filter((v: any) => {
    if (filter === 'with') return v.barcode
    if (filter === 'without') return !v.barcode || v.barcode === ''
    return true
  })

  const [checked, setChecked] = useState<Set<string>>(new Set())

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
        refresh()
      } else {
        toast.error((result as { error?: string }).error || 'Error al generar')
      }
    } finally {
      setGenerating(false)
    }
  }, [can, refresh])

  const handleSaveBarcode = useCallback(async (variantId: string) => {
    const value = editingBarcode[variantId] ?? ''
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
        refresh()
      } else {
        toast.error((result as { error?: string }).error)
      }
    } finally {
      setSavingId(null)
    }
  }, [editingBarcode, refresh])

  const handlePrintSelected = useCallback(() => {
    const ids = Array.from(checked).filter((id) => {
      const v = variants.find((x: any) => x.id === id)
      return v && v.barcode
    })
    if (ids.length === 0) {
      toast.error('Selecciona al menos una variante (producto + talla) con código')
      return
    }
    router.push(`/admin/stock/codigos-barras/imprimir?variantIds=${ids.join(',')}`)
  }, [checked, variants, router])

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCheckAll = () => {
    const withBarcode = filtered.filter((v: any) => v.barcode).map((v: any) => v.id)
    if (withBarcode.every((id) => checked.has(id))) {
      setChecked((prev) => {
        const next = new Set(prev)
        withBarcode.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setChecked((prev) => new Set([...prev, ...withBarcode]))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Códigos de barras EAN-13</h1>
          <p className="text-muted-foreground">Cada variante (producto + talla) tiene su propio código EAN-13. Etiquetas Brother QL-700 (29×68mm)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('products.edit') && (
            <Button onClick={handleGenerateAll} disabled={generating} className="gap-2 bg-prats-navy hover:bg-prats-navy-light">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Barcode className="h-4 w-4" />}
              Generar códigos para variantes sin código
            </Button>
          )}
          <Button variant="outline" onClick={handlePrintSelected} className="gap-2" disabled={checked.size === 0}>
            <Printer className="h-4 w-4" /> Imprimir etiquetas seleccionadas ({checked.size})
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
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={filtered.filter((v: any) => v.barcode).length > 0 && filtered.filter((v: any) => v.barcode).every((v: any) => checked.has(v.id))}
                  onCheckedChange={toggleCheckAll}
                />
              </TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="w-24">Talla</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Código EAN-13</TableHead>
              <TableHead>PVP</TableHead>
              <TableHead className="w-24">Estado</TableHead>
              <TableHead className="w-40">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No hay variantes
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((v: any) => (
                <TableRow key={v.id}>
                  <TableCell>
                    {v.barcode && (
                      <Checkbox checked={checked.has(v.id)} onCheckedChange={() => toggleCheck(v.id)} />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell className="text-muted-foreground">{v.size ?? '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{v.variant_sku || v.sku}</TableCell>
                  <TableCell>
                    {can('products.edit') ? (
                      <div className="flex items-center gap-1">
                        <Input
                          className="font-mono h-8 w-36 text-xs"
                          value={editingBarcode[v.id] ?? v.barcode ?? ''}
                          onChange={(e) => setEditingBarcode((prev) => ({ ...prev, [v.id]: e.target.value }))}
                          placeholder="13 dígitos"
                          maxLength={13}
                        />
                        <Button
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleSaveBarcode(v.id)}
                          disabled={savingId === v.id}
                        >
                          {savingId === v.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </div>
                    ) : (
                      <span className="font-mono text-sm">{v.barcode || '—'}</span>
                    )}
                  </TableCell>
                  <TableCell>{formatCurrency(v.base_price)}</TableCell>
                  <TableCell>
                    {v.barcode ? (
                      <span className="text-xs text-green-600">Con código</span>
                    ) : (
                      <span className="text-xs text-amber-600">Sin código</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {v.barcode && (
                      <Button variant="ghost" size="sm" className="gap-1" asChild>
                        <Link href={`/admin/stock/codigos-barras/imprimir?variantIds=${v.id}`}>
                          <Printer className="h-3 w-3" /> Imprimir
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} de {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span className="text-sm py-2">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
