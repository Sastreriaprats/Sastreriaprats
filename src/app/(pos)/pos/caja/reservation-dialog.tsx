'use client'

import { ReservationFormDialog } from '@/components/reservations/reservation-form-dialog'

interface ReservationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: string | null
  defaultClientId: string | null
  defaultClientName: string
  onCreated?: () => void
}

export function ReservationDialog({
  open,
  onOpenChange,
  storeId,
  defaultClientId,
  defaultClientName,
  onCreated,
}: ReservationDialogProps) {
  return (
    <ReservationFormDialog
      open={open}
      onOpenChange={onOpenChange}
      storeId={storeId}
      defaultClientId={defaultClientId}
      defaultClientName={defaultClientName}
      lockClient={false}
      allowWarehouseSelection={false}
      onSuccess={() => { onCreated?.() }}
    />
  )
}
