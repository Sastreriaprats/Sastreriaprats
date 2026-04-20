'use client'

import { useState } from 'react'
import { ReservationFormDialog, type ReservationSuccessPayload } from '@/components/reservations/reservation-form-dialog'
import { ReservationSuccessDialog } from '@/components/reservations/reservation-success-dialog'

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
}

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
}: ReservationDialogProps) {
  const [successPayload, setSuccessPayload] = useState<ReservationSuccessPayload | null>(null)

  return (
    <>
      <ReservationFormDialog
        open={open}
        onOpenChange={onOpenChange}
        storeId={storeId}
        cashSessionId={cashSessionId ?? null}
        defaultClientId={defaultClientId}
        defaultClientName={defaultClientName}
        lockClient={false}
        allowWarehouseSelection={false}
        onSuccess={(payload) => {
          setSuccessPayload(payload)
          onCreated?.()
        }}
      />
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
