'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Bookmark, Printer, Download, Check, Clock, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { generateReservationPdf, printReservationPdf, type ReservationTicketData } from '@/components/pos/ticket-pdf'
import { getStorePdfData } from '@/lib/pdf/pdf-company'
import type { ReservationSuccessPayload } from './reservation-form-dialog'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  bizum: 'Bizum',
  transfer: 'Transferencia',
  voucher: 'Vale',
}

interface ReservationSuccessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reservation: ReservationSuccessPayload | null
  attendedBy?: string | null
  storeName?: string | null
}

export function ReservationSuccessDialog({
  open,
  onOpenChange,
  reservation,
  attendedBy,
  storeName,
}: ReservationSuccessDialogProps) {
  const [printing, setPrinting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  if (!reservation) return null

  const buildTicketData = (): ReservationTicketData => {
    const storeConfig = getStorePdfData(storeName || undefined)
    return {
      reservation_number: reservation.reservation_number,
      created_at: new Date().toISOString(),
      expires_at: reservation.expires_at,
      status: reservation.status,
      payment_status: reservation.payment_status,
      lines: reservation.lines.map((ln) => {
        const variantBits = [ln.size ? `T.${ln.size}` : null, ln.color].filter(Boolean).join(' · ')
        return {
          description: variantBits ? `${ln.product_name} (${variantBits})` : ln.product_name,
          sku: ln.sku,
          size: ln.size,
          color: ln.color,
          quantity: ln.quantity,
          unit_price: ln.unit_price,
          line_total: ln.line_total,
        }
      }),
      total: reservation.total,
      total_paid: reservation.total_paid,
      payments: reservation.initial_payment
        ? [{ payment_method: reservation.initial_payment.method, amount: reservation.initial_payment.amount }]
        : [],
      clientName: reservation.client?.name ?? null,
      clientCode: reservation.client?.code ?? null,
      attendedBy: attendedBy ?? null,
      storeAddress: storeConfig.address,
      storeSubtitle: storeConfig.subtitle,
      storePhones: storeConfig.phones,
      reason: reservation.reason,
      notes: reservation.notes,
    }
  }

  const handlePrint = async () => {
    setPrinting(true)
    try {
      await printReservationPdf(buildTicketData())
    } finally {
      setPrinting(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await generateReservationPdf(buildTicketData(), 'download')
    } finally {
      setDownloading(false)
    }
  }

  const pending = Math.max(0, reservation.total - reservation.total_paid)
  const statusBadge = reservation.status === 'active'
    ? { label: 'Stock bloqueado', className: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Bookmark }
    : { label: 'Pendiente de stock', className: 'bg-amber-100 text-amber-800 border-amber-200', icon: Clock }
  const Icon = statusBadge.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-purple-600" />
            Reserva creada
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Nº Reserva</p>
            <p className="text-xl font-mono font-bold text-slate-900 mt-0.5">{reservation.reservation_number}</p>
            <div className="mt-2">
              <Badge variant="outline" className={`text-xs ${statusBadge.className}`}>
                <Icon className="h-3 w-3 mr-0.5" /> {statusBadge.label}
              </Badge>
            </div>
          </div>

          {reservation.client && (
            <div className="flex justify-between items-center py-1 border-b border-slate-100 text-sm">
              <span className="text-slate-600">Cliente</span>
              <span className="font-medium truncate ml-2">{reservation.client.name}</span>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Productos ({reservation.lines.length})</p>
            <div className="rounded-md border divide-y text-sm">
              {reservation.lines.map((ln) => {
                const variantBits = [ln.size ? `T.${ln.size}` : null, ln.color].filter(Boolean).join(' · ')
                const lineBadge = ln.status === 'active'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
                return (
                  <div key={ln.id} className="flex items-start gap-2 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{ln.product_name}</div>
                      {variantBits && <div className="text-xs text-muted-foreground">{variantBits}</div>}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {ln.quantity} × {formatCurrency(ln.unit_price)}
                        <Badge variant="outline" className={`ml-2 text-[10px] ${lineBadge}`}>
                          {ln.status === 'active' ? 'Stock bloqueado' : 'Pendiente'}
                        </Badge>
                      </div>
                    </div>
                    <div className="font-semibold tabular-nums text-sm">
                      {formatCurrency(ln.line_total)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-1 text-sm">
            <div className="flex justify-between items-center py-1 border-b border-slate-100">
              <dt className="text-slate-600">Total</dt>
              <dd className="font-bold tabular-nums">{formatCurrency(reservation.total)}</dd>
            </div>
            {reservation.initial_payment && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <dt className="text-slate-600">
                  Pagado ({PAYMENT_LABELS[reservation.initial_payment.method] || reservation.initial_payment.method})
                </dt>
                <dd className="font-medium tabular-nums text-emerald-700">
                  {formatCurrency(reservation.total_paid)}
                </dd>
              </div>
            )}
            <div className="flex justify-between items-center py-1">
              <dt className="text-slate-600 font-medium">Pendiente</dt>
              <dd className={`font-bold tabular-nums ${pending > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {formatCurrency(pending)}
              </dd>
            </div>
          </dl>
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:flex-row border-t pt-4">
          <Button
            className="flex-1 min-w-[140px] gap-2 bg-prats-gold text-prats-navy hover:opacity-90"
            onClick={handlePrint}
            disabled={printing || downloading}
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Imprimir ticket
          </Button>
          <Button
            variant="outline"
            className="flex-1 min-w-[140px] gap-2"
            onClick={handleDownload}
            disabled={printing || downloading}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Descargar PDF
          </Button>
          <Button
            className="flex-1 min-w-[140px] bg-prats-navy hover:bg-prats-navy-light text-white gap-1"
            onClick={() => onOpenChange(false)}
          >
            <Check className="h-4 w-4" /> Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
