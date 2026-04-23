'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Plus, ChevronLeft, ChevronRight, X, Check, Pencil, Bookmark, Clock, Printer, Euro, Banknote, CreditCard, Smartphone, ArrowRightLeft, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import {
  listReservations,
  cancelReservation,
  cancelReservationLine,
  updateReservation,
  fulfillReservationLine,
  addReservationPayment,
} from '@/actions/reservations'
import { ReservationFormDialog } from '@/components/reservations/reservation-form-dialog'
import { generateReservationPdf, printReservationPdf, type ReservationTicketData } from '@/components/pos/ticket-pdf'
import { getStorePdfData } from '@/lib/pdf/pdf-company'
import type { ReservationPaymentMethod } from '@/lib/validations/reservations'

const PAGE_SIZE = 20

const STATUS_LABELS: Record<string, string> = {
  all: 'Todas',
  active: 'Activas',
  pending_stock: 'Pendientes de stock',
  fulfilled: 'Cumplidas',
  cancelled: 'Canceladas',
  expired: 'Expiradas',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active:        { label: 'Activa',            className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  pending_stock: { label: 'Pendiente stock',   className: 'bg-amber-100 text-amber-800 border-amber-200' },
  fulfilled:     { label: 'Cumplida',          className: 'bg-sky-100 text-sky-800 border-sky-200' },
  cancelled:     { label: 'Cancelada',         className: 'bg-slate-100 text-slate-700 border-slate-200' },
  expired:       { label: 'Expirada',          className: 'bg-rose-100 text-rose-800 border-rose-200' },
}

type ReservationLine = {
  id: string
  product_variant_id: string
  warehouse_id: string
  quantity: number
  unit_price: number | string
  line_total: number | string
  status: 'active' | 'pending_stock' | 'fulfilled' | 'cancelled' | 'expired' | string
  product_variant?: {
    id: string
    variant_sku?: string | null
    size?: string | null
    color?: string | null
    product?: { id?: string; sku?: string; name?: string; main_image_url?: string | null; tax_rate?: number | string | null } | null
  } | null
  warehouse?: { id: string; code?: string | null; name?: string | null } | null
}

type Reservation = {
  id: string
  reservation_number: string
  status: keyof typeof STATUS_BADGE
  quantity: number | null
  total: number | string
  total_paid: number | string
  payment_status: 'pending' | 'partial' | 'paid'
  notes: string | null
  reason: string | null
  expires_at: string | null
  created_at: string
  cancelled_at: string | null
  client?: { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null; client_code?: string | null; phone?: string | null } | null
  store?: { id: string; code?: string | null; name?: string | null; display_name?: string | null } | null
  lines?: ReservationLine[]
  payments?: Array<{ id: string; payment_date: string; payment_method: string; amount: number | string; reference: string | null; notes: string | null; created_at: string }>
}

const PAYMENT_METHOD_OPTIONS: Array<{ value: ReservationPaymentMethod; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'cash',     label: 'Efectivo',      icon: Banknote },
  { value: 'card',     label: 'Tarjeta',       icon: CreditCard },
  { value: 'bizum',    label: 'Bizum',         icon: Smartphone },
  { value: 'transfer', label: 'Transferencia', icon: ArrowRightLeft },
]

const PAYMENT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Sin pago',   className: 'bg-slate-100 text-slate-700 border-slate-200' },
  partial: { label: 'Parcial',    className: 'bg-amber-100 text-amber-800 border-amber-200' },
  paid:    { label: 'Pagada',     className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
}

function getClientName(c: Reservation['client']): string {
  if (!c) return '—'
  return c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.client_code || '—'
}

function getLineDescription(ln: ReservationLine): string {
  const name = ln.product_variant?.product?.name || '—'
  const variantBits = [ln.product_variant?.size ? `T.${ln.product_variant.size}` : null, ln.product_variant?.color].filter(Boolean).join(' · ')
  return variantBits ? `${name} — ${variantBits}` : name
}

