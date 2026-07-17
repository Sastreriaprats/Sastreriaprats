'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAction } from '@/hooks/use-action'
import { changeOrderStatus } from '@/actions/orders'
import { getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { getStatusesFor, getStatusIndex } from '@/lib/orders/statuses'

/**
 * Chip de estado de UNA prenda, clicable: abre un menú con los estados del
 * pipeline de su order_type y aplica el cambio al momento — misma ruta de
 * servidor que el diálogo "Estado del pedido" con una sola prenda marcada
 * (set directo + historial + rederivación del estado del pedido).
 *
 * Retroceder o cancelar pide confirmación ligera para evitar misclicks en un
 * elemento que antes era estático.
 */
export function LineStatusChip({ orderId, line, orderType, disabled = false }: {
  orderId: string
  line: { id: string; status: string }
  orderType: string | null | undefined
  disabled?: boolean
}) {
  const router = useRouter()
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null)

  const { execute, isLoading } = useAction(changeOrderStatus, {
    onSuccess: () => {
      toast.success('Estado actualizado')
      router.refresh()
    },
  })

  if (disabled) {
    return (
      <Badge className={`text-xs ${getOrderStatusColor(line.status)}`}>
        {getOrderStatusLabel(line.status)}
      </Badge>
    )
  }

  const options = getStatusesFor(orderType).filter((s) => s !== line.status)
  // Delicado = cancelación o retroceso real dentro del pipeline (incident es
  // transversal y reversible: aplica directo).
  const isDelicate = (target: string) => {
    if (target === 'cancelled') return true
    const ti = getStatusIndex(target, orderType)
    const ci = getStatusIndex(line.status, orderType)
    return ti >= 0 && ci >= 0 && ti < ci
  }

  const apply = (target: string) =>
    execute({ order_id: orderId, line_ids: [line.id], new_status: target })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={isLoading}>
          <button type="button" className="focus:outline-none" title="Cambiar estado de la prenda">
            <Badge className={`text-xs cursor-pointer inline-flex items-center gap-1 ${getOrderStatusColor(line.status)}`}>
              {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              {getOrderStatusLabel(line.status)}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Badge>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {options.map((s) => (
            <DropdownMenuItem
              key={s}
              className="gap-2"
              onClick={() => (isDelicate(s) ? setConfirmStatus(s) : apply(s))}
            >
              <span className={`h-2 w-2 rounded-full shrink-0 ${getOrderStatusColor(s).split(' ')[0]}`} />
              {getOrderStatusLabel(s)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmStatus !== null} onOpenChange={(v) => { if (!v) setConfirmStatus(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmStatus === 'cancelled' ? '¿Cancelar esta prenda?' : '¿Retroceder el estado?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmStatus === 'cancelled'
                ? 'La prenda pasará a Cancelada. Si es la última prenda viva, el pedido entero quedará cancelado (y se repondrá el tejido). Los cobros NO se reembolsan automáticamente.'
                : `La prenda volverá a "${confirmStatus ? getOrderStatusLabel(confirmStatus) : ''}". El estado del pedido se recalculará al de la prenda menos avanzada.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, dejar como está</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmStatus) apply(confirmStatus); setConfirmStatus(null) }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
