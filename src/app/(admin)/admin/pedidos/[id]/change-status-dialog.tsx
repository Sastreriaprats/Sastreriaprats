'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
  // Prendas seleccionadas (multi-selección). Vacío = aplicar a TODO el pedido.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')

  const multiline = lines.length > 1
  // "Todo el pedido" cuando no se marca ninguna prenda o se marcan todas: ruta de
  // propagación forward (y reembolsos en cancelación). Un subconjunto va por la
  // ruta de prendas concretas (`line_ids`).
  const wholeOrder = selectedIds.size === 0 || selectedIds.size === lines.length

  const allStatuses = getStatusesFor(orderType)
  // Estado a EXCLUIR del desplegable: si las prendas afectadas comparten un mismo
  // estado, se oculta ese (no tiene sentido "cambiar" a donde ya están). Si están
  // en estados distintos, se muestran todos.
  const affectedLines = selectedIds.size > 0 ? lines.filter((l) => selectedIds.has(l.id)) : lines
  const affectedStatuses = new Set(affectedLines.map((l) => l.status as string))
  const referenceStatus = affectedStatuses.size === 1 ? [...affectedStatuses][0] : null
  const allowedStatuses = allStatuses.filter((s) => (referenceStatus ? s !== referenceStatus : true))

  const toggleLine = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id); else next.delete(id)
      return next
    })
  }
  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(lines.map((l) => l.id)) : new Set())
  }

  const { execute, isLoading } = useAction(changeOrderStatus, {
    onSuccess: (data: any) => {
      if (!wholeOrder) {
        toast.success(selectedIds.size === 1 ? 'Estado actualizado' : `Estado actualizado (${selectedIds.size} prendas)`)
      } else {
        statusChangeToast(data?.ahead_lines_count ?? 0)
      }
      onOpenChange(false)
      router.refresh()
    },
  })

  const allChecked = selectedIds.size === lines.length && lines.length > 0
  const someChecked = selectedIds.size > 0 && !allChecked

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

          {multiline && (
            <div className="space-y-2">
              <Label>Aplicar a</Label>
              <div className="rounded-md border divide-y">
                <label className="flex items-center gap-2 px-3 py-2 cursor-pointer bg-muted/40">
                  <Checkbox
                    checked={allChecked ? true : (someChecked ? 'indeterminate' : false)}
                    onCheckedChange={(c) => toggleAll(c === true)}
                  />
                  <span className="text-sm font-medium">Todas las prendas</span>
                </label>
                <div className="max-h-52 overflow-y-auto">
                  {lines.map((l: any, i: number) => (
                    <label key={l.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40">
                      <Checkbox
                        checked={selectedIds.has(l.id)}
                        onCheckedChange={(c) => toggleLine(l.id, c === true)}
                      />
                      <span className="text-sm flex-1">Prenda #{i + 1}: {l.garment_types?.name}</span>
                      <Badge className={`${getOrderStatusColor(l.status)} text-[10px]`} variant="secondary">
                        {getOrderStatusLabel(l.status)}
                      </Badge>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {wholeOrder
                  ? 'Se aplicará a todo el pedido (las prendas ya más adelantadas se mantienen).'
                  : `Se cambiarán ${selectedIds.size} ${selectedIds.size === 1 ? 'prenda' : 'prendas'}.`}
              </p>
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
              line_ids: wholeOrder ? undefined : [...selectedIds],
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
