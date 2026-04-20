'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, Search, Bookmark, Clock, Check, ChevronLeft,
  Banknote, CreditCard, Smartphone, ArrowRightLeft, Printer, Download, ImageOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  listReservations,
  getReservation,
  addReservationPayment,
  fulfillReservation,
} from '@/actions/reservations'
import type { ReservationPaymentMethod } from '@/lib/validations/reservations'
import {
  generateReservationPdf, printReservationPdf,
  type ReservationTicketData,
} from '@/components/pos/ticket-pdf'
import { getStorePdfData } from '@/lib/pdf/pdf-company'

interface ReservationPickupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId?: string | null
  cashSessionId?: string | null
  storeName?: string | null
  attendedBy?: string | null
}

type ReservationListRow = {
  id: string
  reservation_number: string
  status: string
  quantity: number
  total: number | string
  total_paid: number | string
  payment_status: 'pending' | 'partial' | 'paid'
  expires_at: string | null
  client?: { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null; client_code?: string | null } | null
  product_variant?: {
    id: string
    variant_sku?: string | null
    size?: string | null
    color?: string | null
    product?: { id?: string; name?: string; sku?: string; main_image_url?: string | null } | null
  } | null
  store?: { id: string; name?: string | null; display_name?: string | null } | null
}

type ReservationDetail = ReservationListRow & {
  created_at: string
  reason: string | null
  notes: string | null
  payments?: Array<{ id: string; payment_date: string; payment_method: string; amount: number | string; reference: string | null; created_at: string }>
  client?: ReservationListRow['client'] & { client_code?: string | null }
}

const PAYMENT_METHODS: Array<{ value: ReservationPaymentMethod; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'cash',     label: 'Efectivo',      icon: Banknote },
  { value: 'card',     label: 'Tarjeta',       icon: CreditCard },
  { value: 'bizum',    label: 'Bizum',         icon: Smartphone },
  { value: 'transfer', label: 'Transferencia', icon: ArrowRightLeft },
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active:        { label: 'Activa',           className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  pending_stock: { label: 'Pendiente stock',  className: 'bg-amber-100 text-amber-800 border-amber-200' },
}

function clientName(c: ReservationListRow['client']): string {
  if (!c) return '—'
  return c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.client_code || '—'
}

function productName(pv: ReservationListRow['product_variant']): string {
  if (!pv) return '—'
  const name = pv.product?.name || '—'
  const variantBits = [pv.size ? `T.${pv.size}` : null, pv.color].filter(Boolean).join(' · ')
  return variantBits ? `${name} (${variantBits})` : name
}

