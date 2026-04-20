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
import { Loader2, Plus, ChevronLeft, ChevronRight, X, Check, Pencil, Bookmark, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate, formatDateTime } from '@/lib/utils'
import {
  listReservations,
  cancelReservation,
  updateReservation,
  fulfillReservation,
} from '@/actions/reservations'
import { ReservationFormDialog } from '@/components/reservations/reservation-form-dialog'

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

type Reservation = {
  id: string
  reservation_number: string
  status: keyof typeof STATUS_BADGE
  quantity: number
  notes: string | null
  reason: string | null
  expires_at: string | null
  created_at: string
  stock_reserved_at: string | null
  fulfilled_at: string | null
  cancelled_at: string | null
  client?: { id: string; full_name?: string | null; first_name?: string | null; last_name?: string | null; client_code?: string | null; phone?: string | null } | null
  product_variant?: {
    id: string
    variant_sku?: string | null
    size?: string | null
    color?: string | null
    product?: { id?: string; sku?: string; name?: string } | null
  } | null
  warehouse?: { id: string; code?: string | null; name?: string | null } | null
  store?: { id: string; code?: string | null; name?: string | null; display_name?: string | null } | null
}

function getClientName(c: Reservation['client']): string {
  if (!c) return '—'
  return c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.client_code || '—'
}

function getProductName(pv: Reservation['product_variant']): string {
  if (!pv) return '—'
  const name = pv.product?.name || '—'
  const variantBits = [pv.size ? `T.${pv.size}` : null, pv.color].filter(Boolean).join(' · ')
  return variantBits ? `${name} — ${variantBits}` : name
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
  const [editing, setEditing] = useState<Reservation | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editExpires, setEditExpires] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null)
  const [cancelReasonInput, setCancelReasonInput] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const [actioningId, setActioningId] = useState<string | null>(null)

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

  const markFulfilled = async (r: Reservation) => {
    setActioningId(r.id)
    const res = await fulfillReservation({ id: r.id, sale_id: null })
    setActioningId(null)
    if (!res.success) { toast.error(res.error || 'No se pudo marcar como cumplida'); return }
    toast.success('Reserva marcada como cumplida')
    fetchData()
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
            placeholder="Buscar por nº reserva..."
            className="w-56"
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
              <TableHead>Producto</TableHead>
              <TableHead className="text-center">Cant.</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Expira</TableHead>
              <TableHead>Tienda</TableHead>
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
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.reservation_number}</TableCell>
                  <TableCell>
                    <div className="text-sm">{getClientName(r.client)}</div>
                    {r.client?.phone && <div className="text-xs text-muted-foreground font-mono">{r.client.phone}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{getProductName(r.product_variant)}</div>
                    {r.product_variant?.variant_sku && (
                      <div className="text-xs text-muted-foreground font-mono">{r.product_variant.variant_sku}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{r.quantity}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${badge.className}`}>
                      {r.status === 'pending_stock' && <Clock className="h-3 w-3 mr-0.5" />}
                      {r.status === 'active' && <Bookmark className="h-3 w-3 mr-0.5" />}
                      {badge.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {r.expires_at ? formatDate(r.expires_at) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.store?.display_name || r.store?.name || r.store?.code || '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {(r.status === 'active' || r.status === 'pending_stock') && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => openEdit(r)}>
                            <Pencil className="h-3 w-3" /> Editar
                          </Button>
                          {r.status === 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              disabled={actioningId !== null}
                              onClick={() => markFulfilled(r)}
                            >
                              {actioningId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              Cumplida
                            </Button>
                          )}
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

      {/* Crear reserva */}
      <ReservationFormDialog
        open={creating}
        onOpenChange={setCreating}
        allowWarehouseSelection
        onSuccess={() => { fetchData() }}
      />

      {/* Editar notas/motivo/expiración */}
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
              Para cambiar la cantidad o el almacén cancela la reserva y crea una nueva.
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

      {/* Cancelar reserva */}
      <Dialog open={Boolean(cancelTarget)} onOpenChange={(v) => { if (!v) setCancelTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar reserva {cancelTarget?.reservation_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esto liberará {cancelTarget?.quantity ?? ''} unidades bloqueadas (si la reserva estaba activa).
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
    </div>
  )
}
