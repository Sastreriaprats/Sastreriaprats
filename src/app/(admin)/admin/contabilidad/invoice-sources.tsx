'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ClipboardList, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import {
  listTailoringOrdersForInvoice, getTailoringOrderLinesForInvoice,
  listReservationsForInvoice, getReservationLinesForInvoice,
} from '@/actions/accounting'

/** Línea de factura mínima que este selector produce (sin descuento). */
export type SourceInvoiceLine = { description: string; quantity: number; unit_price: number; tax_rate: number }

type SourceRow = { id: string; number: string; total: number; client_name: string; already_invoiced: boolean }

/**
 * Estado y lógica para asociar una factura a varios pedidos y reservas de
 * sastrería (relación N:M, mig 269). Un mismo hook sirve para "nueva factura" y
 * para el editor. `orderIds`/`reservationIds` se envían a create/updateInvoiceAction.
 */
export function useInvoiceSources() {
  const [orderIds, setOrderIds] = useState<string[]>([])
  const [reservationIds, setReservationIds] = useState<string[]>([])

  const reset = useCallback(() => { setOrderIds([]); setReservationIds([]) }, [])
  const init = useCallback((o: string[], r: string[]) => { setOrderIds(o); setReservationIds(r) }, [])

  return {
    orderIds, reservationIds,
    setOrderIds, setReservationIds,
    reset, init,
    /** ¿La factura declara cubrir algún pedido/reserva? */
    get hasAny() { return orderIds.length > 0 || reservationIds.length > 0 },
  }
}

export type InvoiceSourcesState = ReturnType<typeof useInvoiceSources>

/**
 * Botón + resumen + diálogo para elegir los pedidos y reservas que cubre la
 * factura, cargando además sus líneas. Reutilizable en nueva factura y editor.
 */
