'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, ShieldCheck, Search, Trash2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { listOrphanStockMovements, cleanOrphanStockMovements, type OrphanStockMovement } from '@/actions/stock-maintenance'

export function OrphanMovementsPanel() {
  const { can } = usePermissions()
  const [orphans, setOrphans] = useState<OrphanStockMovement[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Sin permiso de ajuste de stock, el panel no aparece.
  if (!can('stock.adjust')) return null

  async function search() {
    setLoading(true)
    try {
      const res = await listOrphanStockMovements()
      if (res.success) setOrphans(res.data)
      else toast.error(res.error ?? 'Error al buscar movimientos huérfanos')
    } catch {
      toast.error('Error inesperado al buscar')
    } finally {
      setLoading(false)
    }
  }

  async function clean() {
    setCleaning(true)
    try {
      const res = await cleanOrphanStockMovements()
      if (res.success) {
        toast.success(`${res.data.count} movimiento(s) huérfano(s) limpiado(s). El stock no cambia.`)
        setOrphans([])
      } else {
        toast.error(res.error ?? 'Error al limpiar')
      }
    } catch {
      toast.error('Error inesperado al limpiar')
    } finally {
      setCleaning(false)
      setConfirmOpen(false)
    }
  }

  return (
    <Card className="mb-6 border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Integridad de inventario
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Movimientos de stock que quedaron sin su venta/devolución/reserva (huérfanos). Limpiarlos solo
          quita el registro histórico — <strong>no altera el stock actual</strong>.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" size="sm" className="gap-2" onClick={search} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar movimientos huérfanos
        </Button>

        {orphans !== null && (
          orphans.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" /> No hay movimientos huérfanos. Inventario íntegro.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Producto</TableHead>
                      <TableHead className="text-xs">Tipo origen</TableHead>
                      <TableHead className="text-xs text-right">Cantidad</TableHead>
                      <TableHead className="text-xs">Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orphans.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-sm">
                          {o.product_name}{o.variant_desc ? <span className="text-muted-foreground"> · {o.variant_desc}</span> : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{o.reference_type}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{o.quantity}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatDateTime(o.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Limpiar {orphans.length} movimiento{orphans.length !== 1 ? 's' : ''} huérfano{orphans.length !== 1 ? 's' : ''}
              </Button>
            </div>
          )
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={(v) => { if (!cleaning) setConfirmOpen(v) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Limpiar {orphans?.length ?? 0} movimiento(s) huérfano(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán {orphans?.length ?? 0} registro(s) de movimientos cuya entidad ya no existe.
              Esto <strong>no modifica el stock actual</strong> (solo quita el histórico colgado) y queda registrado en auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cleaning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cleaning}
              onClick={(e) => { e.preventDefault(); clean() }}
            >
              {cleaning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sí, limpiar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
