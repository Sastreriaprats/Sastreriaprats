'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Loader2,
  Plus,
  FileDown,
  Upload,
  Calendar,
  CreditCard,
  Pencil,
  Trash2,
  FileText,
  Check,
  ChevronsUpDown,
  Package,
  X,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { useAuth } from '@/components/providers/auth-provider'
import {
  getSupplierInvoicesKpis,
  listSupplierInvoices,
  createSupplierInvoiceAction,
  updateSupplierInvoiceAction,
  deleteSupplierInvoiceAction,
  importSupplierInvoicesCsvAction,
  listSuppliersForInvoice,
  listUnlinkedDeliveryNotesForSupplier,
  getSupplierInvoiceDeliveryNoteIds,
  type ApSupplierInvoiceRow,
  type ApSupplierInvoiceInput,
  type SupplierInvoicesKpis,
  type SupplierOptionForInvoice,
  type UnlinkedDeliveryNoteOption,
} from '@/actions/supplier-invoices'
import { getSupplierInvoicesPaidMap } from '@/actions/supplier-invoice-payments'
import {
  SupplierPaymentDialog,
  type SupplierPaymentDialogInvoice,
} from '@/components/payments/supplier-payment-dialog'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'vencida', label: 'Vencida' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'pagada', label: 'Pagada' },
]

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  transfer: 'Transferencia',
  direct_debit: 'Domiciliación',
  check: 'Cheque',
  cash: 'Efectivo',
  card: 'Tarjeta',
  bank_draft: 'Pagaré',
}