export function InvoiceSourcesSection({
  state, clientId, onAddLines,
}: {
  state: InvoiceSourcesState
  clientId: string | undefined
  onAddLines: (lines: SourceInvoiceLine[]) => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loadingLists, setLoadingLists] = useState(false)
  const [applying, setApplying] = useState(false)
  const [orders, setOrders] = useState<SourceRow[]>([])
  const [reservations, setReservations] = useState<SourceRow[]>([])
  // Selección temporal dentro del diálogo (se confirma al pulsar "Añadir").
  const [selOrders, setSelOrders] = useState<Set<string>>(new Set())
  const [selReservations, setSelReservations] = useState<Set<string>>(new Set())

  const openDialog = async () => {
    setDialogOpen(true)
    setLoadingLists(true)
    setSelOrders(new Set(state.orderIds))
    setSelReservations(new Set(state.reservationIds))
    const [ro, rr] = await Promise.all([
      listTailoringOrdersForInvoice({ clientId: clientId || undefined }),
      listReservationsForInvoice({ clientId: clientId || undefined }),
    ])
    if (ro.success) setOrders(ro.data.map(o => ({ id: o.id, number: o.order_number, total: o.total, client_name: o.client_name, already_invoiced: o.already_invoiced })))
    if (rr.success) setReservations(rr.data.map(o => ({ id: o.id, number: o.reservation_number, total: o.total, client_name: o.client_name, already_invoiced: o.already_invoiced })))
    setLoadingLists(false)
  }

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSet(next)
  }

  const confirm = async () => {
    setApplying(true)
    try {
      // Carga y añade líneas SOLO de los orígenes recién marcados (no de los que
      // ya estaban incluidos, para no duplicar líneas). Los desmarcados se quitan
      // del vínculo; sus líneas ya añadidas permanecen y se editan a mano.
      const newOrderIds = [...selOrders].filter(id => !state.orderIds.includes(id))
      const newReservationIds = [...selReservations].filter(id => !state.reservationIds.includes(id))
      const collected: SourceInvoiceLine[] = []
      for (const id of newOrderIds) {
        const r = await getTailoringOrderLinesForInvoice(id)
        if (r.success) collected.push(...r.data.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate })))
      }
      for (const id of newReservationIds) {
        const r = await getReservationLinesForInvoice(id)
        if (r.success) collected.push(...r.data.map(l => ({ description: l.description, quantity: l.quantity, unit_price: l.unit_price, tax_rate: l.tax_rate })))
      }
      if (collected.length) onAddLines(collected)
      state.setOrderIds([...selOrders])
      state.setReservationIds([...selReservations])
      const nDocs = selOrders.size + selReservations.size
      toast.success(nDocs === 0 ? 'Sin pedidos/reservas asociados' : `${nDocs} documento(s) asociado(s)${collected.length ? ` · ${collected.length} línea(s) añadida(s)` : ''}`)
      setDialogOpen(false)
    } finally {
      setApplying(false)
    }
  }

  const includedOrders = orders.filter(o => state.orderIds.includes(o.id))
  const includedReservations = reservations.filter(r => state.reservationIds.includes(r.id))
  // Etiquetas de resumen: si aún no cargamos las listas, mostramos el conteo.
  const summaryCount = state.orderIds.length + state.reservationIds.length

  const removeOrder = (id: string) => state.setOrderIds(state.orderIds.filter(x => x !== id))
  const removeReservation = (id: string) => state.setReservationIds(state.reservationIds.filter(x => x !== id))

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <ClipboardList className="h-3.5 w-3.5 mr-1" /> Escoger pedidos/reservas
      </Button>

      {summaryCount > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {includedOrders.map(o => (
            <Badge key={`o-${o.id}`} variant="secondary" className="gap-1">
              {o.number}
              <button type="button" onClick={() => removeOrder(o.id)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          ))}
          {includedReservations.map(r => (
            <Badge key={`r-${r.id}`} variant="secondary" className="gap-1">
              {r.number}
              <button type="button" onClick={() => removeReservation(r.id)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
            </Badge>
          ))}
          {includedOrders.length + includedReservations.length < summaryCount && (
            // Ids incluidos que aún no están en las listas cargadas (p. ej. al abrir el editor).
            <Badge variant="secondary">{summaryCount - includedOrders.length - includedReservations.length} más</Badge>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Pedidos y reservas de la factura</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Marca los pedidos y reservas{clientId ? ' del cliente' : ''} que cubre esta factura. Se añaden sus líneas y quedan asociados para el bloqueo de precios.
          </p>

          {loadingLists ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-4 max-h-[26rem] overflow-y-auto pr-1">
              <SourceGroup title="Pedidos de sastrería" rows={orders} sel={selOrders} onToggle={id => toggle(selOrders, setSelOrders, id)} preIncluded={state.orderIds} />
              <SourceGroup title="Reservas" rows={reservations} sel={selReservations} onToggle={id => toggle(selReservations, setSelReservations, id)} preIncluded={state.reservationIds} />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={applying}>Cancelar</Button>
            <Button onClick={confirm} disabled={applying || loadingLists}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Aplicar ({selOrders.size + selReservations.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SourceGroup({
  title, rows, sel, onToggle, preIncluded,
}: {
  title: string
  rows: SourceRow[]
  sel: Set<string>
  onToggle: (id: string) => void
  preIncluded: string[]
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No hay.</p>
      ) : (
        <div className="space-y-1">
          {rows.map(o => {
            // "Ya facturado" en OTRA factura vigente. Si ya estaba incluido en
            // ESTA factura (preIncluded), se puede desmarcar sin problema.
            const blocked = o.already_invoiced && !preIncluded.includes(o.id)
            const checked = sel.has(o.id)
            return (
              <label
                key={o.id}
                className={`flex items-center gap-2 rounded border p-2.5 ${blocked ? 'opacity-60' : 'cursor-pointer hover:bg-muted'}`}
              >
                <Checkbox checked={checked} disabled={blocked} onCheckedChange={() => !blocked && onToggle(o.id)} />
                <span className="font-mono font-medium text-sm">{o.number}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">{o.client_name}</span>
                {blocked && <Badge variant="outline" className="text-[10px]">Ya facturado</Badge>}
                <span className="font-semibold text-sm shrink-0">{formatCurrency(o.total)}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
