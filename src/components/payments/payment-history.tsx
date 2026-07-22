'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Plus, Loader2, CreditCard, Banknote, ArrowRightLeft, FileText, Trash2, CalendarClock, Pencil,
  AlertTriangle, Store,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { useActiveStore } from '@/hooks/use-store'
import { usePermissions } from '@/hooks/use-permissions'
import {
  getOrderPayments, addOrderPayment, deleteOrderPayment, updateOrderPayment,
  getSalePayments, addSalePayment, deleteSalePayment, updateSalePayment,
  type OrderPayment, type PaymentMethod,
} from '@/actions/payments'
import { checkCashSessionOpen } from '@/actions/pos'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  check: 'Cheque',
  bizum: 'Bizum',
}

const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  cash: <Banknote className="h-3.5 w-3.5" />,
  card: <CreditCard className="h-3.5 w-3.5" />,
  transfer: <ArrowRightLeft className="h-3.5 w-3.5" />,
  check: <FileText className="h-3.5 w-3.5" />,
  bizum: <ArrowRightLeft className="h-3.5 w-3.5" />,
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PaymentHistoryProps {
  entityType: 'tailoring_order' | 'sale'
  entityId: string
  total: number
  onPaymentAdded?: () => void
  /** Si es true, oculta el botón de añadir pago (modo solo lectura) */
  readonly?: boolean
  /** Estilo tabla: 'sastre' aplica tema oscuro para vista sastre */
  variant?: 'default' | 'sastre'
  /** Tienda DEL PEDIDO/VENTA — para que el cobro caiga en su caja
   *  (no en la "tienda activa" del operador, que puede ser otra). */
  entityStoreId?: string | null
  /** Nombre de la tienda (para mostrar en el diálogo). Opcional. */
  entityStoreName?: string | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentHistory({
  entityType, entityId, total, onPaymentAdded, readonly = false, variant = 'default',
  entityStoreId, entityStoreName,
}: PaymentHistoryProps) {
  const { activeStoreId } = useActiveStore()
  const { can, isSuperAdmin } = usePermissions()
  // Tienda efectiva donde cae el cobro: SIEMPRE la del pedido/venta si la
  // conocemos. Solo si no la sabemos (callers antiguos) se recurre a la
  // tienda activa del operador. Esto evita que un cobro de un pedido de
  // Wellington caiga en la caja de Pinzón solo porque el operador tenía
  // esa otra tienda como activa.
  const effectiveStoreId = entityStoreId ?? activeStoreId ?? undefined
  // Permiso de gestión de cobros según el tipo: pedido (orders.edit) o venta (sales.edit).
  const paymentPerm = entityType === 'sale' ? 'sales.edit' : 'orders.edit'
  // Editar cobro: solo admin pleno (administrador/super_admin), igual que el cerrojo
  // del server (update*Payment → permiso + isFullAdmin).
  const canEditPayment = !readonly && can(paymentPerm) && isSuperAdmin
  // Columna de acciones (editar/borrar). Pedido: visible con !readonly (comportamiento
  // previo). Venta: gateada por sales.edit (sin permiso no aparece).
  const showActions = !readonly && (entityType === 'tailoring_order' || (entityType === 'sale' && can('sales.edit')))
  // Columna "Vendedor": solo pedidos de sastrería (sale_payments no guarda created_by).
  const showSeller = entityType === 'tailoring_order'
  const [payments, setPayments] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [cashSessionOpen, setCashSessionOpen] = useState<boolean | null>(null)

  // Editar cobro
  const [editTarget, setEditTarget] = useState<any | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editMethod, setEditMethod] = useState<PaymentMethod>('cash')
  const [isEditing, setIsEditing] = useState(false)

  // Form state
  const [formDate, setFormDate] = useState(today())
  const [formMethod, setFormMethod] = useState<PaymentMethod>('cash')
  const [formAmount, setFormAmount] = useState('')
  const [formReference, setFormReference] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formNextPaymentDate, setFormNextPaymentDate] = useState('')
  // Si no hay caja abierta en la tienda del cobro, el usuario debe confirmar
  // explícitamente que entiende que el pago no entrará en ningún arqueo.
  const [confirmNoSession, setConfirmNoSession] = useState(false)

  const loadPayments = useCallback(async () => {
    setIsLoading(true)
    try {
      let result
      if (entityType === 'tailoring_order') {
        result = await getOrderPayments({ tailoring_order_id: entityId })
      } else {
        result = await getSalePayments({ sale_id: entityId })
      }
      if (result.success) setPayments(result.data)
      else console.error('[PaymentHistory] load:', result.error)
    } catch (e) {
      console.error('[PaymentHistory] unexpected:', e)
    } finally {
      setIsLoading(false)
    }
  }, [entityType, entityId])

  useEffect(() => { loadPayments() }, [loadPayments])

  useEffect(() => {
    if (readonly) return
    checkCashSessionOpen({ storeId: effectiveStoreId })
      .then(r => setCashSessionOpen(r.success ? r.data.open : null))
      .catch(() => setCashSessionOpen(null))
  }, [effectiveStoreId, readonly])

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const totalPending = Math.max(0, total - totalPaid)
  const progressPct = total > 0 ? Math.min(100, (totalPaid / total) * 100) : 0

  function resetForm() {
    setFormDate(today())
    setFormMethod('cash')
    setFormAmount('')
    setFormReference('')
    setFormNotes('')
    setFormNextPaymentDate('')
    setConfirmNoSession(false)
  }

  async function handleSave() {
    const amount = parseFloat(formAmount)
    if (!formAmount || isNaN(amount) || amount <= 0) {
      toast.error('Introduce un importe válido')
      return
    }
    if (amount > totalPending + 0.01) {
      toast.error(`El importe supera el pendiente (${formatCurrency(totalPending)})`)
      return
    }

    setIsSaving(true)
    try {
      let result
      if (entityType === 'tailoring_order') {
        result = await addOrderPayment({
          tailoring_order_id: entityId,
          payment_date: formDate,
          payment_method: formMethod,
          amount,
          reference: formReference || undefined,
          notes: formNotes || undefined,
          next_payment_date: formNextPaymentDate || undefined,
          storeId: effectiveStoreId,
        })
      } else {
        result = await addSalePayment({
          sale_id: entityId,
          payment_method: formMethod,
          amount,
          reference: formReference || undefined,
          next_payment_date: formNextPaymentDate || undefined,
          storeId: effectiveStoreId,
        })
      }

      if (result.success) {
        toast.success('Pago registrado correctamente')
        setDialogOpen(false)
        resetForm()
        await loadPayments()
        onPaymentAdded?.()
      } else {
        toast.error(result.error ?? 'Error al registrar pago')
      }
    } catch (e) {
      console.error('[PaymentHistory] save:', e)
      toast.error('Error inesperado al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  function openEdit(p: any) {
    setEditTarget(p)
    setEditAmount(String(p.amount))
    setEditMethod((p.payment_method as PaymentMethod) ?? 'cash')
  }

  async function handleEditSave() {
    if (!editTarget) return
    const amount = parseFloat(editAmount)
    if (!editAmount || isNaN(amount) || amount <= 0) {
      toast.error('Introduce un importe válido')
      return
    }
    setIsEditing(true)
    try {
      const result = entityType === 'tailoring_order'
        ? await updateOrderPayment({
            payment_id: editTarget.id,
            tailoring_order_id: entityId,
            amount,
            method: editMethod,
          })
        : await updateSalePayment({
            salePaymentId: editTarget.id,
            amount,
            method: editMethod,
          })
      if (result.success) {
        toast.success('Cobro actualizado')
        setEditTarget(null)
        await loadPayments()
        onPaymentAdded?.()
      } else {
        toast.error(result.error ?? 'Error al actualizar el cobro')
      }
    } catch (e) {
      console.error('[PaymentHistory] edit:', e)
      toast.error('Error inesperado al actualizar')
    } finally {
      setIsEditing(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTargetId) return
    const paymentId = deleteTargetId
    setDeletingId(paymentId)
    try {
      const result = entityType === 'tailoring_order'
        ? await deleteOrderPayment({ payment_id: paymentId, tailoring_order_id: entityId })
        : await deleteSalePayment({ salePaymentId: paymentId })
      if (result.success) {
        toast.success('Pago eliminado')
        await loadPayments()
        onPaymentAdded?.()
      } else {
        toast.error(result.error ?? 'Error al eliminar')
      }
    } catch (e) {
      console.error('[PaymentHistory] delete:', e)
      toast.error('Error inesperado al eliminar')
    } finally {
      setDeletingId(null)
      setDeleteTargetId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className={variant === 'sastre' ? 'rounded-lg border border-white/10 bg-white/[0.04] p-4 space-y-3' : 'rounded-lg border bg-card p-4 space-y-3'}>
        <div className="flex items-center justify-between text-sm">
          <span className={variant === 'sastre' ? 'text-white/50' : 'text-muted-foreground'}>Progreso de pago</span>
          <span className={`font-medium tabular-nums${variant === 'sastre' ? ' text-white/70' : ''}`}>{progressPct.toFixed(0)}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div>
            <p className={variant === 'sastre' ? 'text-[11px] text-white/40 uppercase tracking-wide' : 'text-[11px] text-muted-foreground uppercase tracking-wide'}>Total</p>
            <p className={`font-semibold tabular-nums${variant === 'sastre' ? ' text-white' : ''}`}>{formatCurrency(total)}</p>
          </div>
          <div>
            <p className={variant === 'sastre' ? 'text-[11px] text-white/40 uppercase tracking-wide' : 'text-[11px] text-muted-foreground uppercase tracking-wide'}>Pagado</p>
            <p className={`font-semibold tabular-nums${variant === 'sastre' ? ' text-green-400' : ' text-green-600'}`}>{formatCurrency(totalPaid)}</p>
          </div>
          <div>
            <p className={variant === 'sastre' ? 'text-[11px] text-white/40 uppercase tracking-wide' : 'text-[11px] text-muted-foreground uppercase tracking-wide'}>Pendiente</p>
            <p className={`font-semibold tabular-nums ${totalPending > 0 ? (variant === 'sastre' ? 'text-amber-400' : 'text-amber-600') : (variant === 'sastre' ? 'text-green-400' : 'text-green-600')}`}>
              {formatCurrency(totalPending)}
            </p>
          </div>
        </div>
      </div>

      {/* Cabecera + botón */}
      <div className="flex items-center justify-between">
        <h4 className={`text-sm font-medium${variant === 'sastre' ? ' text-white/70' : ''}`}>Historial de pagos</h4>
        {!readonly && totalPending > 0 && (
          <Button
            size="sm"
            onClick={() => { resetForm(); setDialogOpen(true) }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Registrar pago
          </Button>
        )}
        {!readonly && totalPending <= 0 && (
          <Badge
            variant="default"
            className={variant === 'sastre' ? 'bg-green-500/15 text-green-400 border border-green-500/20 px-2.5 py-1 rounded-md text-xs' : 'bg-green-600 text-white'}
          >
            Pagado
          </Badge>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border rounded-lg">
          <CreditCard className="mx-auto h-8 w-8 mb-3 opacity-30" />
          <p className="text-sm">Sin pagos registrados</p>
        </div>
      ) : (
        <div
          className={
            variant === 'sastre'
              ? 'bg-white/[0.03] border border-white/10 rounded-lg overflow-hidden'
              : 'rounded-lg border overflow-hidden'
          }
        >
          <Table>
            <TableHeader>
              <TableRow className={variant === 'sastre' ? 'bg-white/[0.06] text-white/50 text-xs uppercase' : 'bg-muted/50'}>
                <TableHead className={variant === 'sastre' ? 'text-xs text-white/50' : 'text-xs'}>Fecha</TableHead>
                <TableHead className={variant === 'sastre' ? 'text-xs text-white/50' : 'text-xs'}>Método</TableHead>
                {showSeller && (
                  <TableHead className={variant === 'sastre' ? 'text-xs text-white/50' : 'text-xs'}>Vendedor</TableHead>
                )}
                <TableHead className={variant === 'sastre' ? 'text-xs text-right text-white/50' : 'text-xs text-right'}>Importe</TableHead>
                <TableHead className={variant === 'sastre' ? 'text-xs text-white/50' : 'text-xs'}>Referencia</TableHead>
                <TableHead className={variant === 'sastre' ? 'text-xs text-white/50' : 'text-xs'}>Próximo pago</TableHead>
                {showActions && (
                  <TableHead className={canEditPayment ? 'w-20' : 'w-10'} />
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow
                  key={p.id}
                  className={
                    variant === 'sastre'
                      ? 'border-b border-white/[0.06] text-white hover:bg-white/[0.04]'
                      : undefined
                  }
                >
                  <TableCell className={variant === 'sastre' ? 'py-3 px-4 text-sm' : 'text-sm tabular-nums'}>
                    {formatDate(p.payment_date ?? p.created_at)}
                  </TableCell>
                  <TableCell className={variant === 'sastre' ? 'py-3 px-4 text-sm' : ''}>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      {METHOD_ICONS[p.payment_method as PaymentMethod] ?? null}
                      {METHOD_LABELS[p.payment_method as PaymentMethod] ?? p.payment_method}
                    </span>
                  </TableCell>
                  {showSeller && (
                    <TableCell className={variant === 'sastre' ? 'py-3 px-4 text-xs text-white/70' : 'text-xs'}>
                      {p.created_by_name ?? '—'}
                    </TableCell>
                  )}
                  <TableCell
                    className={
                      variant === 'sastre'
                        ? 'text-right py-3 px-4 text-sm text-white font-medium tabular-nums'
                        : 'text-right font-medium tabular-nums'
                    }
                  >
                    {formatCurrency(p.amount)}
                  </TableCell>
                  <TableCell className={variant === 'sastre' ? 'py-3 px-4 text-xs text-white/40 truncate max-w-[120px]' : 'text-xs text-muted-foreground truncate max-w-[120px]'}>
                    {p.reference ?? '—'}
                  </TableCell>
                  <TableCell className={variant === 'sastre' ? 'py-3 px-4 text-sm text-xs' : 'text-xs'}>
                    {p.next_payment_date ? (
                      <span className={`inline-flex items-center gap-1 ${
                        p.next_payment_date <= today()
                          ? 'text-red-600 font-medium'
                          : 'text-muted-foreground'
                      }`}>
                        <CalendarClock className="h-3 w-3 flex-shrink-0" />
                        {formatDate(p.next_payment_date)}
                      </span>
                    ) : '—'}
                  </TableCell>
                  {showActions && (
                    <TableCell className={variant === 'sastre' ? 'py-3 px-4' : ''}>
                      <div className="flex items-center justify-end gap-1">
                        {canEditPayment && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${variant === 'sastre' ? 'text-white/60 hover:text-white' : ''}`}
                            disabled={deletingId === p.id}
                            onClick={() => openEdit(p)}
                            title="Editar cobro"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={deletingId === p.id}
                          onClick={() => setDeleteTargetId(p.id)}
                        >
                          {deletingId === p.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog: registrar pago */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={`max-w-md ${variant === 'sastre' ? 'bg-[#0d1629] border border-white/20 text-white' : ''}`}>
          <DialogHeader>
            <DialogTitle className={variant === 'sastre' ? 'text-white' : ''}>Registrar pago</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Banner de tienda + estado de caja (PIEZA B). El cobro siempre
                cae en la caja de la TIENDA DEL PEDIDO/VENTA, no en la del
                operador. Si no hay caja abierta en esa tienda hoy, se pide
                confirmación explícita. */}
            {cashSessionOpen === true && (
              <div className={variant === 'sastre'
                ? 'rounded-md border border-green-500/30 bg-green-500/10 p-2 text-xs text-green-300 flex items-center gap-2'
                : 'rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800 flex items-center gap-2'
              }>
                <Store className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  Se registrará en la caja abierta
                  {entityStoreName ? <> de <strong>{entityStoreName}</strong></> : <> de la tienda del pedido</>}.
                </span>
              </div>
            )}
            {cashSessionOpen === false && (
              <div className={variant === 'sastre'
                ? 'rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200 space-y-2'
                : 'rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 space-y-2'
              }>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    No hay caja abierta
                    {entityStoreName ? <> en <strong>{entityStoreName}</strong></> : <> en la tienda del pedido</>}
                    {' '}para hoy. El cobro se registrará pero no entrará en ningún arqueo.
                  </span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none pl-6">
                  <input
                    type="checkbox"
                    checked={confirmNoSession}
                    onChange={(e) => setConfirmNoSession(e.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-700"
                  />
                  <span className="font-medium">Entiendo que el cobro no entrará en ningún arqueo</span>
                </label>
              </div>
            )}
            {entityType === 'tailoring_order' && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-date" className={variant === 'sastre' ? 'text-white/80' : ''}>Fecha</Label>
                <DatePickerPopover
                  id="pay-date"
                  value={formDate}
                  onChange={(date) => setFormDate(date)}
                  containerClassName={variant === 'sastre' ? 'bg-white/[0.07] border-white/20 text-white placeholder:text-white/30' : ''}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className={variant === 'sastre' ? 'text-white/80' : ''}>Método de pago</Label>
              <Select value={formMethod} onValueChange={(v) => setFormMethod(v as PaymentMethod)}>
                <SelectTrigger className={variant === 'sastre' ? 'bg-white/[0.07] border-white/20 text-white' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={variant === 'sastre' ? 'bg-[#0d1629] border border-white/20 text-white' : ''}>
                  {(Object.entries(METHOD_LABELS) as [PaymentMethod, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k} className={variant === 'sastre' ? 'text-white focus:bg-white/10 focus:text-white' : ''}>
                      <span className="flex items-center gap-2">
                        {METHOD_ICONS[k]}
                        {v}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-amount" className={variant === 'sastre' ? 'text-white/80' : ''}>
                Importe{' '}
                <span className={`font-normal text-xs ${variant === 'sastre' ? 'text-white/40' : 'text-muted-foreground'}`}>
                  (pendiente: {formatCurrency(totalPending)})
                </span>
              </Label>
              <Input
                id="pay-amount"
                type="number"
                min="0.01"
                step="0.01"
                max={totalPending}
                placeholder="0,00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className={variant === 'sastre' ? 'bg-white/[0.07] border-white/20 text-white placeholder:text-white/30' : ''}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-ref" className={variant === 'sastre' ? 'text-white/80' : ''}>
                Referencia <span className={`font-normal text-xs ${variant === 'sastre' ? 'text-white/40' : 'text-muted-foreground'}`}>(opcional)</span>
              </Label>
              <Input
                id="pay-ref"
                placeholder="Nº transferencia, recibo…"
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
                className={variant === 'sastre' ? 'bg-white/[0.07] border-white/20 text-white placeholder:text-white/30' : ''}
              />
            </div>

            {entityType === 'tailoring_order' && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-notes" className={variant === 'sastre' ? 'text-white/80' : ''}>
                  Notas <span className={`font-normal text-xs ${variant === 'sastre' ? 'text-white/40' : 'text-muted-foreground'}`}>(opcional)</span>
                </Label>
                <Textarea
                  id="pay-notes"
                  rows={2}
                  placeholder="Observaciones…"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className={variant === 'sastre' ? 'bg-white/[0.07] border-white/20 text-white placeholder:text-white/30' : ''}
                />
              </div>
            )}

            <div className={`space-y-1.5 pt-1 border-t ${variant === 'sastre' ? 'border-white/10' : ''}`}>
              <Label htmlFor="pay-next-date" className={`flex items-center gap-1.5 ${variant === 'sastre' ? 'text-white/80' : ''}`}>
                Fecha próximo pago
                <span className={`font-normal text-xs ${variant === 'sastre' ? 'text-white/40' : 'text-muted-foreground'}`}>(opcional)</span>
              </Label>
              <DatePickerPopover
                id="pay-next-date"
                value={formNextPaymentDate}
                min={formDate || today()}
                onChange={(date) => setFormNextPaymentDate(date)}
                containerClassName={variant === 'sastre' ? 'bg-white/[0.07] border-white/20 text-white placeholder:text-white/30' : ''}
              />
              <p className={`text-[11px] ${variant === 'sastre' ? 'text-white/40' : 'text-muted-foreground'}`}>
                Si hay saldo pendiente, indica cuándo se espera el siguiente pago.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant={variant === 'sastre' ? undefined : 'outline'}
              className={variant === 'sastre' ? 'bg-white/[0.06] border border-white/15 text-white/70 hover:bg-white/10 hover:text-white' : undefined}
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              className={variant === 'sastre' ? 'bg-[#c9a96e] text-[#0a1020] font-semibold hover:bg-[#c9a96e]/90' : undefined}
              onClick={handleSave}
              disabled={isSaving || (cashSessionOpen === false && !confirmNoSession)}
              title={cashSessionOpen === false && !confirmNoSession ? 'Confirma que entiendes que el cobro no entrará en ningún arqueo' : undefined}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará este pago y se revertirán sus efectos en caja (totales y, si la
              sesión está cerrada, el arqueo). Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>No, volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!deletingId}
              onClick={confirmDelete}
            >
              Sí, eliminar pago
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: editar cobro (importe + método) */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent className={`max-w-md ${variant === 'sastre' ? 'bg-[#0d1629] border border-white/20 text-white' : ''}`}>
          <DialogHeader>
            <DialogTitle className={variant === 'sastre' ? 'text-white' : ''}>Editar cobro</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className={variant === 'sastre' ? 'text-white/80' : ''}>Método de pago</Label>
              <Select value={editMethod} onValueChange={(v) => setEditMethod(v as PaymentMethod)}>
                <SelectTrigger className={variant === 'sastre' ? 'bg-white/[0.07] border-white/20 text-white' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={variant === 'sastre' ? 'bg-[#0d1629] border border-white/20 text-white' : ''}>
                  {(Object.entries(METHOD_LABELS) as [PaymentMethod, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k} className={variant === 'sastre' ? 'text-white focus:bg-white/10 focus:text-white' : ''}>
                      <span className="flex items-center gap-2">
                        {METHOD_ICONS[k]}
                        {v}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-amount" className={variant === 'sastre' ? 'text-white/80' : ''}>Importe</Label>
              <Input
                id="edit-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0,00"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className={variant === 'sastre' ? 'bg-white/[0.07] border-white/20 text-white placeholder:text-white/30' : ''}
              />
            </div>

            <p className={`text-[11px] ${variant === 'sastre' ? 'text-white/40' : 'text-muted-foreground'}`}>
              Solo se editan importe y método. Si el cobro pertenece a una caja ya cerrada,
              se ajustarán sus totales y se recalculará el arqueo automáticamente.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant={variant === 'sastre' ? undefined : 'outline'}
              className={variant === 'sastre' ? 'bg-white/[0.06] border border-white/15 text-white/70 hover:bg-white/10 hover:text-white' : undefined}
              onClick={() => setEditTarget(null)}
              disabled={isEditing}
            >
              Cancelar
            </Button>
            <Button
              className={variant === 'sastre' ? 'bg-[#c9a96e] text-[#0a1020] font-semibold hover:bg-[#c9a96e]/90' : undefined}
              onClick={handleEditSave}
              disabled={isEditing}
            >
              {isEditing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
