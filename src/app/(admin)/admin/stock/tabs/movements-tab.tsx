'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { listStockMovements, reverseStockMovement } from '@/actions/products'

const PAGE_SIZE = 30

const movementTypeLabels: Record<string, string> = {
  sale: 'Venta', return: 'Devolución', purchase: 'Compra proveedor',
  purchase_receipt: 'Recepción pedido',
  adjustment_positive: 'Ajuste +', adjustment_negative: 'Ajuste -',
  transfer_in: 'Transferencia entrada', transfer_out: 'Transferencia salida',
  initial: 'Stock inicial', reservation: 'Reserva', reservation_release: 'Liberar reserva',
  inventory: 'Inventario',
}

export function MovementsTab() {
  const { can } = usePermissions()
  const canReverse = can('stock_movements.reverse')
  const [movements, setMovements] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [typeFilter, setTypeFilter] = useState('all')
  const [revTarget, setRevTarget] = useState<any | null>(null)
  const [reversing, setReversing] = useState(false)

  const fetchMovements = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await listStockMovements({
        page,
        pageSize: PAGE_SIZE,
        typeFilter,
      })
      if (result.success && result.data) {
        setMovements(result.data.data)
        setTotal(result.data.total)
      } else {
        setMovements([])
        setTotal(0)
      }
    } catch (err) {
      console.error('[MovementsTab] fetchMovements error:', err)
      setMovements([])
      setTotal(0)
    } finally {
      setIsLoading(false)
    }
  }, [page, typeFilter])

  useEffect(() => { fetchMovements() }, [fetchMovements])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const isReversible = (m: any) =>
    canReverse && (m.movement_type === 'adjustment_positive' || m.movement_type === 'adjustment_negative')
    && m.reference_type !== 'reversal' && !m.reverted
  const revDelta = revTarget ? -revTarget.quantity : 0
  const revResulting = revTarget && revTarget.current_stock != null ? revTarget.current_stock + revDelta : null
  const revNegative = revResulting != null && revResulting < 0

  const doReverse = async () => {
    if (!revTarget) return
    setReversing(true)
    const r = await reverseStockMovement({ movementId: revTarget.id })
    setReversing(false)
    setRevTarget(null)
    if (r.success) { toast.success('Movimiento revertido'); fetchMovements() }
    else toast.error(r.error)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0) }}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Tipo de movimiento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {Object.entries(movementTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Producto</TableHead>
              <TableHead>Almacén</TableHead><TableHead>Cantidad</TableHead><TableHead>Stock ant.</TableHead>
              <TableHead>Stock post.</TableHead><TableHead>Motivo</TableHead><TableHead>Usuario</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="h-32 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
            ) : movements.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="h-32 text-center text-muted-foreground">Sin movimientos</TableCell></TableRow>
            ) : movements.map((m: any) => {
              const isPositive = m.quantity > 0
              const Icon = isPositive ? ArrowUp : m.quantity < 0 ? ArrowDown : Minus
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(m.created_at)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs gap-1"><Icon className={`h-3 w-3 ${isPositive ? 'text-green-600' : 'text-red-600'}`} />{movementTypeLabels[m.movement_type] || m.movement_type}</Badge></TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{m.product_variants?.products?.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{m.product_variants?.variant_sku}</p>
                  </TableCell>
                  <TableCell className="text-sm">{m.warehouses?.name}</TableCell>
                  <TableCell>
                    <span className={`font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : ''}{m.quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.stock_before}</TableCell>
                  <TableCell className="text-sm font-medium">{m.stock_after}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{m.reason || m.notes || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.profiles?.full_name}</TableCell>
                  <TableCell className="text-right">
                    {isReversible(m) ? (
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setRevTarget(m)}>
                        <Undo2 className="h-3.5 w-3.5" /> Revertir
                      </Button>
                    ) : m.reference_type === 'reversal' ? (
                      <span className="text-xs text-muted-foreground">reversión</span>
                    ) : m.reverted ? (
                      <span className="text-xs text-muted-foreground">revertido</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!revTarget} onOpenChange={(o) => { if (!o) setRevTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revertir este ajuste de stock?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Se creará un movimiento de contrapartida de <span className="font-semibold">{revDelta > 0 ? '+' : ''}{revDelta} uds</span> en <span className="font-semibold">{revTarget?.warehouses?.name}</span> para <span className="font-semibold">{revTarget?.product_variants?.products?.name}</span>.</p>
                {revTarget?.current_stock != null ? (
                  <p>Stock actual: <span className="font-semibold tabular-nums">{revTarget.current_stock}</span> → resultante: <span className={`font-semibold tabular-nums ${revNegative ? 'text-red-600' : ''}`}>{revResulting}</span></p>
                ) : (
                  <p className="text-muted-foreground">No se pudo leer el stock actual.</p>
                )}
                {revNegative && <p className="text-red-600 font-medium">El stock quedaría negativo. Probablemente las unidades ya se movieron; haz un ajuste manual con el motivo concreto.</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); doReverse() }} disabled={reversing || revNegative}>
              {reversing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Revertir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} movimientos</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm">{page + 1} / {totalPages || 1}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  )
}
