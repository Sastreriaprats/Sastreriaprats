'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createSupplierInvoiceAction, type ApSupplierInvoiceRow } from '@/actions/supplier-invoices'
import { formatCurrency } from '@/lib/utils'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Diálogo de "Registrar abono" (rectificativa recibida de proveedor).
 * Prefill con los importes de la factura original EN NEGATIVO; el usuario ajusta
 * y añade el motivo. Crea una ap_supplier_invoices con is_rectifying=true que
 * apunta a la original. El nº del abono es el del documento del proveedor.
 */
export function CreditNoteDialog({ invoice, open, onOpenChange, onCreated }: {
  invoice: ApSupplierInvoiceRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayStr())
  const [base, setBase] = useState('')
  const [iva, setIva] = useState('')
  const [total, setTotal] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (invoice && open) {
      setInvoiceNumber(invoice.invoice_number)
      setInvoiceDate(todayStr())
      setBase(String(-Number(invoice.amount || 0)))
      setIva(String(-Number(invoice.tax_amount || 0)))
      setTotal(String(-Number(invoice.total_amount || 0)))
      setReason('')
    }
  }, [invoice, open])

  if (!invoice) return null

  const num = (s: string) => parseFloat(String(s).replace(',', '.'))
  const totalN = num(total)

  const handleSubmit = async () => {
    if (!invoiceNumber.trim()) { toast.error('El número del abono es obligatorio'); return }
    if (reason.trim().length < 10) { toast.error('El motivo debe tener al menos 10 caracteres'); return }
    if (!(totalN < 0)) { toast.error('El total del abono debe ser negativo'); return }

    setSaving(true)
    const r = await createSupplierInvoiceAction({
      supplier_id: invoice.supplier_id,
      supplier_name: invoice.supplier_name,
      supplier_cif: invoice.supplier_cif,
      invoice_number: invoiceNumber.trim(),
      invoice_date: invoiceDate,
      due_date: invoiceDate,
      amount: num(base),
      tax_amount: num(iva),
      total_amount: totalN,
      store_id: invoice.store_id,
      is_rectifying: true,
      rectifies_invoice_id: invoice.id,
      rectification_reason: reason.trim(),
    })
    setSaving(false)
    if (r.success) {
      toast.success('Abono registrado')
      onOpenChange(false)
      onCreated()
    } else {
      toast.error((r as { error?: string }).error || 'No se pudo registrar el abono')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar abono de proveedor</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">{invoice.supplier_name}</div>
            <div className="text-muted-foreground">
              Rectifica la factura <span className="font-mono">{invoice.invoice_number}</span> · Total original {formatCurrency(invoice.total_amount)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nº del abono *</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Base</Label>
              <Input type="number" step="0.01" value={base} onChange={(e) => setBase(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>IVA</Label>
              <Input type="number" step="0.01" value={iva} onChange={(e) => setIva(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Total *</Label>
              <Input type="number" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Los importes deben ser negativos (es un abono).</p>

          <div className="space-y-1">
            <Label>Motivo del abono *</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: Devolución de mercancía defectuosa" />
            <p className="text-xs text-muted-foreground">{reason.trim().length} caracteres (mínimo 10)</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-prats-navy hover:bg-prats-navy-light">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Emitir abono
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
