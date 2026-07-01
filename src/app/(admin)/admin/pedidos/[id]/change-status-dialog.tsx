'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useAction } from '@/hooks/use-action'
import { changeOrderStatus } from '@/actions/orders'
import { getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { getStatusesFor } from '@/lib/orders/statuses'
import { statusChangeToast } from '@/lib/orders/status-toast'

export function ChangeStatusDialog({ open, onOpenChange, orderId, currentStatus, lines, orderType = 'artesanal', totalPaid = 0 }: {
  open: boolean; onOpenChange: (open: boolean) => void
  orderId: string; currentStatus: string; lines: any[]
  orderType?: string
  totalPaid?: number
}) {
  const router = useRouter()
  const [newStatus, setNewStatus] = useState('')
  const [lineId, setLineId] = useState<string>('')
  const [notes, setNotes] = useState('')

  const allStatuses = getStatusesFor(orderType)
  // El estado a EXCLUIR es el de la PRENDA seleccionada (cuando se aplica a una
  // concreta); si no, el del pedido. Antes se excluía siempre el del pedido, lo
  // que ocultaba el estado deseado para una prenda que va por detrás (p.ej. no
  // dejaba poner "Tejido pedido a fabricante" a una prenda en "Creado" si el
  // pedido ya figuraba en ese estado por otras prendas más avanzadas).
  const selectedLine = lineId && lineId !== 'all' ? lines.find((l) => l.id === lineId) : null
  const referenceStatus = (selectedLine?.status as string | undefined) ?? currentStatus
  const allowedStatuses = allStatuses.filter(s => s !== referenceStatus)


  const { execute, isLoading } = useAction(changeOrderStatus, {
    onSuccess: (data: any) => {
      // Cambio por línea individual (no "Todo el pedido"): sin propagación.
      const isSingleLine = !!lineId && lineId !== 'all'
      if (isSingleLine) toast.success('Estado actualizado')
      else statusChangeToast(data?.ahead_lines_count ?? 0)
      onOpenChange(false)
      router.refresh()
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Estado del pedido</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <Badge className={`${getOrderStatusColor(currentStatus)}`}>{getOrderStatusLabel(currentStatus)}</Badge>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            {newStatus ? (
              <Badge className={`${getOrderStatusColor(newStatus)}`}>{getOrderStatusLabel(newStatus)}</Badge>
            ) : (
              <span className="text-sm text-muted-foreground">Seleccionar...</span>
            )}
          </div>

          <div className="space-y-2">
            <Label>Nuevo estado *</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
              <SelectContent>
                {allowedStatuses.map(s => (
                  <SelectItem key={s} value={s}>{getOrderStatusLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              El estado del pedido se calcula solo: sigue al de la prenda <strong>menos avanzada</strong>. No llega a un estado hasta que todas las prendas lo alcanzan.
            </p>
          </div>

          {newStatus === 'cancelled' && currentStatus === 'delivered' && (Number(totalPaid) || 0) > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              Este pedido ya está <strong>entregado</strong> y tiene cobros registrados. Al cancelarlo <strong>NO se reembolsan automáticamente</strong> (el cliente ya tiene la prenda). Si quieres devolver el dinero, regístralo a mano como un gasto en la caja (devolución de pedido).
            </div>
          )}

          {lines.length > 1 && (
            <div className="space-y-2">
              <Label>Aplicar a</Label>
              <Select value={lineId} onValueChange={setLineId}>
                <SelectTrigger><SelectValue placeholder="Todas las prendas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las prendas</SelectItem>
                  {lines.map((l: any, i: number) => (
                    <SelectItem key={l.id} value={l.id}>
                      Prenda #{i + 1}: {l.garment_types?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Motivo del cambio..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => execute({
              order_id: orderId,
              line_id: lineId && lineId !== 'all' ? lineId : undefined,
              new_status: newStatus,
              notes: notes || undefined,
            })}
            disabled={isLoading || !newStatus}
            className="bg-prats-navy hover:bg-prats-navy-light"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Confirmar cambio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
