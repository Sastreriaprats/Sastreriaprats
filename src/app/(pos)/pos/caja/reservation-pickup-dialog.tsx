'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2, Search, Bookmark, Clock, Check, ChevronLeft, ShoppingCart,
  Banknote, CreditCard, Smartphone, ArrowRightLeft, Euro, ImageOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  listReservations,
  getReservation,
  addReservationPayment,
  cancelReservationLine,
} from '@/actions/reservations'
import type { ReservationPaymentMethod } from '@/lib/validations/reservations'

export interface ReservationTicketLinePayload {
  reservation_id: string
  reservation_line_id: string
  reservation_number: string
  product_variant_id: string
  description: string
  sku: string
  size: string | null
  color: string | null
  image_url: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  cost_price: number
  reservation_total: number
  reservation_already_paid: number
  client_id: string | null
  client_name: string | null
}

interface ReservationPickupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId?: string | null
  cashSessionId?: string | null
  onAddToTicket?: (payloads: ReservationTicketLinePayload[]) => void
}

type ReservationLine = {
  id: string
  product_variant_id: string
  quantity: number
  unit_price: number | string
  line_total: number | string
  status: 'active' | 'pending_stock' | 'fulfilled' | 'cancelled' | 'expired' | string
  product_variant?: {
    id: string
    variant_sku?: string | null
    size?: string | null
    color?: string | null
    product?: { id?: string; name?: string; sku?: string; main_image_url?: string | null; tax_rate?: number | string | null } | null
  } | null
}

type ReservationRow = {
  id: string
  reservation_number: string
  status: string
  total: number | string
  total_paid: number | string
  payment_status: 'pending' | 'partial' | 'paid'
  expires_at: string | null
  created_at: string
  reason: string | null
  notes: string | null
  client?: { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null; client_code?: string | null } | null
  store?: { id: string; name?: string | null; display_name?: string | null } | null
  lines?: ReservationLine[]
  payments?: Array<{ id: string; payment_date: string; payment_method: string; amount: number | string; reference: string | null; created_at: string }>
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
  fulfilled:     { label: 'Entregada',        className: 'bg-sky-100 text-sky-800 border-sky-200' },
  cancelled:     { label: 'Cancelada',        className: 'bg-rose-100 text-rose-800 border-rose-200' },
  expired:       { label: 'Expirada',         className: 'bg-slate-200 text-slate-700 border-slate-300' },
}

function clientName(c: ReservationRow['client']): string {
  if (!c) return '—'
  return c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.client_code || '—'
}

function lineDescription(ln: ReservationLine): string {
  const name = ln.product_variant?.product?.name || '—'
  const bits = [ln.product_variant?.size ? `T.${ln.product_variant.size}` : null, ln.product_variant?.color].filter(Boolean).join(' · ')
  return bits ? `${name} (${bits})` : name
}

function summarizeProducts(lines: ReservationLine[] | undefined): string {
  if (!lines || lines.length === 0) return '—'
  const active = lines.filter((l) => l.status !== 'cancelled')
  if (active.length === 1) return lineDescription(active[0])
  return `${active.length} productos`
}