function getTotalQuantity(r: Reservation): number {
  if (r.quantity !== null && r.quantity !== undefined) return Number(r.quantity)
  return (r.lines || [])
    .filter((l) => l.status !== 'cancelled')
    .reduce((acc, l) => acc + Number(l.quantity || 0), 0)
}

export function ReservationsTab() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)

  const [status, setStatus] = useState<string>('all')
  const [onlyPending, setOnlyPending] = useState(false)
  const [search, setSearch] = useState('')

  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<Reservation | null>(null)
  const [editing, setEditing] = useState<Reservation | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editExpires, setEditExpires] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [cancelReasonInput, setCancelReasonInput] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const [cancelLineTarget, setCancelLineTarget] = useState<{ reservation: Reservation; line: ReservationLine } | null>(null)

  const [paymentTarget, setPaymentTarget] = useState<Reservation | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<ReservationPaymentMethod>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)

  const [printingId, setPrintingId] = useState<string | null>(null)

  const [actioningLineId, setActioningLineId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const result = await listReservations({
      status: status as any,
      onlyPending: onlyPending || undefined,
      search: search.trim() || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
    setLoading(false)
    if (result.success && result.data) {
      setReservations(result.data.data as Reservation[])
      setTotal(result.data.total)
    } else {
      setReservations([])
      setTotal(0)
    }
  }, [page, status, onlyPending, search])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openEdit = (r: Reservation) => {
    setEditing(r)
    setEditNotes(r.notes ?? '')
    setEditReason(r.reason ?? '')
    setEditExpires(r.expires_at ? r.expires_at.slice(0, 10) : '')
  }

  const saveEdit = async () => {
    if (!editing) return
    setEditSubmitting(true)
    const res = await updateReservation({
      id: editing.id,
      notes: editNotes || null,
      reason: editReason || null,
      expires_at: editExpires ? new Date(editExpires).toISOString() : null,
    })
    setEditSubmitting(false)
    if (!res.success) { toast.error(res.error || 'No se pudo actualizar la reserva'); return }
    toast.success('Reserva actualizada')
    setEditing(null)
    fetchData()
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    const res = await cancelReservation({ id: cancelTarget.id, reason: cancelReasonInput || null })
    setCancelling(false)
    if (!res.success) { toast.error(res.error || 'No se pudo cancelar la reserva'); return }
    toast.success('Reserva cancelada')
    setCancelTarget(null)
    setCancelReasonInput('')
    fetchData()
  }

  const confirmCancelLine = async () => {
    if (!cancelLineTarget) return
    setCancelling(true)
    const res = await cancelReservationLine({ line_id: cancelLineTarget.line.id, reason: null })
    setCancelling(false)
    if (!res.success) { toast.error(res.error || 'No se pudo cancelar la línea'); return }
    toast.success('Línea cancelada')
    setCancelLineTarget(null)
    fetchData()
  }

  const markLineFulfilled = async (lineId: string) => {
    setActioningLineId(lineId)
    const res = await fulfillReservationLine({ line_id: lineId, sale_id: null })
    setActioningLineId(null)
    if (!res.success) { toast.error(res.error || 'No se pudo marcar como cumplida'); return }
    toast.success('Línea marcada como cumplida')
    fetchData()
  }

  const openAddPayment = (r: Reservation) => {
    setPaymentTarget(r)
    setPaymentMethod('cash')
    const pending = Number(r.total) - Number(r.total_paid)
    setPaymentAmount(pending > 0 ? pending.toFixed(2) : '')
    setPaymentReference('')
  }

  const confirmAddPayment = async () => {
    if (!paymentTarget) return
    const amount = Number(paymentAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Introduce un importe válido')
      return
    }
    setPaymentSubmitting(true)
    const res = await addReservationPayment({
      reservation_id: paymentTarget.id,
      payment_method: paymentMethod,
      amount,
      reference: paymentReference || null,
      store_id: paymentTarget.store?.id ?? null,
    })
    setPaymentSubmitting(false)
    if (!res.success) { toast.error(res.error || 'No se pudo registrar el pago'); return }
    toast.success(`Pago registrado (${formatCurrency(amount)})`)
    setPaymentTarget(null)
    fetchData()
  }

  const buildReservationTicketData = (r: Reservation): ReservationTicketData => {
    const storeConfig = getStorePdfData(r.store?.display_name || r.store?.name || undefined)
    const clientName = r.client
      ? (r.client.full_name || [r.client.first_name, r.client.last_name].filter(Boolean).join(' ') || null)
      : null
    return {
      reservation_number: r.reservation_number,
      created_at: r.created_at,
      expires_at: r.expires_at,
      status: r.status,
      payment_status: r.payment_status,
      lines: (r.lines || [])
        .filter((ln) => ln.status !== 'cancelled')
        .map((ln) => {
          const productName = ln.product_variant?.product?.name || '—'
          const variantBits = [ln.product_variant?.size ? `T.${ln.product_variant.size}` : null, ln.product_variant?.color].filter(Boolean).join(' · ')
          return {
            description: variantBits ? `${productName} (${variantBits})` : productName,
            sku: ln.product_variant?.variant_sku || ln.product_variant?.product?.sku || null,
            size: ln.product_variant?.size || null,
            color: ln.product_variant?.color || null,
            quantity: Number(ln.quantity),
            unit_price: Number(ln.unit_price),
            line_total: Number(ln.line_total),
          }
        }),
      total: Number(r.total),
      total_paid: Number(r.total_paid),
      payments: (r.payments || []).map((p) => ({ payment_method: p.payment_method, amount: Number(p.amount) })),
      clientName,
      clientCode: r.client?.client_code ?? null,
      storeAddress: storeConfig.address,
      storeSubtitle: storeConfig.subtitle,
      storePhones: storeConfig.phones,
      reason: r.reason,
      notes: r.notes,
    }
  }

  const handlePrintTicket = async (r: Reservation, mode: 'print' | 'download') => {
    setPrintingId(r.id)
    try {
      if (mode === 'print') {
        await printReservationPdf(buildReservationTicketData(r))
      } else {
        await generateReservationPdf(buildReservationTicketData(r), 'download')
      }
    } finally {
      setPrintingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox id="only-pending" checked={onlyPending} onCheckedChange={(v) => { setOnlyPending(Boolean(v)); setPage(0) }} />
            <Label htmlFor="only-pending" className="text-sm">Solo pendientes de stock</Label>
          </div>
          <Input
            placeholder="Buscar por nº reserva o cliente..."
            className="w-64"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          />
        </div>
        <Button className="gap-1" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nueva reserva
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Productos</TableHead>
              <TableHead className="text-center">Uds</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total / Pagado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Expira</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : reservations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  Sin reservas
                </TableCell>
              </TableRow>
            ) : reservations.map((r) => {
              const badge = STATUS_BADGE[r.status] || { label: r.status, className: 'bg-slate-100 text-slate-700 border-slate-200' }
              const payBadge = PAYMENT_STATUS_BADGE[r.payment_status] || PAYMENT_STATUS_BADGE.pending
              const totalNum = Number(r.total)
              const paidNum = Number(r.total_paid)
              const pendingNum = Math.max(0, totalNum - paidNum)
              const canEdit = r.status === 'active' || r.status === 'pending_stock'
              const canPay  = canEdit && pendingNum > 0
              const activeLines = (r.lines || []).filter((l) => l.status !== 'cancelled')
              return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setViewing(r)}
                >
                  <TableCell className="font-mono text-sm align-top">{r.reservation_number}</TableCell>
                  <TableCell className="align-top">
                    <div className="text-sm">{getClientName(r.client)}</div>
                    {r.client?.phone && <div className="text-xs text-muted-foreground font-mono">{r.client.phone}</div>}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      {activeLines.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {activeLines.map((ln) => {
                        const lineBadge = STATUS_BADGE[ln.status] || STATUS_BADGE.active
                        return (
                          <div key={ln.id} className="flex items-start justify-between gap-2 text-sm">
                            <div className="min-w-0">
                              <div className="truncate">{getLineDescription(ln)}</div>
                              <div className="text-xs text-muted-foreground">
                                <Badge variant="outline" className={`text-[10px] mr-1 ${lineBadge.className}`}>
                                  {ln.status === 'pending_stock' && <Clock className="h-2 w-2 mr-0.5" />}
                                  {lineBadge.label}
                                </Badge>
                                {ln.quantity} × {formatCurrency(Number(ln.unit_price))}
                              </div>
                            </div>
                            {canEdit && activeLines.length > 1 && (
                              <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {ln.status === 'active' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    title="Marcar cumplida"
                                    disabled={actioningLineId !== null}
                                    onClick={() => markLineFulfilled(ln.id)}
                                  >
                                    {actioningLineId === ln.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-rose-700"
                                  title="Cancelar línea"
                                  onClick={() => setCancelLineTarget({ reservation: r, line: ln })}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums align-top">{getTotalQuantity(r)}</TableCell>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className={`text-xs w-fit ${badge.className}`}>
                        {r.status === 'pending_stock' && <Clock className="h-3 w-3 mr-0.5" />}
                        {r.status === 'active' && <Bookmark className="h-3 w-3 mr-0.5" />}
                        {badge.label}
                      </Badge>
                      <Badge variant="outline" className={`text-xs w-fit ${payBadge.className}`}>
                        {payBadge.label}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-xs whitespace-nowrap align-top">
                    <div className="font-semibold tabular-nums">{formatCurrency(totalNum)}</div>
                    <div className="text-emerald-700 tabular-nums">+{formatCurrency(paidNum)}</div>
                    {pendingNum > 0 && (
                      <div className="text-rose-700 tabular-nums">-{formatCurrency(pendingNum)}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap align-top">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap align-top">
                    {r.expires_at ? formatDate(r.expires_at) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        title="Ver detalle"
                        onClick={() => setViewing(r)}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={printingId === r.id}
                        title="Reimprimir ticket"
                        onClick={() => handlePrintTicket(r, 'print')}
                      >
                        {printingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                      </Button>
                      {canPay && (
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => openAddPayment(r)}>
                          <Euro className="h-3 w-3" /> Pago
                        </Button>
                      )}
                      {canEdit && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => openEdit(r)}>
                            <Pencil className="h-3 w-3" /> Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-rose-700 hover:text-rose-800"
                            onClick={() => { setCancelTarget(r); setCancelReasonInput('') }}
                          >
                            <X className="h-3 w-3" /> Cancelar
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} reservas</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">{page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ReservationFormDialog
        open={creating}
        onOpenChange={setCreating}
        allowWarehouseSelection
        onSuccess={() => { fetchData() }}
      />

      <Dialog open={Boolean(viewing)} onOpenChange={(v) => { if (!v) setViewing(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewing && (() => {
            const badge = STATUS_BADGE[viewing.status] || { label: viewing.status, className: 'bg-slate-100 text-slate-700 border-slate-200' }
            const payBadge = PAYMENT_STATUS_BADGE[viewing.payment_status] || PAYMENT_STATUS_BADGE.pending
            const totalNum = Number(viewing.total)
            const paidNum = Number(viewing.total_paid)
            const pendingNum = Math.max(0, totalNum - paidNum)
            const allLines = viewing.lines || []
            const payments = viewing.payments || []
            const canEdit = viewing.status === 'active' || viewing.status === 'pending_stock'
            const canPay  = canEdit && pendingNum > 0
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Bookmark className="h-5 w-5 text-purple-600" />
                    Reserva <span className="font-mono">{viewing.reservation_number}</span>
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={`text-xs ${badge.className}`}>
                      {viewing.status === 'pending_stock' && <Clock className="h-3 w-3 mr-0.5" />}
                      {viewing.status === 'active' && <Bookmark className="h-3 w-3 mr-0.5" />}
                      {badge.label}
                    </Badge>
                    <Badge variant="outline" className={`text-xs ${payBadge.className}`}>
                      {payBadge.label}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md border bg-slate-50 px-3 py-2">
                      <div className="text-xs text-slate-500 uppercase tracking-wide">Cliente</div>
                      <div className="font-medium">{getClientName(viewing.client)}</div>
                      {viewing.client?.phone && <div className="text-xs text-muted-foreground font-mono">{viewing.client.phone}</div>}
                      {viewing.client?.client_code && <div className="text-xs text-muted-foreground">{viewing.client.client_code}</div>}
                    </div>
                    <div className="rounded-md border bg-slate-50 px-3 py-2">
                      <div className="text-xs text-slate-500 uppercase tracking-wide">Tienda</div>
                      <div className="font-medium">{viewing.store?.display_name || viewing.store?.name || '—'}</div>
                      <div className="text-xs text-muted-foreground mt-1">Creada: {formatDateTime(viewing.created_at)}</div>
                      {viewing.expires_at && <div className="text-xs text-muted-foreground">Expira: {formatDate(viewing.expires_at)}</div>}
                      {viewing.cancelled_at && <div className="text-xs text-rose-700">Cancelada: {formatDateTime(viewing.cancelled_at)}</div>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Productos ({allLines.length})
                    </div>
                    <div className="rounded-md border divide-y">
                      {allLines.length === 0 && (
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground">Sin líneas</div>
                      )}
                      {allLines.map((ln) => {
                        const lineBadge = STATUS_BADGE[ln.status] || STATUS_BADGE.active
                        return (
                          <div key={ln.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">{getLineDescription(ln)}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                                <Badge variant="outline" className={`text-[10px] ${lineBadge.className}`}>
                                  {lineBadge.label}
                                </Badge>
                                <span>{ln.quantity} × {formatCurrency(Number(ln.unit_price))}</span>
                                {ln.product_variant?.variant_sku && (
                                  <span className="font-mono">{ln.product_variant.variant_sku}</span>
                                )}
                                {ln.warehouse?.name && <span>· {ln.warehouse.name}</span>}
                              </div>
                            </div>
                            <div className="font-semibold tabular-nums">
                              {formatCurrency(Number(ln.line_total))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-600">Total</span><span className="font-semibold tabular-nums">{formatCurrency(totalNum)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-600">Pagado</span><span className="text-emerald-700 tabular-nums">{formatCurrency(paidNum)}</span></div>
                    <div className="flex justify-between border-t border-slate-200 mt-1 pt-1">
                      <span className="font-medium">Pendiente</span>
                      <span className={`font-bold tabular-nums ${pendingNum > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {formatCurrency(pendingNum)}
                      </span>
                    </div>
                  </div>

                  {payments.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        Pagos ({payments.length})
                      </div>
                      <div className="rounded-md border divide-y text-sm">
                        {payments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between px-3 py-2">
                            <div>
                              <div className="font-medium capitalize">{p.payment_method}</div>
                              <div className="text-xs text-muted-foreground">{formatDateTime(p.payment_date)}</div>
                              {p.reference && <div className="text-xs text-muted-foreground">Ref: {p.reference}</div>}
                            </div>
                            <div className="font-semibold tabular-nums text-emerald-700">
                              {formatCurrency(Number(p.amount))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {viewing.reason && (
                    <div className="text-sm">
                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Motivo</div>
                      <div>{viewing.reason}</div>
                    </div>
                  )}
                  {viewing.notes && (
                    <div className="text-sm">
                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Notas</div>
                      <div className="whitespace-pre-wrap">{viewing.notes}</div>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    variant="outline"
                    className="gap-1"
                    disabled={printingId === viewing.id}
                    onClick={() => handlePrintTicket(viewing, 'print')}
                  >
                    {printingId === viewing.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                    Imprimir
                  </Button>
                  {canPay && (
                    <Button variant="outline" className="gap-1" onClick={() => { openAddPayment(viewing); setViewing(null) }}>
                      <Euro className="h-4 w-4" /> Añadir pago
                    </Button>
                  )}
                  {canEdit && (
                    <>
                      <Button variant="outline" className="gap-1" onClick={() => { openEdit(viewing); setViewing(null) }}>
                        <Pencil className="h-4 w-4" /> Editar
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-1 text-rose-700 hover:text-rose-800"
                        onClick={() => { setCancelTarget(viewing); setCancelReasonInput(''); setViewing(null) }}
                      >
                        <X className="h-4 w-4" /> Cancelar
                      </Button>
                    </>
                  )}
                  <Button onClick={() => setViewing(null)}>Cerrar</Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(v) => { if (!v) setEditing(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar reserva {editing?.reservation_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Motivo</Label>
              <Input value={editReason} onChange={(e) => setEditReason(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1">
              <Label>Fecha límite</Label>
              <Input type="date" value={editExpires} onChange={(e) => setEditExpires(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Notas internas</Label>
              <Textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} maxLength={500} />
            </div>
            <p className="text-xs text-muted-foreground">
              Para cambiar productos o cantidades, cancela la reserva y crea una nueva.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={editSubmitting}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={editSubmitting} className="gap-1">
              {editSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(paymentTarget)} onOpenChange={(v) => { if (!v) setPaymentTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Añadir pago — {paymentTarget?.reservation_number}</DialogTitle>
          </DialogHeader>
          {paymentTarget && (() => {
            const totalNum = Number(paymentTarget.total)
            const paidNum = Number(paymentTarget.total_paid)
            const pending = Math.max(0, totalNum - paidNum)
            return (
              <div className="space-y-3">
                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-600">Total</span><span className="font-semibold">{formatCurrency(totalNum)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-600">Pagado</span><span className="text-emerald-700">{formatCurrency(paidNum)}</span></div>
                  <div className="flex justify-between border-t border-slate-200 mt-1 pt-1"><span className="font-medium">Pendiente</span><span className="font-bold text-rose-700">{formatCurrency(pending)}</span></div>
                </div>
                <div className="space-y-1">
                  <Label>Método de pago</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {PAYMENT_METHOD_OPTIONS.map((m) => {
                      const Icon = m.icon
                      return (
                        <button
                          key={m.value}
                          type="button"
                          onClick={() => setPaymentMethod(m.value)}
                          className={`flex flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors ${
                            paymentMethod === m.value ? 'border-purple-600 bg-purple-50 text-purple-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Importe</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={pending}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Referencia (opcional)</Label>
                  <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} maxLength={100} />
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentTarget(null)} disabled={paymentSubmitting}>Cancelar</Button>
            <Button onClick={confirmAddPayment} disabled={paymentSubmitting} className="gap-1">
              {paymentSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Registrar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelTarget)} onOpenChange={(v) => { if (!v) setCancelTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar reserva {cancelTarget?.reservation_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esto cancelará todas las líneas no cumplidas y liberará el stock bloqueado.
            </p>
            <div className="space-y-1">
              <Label>Motivo de cancelación (opcional)</Label>
              <Textarea rows={3} value={cancelReasonInput} onChange={(e) => setCancelReasonInput(e.target.value)} maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>Volver</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelling} className="gap-1">
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Confirmar cancelación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelLineTarget)} onOpenChange={(v) => { if (!v) setCancelLineTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar línea — {cancelLineTarget?.reservation.reservation_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {cancelLineTarget && (
                <>Se cancelará <strong>{getLineDescription(cancelLineTarget.line)}</strong> y se liberará su stock (si estaba activo).</>
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelLineTarget(null)} disabled={cancelling}>Volver</Button>
            <Button variant="destructive" onClick={confirmCancelLine} disabled={cancelling} className="gap-1">
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Cancelar línea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
