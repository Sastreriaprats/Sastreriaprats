'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Bookmark, Plus, Search } from 'lucide-react'
import { ReservationFormDialog, type ReservationSuccessPayload } from '@/components/reservations/reservation-form-dialog'
import { ReservationSuccessDialog } from '@/components/reservations/reservation-success-dialog'
import { ReservationPickupDialog, type ReservationTicketLinePayload } from './reservation-pickup-dialog'

interface ReservationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: string | null
  cashSessionId?: string | null
  storeName?: string | null
  attendedBy?: string | null
  defaultClientId: string | null
  defaultClientName: string
  onCreated?: () => void
  /** El POS añade la línea al ticket (recogida de reserva). */
  onAddReservationToTicket?: (payload: ReservationTicketLinePayload) => void
}

type Mode = 'menu' | 'new' | 'pickup'

export function ReservationDialog({
  open,
  onOpenChange,
  storeId,
  cashSessionId,
  storeName,
  attendedBy,
  defaultClientId,
  defaultClientName,
  onCreated,
  onAddReservationToTicket,
}: ReservationDialogProps) {
  const [mode, setMode] = useState<Mode>('menu')
  const [successPayload, setSuccessPayload] = useState<ReservationSuccessPayload | null>(null)

  // Al abrir el diálogo padre, volver siempre al menú.
  useEffect(() => {
    if (open) setMode('menu')
  }, [open])

  // Si se cierra cualquier sub-diálogo, cerramos todo.
  const closeAll = () => {
    setMode('menu')
    onOpenChange(false)
  }

  return (
    <>
      {/* Menú con las dos opciones */}
      <Dialog open={open && mode === 'menu'} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="h-5 w-5 text-purple-600" /> Reservas
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <button
              type="button"
              onClick={() => setMode('new')}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 transition-colors px-4 py-8 text-center"
            >
              <Plus className="h-8 w-8 text-purple-700" />
              <span className="font-semibold text-purple-900">Nueva reserva</span>
              <span className="text-xs text-purple-700">Reservar un producto para un cliente</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('pickup')}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 transition-colors px-4 py-8 text-center"
            >
              <Search className="h-8 w-8 text-emerald-700" />
              <span className="font-semibold text-emerald-900">Buscar reserva</span>
              <span className="text-xs text-emerald-700">Entregar o cobrar una reserva existente</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nueva reserva */}
      <ReservationFormDialog
        open={open && mode === 'new'}
        onOpenChange={(v) => {
          if (!v) {
            // Si cierra el form sin crear, volver al menú (no cerrar del todo).
            // Si cierra tras crear con éxito, el success dialog tomará el relevo.
            if (!successPayload) closeAll()
            else setMode('menu')
          }
        }}
        storeId={storeId}
        cashSessionId={cashSessionId ?? null}
        defaultClientId={defaultClientId}
        defaultClientName={defaultClientName}
        lockClient={false}
        allowWarehouseSelection={false}
        onSuccess={(payload) => {
          setSuccessPayload(payload)
          onCreated?.()
          // Cerramos el menú raíz; el success dialog abre aparte.
          setMode('menu')
          onOpenChange(false)
        }}
      />

      {/* Buscar reserva (añadir al ticket / cobro parcial) */}
      <ReservationPickupDialog
        open={open && mode === 'pickup'}
        onOpenChange={(v) => { if (!v) closeAll() }}
        storeId={storeId}
        cashSessionId={cashSessionId}
        onAddToTicket={(payload) => {
          onAddReservationToTicket?.(payload)
          closeAll()
        }}
      />

      {/* Ticket de nueva reserva */}
      <ReservationSuccessDialog
        open={Boolean(successPayload)}
        onOpenChange={(v) => { if (!v) setSuccessPayload(null) }}
        reservation={successPayload}
        attendedBy={attendedBy ?? null}
        storeName={storeName ?? null}
      />
    </>
  )
}
