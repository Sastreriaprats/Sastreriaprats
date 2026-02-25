'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Plus, Loader2, CreditCard, Banknote, ArrowRightLeft, FileText, Trash2, CalendarClock,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  getOrderPayments, addOrderPayment, deleteOrderPayment,
  getSalePayments, addSalePayment,
  type OrderPayment, type PaymentMethod,
} from '@/actions/payments'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  check: 'Cheque',
}

const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  cash: <Banknote className="h-3.5 w-3.5" />,
  card: <CreditCard className="h-3.5 w-3.5" />,
  transfer: <ArrowRightLeft className="h-3.5 w-3.5" />,
  check: <FileText className="h-3.5 w-3.5" />,
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
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentHistory({
  entityType, entityId, total, onPaymentAdded, readonly = false,
}: PaymentHistoryProps) {
  const [payments, setPayments] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Form state
  const [formDate, setFormDate] = useState(today())
  const [formMethod, setFormMethod] = useState<PaymentMethod>('cash')
  const [formAmount, setFormAmount] = useState('')
  const [formReference, setFormReference] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formNextPaymentDate, setFormNextPaymentDate] = useState('')

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
        })
      } else {
        result = await addSalePayment({
          sale_id: entityId,
          payment_method: formMethod,
          amount,
          reference: formReference || undefined,
          next_payment_date: formNextPaymentDate || undefined,
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

  async function handleDelete(paymentId: string) {
    if (entityType !== 'tailoring_order') return
    setDeletingId(paymentId)
    try {
      const result = await deleteOrderPayment({ payment_id: paymentId, tailoring_order_id: entityId })
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
    }
  }

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progreso de pago</span>
          <span className="font-medium tabular-nums">{progressPct.toFixed(0)}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
        <div className="grid grid-cols-3 gap-3 pt-1">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</p>
            <p className="font-semibold tabular-nums">{formatCurrency(total)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pagado</p>
            <p className="font-semibold text-green-600 tabular-nums">{formatCurrency(totalPaid)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pendiente</p>
            <p className={`font-semibold tabular-nums ${totalPending > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {formatCurrency(totalPending)}
            </p>
          </div>
        </div>
      </div>

      {/* Cabecera + botón */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Historial de pagos</h4>
        {!readonly && totalPending > 0 && (
          <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-1" />
            Registrar pago
          </Button>
        )}
        {!readonly && totalPending <= 0 && (
          <Badge variant="default" className="bg-green-600 text-white">Pagado</Badge>
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
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Método</TableHead>
                <TableHead className="text-xs text-right">Importe</TableHead>
                <TableHead className="text-xs">Referencia</TableHead>
                <TableHead className="text-xs">Próximo pago</TableHead>
                {entityType === 'tailoring_order' && !readonly && (
                  <TableHead className="w-10" />
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm tabular-nums">
                    {formatDate(p.payment_date ?? p.created_at)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      {METHOD_ICONS[p.payment_method as PaymentMethod] ?? null}
                      {METHOD_LABELS[p.payment_method as PaymentMethod] ?? p.payment_method}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(p.amount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                    {p.reference ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
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
                  {entityType === 'tailoring_order' && !readonly && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        disabled={deletingId === p.id}
                        onClick={() => handleDelete(p.id)}
                      >
                        {deletingId === p.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </Button>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {entityType === 'tailoring_order' && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-date">Fecha</Label>
                <Input
                  id="pay-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Método de pago</Label>
              <Select value={formMethod} onValueChange={(v) => setFormMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(METHOD_LABELS) as [PaymentMethod, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
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
              <Label htmlFor="pay-amount">
                Importe{' '}
                <span className="text-muted-foreground font-normal text-xs">
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
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Referencia <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
              <Input
                id="pay-ref"
                placeholder="Nº transferencia, recibo…"
                value={formReference}
                onChange={(e) => setFormReference(e.target.value)}
              />
            </div>

            {entityType === 'tailoring_order' && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-notes">Notas <span className="text-muted-foreground font-normal text-xs">(opcional)</span></Label>
                <Textarea
                  id="pay-notes"
                  rows={2}
                  placeholder="Observaciones…"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5 pt-1 border-t">
              <Label htmlFor="pay-next-date" className="flex items-center gap-1.5">
                Fecha próximo pago
                <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
              </Label>
              <Input
                id="pay-next-date"
                type="date"
                value={formNextPaymentDate}
                min={formDate || today()}
                onChange={(e) => setFormNextPaymentDate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Si hay saldo pendiente, indica cuándo se espera el siguiente pago.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
