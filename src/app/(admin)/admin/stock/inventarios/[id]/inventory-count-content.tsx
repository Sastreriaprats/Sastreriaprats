'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Loader2, ChevronLeft, ScanBarcode, Check, X, Download, AlertTriangle, RotateCcw, ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { todayLocalISODate } from '@/lib/dates'
import { downloadExcelMulti } from '@/lib/excel/export'
import {
  getInventory,
  scanInventoryCode,
  setInventoryCount,
  closeInventory,
  cancelInventory,
} from '@/actions/inventories'

/**
 * Pantalla de recuento. Está pensada para trabajar con la pistola en la mano:
 * el cursor vive SIEMPRE en el cuadro de escaneo y lo último leído sube a la
 * primera línea (petición de Mónica, 22-sep-2026: «que nos ponga en la primera
 * línea la última que hayamos leído, porque ahora se va al final»).
 */

type Line = {
  id: string
  product_variant_id: string
  expected_quantity: number
  counted_quantity: number | null
  difference: number | null
  unit_cost: number | string | null
  was_extra: boolean
  counted_at: string | null
  product_variant?: {
    variant_sku?: string | null
    size?: string | null
    color?: string | null
    barcode?: string | null
    product?: { name?: string; sku?: string; brand?: string | null; season?: string | null } | null
  } | null
  counted_by_profile?: { full_name?: string | null } | null
}

type Inventory = {
  id: string
  reference: string
  status: 'in_progress' | 'completed' | 'cancelled'
  inventory_type: string | null
  season_filter: string | null
  brand_filter: string | null
  started_at: string | null
  completed_at: string | null
  applied_at: string | null
  notes: string | null
  total_value_difference: number | string | null
  warehouse?: { id: string; name?: string | null; code?: string | null; store?: { name?: string | null; display_name?: string | null } | null } | null
  started_by_profile?: { full_name?: string | null } | null
  completed_by_profile?: { full_name?: string | null } | null
}

type LineFilter = 'all' | 'counted' | 'uncounted' | 'differences' | 'extra'

const FILTER_LABELS: Record<LineFilter, string> = {
  all: 'Todas las referencias',
  uncounted: 'Sin contar todavía',
  counted: 'Ya contadas',
  differences: 'Solo las que no cuadran',
  extra: 'Aparecidas (no estaban en el sistema)',
}

function lineName(l: Line): string {
  const p = l.product_variant?.product
  const bits = [l.product_variant?.size ? `T.${l.product_variant.size}` : null, l.product_variant?.color].filter(Boolean)
  return `${p?.name ?? 'Producto'}${bits.length ? ` · ${bits.join(' · ')}` : ''}`
}

