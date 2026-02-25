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
import { useAction } from '@/hooks/use-action'
import { changeOrderStatus } from '@/actions/orders'
import { getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'

const allStatusesByType: Record<string, string[]> = {
  artesanal: ['created', 'in_production', 'fitting', 'adjustments', 'finished', 'delivered', 'incident', 'cancelled'],
  industrial: ['created', 'fabric_ordered', 'fabric_received', 'in_production', 'finished', 'delivered', 'incident', 'cancelled'],
  oficial: ['created', 'requested', 'in_production', 'supplier_delivered', 'delivered', 'cancelled'],
  proveedor: ['created', 'requested', 'supplier_delivered', 'finished', 'cancelled'],
}

export function ChangeStatusDialog({ open, onOpenChange, orderId, currentStatus, lines, orderType = 'artesanal' }: {
  open: boolean; onOpenChange: (open: boolean) => void
  orderId: string; currentStatus: string; lines: any[]
  orderType?: 'artesanal' | 'industrial' | 'proveedor' | 'oficial'
}) {
  const router = useRouter()
  const [newStatus, setNewStatus] = useState('')
  const [lineId, setLineId] = useState<string>('')
  const [notes, setNotes] = useState('')

  const allStatuses = allStatusesByType[orderType] || allStatusesByType.artesanal
  const allowedStatuses = allStatuses.filter(s => s !== currentStatus)


  const { execute, isLoading } = useAction(changeOrderStatus, {
    successMessage: 'Estado actualizado',
    onSuccess: () => { onOpenChange(false); router.refresh() },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cambiar estado del pedido</DialogTitle></DialogHeader>
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
          </div>

          {lines.length > 1 && (
            <div className="space-y-2">
              <Label>Aplicar a</Label>
              <Select value={lineId} onValueChange={setLineId}>
                <SelectTrigger><SelectValue placeholder="Todo el pedido" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo el pedido</SelectItem>
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
