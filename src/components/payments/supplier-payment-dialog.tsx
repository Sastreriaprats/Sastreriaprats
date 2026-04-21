'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Loader2, Trash2, CreditCard, Banknote, ArrowRightLeft, FileText } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  registerSupplierInvoicePayment,
  listSupplierInvoicePayments,
  deleteSupplierInvoicePayment,
  type SupplierInvoicePayment,
} from '@/actions/supplier-invoice-payments'
import {
  SUPPLIER_PAYMENT_METHOD_LABEL,
  type SupplierPaymentMethod,
} from '@/lib/constants/supplier-payment-methods'

const METHOD_ICON: Record<string, React.ReactNode> = {
  transfer: <ArrowRightLeft className="h-3.5 w-3.5" />,
  direct_debit: <ArrowRightLeft className="h-3.5 w-3.5" />,
  check: <FileText className="h-3.5 w-3.5" />,
  cash: <Banknote className="h-3.5 w-3.5" />,
  card: <CreditCard className="h-3.5 w-3.5" />,
  bank_draft: <FileText className="h-3.5 w-3.5" />,
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export type SupplierPaymentDialogInvoice = {
  id: string
  supplier_name: string
  invoice_number: string
  total_amount: number
  amount_paid: number
  amount_pending: number
  default_payment_method?: SupplierPaymentMethod | string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: SupplierPaymentDialogInvoice | null
  onChanged?: () => void
}

export function SupplierPaymentDialog({ open, onOpenChange, invoice, onChanged }: Props) {
  const [payments, setPayments] = useState<SupplierInvoicePayment[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [formDate, setFormDate] = useState(today())
  const [formMethod, setFormMethod] = useState<SupplierPaymentMethod>('transfer')
  const [formAmount, setFormAmount] = useState('')
  const [formReference, setFormReference] = useState('')
  const [formNotes, setFormNotes] = useState('')

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const total = invoice?.total_amount ?? 0
  const pending = Math.max(0, Math.round((total - totalPaid) * 100) / 100)
  const progressPct = total > 0 ? Math.min(100, (totalPaid / total) * 100) : 0

  const loadPayments = useCallback(async () => {
    if (!invoice) return
    setLoading(true)
    const r = await listSupplierInvoicePayments({ supplier_invoice_id: invoice.id })
    setLoading(false)
    if (r.success) setPayments(r.data)
  }, [invoice])

  useEffect(() => {
    if (open && invoice) {
      loadPayments()
      setFormDate(today())
      const defaultMethod = (invoice.default_payment_method as SupplierPaymentMethod) || 'transfer'
      setFormMethod(
        defaultMethod in SUPPLIER_PAYMENT_METHOD_LABEL
          ? defaultMethod
          : 'transfer',
      )
      setFormAmount(invoice.amount_pending > 0 ? String(invoice.amount_pending) : '')
      setFormReference('')
      setFormNotes('')
    }
  }, [open, invoice, loadPayments])

  async function handleSave() {
    if (!invoice) return
    const amount = parseFloat(String(formAmount).replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Introduce un importe válido')
      return
    }
    if (amount > pending + 0.01) {
      toast.error(`El importe supera el pendiente (${formatCurrency(pending)})`)
      return
    }
    setSaving(true)
    const r = await registerSupplierInvoicePayment({
      supplier_invoice_id: invoice.id,
      amount,
      payment_date: formDate,
      payment_method: formMethod,
      reference: formReference.trim() || null,
      notes: formNotes.trim() || null,
    })
    setSaving(false)
    if (r.success) {
      toast.success('Pago registrado')
      setFormAmount('')
      setFormReference('')
      setFormNotes('')
      await loadPayments()
      onChanged?.()
    } else {
      toast.error(r.error || 'Error al registrar pago')
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('¿Eliminar este pago? Se recalculará el estado de la factura.')) return
    setDeletingId(id)
    const r = await deleteSupplierInvoicePayment({ id })
    setDeletingId(null)
    if (r.success) {
      toast.success('Pago eliminado')
      await loadPayments()
      onChanged?.()
    } else {
      toast.error(r.error || 'Error al eliminar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-amber-500" />
            Pagos factura {invoice?.invoice_number}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              — {invoice?.supplier_name}
            </span>
          </DialogTitle>
        </DialogHeader>

        {invoice && (
          <div className="space-y-4">
            {/* Resumen progreso */}
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
                  <p className="font-semibold tabular-nums text-green-600">{formatCurrency(totalPaid)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pendiente</p>
                  <p className={`font-semibold tabular-nums ${pending > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {formatCurrency(pending)}
                  </p>
                </div>
              </div>
            </div>

            {/* Form nuevo pago */}
            {pending > 0 ? (
              <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
                <h4 className="text-sm font-medium flex items-center gap-1.5">
                  <Plus className="h-4 w-4" /> Registrar pago
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Fecha</Label>
                    <DatePickerPopover value={formDate} onChange={setFormDate} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Método</Label>
                    <Select value={formMethod} onValueChange={(v) => setFormMethod(v as SupplierPaymentMethod)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(SUPPLIER_PAYMENT_METHOD_LABEL) as [SupplierPaymentMethod, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            <span className="flex items-center gap-2">
                              {METHOD_ICON[k]} {v}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      Importe{' '}
                      <span className="font-normal text-xs text-muted-foreground">
                        (pendiente: {formatCurrency(pending)})
                      </span>
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={pending}
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Referencia <span className="font-normal text-xs text-muted-foreground">(opcional)</span></Label>
                    <Input
                      placeholder="Nº transferencia, recibo…"
                      value={formReference}
                      onChange={(e) => setFormReference(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Notas <span className="font-normal text-xs text-muted-foreground">(opcional)</span></Label>
                    <Textarea
                      rows={2}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFormAmount(String(pending))}
                  >
                    Pagar todo ({formatCurrency(pending)})
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Guardar pago
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center p-3 rounded-lg border bg-green-50 text-green-700">
                <Badge className="bg-green-600 text-white">Factura pagada al completo</Badge>
              </div>
            )}

            {/* Historial */}
            <div>
              <h4 className="text-sm font-medium mb-2">Historial de pagos</h4>
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : payments.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg">
                  Sin pagos registrados
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-xs">Fecha</TableHead>
                        <TableHead className="text-xs">Método</TableHead>
                        <TableHead className="text-xs text-right">Importe</TableHead>
                        <TableHead className="text-xs">Referencia</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm tabular-nums">{formatDate(p.payment_date)}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              {METHOD_ICON[p.payment_method] ?? null}
                              {SUPPLIER_PAYMENT_METHOD_LABEL[p.payment_method as SupplierPaymentMethod] ?? p.payment_method}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCurrency(Number(p.amount))}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {p.reference ?? '—'}
                          </TableCell>
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
                                : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
