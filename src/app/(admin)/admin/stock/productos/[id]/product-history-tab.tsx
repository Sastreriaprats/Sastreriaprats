'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Inbox } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { getProductMovementHistory, type ProductMovementHistory } from '@/actions/products'
import { cn } from '@/lib/utils'

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  purchase_receipt:    { label: 'Entrada',           className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  initial:             { label: 'Stock inicial',     className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  sale:                { label: 'Venta',             className: 'bg-blue-100 text-blue-800 border-blue-200' },
  return:              { label: 'Devolución',        className: 'bg-amber-100 text-amber-800 border-amber-200' },
  adjustment_positive: { label: 'Ajuste +',          className: 'bg-green-50 text-green-800 border-green-200' },
  adjustment_negative: { label: 'Ajuste -',          className: 'bg-red-100 text-red-800 border-red-200' },
  transfer_in:         { label: 'Traspaso entrada',  className: 'bg-purple-100 text-purple-800 border-purple-200' },
  transfer_out:        { label: 'Traspaso salida',   className: 'bg-purple-100 text-purple-800 border-purple-200' },
  reservation:         { label: 'Reserva',           className: 'bg-slate-200 text-slate-700 border-slate-300' },
  reservation_release: { label: 'Liberación reserva', className: 'bg-slate-200 text-slate-700 border-slate-300' },
  inventory:           { label: 'Inventario',        className: 'bg-slate-200 text-slate-700 border-slate-300' },
}

function buildDetail(m: ProductMovementHistory['movements'][number]): string {
  switch (m.movement_type) {
    case 'sale': {
      const ticket = m.ticket_number ? `Venta ${m.ticket_number}` : 'Venta'
      const client = m.client_name || 'Sin cliente'
      return `${ticket} — ${client}`
    }
    case 'purchase_receipt': {
      const ord = m.supplier_order_number ? `Recepción ${m.supplier_order_number}` : 'Recepción'
      const sup = m.supplier_name ? ` — ${m.supplier_name}` : ''
      return `${ord}${sup}`
    }
    case 'return':
      return `Devolución${m.reason ? ` — ${m.reason}` : ''}`
    case 'adjustment_positive':
    case 'adjustment_negative':
      return `Ajuste${m.reason ? ` — ${m.reason}` : ''}`
    case 'transfer_in':
    case 'transfer_out':
      return `Traspaso${m.reason ? ` — ${m.reason}` : ''}`
    case 'reservation':
      return 'Reserva'
    case 'reservation_release':
      return 'Liberación reserva'
    case 'initial':
      return 'Stock inicial'
    case 'inventory':
      return `Inventario${m.reason ? ` — ${m.reason}` : ''}`
    default:
      return m.reason || m.notes || '—'
  }
}

function variantLabel(v: { variant_sku: string; size: string | null; color: string | null }) {
  const parts: string[] = [v.variant_sku]
  if (v.size) parts.push(`T.${v.size}`)
  if (v.color) parts.push(v.color)
  return parts.join(' · ')
}

export function ProductHistoryTab({ productId }: { productId: string }) {
  const [data, setData] = useState<ProductMovementHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [variantFilter, setVariantFilter] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getProductMovementHistory({ productId })
      .then((r) => {
        if (cancelled) return
        if (r.success) setData(r.data)
        else setData(null)
      })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [productId])

  const filteredMovements = useMemo(() => {
    if (!data) return []
    if (variantFilter === 'all') return data.movements
    return data.movements.filter(m => m.product_variant_id === variantFilter)
  }, [data, variantFilter])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return <p className="text-center text-muted-foreground py-12">No se pudo cargar el historial.</p>
  }

  const { kpis, variants, movements } = data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Total recibido</p>
          <p className="text-xl font-bold text-emerald-700">{kpis.total_received} uds</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Total vendido</p>
          <p className="text-xl font-bold text-blue-700">{kpis.total_sold} uds</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Total devuelto</p>
          <p className="text-xl font-bold text-amber-700">{kpis.total_returned} uds</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">
            {kpis.first_reception_at ? 'Días desde 1ª recepción' : 'Primera recepción'}
          </p>
          <p className="text-xl font-bold">
            {kpis.days_since_first_reception != null
              ? `${kpis.days_since_first_reception} días`
              : <span className="text-muted-foreground text-sm font-normal">Sin recepciones aún</span>}
          </p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Movimientos cronológicos</CardTitle>
            {variants.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Filtrar variante:</span>
                <Select value={variantFilter} onValueChange={setVariantFilter}>
                  <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las variantes</SelectItem>
                    {variants.map(v => (
                      <SelectItem key={v.id} value={v.id}>{variantLabel(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {movements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Inbox className="mx-auto h-10 w-10 mb-3 opacity-30" />
              <p>Este producto aún no tiene movimientos de stock.</p>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No hay movimientos para la variante seleccionada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Variante</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-center">Stock antes → después</TableHead>
                    <TableHead>Almacén</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map((m) => {
                    const badge = TYPE_BADGE[m.movement_type] ?? { label: m.movement_type, className: 'bg-slate-100 text-slate-700 border-slate-200' }
                    const qtyClass = m.quantity > 0 ? 'text-emerald-700' : m.quantity < 0 ? 'text-red-700' : ''
                    const sign = m.quantity > 0 ? '+' : ''
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(m.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs font-medium', badge.className)}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="font-mono">{m.variant_sku}</div>
                          {(m.size || m.color) && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              {m.size && <span>T.{m.size}</span>}
                              {m.color && <span className="flex items-center gap-1">
                                {m.color_hex && <span className="h-2 w-2 rounded-full border" style={{ backgroundColor: m.color_hex }} />}
                                {m.color}
                              </span>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={cn('text-right font-semibold tabular-nums', qtyClass)}>{sign}{m.quantity}</TableCell>
                        <TableCell className="text-center text-sm tabular-nums text-muted-foreground">
                          {m.stock_before} → <span className="font-semibold text-foreground">{m.stock_after}</span>
                        </TableCell>
                        <TableCell className="text-sm">{m.warehouse_name ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.user_name ?? '—'}</TableCell>
                        <TableCell className="text-sm max-w-[300px]">{buildDetail(m)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