export function ReservationPickupDialog({
  open,
  onOpenChange,
  storeId,
  cashSessionId,
  storeName,
  attendedBy,
}: ReservationPickupDialogProps) {
  const [step, setStep] = useState<'search' | 'detail'>('search')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ReservationListRow[]>([])
  const [loading, setLoading] = useState(false)

  const [selected, setSelected] = useState<ReservationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const [paymentMethod, setPaymentMethod] = useState<ReservationPaymentMethod>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const resetAll = useCallback(() => {
    setStep('search')
    setSearch('')
    setResults([])
    setSelected(null)
    setPaymentMethod('cash')
    setPaymentAmount('')
  }, [])

  useEffect(() => {
    if (!open) resetAll()
  }, [open, resetAll])

  // Cargar reservas activas / pendientes al abrir (sin filtrar por tienda, pero priorizando la actual)
  const fetchList = useCallback(async (term: string) => {
    setLoading(true)
    try {
      const res = await listReservations({
        status: 'all',
        search: term.trim() || undefined,
        storeId: storeId || undefined,
        page: 0,
        pageSize: 25,
      })
      if (!res.success) { setResults([]); return }
      const rows = (res.data.data || []) as ReservationListRow[]
      // Filtrar solo activas o pendientes de stock (las que aún se pueden entregar)
      setResults(rows.filter((r) => r.status === 'active' || r.status === 'pending_stock'))
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (!open || step !== 'search') return
    const t = setTimeout(() => { fetchList(search) }, 250)
    return () => clearTimeout(t)
  }, [open, step, search, fetchList])

  const openDetail = async (row: ReservationListRow) => {
    setLoadingDetail(true)
    const res = await getReservation({ id: row.id })
    setLoadingDetail(false)
    if (!res.success) { toast.error(res.error || 'No se pudo cargar la reserva'); return }
    const detail = res.data as ReservationDetail
    setSelected(detail)
    const pending = Math.max(0, Number(detail.total) - Number(detail.total_paid))
    setPaymentAmount(pending > 0 ? pending.toFixed(2) : '0')
    setStep('detail')
  }

  const pendingAmount = useMemo(() => {
    if (!selected) return 0
    return Math.max(0, Number(selected.total) - Number(selected.total_paid))
  }, [selected])

  const todayAmountToPay = useMemo(() => {
    if (pendingAmount <= 0) return 0
    const n = Number(paymentAmount.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? Math.min(n, pendingAmount) : 0
  }, [paymentAmount, pendingAmount])

  const canFinalize = Boolean(selected)
  const finalizeLabel = pendingAmount > 0
    ? `Cobrar ${formatCurrency(todayAmountToPay)} y entregar`
    : 'Entregar al cliente'

  const handleFinalize = async () => {
    if (!selected) return
    if (pendingAmount > 0 && todayAmountToPay <= 0) {
      toast.error('Introduce un importe a cobrar (o pon 0 si no cobras nada hoy)')
      return
    }

    setSubmitting(true)
    try {
      // 1. Registrar pago de hoy si procede
      if (todayAmountToPay > 0) {
        const payRes = await addReservationPayment({
          reservation_id: selected.id,
          payment_method: paymentMethod,
          amount: todayAmountToPay,
          store_id: storeId ?? null,
          cash_session_id: cashSessionId ?? null,
        })
        if (!payRes.success) {
          toast.error(payRes.error || 'No se pudo registrar el pago')
          return
        }
      }

      // 2. Si la reserva está en pending_stock no podemos hacer fulfill (stock no bloqueado)
      //    En ese caso avisamos y dejamos solo el pago registrado.
      if (selected.status === 'pending_stock') {
        toast.warning('La reserva estaba pendiente de stock — pago registrado pero no se puede entregar.')
        const updated = await getReservation({ id: selected.id })
        if (updated.success) setSelected(updated.data as ReservationDetail)
        return
      }

      // 3. Cumplir reserva (descontar stock)
      const fulfillRes = await fulfillReservation({ id: selected.id, sale_id: null })
      if (!fulfillRes.success) {
        toast.error(fulfillRes.error || 'No se pudo cerrar la reserva')
        return
      }

      toast.success(`Reserva ${selected.reservation_number} entregada`)

      // 4. Generar ticket automáticamente (imprimir)
      const updated = await getReservation({ id: selected.id })
      if (updated.success) {
        const ticketData = buildTicketData(updated.data as ReservationDetail, {
          today_amount: todayAmountToPay,
          today_method: paymentMethod,
          is_pickup: true,
        })
        try { await printReservationPdf(ticketData) } catch { /* ignore */ }
        setSelected(updated.data as ReservationDetail)
      }

      // 5. Cerrar diálogo tras pequeña espera para que el usuario vea el toast
      setTimeout(() => onOpenChange(false), 500)
    } finally {
      setSubmitting(false)
    }
  }

  const buildTicketData = (
    r: ReservationDetail,
    opts: { today_amount: number; today_method: ReservationPaymentMethod; is_pickup: boolean },
  ): ReservationTicketData => {
    const storeConfig = getStorePdfData(storeName || undefined)
    const pName = r.product_variant?.product?.name || '—'
    const variantBits = [r.product_variant?.size ? `T.${r.product_variant.size}` : null, r.product_variant?.color].filter(Boolean).join(' · ')
    const payments = (r.payments || []).map((p) => ({
      payment_method: p.payment_method,
      amount: Number(p.amount),
      payment_date: p.payment_date,
    }))
    return {
      reservation_number: r.reservation_number,
      created_at: r.created_at,
      expires_at: r.expires_at,
      status: r.status,
      payment_status: r.payment_status,
      line: {
        description: variantBits ? `${pName} (${variantBits})` : pName,
        sku: r.product_variant?.variant_sku || r.product_variant?.product?.sku || null,
        size: r.product_variant?.size || null,
        color: r.product_variant?.color || null,
        quantity: r.quantity,
        unit_price: Number(r.total) / Math.max(1, r.quantity),
        line_total: Number(r.total),
      },
      total: Number(r.total),
      total_paid: Number(r.total_paid),
      payments,
      todayPaid: opts.today_amount,
      todayPaymentMethod: opts.today_amount > 0 ? opts.today_method : null,
      isPickup: opts.is_pickup,
      clientName: clientName(r.client ?? null),
      clientCode: r.client?.client_code ?? null,
      attendedBy: attendedBy ?? null,
      storeAddress: storeConfig.address,
      storeSubtitle: storeConfig.subtitle,
      storePhones: storeConfig.phones,
      reason: r.reason,
      notes: r.notes,
    }
  }

  const handleReprintCurrent = async (mode: 'print' | 'download') => {
    if (!selected) return
    const data = buildTicketData(selected, { today_amount: 0, today_method: 'cash', is_pickup: false })
    if (mode === 'print') await printReservationPdf(data)
    else await generateReservationPdf(data, 'download')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            {step === 'detail' && (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 gap-1"
                onClick={() => { setSelected(null); setStep('search') }}
              >
                <ChevronLeft className="h-4 w-4" /> Volver
              </Button>
            )}
            <Bookmark className="h-5 w-5 text-purple-600" />
            {step === 'search' ? 'Buscar reserva' : `Reserva ${selected?.reservation_number || ''}`}
          </DialogTitle>
        </DialogHeader>

        {step === 'search' && (
          <div className="space-y-3 min-w-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por nº reserva (RSV-...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="rounded-md border max-h-[56vh] overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : results.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {search.trim() ? 'Sin resultados' : 'No hay reservas activas o pendientes'}
                </div>
              ) : results.map((r) => {
                const totalNum = Number(r.total)
                const paidNum = Number(r.total_paid)
                const pending = Math.max(0, totalNum - paidNum)
                const badge = STATUS_BADGE[r.status] || { label: r.status, className: 'bg-slate-100 text-slate-700 border-slate-200' }
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={loadingDetail}
                    onClick={() => openDetail(r)}
                    className="w-full flex items-start gap-3 px-3 py-3 text-left border-b last:border-b-0 hover:bg-slate-50 transition-colors"
                  >
                    {r.product_variant?.product?.main_image_url ? (
                      <img src={r.product_variant.product.main_image_url} alt="" className="w-10 h-10 rounded object-cover bg-slate-100 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0">
                        <ImageOff className="h-4 w-4 text-slate-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{r.reservation_number}</span>
                        <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
                          {r.status === 'pending_stock' && <Clock className="h-2.5 w-2.5 mr-0.5" />}
                          {badge.label}
                        </Badge>
                      </div>
                      <div className="text-sm truncate">{clientName(r.client)}</div>
                      <div className="text-xs text-muted-foreground truncate">{productName(r.product_variant)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">{formatCurrency(totalNum)}</div>
                      <div className="text-xs text-emerald-700 tabular-nums">+{formatCurrency(paidNum)}</div>
                      {pending > 0 && (
                        <div className="text-xs text-rose-700 tabular-nums">-{formatCurrency(pending)}</div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 'detail' && selected && (
          <div className="space-y-4 min-w-0">
            {loadingDetail ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="rounded-md border bg-slate-50 px-3 py-3 space-y-1">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Cliente</div>
                  <div className="text-sm font-medium">{clientName(selected.client ?? null)}</div>
                  {selected.client?.phone && (
                    <div className="text-xs text-muted-foreground font-mono">{selected.client.phone}</div>
                  )}
                </div>
                <div className="rounded-md border px-3 py-3 space-y-1">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Producto</div>
                  <div className="text-sm">{productName(selected.product_variant ?? null)}</div>
                  <div className="text-xs text-muted-foreground">Cantidad: <span className="tabular-nums">{selected.quantity}</span></div>
                  {selected.expires_at && (
                    <div className="text-xs text-muted-foreground">Fecha límite: {formatDate(selected.expires_at)}</div>
                  )}
                </div>

                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total reserva</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(Number(selected.total))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Ya pagado</span>
                    <span className="text-emerald-700 tabular-nums">{formatCurrency(Number(selected.total_paid))}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1">
                    <span className="font-medium">Pendiente</span>
                    <span className={`font-bold tabular-nums ${pendingAmount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {formatCurrency(pendingAmount)}
                    </span>
                  </div>
                </div>

                {selected.payments && selected.payments.length > 0 && (
                  <div className="rounded-md border px-3 py-2 text-xs space-y-1">
                    <div className="font-medium text-slate-700">Pagos previos</div>
                    {selected.payments.map((p) => (
                      <div key={p.id} className="flex justify-between">
                        <span className="text-slate-600">
                          {new Date(p.payment_date).toLocaleDateString('es-ES')} · {PAYMENT_METHODS.find((m) => m.value === p.payment_method)?.label || p.payment_method}
                        </span>
                        <span className="tabular-nums">{formatCurrency(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}

                {pendingAmount > 0 ? (
                  <div className="space-y-2 rounded-md border px-3 py-3">
                    <Label className="text-sm">Cobro de hoy</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {PAYMENT_METHODS.map((m) => {
                        const Icon = m.icon
                        return (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => setPaymentMethod(m.value)}
                            className={`flex flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors ${
                              paymentMethod === m.value
                                ? 'border-purple-600 bg-purple-50 text-purple-800'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            {m.label}
                          </button>
                        )
                      })}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Importe</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={pendingAmount}
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Máximo pendiente: <span className="font-semibold">{formatCurrency(pendingAmount)}</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border bg-emerald-50 border-emerald-200 px-3 py-3 text-sm text-emerald-800 flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Esta reserva ya está totalmente pagada. Solo queda entregar.
                  </div>
                )}
              </>
            )}

            <DialogFooter className="gap-2 sm:gap-2 min-w-0">
              <Button variant="outline" onClick={() => handleReprintCurrent('download')} disabled={submitting} className="gap-1">
                <Download className="h-4 w-4" /> PDF actual
              </Button>
              <Button variant="outline" onClick={() => handleReprintCurrent('print')} disabled={submitting} className="gap-1">
                <Printer className="h-4 w-4" /> Imprimir actual
              </Button>
              <Button onClick={handleFinalize} disabled={!canFinalize || submitting} className="gap-1 bg-purple-600 hover:bg-purple-700 text-white">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {finalizeLabel}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