export function ReservationPickupDialog({
  open,
  onOpenChange,
  storeId,
  cashSessionId,
  onAddToTicket,
}: ReservationPickupDialogProps) {
  const [step, setStep] = useState<'search' | 'detail'>('search')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<ReservationRow[]>([])
  const [loading, setLoading] = useState(false)

  const [selected, setSelected] = useState<ReservationRow | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set())

  const [partialOpen, setPartialOpen] = useState(false)
  const [partialMethod, setPartialMethod] = useState<ReservationPaymentMethod>('cash')
  const [partialAmount, setPartialAmount] = useState('')
  const [partialSubmitting, setPartialSubmitting] = useState(false)

  const [unselectedConfirmOpen, setUnselectedConfirmOpen] = useState(false)
  const [cancellingUnselected, setCancellingUnselected] = useState(false)

  const resetAll = useCallback(() => {
    setStep('search')
    setSearch('')
    setResults([])
    setSelected(null)
    setSelectedLineIds(new Set())
    setPartialOpen(false)
    setPartialMethod('cash')
    setPartialAmount('')
    setUnselectedConfirmOpen(false)
    setCancellingUnselected(false)
  }, [])

  useEffect(() => {
    if (!open) resetAll()
  }, [open, resetAll])

  const fetchList = useCallback(async (term: string) => {
    setLoading(true)
    try {
      const trimmed = term.trim()
      const res = await listReservations({
        status: 'all',
        search: trimmed || undefined,
        // No filtramos por storeId: una reserva se puede recoger desde cualquier
        // tienda, así que mostramos reservas de toda la cadena.
        page: 0,
        pageSize: 50,
      })
      if (!res.success) {
        setResults([])
        toast.error(res.error || 'No se pudieron cargar las reservas')
        return
      }
      const rows = (res.data.data || []) as ReservationRow[]
      // Orden estable: primero activas y pendientes de stock (son las que
      // típicamente se van a recoger), después el resto por fecha desc
      // (que ya viene así del servidor).
      const priority = (s: string) => (s === 'active' || s === 'pending_stock' ? 0 : 1)
      const sorted = [...rows].sort((a, b) => priority(a.status) - priority(b.status))
      setResults(sorted)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || step !== 'search') return
    const t = setTimeout(() => { fetchList(search) }, 250)
    return () => clearTimeout(t)
  }, [open, step, search, fetchList])

  const openDetail = async (row: ReservationRow) => {
    setLoadingDetail(true)
    const res = await getReservation({ id: row.id })
    setLoadingDetail(false)
    if (!res.success) { toast.error(res.error || 'No se pudo cargar la reserva'); return }
    const detail = res.data as ReservationRow
    setSelected(detail)
    const activeLineIds = (detail.lines || []).filter((l) => l.status === 'active').map((l) => l.id)
    setSelectedLineIds(new Set(activeLineIds))
    setStep('detail')
  }

  const pendingAmount = useMemo(() => {
    if (!selected) return 0
    return Math.max(0, Number(selected.total) - Number(selected.total_paid))
  }, [selected])

  const activeLines = useMemo(() => {
    return (selected?.lines || []).filter((l) => l.status === 'active')
  }, [selected])

  const pendingLines = useMemo(() => {
    return (selected?.lines || []).filter((l) => l.status === 'pending_stock')
  }, [selected])

  const selectedLines = useMemo(() => {
    return activeLines.filter((l) => selectedLineIds.has(l.id))
  }, [activeLines, selectedLineIds])

  // Subtotal bruto de las líneas seleccionadas (sin descontar pagos previos)
  const selectedSubtotal = useMemo(() => {
    return selectedLines.reduce((acc, l) => acc + Number(l.line_total), 0)
  }, [selectedLines])

  // Parte del pago previo que corresponde proporcionalmente a las líneas seleccionadas
  const selectedPaidShare = useMemo(() => {
    if (!selected) return 0
    const total = Number(selected.total)
    const paid = Number(selected.total_paid)
    if (total <= 0 || paid <= 0) return 0
    return Math.min(paid, Math.round((selectedSubtotal / total) * paid * 100) / 100)
  }, [selected, selectedSubtotal])

  // Lo que realmente hay que cobrar ahora por lo que se lleva el cliente
  const selectedPending = useMemo(() => {
    return Math.max(0, Math.round((selectedSubtotal - selectedPaidShare) * 100) / 100)
  }, [selectedSubtotal, selectedPaidShare])

  const canAddToTicket = selected?.status && (selected.status === 'active' || selected.status === 'pending_stock')
    ? selectedLines.length > 0
    : false

  const toggleLine = (lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedLineIds.size === activeLines.length) {
      setSelectedLineIds(new Set())
    } else {
      setSelectedLineIds(new Set(activeLines.map((l) => l.id)))
    }
  }

  // Líneas activas que el usuario NO ha marcado — requieren decisión:
  // mantener reservadas o cancelar para liberar stock.
  const unselectedLines = useMemo(() => {
    return activeLines.filter((l) => !selectedLineIds.has(l.id))
  }, [activeLines, selectedLineIds])

  const handleAddToTicket = () => {
    if (!selected || !onAddToTicket) return
    if (selectedLines.length === 0) {
      toast.error('Selecciona al menos una línea')
      return
    }
    if (unselectedLines.length > 0) {
      setUnselectedConfirmOpen(true)
      return
    }
    executeAddToTicket(false)
  }

  const executeAddToTicket = async (cancelUnselected: boolean) => {
    if (!selected || !onAddToTicket) return

    if (cancelUnselected && unselectedLines.length > 0) {
      setCancellingUnselected(true)
      try {
        for (const line of unselectedLines) {
          const res = await cancelReservationLine({
            line_id: line.id,
            reason: 'Línea no recogida en la entrega',
          })
          if (!res.success) {
            toast.error(res.error || `No se pudo cancelar "${lineDescription(line)}"`)
            setCancellingUnselected(false)
            return
          }
        }
      } finally {
        setCancellingUnselected(false)
      }
    }

    const total = Number(selected.total)
    const paid = Number(selected.total_paid)
    const payloads: ReservationTicketLinePayload[] = selectedLines.map((l) => {
      const pv = l.product_variant
      const taxRate = Number(pv?.product?.tax_rate ?? 21)
      const desc = `${lineDescription(l)} · Reserva ${selected.reservation_number}`
      const lineTotal = Number(l.line_total)
      // Prorratear el pago previo sobre cada línea según su peso en la reserva
      // completa. Así el cliente paga solo el neto que le corresponde por lo
      // que se lleva; el resto del pago previo queda aplicado a las líneas
      // que queden activas en la reserva.
      const lineShareOfPaid = total > 0 ? (lineTotal / total) * paid : 0
      const lineNet = Math.max(0, lineTotal - lineShareOfPaid)
      const unitPriceForLine = l.quantity > 0
        ? Math.round((lineNet / l.quantity) * 100) / 100
        : 0
      return {
        reservation_id: selected.id,
        reservation_line_id: l.id,
        reservation_number: selected.reservation_number,
        product_variant_id: l.product_variant_id,
        description: desc,
        sku: pv?.variant_sku || pv?.product?.sku || '',
        size: pv?.size ?? null,
        color: pv?.color ?? null,
        image_url: pv?.product?.main_image_url ?? null,
        quantity: l.quantity,
        unit_price: unitPriceForLine,
        tax_rate: Number.isFinite(taxRate) ? taxRate : 21,
        cost_price: 0,
        reservation_total: total,
        reservation_already_paid: paid,
        client_id: selected.client?.id || null,
        client_name: clientName(selected.client ?? null),
      }
    })

    onAddToTicket(payloads)
    setUnselectedConfirmOpen(false)
    onOpenChange(false)
  }

  const openPartial = () => {
    setPartialMethod('cash')
    setPartialAmount('')
    setPartialOpen(true)
  }

  const confirmPartial = async () => {
    if (!selected) return
    const amount = Number(partialAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Introduce un importe válido')
      return
    }
    if (amount > pendingAmount) {
      toast.error('El importe no puede superar el pendiente')
      return
    }
    setPartialSubmitting(true)
    const res = await addReservationPayment({
      reservation_id: selected.id,
      payment_method: partialMethod,
      amount,
      store_id: storeId ?? null,
      cash_session_id: cashSessionId ?? null,
    })
    setPartialSubmitting(false)
    if (!res.success) { toast.error(res.error || 'No se pudo registrar el pago'); return }
    toast.success(`Pago a cuenta registrado (${formatCurrency(amount)})`)
    setPartialOpen(false)
    const updated = await getReservation({ id: selected.id })
    if (updated.success) setSelected(updated.data as ReservationRow)
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
                placeholder="Buscar por nº reserva, nombre, teléfono o código de cliente..."
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
                  {search.trim() ? 'Sin resultados' : 'No hay reservas'}
                </div>
              ) : results.map((r) => {
                const totalNum = Number(r.total)
                const paidNum = Number(r.total_paid)
                const pending = Math.max(0, totalNum - paidNum)
                const badge = STATUS_BADGE[r.status] || { label: r.status, className: 'bg-slate-100 text-slate-700 border-slate-200' }
                const firstLineImage = (r.lines || []).find((l) => l.status !== 'cancelled')?.product_variant?.product?.main_image_url
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={loadingDetail}
                    onClick={() => openDetail(r)}
                    className="w-full flex items-start gap-3 px-3 py-3 text-left border-b last:border-b-0 hover:bg-slate-50 transition-colors"
                  >
                    {firstLineImage ? (
                      <Image src={firstLineImage} alt="" width={40} height={40} className="w-10 h-10 rounded object-cover bg-slate-100 shrink-0" />
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
                      <div className="text-xs text-muted-foreground truncate">{summarizeProducts(r.lines)}</div>
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
          <div className="space-y-3 min-w-0">
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
                  {selected.expires_at && (
                    <div className="text-xs text-muted-foreground">Fecha límite: {formatDate(selected.expires_at)}</div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wide text-slate-500">
                      Productos ({activeLines.length + pendingLines.length})
                    </Label>
                    {activeLines.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                        {selectedLineIds.size === activeLines.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                      </Button>
                    )}
                  </div>
                  <div className="rounded-md border divide-y">
                    {activeLines.map((l) => {
                      const checked = selectedLineIds.has(l.id)
                      return (
                        <label
                          key={l.id}
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50"
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleLine(l.id)} />
                          {l.product_variant?.product?.main_image_url ? (
                            <Image src={l.product_variant.product.main_image_url} alt="" width={40} height={40} className="w-10 h-10 rounded object-cover bg-slate-100 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center shrink-0">
                              <ImageOff className="h-4 w-4 text-slate-300" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{lineDescription(l)}</div>
                            <div className="text-xs text-muted-foreground">
                              {l.quantity} × {formatCurrency(Number(l.unit_price))}
                            </div>
                          </div>
                          <div className="text-sm font-semibold tabular-nums">{formatCurrency(Number(l.line_total))}</div>
                        </label>
                      )
                    })}
                    {pendingLines.map((l) => (
                      <div key={l.id} className="flex items-center gap-3 px-3 py-2 bg-amber-50/50">
                        <Clock className="h-4 w-4 text-amber-700 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{lineDescription(l)}</div>
                          <div className="text-xs text-amber-800">
                            {l.quantity} × {formatCurrency(Number(l.unit_price))} · Pendiente de stock
                          </div>
                        </div>
                        <div className="text-sm font-semibold tabular-nums">{formatCurrency(Number(l.line_total))}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total reserva</span>
                    <span className="tabular-nums">{formatCurrency(Number(selected.total))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Ya pagado</span>
                    <span className="text-emerald-700 tabular-nums">{formatCurrency(Number(selected.total_paid))}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-slate-600">Seleccionado ({selectedLines.length})</span>
                    <span className="tabular-nums">{formatCurrency(selectedSubtotal)}</span>
                  </div>
                  {selectedPaidShare > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Parte ya pagada</span>
                      <span className="text-emerald-700 tabular-nums">-{formatCurrency(selectedPaidShare)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1">
                    <span className="font-medium">A cobrar ahora</span>
                    <span className={`font-bold tabular-nums ${selectedPending > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {formatCurrency(selectedPending)}
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
              </>
            )}

            <DialogFooter className="gap-2 sm:gap-2 min-w-0">
              {pendingAmount > 0 && (
                <Button variant="outline" onClick={openPartial} disabled={loadingDetail} className="gap-1">
                  <Euro className="h-4 w-4" /> Cobro parcial
                </Button>
              )}
              <Button
                onClick={handleAddToTicket}
                disabled={!canAddToTicket || loadingDetail}
                className="gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                title={!canAddToTicket ? 'Selecciona al menos una línea activa' : undefined}
              >
                <ShoppingCart className="h-4 w-4" />
                Añadir al ticket ({selectedLines.length})
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>

      {/* Mini dialog de cobro parcial */}
      <Dialog open={partialOpen} onOpenChange={setPartialOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cobro parcial — {selected?.reservation_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Registra un pago a cuenta sin entregar el producto. Pendiente actual: <span className="font-semibold text-slate-900">{formatCurrency(pendingAmount)}</span>
            </p>
            <div className="space-y-1">
              <Label>Método</Label>
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = m.icon
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setPartialMethod(m.value)}
                      className={`flex flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors ${
                        partialMethod === m.value ? 'border-purple-600 bg-purple-50 text-purple-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
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
                max={pendingAmount}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartialOpen(false)} disabled={partialSubmitting}>Cancelar</Button>
            <Button onClick={confirmPartial} disabled={partialSubmitting} className="gap-1">
              {partialSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Registrar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación cuando se entrega solo parte de la reserva */}
      <AlertDialog open={unselectedConfirmOpen} onOpenChange={(v) => { if (!cancellingUnselected) setUnselectedConfirmOpen(v) }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Qué hacemos con los productos restantes?</AlertDialogTitle>
            <AlertDialogDescription>
              Has seleccionado {selectedLines.length} de {activeLines.length} productos.
              Los productos no seleccionados son:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border divide-y max-h-52 overflow-y-auto">
            {unselectedLines.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="truncate">{lineDescription(l)}</span>
                <span className="font-semibold tabular-nums shrink-0">{formatCurrency(Number(l.line_total))}</span>
              </div>
            ))}
          </div>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); executeAddToTicket(false) }}
              disabled={cancellingUnselected}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Mantener reservados
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); executeAddToTicket(true) }}
              disabled={cancellingUnselected}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white"
            >
              {cancellingUnselected ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Cancelando…</>
              ) : (
                'Cancelar y liberar stock'
              )}
            </AlertDialogAction>
            <AlertDialogCancel disabled={cancellingUnselected} className="w-full mt-0">
              Volver
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
