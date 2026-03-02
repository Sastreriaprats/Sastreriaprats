'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { listStockMovements } from '@/actions/products'

const PAGE_SIZE = 30

const movementTypeLabels: Record<string, string> = {
  sale: 'Venta', return: 'Devolución', purchase: 'Compra proveedor',
  adjustment_positive: 'Ajuste +', adjustment_negative: 'Ajuste -',
  transfer_in: 'Transferencia entrada', transfer_out: 'Transferencia salida',
  initial: 'Stock inicial', reservation: 'Reserva', reservation_release: 'Liberar reserva',
  inventory: 'Inventario',
}

export function MovementsTab() {
  const [movements, setMovements] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [typeFilter, setTypeFilter] = useState('all')

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="h-32 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
            ) : movements.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="h-32 text-center text-muted-foreground">Sin movimientos</TableCell></TableRow>
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
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

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