const PAYMENT_METHOD_OPTIONS = [
  { value: 'all', label: 'Todos los pagos' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'direct_debit', label: 'Domiciliación' },
  { value: 'check', label: 'Cheque' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'bank_draft', label: 'Pagaré' },
  { value: 'none', label: 'Sin método' },
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  vencida: { label: 'Vencida', className: 'bg-red-100 text-red-800' },
  parcial: { label: 'Parcial', className: 'bg-blue-100 text-blue-800' },
  pagada: { label: 'Pagada', className: 'bg-green-100 text-green-800' },
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function computeDueFromSupplier(invoiceDate: string, supplier: SupplierOptionForInvoice | null): string {
  if (!supplier) return addDays(invoiceDate, 30)
  switch (supplier.payment_terms) {
    case 'immediate': return invoiceDate
    case 'net_15': return addDays(invoiceDate, 15)
    case 'net_30': return addDays(invoiceDate, 30)
    case 'net_60': return addDays(invoiceDate, 60)
    case 'net_90': return addDays(invoiceDate, 90)
    case 'custom': {
      // Primera cuota del plan, si existe. Si no, 30 días.
      const firstDays = supplier.custom_payment_plan?.[0]?.days
      const d = firstDays !== null && firstDays !== undefined && Number.isFinite(firstDays) ? Number(firstDays) : 30
      return addDays(invoiceDate, d)
    }
    default: return addDays(invoiceDate, 30)
  }
}

const PAYMENT_TERMS_LABEL: Record<string, string> = {
  immediate: 'Al contado',
  net_15: '15 días',
  net_30: '30 días',
  net_60: '60 días',
  net_90: '90 días',
  custom: 'Personalizado',
}

export function SupplierInvoicesContent() {
  const { isAdmin } = useAuth()
  const [kpis, setKpis] = useState<SupplierInvoicesKpis | null>(null)
  const [rows, setRows] = useState<ApSupplierInvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentInvoice, setPaymentInvoice] = useState<SupplierPaymentDialogInvoice | null>(null)
  const [paidMap, setPaidMap] = useState<Record<string, number>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ApSupplierInvoiceRow | null>(null)

  const [form, setForm] = useState({
    supplier_id: '',
    supplier_name: '',
    supplier_cif: '',
    invoice_number: '',
    invoice_date: today(),
    due_date: addDays(today(), 15),
    amount: '',
    tax_rate: '21',
    shipping_amount: '',
    total_amount: '',
    payment_method: '',
    notes: '',
    attachment_url: '',
  })

  const [suppliers, setSuppliers] = useState<SupplierOptionForInvoice[]>([])
  const [supplierPopoverOpen, setSupplierPopoverOpen] = useState(false)
  const [deliveryNotes, setDeliveryNotes] = useState<UnlinkedDeliveryNoteOption[]>([])
  const [deliveryNotesLoading, setDeliveryNotesLoading] = useState(false)
  const [selectedDeliveryNoteIds, setSelectedDeliveryNoteIds] = useState<string[]>([])
  const [totalTouched, setTotalTouched] = useState(false)

  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [attachmentName, setAttachmentName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedSupplier = suppliers.find((s) => s.id === form.supplier_id) || null

  const loadKpis = useCallback(async () => {
    const r = await getSupplierInvoicesKpis()
    if (r.success) setKpis(r.data)
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    const r = await listSupplierInvoices({
      status: statusFilter === 'all' ? undefined : statusFilter,
      supplierSearch: supplierSearch.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      paymentMethod: paymentMethodFilter === 'all' ? undefined : paymentMethodFilter,
    })
    if (r.success) {
      setRows(r.data)
      const ids = r.data.map((x) => x.id)
      if (ids.length > 0) {
        const pm = await getSupplierInvoicesPaidMap({ invoice_ids: ids })
        if (pm.success) setPaidMap(pm.data)
      } else {
        setPaidMap({})
      }
    }
    setLoading(false)
  }, [statusFilter, supplierSearch, dateFrom, dateTo, paymentMethodFilter])

  const loadSuppliers = useCallback(async () => {
    const r = await listSuppliersForInvoice()
    if (r.success) setSuppliers(r.data)
  }, [])

  useEffect(() => {
    loadKpis()
  }, [loadKpis])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  const loadDeliveryNotesForSupplier = useCallback(
    async (supplierId: string, excludeInvoiceId: string | null) => {
      if (!supplierId) {
        setDeliveryNotes([])
        return
      }
      setDeliveryNotesLoading(true)
      const r = await listUnlinkedDeliveryNotesForSupplier({
        supplierId,
        excludeInvoiceId: excludeInvoiceId ?? undefined,
      })
      setDeliveryNotesLoading(false)
      if (r.success) setDeliveryNotes(r.data)
      else setDeliveryNotes([])
    },
    [],
  )

  const deriveFilenameFromUrl = (url: string | null | undefined): string | null => {
    if (!url) return null
    try {
      const clean = url.split('?')[0]
      const parts = clean.split('/')
      const raw = decodeURIComponent(parts[parts.length - 1] || '')
      // Quitar el prefijo timestamp_ si lo tiene
      return raw.replace(/^\d{10,}_/, '') || raw
    } catch {
      return url
    }
  }

  const uploadInvoiceAttachment = async (file: File) => {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Solo se admiten archivos PDF')
      return
    }
    const supabase = createSupabaseClient()
    const folder = form.supplier_id || 'sin-proveedor'
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${folder}/${Date.now()}_${safeName}`
    setAttachmentUploading(true)
    try {
      const { error } = await supabase.storage
        .from('supplier-invoices')
        .upload(path, file, { contentType: 'application/pdf', upsert: false })
      if (error) {
        toast.error(`No se pudo subir el PDF: ${error.message}`)
        return
      }
      const { data: urlData } = supabase.storage.from('supplier-invoices').getPublicUrl(path)
      setForm((f) => ({ ...f, attachment_url: urlData.publicUrl }))
      setAttachmentName(file.name)
      toast.success('PDF adjuntado')
    } catch (err: any) {
      toast.error(`Error inesperado al subir: ${err?.message || 'desconocido'}`)
    } finally {
      setAttachmentUploading(false)
    }
  }

  const removeAttachment = () => {
    setForm((f) => ({ ...f, attachment_url: '' }))
    setAttachmentName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({
      supplier_id: '',
      supplier_name: '',
      supplier_cif: '',
      invoice_number: '',
      invoice_date: today(),
      due_date: addDays(today(), 30),
      amount: '',
      tax_rate: '21',
      shipping_amount: '',
      total_amount: '',
      payment_method: '',
      notes: '',
      attachment_url: '',
    })
    setSelectedDeliveryNoteIds([])
    setDeliveryNotes([])
    setTotalTouched(false)
    setAttachmentName(null)
    setDialogOpen(true)
  }

  const openEdit = async (row: ApSupplierInvoiceRow) => {
    setEditingId(row.id)
    setForm({
      supplier_id: row.supplier_id || '',
      supplier_name: row.supplier_name,
      supplier_cif: row.supplier_cif || '',
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      amount: String(row.amount),
      tax_rate: '21',
      shipping_amount: row.shipping_amount ? String(row.shipping_amount) : '',
      total_amount: String(row.total_amount),
      payment_method: row.payment_method || '',
      notes: row.notes || '',
      attachment_url: row.attachment_url || '',
    })
    setTotalTouched(true)
    setAttachmentName(deriveFilenameFromUrl(row.attachment_url))
    setDialogOpen(true)
    if (row.supplier_id) {
      await loadDeliveryNotesForSupplier(row.supplier_id, row.id)
      const linked = await getSupplierInvoiceDeliveryNoteIds(row.id)
      if (linked.success) setSelectedDeliveryNoteIds(linked.data)
      else setSelectedDeliveryNoteIds([])
    } else {
      setDeliveryNotes([])
      setSelectedDeliveryNoteIds([])
    }
  }

  const handleSelectSupplier = (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId) || null
    const supplierTaxRate = supplier?.default_tax_rate != null ? String(supplier.default_tax_rate) : '21'
    setForm((f) => ({
      ...f,
      supplier_id: supplierId,
      supplier_name: supplier?.name ?? f.supplier_name,
      supplier_cif: supplier?.nif_cif ?? f.supplier_cif,
      due_date: computeDueFromSupplier(f.invoice_date, supplier),
      payment_method: supplier?.payment_method ?? f.payment_method,
      tax_rate: supplierTaxRate,
    }))
    setSupplierPopoverOpen(false)
    setSelectedDeliveryNoteIds([])
    loadDeliveryNotesForSupplier(supplierId, editingId)
  }

  // Suma de los albaranes marcados con su importe computado
  const computeDeliveryNotesBase = useCallback(
    (ids: string[]) =>
      ids.reduce((sum, id) => {
        const note = deliveryNotes.find((n) => n.id === id)
        return sum + (note?.total_amount ?? 0)
      }, 0),
    [deliveryNotes],
  )

  const toggleDeliveryNote = (noteId: string) => {
    setSelectedDeliveryNoteIds((prev) => {
      const next = prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId]
      // Auto-rellenar base y total a partir de los albaranes seleccionados.
      // El usuario puede ajustar después; al volver a tildar/destildar se
      // recalcula según el nuevo conjunto.
      const base = Math.round(computeDeliveryNotesBase(next) * 100) / 100
      setForm((f) => {
        const rate = parseFloat(String(f.tax_rate).replace(',', '.')) || 21
        const shipping = parseFloat(String(f.shipping_amount).replace(',', '.')) || 0
        const total = Math.round((base * (1 + rate / 100) + shipping) * 100) / 100
        return {
          ...f,
          amount: base > 0 ? String(base) : '',
          total_amount: total > 0 ? String(total) : '',
        }
      })
      setTotalTouched(true)
      return next
    })
  }

  const selectedDeliveryNotesTotal = selectedDeliveryNoteIds.reduce((sum, id) => {
    const note = deliveryNotes.find((n) => n.id === id)
    return sum + (note?.total_amount ?? 0)
  }, 0)

  const amountNum = parseFloat(String(form.amount).replace(',', '.')) || 0
  const taxRateNum = parseFloat(String(form.tax_rate).replace(',', '.')) || 21
  const shippingNum = parseFloat(String(form.shipping_amount).replace(',', '.')) || 0
  const computedTotal = amountNum * (1 + taxRateNum / 100) + shippingNum
  const totalNum = parseFloat(String(form.total_amount).replace(',', '.')) || computedTotal

  // Si hay albaranes seleccionados y el usuario cambia el IVA o el envío,
  // recalcular el total automáticamente sobre la base derivada de los albaranes.
  useEffect(() => {
    if (selectedDeliveryNoteIds.length === 0) return
    const base = Math.round(selectedDeliveryNotesTotal * 100) / 100
    const total = Math.round((base * (1 + taxRateNum / 100) + shippingNum) * 100) / 100
    setForm((f) => ({
      ...f,
      amount: base > 0 ? String(base) : f.amount,
      total_amount: total > 0 ? String(total) : f.total_amount,
    }))
  }, [taxRateNum, shippingNum, selectedDeliveryNoteIds.length, selectedDeliveryNotesTotal])

  const handleSave = async () => {
    if (!form.supplier_id && !form.supplier_name.trim()) {
      toast.error('Selecciona un proveedor')
      return
    }
    if (!form.invoice_number.trim()) {
      toast.error('El número de factura es obligatorio')
      return
    }
    if (new Date(form.due_date) < new Date(form.invoice_date)) {
      toast.error('La fecha de vencimiento no puede ser anterior a la fecha de factura')
      return
    }
    if (totalNum <= 0) {
      toast.error('El total debe ser mayor que 0')
      return
    }
    if (selectedDeliveryNoteIds.length > 0 && !form.supplier_id) {
      toast.error('Selecciona un proveedor registrado para vincular albaranes')
      return
    }

    setSaving(true)
    const tax_amount = totalNum - amountNum - shippingNum
    const payload: ApSupplierInvoiceInput = {
      supplier_id: form.supplier_id || null,
      supplier_name: form.supplier_name.trim(),
      supplier_cif: form.supplier_cif.trim() || null,
      invoice_number: form.invoice_number.trim(),
      invoice_date: form.invoice_date,
      due_date: form.due_date,
      amount: amountNum,
      tax_amount,
      shipping_amount: shippingNum,
      total_amount: totalNum,
      payment_method: form.payment_method.trim() || null,
      notes: form.notes.trim() || null,
      attachment_url: form.attachment_url.trim() || null,
      delivery_note_ids: selectedDeliveryNoteIds,
    }

    if (editingId) {
      const r = await updateSupplierInvoiceAction({ ...payload, id: editingId })
      if (r.success) {
        toast.success('Factura actualizada')
        setDialogOpen(false)
        loadList()
        loadKpis()
      } else {
        toast.error(r.error)
      }
    } else {
      const r = await createSupplierInvoiceAction(payload)
      if (r.success) {
        toast.success('Factura creada')
        setDialogOpen(false)
        loadList()
        loadKpis()
      } else {
        toast.error(r.error)
      }
    }
    setSaving(false)
  }

  const openPaymentDialog = (row: ApSupplierInvoiceRow) => {
    const paid = paidMap[row.id] ?? 0
    const pending = Math.max(0, Math.round((row.total_amount - paid) * 100) / 100)
    setPaymentInvoice({
      id: row.id,
      supplier_name: row.supplier_name,
      invoice_number: row.invoice_number,
      total_amount: row.total_amount,
      amount_paid: paid,
      amount_pending: pending,
      default_payment_method: row.payment_method ?? 'transfer',
    })
    setPaymentDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeletingId(id)
    const r = await deleteSupplierInvoiceAction({ id })
    setDeletingId(null)
    setDeleteTarget(null)
    if (r.success) {
      toast.success('Factura eliminada')
      loadList()
      loadKpis()
    } else {
      toast.error(r.error || 'No se pudo eliminar la factura')
    }
  }

  const downloadTemplate = () => {
    const headers = ['proveedor', 'cif', 'numero_factura', 'fecha_factura', 'fecha_vencimiento', 'base', 'iva', 'total', 'notas']
    const example = ['Proveedor Ejemplo S.L.', 'B12345678', 'FAC-2025-001', '2025-01-15', '2025-02-15', '100', '21', '121', '']
    const csv = [headers.join(','), example.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'plantilla_facturas_proveedores.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('Plantilla descargada')
  }

  const handleImportCsv = async () => {
    if (!importFile) {
      toast.error('Selecciona un archivo CSV')
      return
    }
    setImporting(true)
    Papa.parse(importFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = (results.data || []) as Array<Record<string, string>>
        if (rows.length === 0) {
          toast.error('El CSV no tiene filas de datos')
          setImporting(false)
          return
        }
        const r = await importSupplierInvoicesCsvAction({ rows })
        setImporting(false)
        setImportOpen(false)
        setImportFile(null)
        if (r.success) {
          if (r.data.errors.length > 0) {
            toast.warning(`${r.data.created} creadas. Errores: ${r.data.errors.slice(0, 3).join('; ')}${r.data.errors.length > 3 ? '...' : ''}`)
          } else {
            toast.success(`${r.data.created} factura(s) importada(s)`)
          }
          loadList()
          loadKpis()
        } else {
          toast.error(r.error)
        }
      },
      error: () => {
        setImporting(false)
        toast.error('Error al leer el CSV')
      },
    })
  }

  const displayStatus = (row: ApSupplierInvoiceRow) => {
    const isOverdue = row.due_date < today() && (row.status === 'pendiente' || row.status === 'vencida')
    const s = STATUS_BADGE[row.status] ?? STATUS_BADGE.pendiente
    return isOverdue && row.status === 'pendiente' ? STATUS_BADGE.vencida : s
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7" />
            Facturas de proveedores
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Cuentas por pagar. Gestiona vencimientos y pagos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/contabilidad/facturas-proveedores/calendario">
              <Calendar className="h-4 w-4 mr-1" /> Ver calendario
            </Link>
          </Button>
          <Button variant="outline" onClick={downloadTemplate}>
            <FileDown className="h-4 w-4 mr-1" /> Descargar plantilla CSV
          </Button>
          <Button variant="outline" onClick={() => { setImportOpen(true); setImportFile(null) }}>
            <Upload className="h-4 w-4 mr-1" /> Importar CSV
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Nueva factura
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Total pendiente</p>
              <p className="text-xl font-bold">{formatCurrency(kpis.totalPendiente)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Vencidas</p>
              <p className="text-xl font-bold text-red-600">{kpis.countVencidas}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Próximas 30 días</p>
              <p className="text-xl font-bold text-amber-600">{kpis.countProximas30}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Pagadas este mes</p>
              <p className="text-xl font-bold text-green-600">{kpis.countPagadasEsteMes}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo de pago" />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar por proveedor..."
          className="w-48"
          value={supplierSearch}
          onChange={(e) => setSupplierSearch(e.target.value)}
        />
        <DatePickerPopover
          containerClassName="w-40"
          value={dateFrom}
          onChange={(date) => setDateFrom(date)}
        />
        <DatePickerPopover
          containerClassName="w-40"
          value={dateTo}
          onChange={(date) => setDateTo(date)}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setDateFrom('')
            setDateTo('')
            setSupplierSearch('')
            setStatusFilter('all')
            setPaymentMethodFilter('all')
          }}
        >
          Limpiar
        </Button>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="mx-auto h-12 w-12 mb-4 opacity-30" />
            <p>No hay facturas con los filtros indicados.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Nº factura</TableHead>
                <TableHead>Fecha factura</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
                <TableHead>Tipo de pago</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-32">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const badge = displayStatus(row)
                const paid = paidMap[row.id] ?? 0
                const pending = Math.max(0, Math.round((row.total_amount - paid) * 100) / 100)
                const paymentLabel = row.payment_method
                  ? (PAYMENT_METHOD_LABEL[row.payment_method] ?? row.payment_method)
                  : null
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="font-medium">{row.supplier_name}</span>
                      {row.supplier_cif && (
                        <span className="text-xs text-muted-foreground block">{row.supplier_cif}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{row.invoice_number}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(row.invoice_date)}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(row.due_date)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(row.total_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-600">{formatCurrency(paid)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-semibold ${pending > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {formatCurrency(pending)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {paymentLabel ? (
                        <span>{paymentLabel}</span>
                      ) : (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => openEdit(row)}
                          disabled={row.status === 'pagada'}
                          title={row.status === 'pagada' ? 'Factura pagada (bloqueada)' : 'Editar factura'}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-amber-600"
                          onClick={() => openPaymentDialog(row)}
                          title={pending > 0 ? 'Registrar pago' : 'Ver pagos'}
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(row)}
                            disabled={deletingId === row.id || row.status === 'pagada'}
                            title={row.status === 'pagada' ? 'Factura pagada (bloqueada)' : 'Eliminar factura'}
                          >
                            {deletingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            {(() => {
              const totalBruto = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
              const totalIva = rows.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0)
              const totalFacturado = rows.reduce((s, r) => s + r.total_amount, 0)
              const totalPagado = rows.reduce((s, r) => s + (paidMap[r.id] ?? 0), 0)
              const totalPendiente = rows.reduce(
                (s, r) => s + Math.max(0, Math.round((r.total_amount - (paidMap[r.id] ?? 0)) * 100) / 100),
                0,
              )
              return (
                <TableFooter className="bg-muted/60">
                  <TableRow className="font-normal">
                    <TableCell colSpan={4} className="text-right text-muted-foreground">
                      Base imponible
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totalBruto)}</TableCell>
                    <TableCell colSpan={5}></TableCell>
                  </TableRow>
                  <TableRow className="font-normal">
                    <TableCell colSpan={4} className="text-right text-muted-foreground">
                      IVA
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totalIva)}</TableCell>
                    <TableCell colSpan={5}></TableCell>
                  </TableRow>
                  <TableRow className="font-semibold border-t-2">
                    <TableCell colSpan={4} className="text-right">
                      Totales ({rows.length} factura{rows.length === 1 ? '' : 's'})
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totalFacturado)}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">{formatCurrency(totalPagado)}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">{formatCurrency(totalPendiente)}</TableCell>
                    <TableCell colSpan={3}></TableCell>
                  </TableRow>
                </TableFooter>
              )
            })()}
          </Table>
        )}
      </div>

      {/* Modal Nueva / Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-lg max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar factura proveedor' : 'Nueva factura proveedor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Label>Proveedor *</Label>
                <Popover open={supplierPopoverOpen} onOpenChange={setSupplierPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={supplierPopoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className="truncate text-left">
                        {selectedSupplier?.name || form.supplier_name || 'Selecciona proveedor...'}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar proveedor..." />
                      <CommandList>
                        <CommandEmpty>Sin resultados</CommandEmpty>
                        <CommandGroup>
                          {suppliers.map((s) => (
                            <CommandItem
                              key={s.id}
                              value={`${s.name} ${s.nif_cif ?? ''}`}
                              onSelect={() => handleSelectSupplier(s.id)}
                            >
                              <Check
                                className={`h-4 w-4 mr-2 ${form.supplier_id === s.id ? 'opacity-100' : 'opacity-0'}`}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">{s.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {s.nif_cif ?? '—'} · {PAYMENT_TERMS_LABEL[s.payment_terms ?? 'net_30'] ?? `${s.payment_days ?? 30} días`}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>CIF / NIF</Label>
                <Input
                  value={form.supplier_cif}
                  onChange={(e) => setForm((f) => ({ ...f, supplier_cif: e.target.value }))}
                  placeholder="B12345678"
                />
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1">
                    <Package className="h-3.5 w-3.5" /> Albaranes a facturar
                  </Label>
                  {selectedDeliveryNoteIds.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Base albaranes: {formatCurrency(selectedDeliveryNotesTotal)}
                    </span>
                  )}
                </div>
                <div className="border rounded-md mt-1 max-h-44 overflow-y-auto divide-y">
                  {!form.supplier_id ? (
                    <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                      Selecciona un proveedor para ver sus albaranes pendientes
                    </p>
                  ) : deliveryNotesLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : deliveryNotes.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                      No hay albaranes pendientes de este proveedor
                    </p>
                  ) : (
                    deliveryNotes.map((note) => {
                      const checked = selectedDeliveryNoteIds.includes(note.id)
                      return (
                        <label
                          key={note.id}
                          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleDeliveryNote(note.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium truncate">
                                {note.supplier_reference || `Albarán ${note.id.slice(0, 8)}`}
                              </span>
                              <span className="text-sm font-semibold text-right whitespace-nowrap">
                                {note.total_amount > 0 ? formatCurrency(note.total_amount) : (
                                  <span className="text-xs text-muted-foreground">sin importe</span>
                                )}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {note.delivery_date ? formatDate(note.delivery_date) : 'sin fecha'}
                              {' · '}{note.line_count} línea{note.line_count === 1 ? '' : 's'}
                              {' · '}{note.status}
                            </div>
                          </div>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
              <div>
                <Label>Nº factura *</Label>
                <Input
                  value={form.invoice_number}
                  onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))}
                  placeholder="FAC-2025-001"
                />
              </div>
              <div>
                <Label>Fecha factura *</Label>
                <DatePickerPopover
                  value={form.invoice_date}
                  onChange={(date) => setForm((f) => ({
                    ...f,
                    invoice_date: date,
                    due_date: computeDueFromSupplier(date, selectedSupplier),
                  }))}
                />
              </div>
              <div>
                <Label>Base imponible (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => {
                    const v = e.target.value
                    const amt = parseFloat(v.replace(',', '.')) || 0
                    const rate = parseFloat(String(form.tax_rate).replace(',', '.')) || 21
                    const ship = parseFloat(String(form.shipping_amount).replace(',', '.')) || 0
                    setForm((f) => ({ ...f, amount: v, total_amount: String(amt * (1 + rate / 100) + ship) }))
                  }}
                />
              </div>
              <div>
                <Label>IVA %</Label>
                <Select
                  value={form.tax_rate}
                  onValueChange={(v) => {
                    const amt = parseFloat(String(form.amount).replace(',', '.')) || 0
                    const ship = parseFloat(String(form.shipping_amount).replace(',', '.')) || 0
                    setForm((f) => ({ ...f, tax_rate: v, total_amount: String(amt * (1 + parseFloat(v) / 100) + ship) }))
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 4, 10, 21].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Transporte (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.shipping_amount}
                  placeholder="0.00"
                  onChange={(e) => {
                    const v = e.target.value
                    const ship = parseFloat(v.replace(',', '.')) || 0
                    const amt = parseFloat(String(form.amount).replace(',', '.')) || 0
                    const rate = parseFloat(String(form.tax_rate).replace(',', '.')) || 21
                    setForm((f) => ({ ...f, shipping_amount: v, total_amount: String(amt * (1 + rate / 100) + ship) }))
                  }}
                />
              </div>
              <div>
                <Label>Total (€) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.total_amount}
                  onChange={(e) => { setTotalTouched(true); setForm((f) => ({ ...f, total_amount: e.target.value })) }}
                />
              </div>
            </div>

            {selectedSupplier && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <span className="text-muted-foreground">Vence:</span>{' '}
                  <span className="font-medium">{formatDate(form.due_date)}</span>
                </span>
                <span>
                  <span className="text-muted-foreground">Condiciones:</span>{' '}
                  <span className="font-medium">
                    {PAYMENT_TERMS_LABEL[selectedSupplier.payment_terms ?? 'net_30'] ?? `${selectedSupplier.payment_days ?? 30} días`}
                  </span>
                </span>
                <span>
                  <span className="text-muted-foreground">Pago:</span>{' '}
                  <span className="font-medium">{selectedSupplier.payment_method ?? '—'}</span>
                </span>
              </div>
            )}
            {selectedSupplier?.payment_terms === 'custom' && (selectedSupplier.custom_payment_plan?.length ?? 0) > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-semibold">Plan de pagos personalizado</p>
                <p className="mt-0.5">
                  Este proveedor tiene {selectedSupplier.custom_payment_plan!.length} cuota
                  {selectedSupplier.custom_payment_plan!.length === 1 ? '' : 's'} configurada
                  {selectedSupplier.custom_payment_plan!.length === 1 ? '' : 's'}. Las cuotas se generarán
                  automáticamente al guardar la factura (la fecha de vencimiento visible es solo la de la
                  primera cuota).
                </p>
                <ul className="mt-1 space-y-0.5 font-mono">
                  {selectedSupplier.custom_payment_plan!.map((p, i) => (
                    <li key={i}>
                      · Cuota {i + 1}: {p.amount.toFixed(2)} € — {p.days !== null ? `${p.days} días` : 'sin fecha'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div>
              <Label>Adjuntar factura (PDF)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) await uploadInvoiceAttachment(file)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              />
              {form.attachment_url ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/30">
                  <FileText className="h-4 w-4 text-red-600 shrink-0" />
                  <a
                    href={form.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-sm truncate text-prats-navy hover:underline"
                    title={attachmentName || form.attachment_url}
                  >
                    {attachmentName || 'Ver factura'}
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={attachmentUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {attachmentUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Reemplazar'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                    disabled={attachmentUploading}
                    onClick={removeAttachment}
                    aria-label="Quitar adjunto"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2"
                  disabled={attachmentUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {attachmentUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Subiendo...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" /> Seleccionar PDF
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || attachmentUploading}>
              {(saving || attachmentUploading) && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {attachmentUploading ? 'Subiendo PDF...' : editingId ? 'Guardar' : 'Crear factura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Pagos */}
      <SupplierPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={(open) => { setPaymentDialogOpen(open); if (!open) setPaymentInvoice(null) }}
        invoice={paymentInvoice}
        onChanged={() => { loadList(); loadKpis() }}
      />

      {/* Modal Importar CSV */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar facturas desde CSV</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Formato: proveedor, cif, numero_factura, fecha_factura, fecha_vencimiento, base, iva, total, notas
          </p>
          <div>
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={handleImportCsv} disabled={!importFile || importing}>
              {importing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar factura de proveedor?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Se eliminará la factura ${deleteTarget.supplier_name} · ${deleteTarget.invoice_number} y sus datos asociados. Esta acción no se puede deshacer.`
                : 'Se eliminará esta factura y sus datos asociados. Esta acción no se puede deshacer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>No, volver</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!deletingId}
              onClick={confirmDelete}
            >
              Sí, eliminar factura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