export function InventoryCountContent({ inventoryId }: { inventoryId: string }) {
  const router = useRouter()
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [code, setCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [lastScannedLineId, setLastScannedLineId] = useState<string | null>(null)
  const [recent, setRecent] = useState<Array<{ id: string; text: string; ok: boolean }>>([])
  const scanRef = useRef<HTMLInputElement>(null)

  const [filter, setFilter] = useState<LineFilter>('all')
  const [search, setSearch] = useState('')

  const [closeOpen, setCloseOpen] = useState(false)
  const [applyAdjustments, setApplyAdjustments] = useState(true)
  const [zeroUncounted, setZeroUncounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [exporting, setExporting] = useState(false)

  const isOpen = inventory?.status === 'in_progress'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getInventory({ id: inventoryId })
      if (!res.success || !res.data) { setNotFound(true); return }
      setInventory(res.data.inventory as Inventory)
      setLines(res.data.lines as Line[])
    } catch (err) {
      console.error('Error cargando el inventario:', err)
      toast.error('No se pudo cargar el inventario')
    } finally {
      setLoading(false)
    }
  }, [inventoryId])

  useEffect(() => { load() }, [load])

  // El foco vuelve siempre al cuadro de escaneo: con la pistola no se toca el
  // ratón, y si el cursor se va a otro sitio el código se pierde por el camino.
  useEffect(() => {
    if (!isOpen) return
    const keep = () => {
      const active = document.activeElement as HTMLElement | null
      const typingElsewhere = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active !== scanRef.current
      if (!typingElsewhere) scanRef.current?.focus()
    }
    keep()
    const timer = setInterval(keep, 1500)
    return () => clearInterval(timer)
  }, [isOpen, lines.length])

  const handleScan = async (raw?: string) => {
    const value = (raw ?? code).trim()
    if (!value) return
    setScanning(true)
    setCode('')
    try {
      const res = await scanInventoryCode({ inventory_id: inventoryId, code: value, quantity: 1 })
      if (!res.success) {
        toast.error(res.error || 'No se pudo leer el código')
        setRecent((prev) => [{ id: crypto.randomUUID(), text: `${value} — ${res.error ?? 'no encontrado'}`, ok: false }, ...prev].slice(0, 8))
        return
      }
      const data = res.data
      const updated = data.line as Line
      // Lo recién leído va SIEMPRE arriba del todo.
      setLines((prev) => {
        const rest = prev.filter((l) => l.id !== updated.id)
        return [updated, ...rest]
      })
      setLastScannedLineId(updated.id)
      setRecent((prev) => [{
        id: crypto.randomUUID(),
        text: `${data.product_name}${data.variant_label ? ` · ${data.variant_label}` : ''} → ${data.counted_quantity} ud.`,
        ok: true,
      }, ...prev].slice(0, 8))
      if (data.was_extra) {
        toast.warning(`${data.product_name}: el sistema no tenía esta referencia en este almacén`)
      }
    } catch (err) {
      console.error('Error escaneando:', err)
      toast.error('Error al leer el código. Inténtalo de nuevo.')
    } finally {
      setScanning(false)
      scanRef.current?.focus()
    }
  }

  const changeCount = async (line: Line, value: string) => {
    const trimmed = value.trim()
    const parsed = trimmed === '' ? null : Number(trimmed)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return
    const counted = parsed === null ? null : Math.trunc(parsed)
    // Optimista: escribir a mano no puede esperar al servidor en cada tecla.
    setLines((prev) => prev.map((l) => l.id === line.id
      ? { ...l, counted_quantity: counted, difference: counted === null ? null : counted - l.expected_quantity }
      : l))
    const res = await setInventoryCount({ line_id: line.id, counted_quantity: counted })
    if (!res.success) {
      toast.error(res.error || 'No se pudo guardar el recuento')
      load()
    }
  }

  const stats = useMemo(() => {
    const expectedUnits = lines.reduce((acc, l) => acc + Number(l.expected_quantity || 0), 0)
    const countedLines = lines.filter((l) => l.counted_quantity !== null && l.counted_quantity !== undefined)
    const countedUnits = countedLines.reduce((acc, l) => acc + Number(l.counted_quantity || 0), 0)
    const diffs = countedLines.filter((l) => Number(l.counted_quantity) !== Number(l.expected_quantity))
    const valueDiff = diffs.reduce(
      (acc, l) => acc + (Number(l.counted_quantity) - Number(l.expected_quantity)) * (Number(l.unit_cost) || 0),
      0,
    )
    const missing = diffs.filter((l) => Number(l.counted_quantity) < Number(l.expected_quantity)).length
    const surplus = diffs.filter((l) => Number(l.counted_quantity) > Number(l.expected_quantity)).length
    return {
      references: lines.length,
      expectedUnits,
      countedUnits,
      countedLines: countedLines.length,
      pending: lines.length - countedLines.length,
      diffs: diffs.length,
      missing,
      surplus,
      valueDiff,
    }
  }, [lines])

  const visibleLines = useMemo(() => {
    const term = search.trim().toLowerCase()
    return lines.filter((l) => {
      const counted = l.counted_quantity !== null && l.counted_quantity !== undefined
      if (filter === 'counted' && !counted) return false
      if (filter === 'uncounted' && counted) return false
      if (filter === 'differences' && (!counted || Number(l.counted_quantity) === Number(l.expected_quantity))) return false
      if (filter === 'extra' && !l.was_extra) return false
      if (!term) return true
      const hay = [
        l.product_variant?.product?.name,
        l.product_variant?.product?.sku,
        l.product_variant?.variant_sku,
        l.product_variant?.barcode,
        l.product_variant?.size,
        l.product_variant?.color,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(term)
    })
  }, [lines, filter, search])

  const handleClose = async () => {
    setClosing(true)
    try {
      const res = await closeInventory({
        id: inventoryId,
        apply_adjustments: applyAdjustments,
        uncounted: zeroUncounted ? 'zero' : 'ignore',
      })
      if (!res.success) { toast.error(res.error || 'No se pudo cerrar el inventario'); return }
      const d = res.data
      toast.success(applyAdjustments
        ? `Inventario cerrado: ${d.differences} diferencias, stock ajustado en ${d.adjusted} referencias`
        : `Inventario cerrado: ${d.differences} diferencias (stock sin tocar)`)
      if (d.negative_available > 0) {
        toast.warning(`${d.negative_available} referencias quedan con menos unidades de las que hay reservadas para clientes. Revísalas en Reservas.`)
      }
      setCloseOpen(false)
      load()
    } catch (err) {
      console.error('Error cerrando el inventario:', err)
      toast.error('Error al cerrar el inventario. Inténtalo de nuevo.')
    } finally {
      setClosing(false)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const res = await cancelInventory({ id: inventoryId })
      if (!res.success) { toast.error(res.error || 'No se pudo anular el inventario'); return }
      toast.success('Inventario anulado')
      setCancelOpen(false)
      router.push('/admin/stock?tab=inventario')
    } catch (err) {
      console.error('Error anulando el inventario:', err)
      toast.error('Error al anular el inventario.')
    } finally {
      setCancelling(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const rows = lines.map((l) => {
        const counted = l.counted_quantity === null || l.counted_quantity === undefined ? null : Number(l.counted_quantity)
        const diff = counted === null ? null : counted - Number(l.expected_quantity || 0)
        return {
          'Producto': l.product_variant?.product?.name ?? '',
          'SKU': l.product_variant?.product?.sku ?? '',
          'Referencia': l.product_variant?.variant_sku ?? '',
          'EAN': l.product_variant?.barcode ?? '',
          'Talla': l.product_variant?.size ?? '',
          'Color': l.product_variant?.color ?? '',
          'Marca': l.product_variant?.product?.brand ?? '',
          'Temporada': l.product_variant?.product?.season ?? '',
          'Había (sistema)': Number(l.expected_quantity || 0),
          'Contado': counted,
          'Diferencia': diff,
          'Coste unitario (€)': Number(l.unit_cost || 0),
          'Valor diferencia (€)': diff === null ? null : Number((diff * (Number(l.unit_cost) || 0)).toFixed(2)),
          'Aparecida': l.was_extra ? 'Sí' : '',
          'Contado por': l.counted_by_profile?.full_name ?? '',
          'Fecha recuento': l.counted_at ? formatDateTime(l.counted_at) : '',
        }
      })
      const resumen = [{
        'Inventario': inventory?.reference ?? '',
        'Almacén': inventory?.warehouse?.name ?? '',
        'Tienda': inventory?.warehouse?.store?.display_name || inventory?.warehouse?.store?.name || '',
        'Estado': inventory?.status === 'completed' ? 'Cerrado' : inventory?.status === 'cancelled' ? 'Anulado' : 'En curso',
        'Referencias': stats.references,
        'Unidades según el sistema': stats.expectedUnits,
        'Unidades contadas': stats.countedUnits,
        'Referencias contadas': stats.countedLines,
        'Referencias sin contar': stats.pending,
        'Referencias que no cuadran': stats.diffs,
        'Faltan (referencias)': stats.missing,
        'Sobran (referencias)': stats.surplus,
        'Diferencia valorada a coste (€)': Number(stats.valueDiff.toFixed(2)),
      }]
      await downloadExcelMulti(
        [{ name: 'Resumen', rows: resumen }, { name: 'Recuento', rows }],
        `inventario-${inventory?.reference ?? inventoryId}-${todayLocalISODate()}`,
      )
      toast.success('Inventario exportado a Excel')
    } catch (err) {
      console.error('Error exportando el inventario:', err)
      toast.error('No se pudo exportar el inventario')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !inventory) {
    return (
      <div className="space-y-4">
        <Link href="/admin/stock?tab=inventario" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Volver a inventarios
        </Link>
        <p className="text-muted-foreground">No se ha encontrado este inventario.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/stock?tab=inventario" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Inventarios
          </Link>
          <h1 className="text-2xl font-semibold mt-1 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            {inventory.reference}
            {inventory.status === 'completed' && (
              <Badge variant="outline" className="bg-sky-100 text-sky-800 border-sky-200">
                Cerrado{inventory.applied_at ? ' · stock ajustado' : ' · sin ajustar'}
              </Badge>
            )}
            {inventory.status === 'cancelled' && (
              <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200">Anulado</Badge>
            )}
            {isOpen && <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">En curso</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {inventory.warehouse?.name ?? 'Almacén'}
            {inventory.warehouse?.store ? ` · ${inventory.warehouse.store.display_name || inventory.warehouse.store.name}` : ''}
            {inventory.started_at ? ` · empezado ${formatDateTime(inventory.started_at)}` : ''}
            {inventory.started_by_profile?.full_name ? ` por ${inventory.started_by_profile.full_name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-1" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exportar a Excel
          </Button>
          {isOpen && (
            <>
              <Button variant="outline" className="gap-1 text-rose-700" onClick={() => setCancelOpen(true)}>
                <X className="h-4 w-4" /> Anular
              </Button>
              <Button className="gap-1" onClick={() => setCloseOpen(true)}>
                <Check className="h-4 w-4" /> Cerrar inventario
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Resumen: "qué había" vs "qué hemos contado" */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Había (sistema)</p>
          <p className="text-2xl font-semibold tabular-nums">{stats.expectedUnits}</p>
          <p className="text-xs text-muted-foreground">{stats.references} referencias</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Contado</p>
          <p className="text-2xl font-semibold tabular-nums">{stats.countedUnits}</p>
          <p className="text-xs text-muted-foreground">{stats.countedLines} referencias</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Sin contar</p>
          <p className="text-2xl font-semibold tabular-nums">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">referencias</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">No cuadran</p>
          <p className="text-2xl font-semibold tabular-nums">{stats.diffs}</p>
          <p className="text-xs text-muted-foreground">{stats.missing} faltan · {stats.surplus} sobran</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Diferencia a coste</p>
          <p className={`text-2xl font-semibold tabular-nums ${stats.valueDiff < 0 ? 'text-rose-700' : stats.valueDiff > 0 ? 'text-emerald-700' : ''}`}>
            {formatCurrency(stats.valueDiff)}
          </p>
          <p className="text-xs text-muted-foreground">sobre lo contado</p>
        </div>
      </div>

      {isOpen && (
        <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
          <Label htmlFor="inventory-scan" className="flex items-center gap-2 text-sm font-medium">
            <ScanBarcode className="h-4 w-4" /> Pasa la pistola (o escribe el código y pulsa Enter)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="inventory-scan"
              ref={scanRef}
              autoFocus
              autoComplete="off"
              value={code}
              placeholder="EAN, referencia de talla o SKU…"
              className="h-11 text-base font-mono max-w-md"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleScan() }
              }}
            />
            <Button onClick={() => handleScan()} disabled={scanning || !code.trim()} className="h-11">
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Contar'}
            </Button>
          </div>
          {recent.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {recent.map((r) => (
                <Badge
                  key={r.id}
                  variant="outline"
                  className={`text-[11px] font-normal ${r.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}
                >
                  {r.text}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as LineFilter)}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(FILTER_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar producto, referencia o EAN…"
          className="w-72"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">{visibleLines.length} de {lines.length} referencias</span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Referencia / EAN</TableHead>
              <TableHead className="text-center">Había</TableHead>
              <TableHead className="text-center">Contado</TableHead>
              <TableHead className="text-center">Diferencia</TableHead>
              <TableHead className="text-right">Valor dif.</TableHead>
              <TableHead>Recuento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                  No hay referencias con este filtro
                </TableCell>
              </TableRow>
            ) : visibleLines.map((l) => {
              const counted = l.counted_quantity === null || l.counted_quantity === undefined ? null : Number(l.counted_quantity)
              const diff = counted === null ? null : counted - Number(l.expected_quantity || 0)
              return (
                <TableRow key={l.id} className={l.id === lastScannedLineId ? 'bg-amber-50' : undefined}>
                  <TableCell className="align-top">
                    <div className="text-sm">{lineName(l)}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-muted-foreground">{l.product_variant?.product?.sku ?? ''}</span>
                      {l.was_extra && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> no estaba en el sistema
                        </Badge>
                      )}
                      {l.id === lastScannedLineId && (
                        <Badge variant="outline" className="text-[10px] font-normal">recién leído</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs align-top">
                    <div>{l.product_variant?.variant_sku ?? '—'}</div>
                    {l.product_variant?.barcode && <div className="text-muted-foreground">{l.product_variant.barcode}</div>}
                  </TableCell>
                  <TableCell className="text-center tabular-nums align-top">{Number(l.expected_quantity || 0)}</TableCell>
                  <TableCell className="text-center align-top">
                    {isOpen ? (
                      <div className="flex items-center justify-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-20 text-center"
                          value={counted === null ? '' : String(counted)}
                          placeholder="—"
                          onChange={(e) => changeCount(l, e.target.value)}
                        />
                        {counted !== null && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground"
                            title="Volver a dejarla sin contar"
                            onClick={() => changeCount(l, '')}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="tabular-nums">{counted === null ? '—' : counted}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center tabular-nums align-top">
                    {diff === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : diff === 0 ? (
                      <span className="text-emerald-700">0</span>
                    ) : (
                      <span className={diff < 0 ? 'text-rose-700 font-medium' : 'text-amber-700 font-medium'}>
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs align-top">
                    {diff === null || diff === 0 ? '—' : formatCurrency(diff * (Number(l.unit_cost) || 0))}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground align-top whitespace-nowrap">
                    {l.counted_at ? (
                      <>
                        <div>{formatDateTime(l.counted_at)}</div>
                        {l.counted_by_profile?.full_name && <div>{l.counted_by_profile.full_name}</div>}
                      </>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={closeOpen} onOpenChange={(v) => { if (!v && !closing) setCloseOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cerrar el inventario {inventory.reference}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Has contado <strong>{stats.countedLines}</strong> de {stats.references} referencias
              {stats.pending > 0 ? `, quedan ${stats.pending} sin contar` : ''}.
              No cuadran <strong>{stats.diffs}</strong> ({formatCurrency(stats.valueDiff)} a coste).
            </p>
            <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
              <Checkbox checked={applyAdjustments} onCheckedChange={(v) => setApplyAdjustments(Boolean(v))} className="mt-0.5" />
              <span>
                <span className="font-medium">Dejar el stock igual a lo contado</span>
                <span className="block text-xs text-muted-foreground">
                  Cada corrección queda registrada como movimiento de inventario en el historial del producto.
                  Si lo dejas sin marcar, el inventario queda solo como informe.
                </span>
              </span>
            </label>
            {stats.pending > 0 && (
              <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
                <Checkbox checked={zeroUncounted} onCheckedChange={(v) => setZeroUncounted(Boolean(v))} className="mt-0.5" />
                <span>
                  <span className="font-medium">Dar por contadas a 0 las {stats.pending} sin contar</span>
                  <span className="block text-xs text-muted-foreground">
                    Solo si has recorrido la tienda entera. Si no, déjalo sin marcar: esas referencias se
                    quedan como estaban.
                  </span>
                </span>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)} disabled={closing}>Cancelar</Button>
            <Button onClick={handleClose} disabled={closing} className="gap-1">
              {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {applyAdjustments ? 'Cerrar y ajustar stock' : 'Cerrar sin tocar el stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={(v) => { if (!v && !cancelling) setCancelOpen(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Anular el inventario {inventory.reference}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se descarta el recuento entero. El stock no se toca y el almacén vuelve a quedar libre
            para empezar otro inventario.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>Volver</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling} className="gap-1">
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Anular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
