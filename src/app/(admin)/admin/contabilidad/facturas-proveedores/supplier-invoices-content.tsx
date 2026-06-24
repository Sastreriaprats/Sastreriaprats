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
import { Switch } from '@/components/ui/switch'
import {
  Loader2,
  Plus,
  FileDown,
  Download,
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
  Undo2,
} from 'lucide-react'
import { CreditNoteDialog } from './credit-note-dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { downloadExcel } from '@/lib/excel/export'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { usePermissions } from '@/hooks/use-permissions'
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
  getSupplierInvoiceLines,
  listSupplierInvoiceInstallments,
  type ApSupplierInvoiceRow,
  type ApSupplierInvoiceInput,
  type SupplierInvoicesKpis,
  type SupplierOptionForInvoice,
  type UnlinkedDeliveryNoteOption,
} from '@/actions/supplier-invoices'
import { getSupplierInvoicesPaidMap, registerBulkSupplierInvoicePayments } from '@/actions/supplier-invoice-payments'
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

// IVA de factura a proveedor. Lista propia del formulario; NO se comparte con
// otros módulos (factura cliente, POS, productos, pedidos a proveedor).
// El 23% se incluye para soportar proveedores portugueses / extracomunitarios
// que facturan con tipo distinto al estándar español 21%.
const SUPPLIER_INVOICE_TAX_RATES = [0, 4, 10, 21, 23] as const

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
  const { can } = usePermissions()
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
  // Selección múltiple para marcar varias facturas como pagadas a la vez
  // (caso: un único pago en el banco que liquida N facturas).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkPayOpen, setBulkPayOpen] = useState(false)
  const [bulkPayDate, setBulkPayDate] = useState(today())
  const [bulkPayMethod, setBulkPayMethod] = useState('transfer')
  const [bulkPaying, setBulkPaying] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ApSupplierInvoiceRow | null>(null)
  const [creditNoteTarget, setCreditNoteTarget] = useState<ApSupplierInvoiceRow | null>(null)
  // Proforma: si la fila en edición es un abono, el flag proforma se deshabilita
  // (son excluyentes). `hideProformas` oculta las proformas de la lista (off por defecto).
  const [editingIsRectifying, setEditingIsRectifying] = useState(false)
  const [hideProformas, setHideProformas] = useState(false)

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
    retention_rate: '0',
    total_amount: '',
    payment_method: '',
    notes: '',
    attachment_url: '',
    is_proforma: false,
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

  // Editor de plazos de pago para esta factura.
  // Cuando está activo, las cuotas introducidas aquí sustituyen al cálculo
  // automático de buildInstallments en el server action.
  const [splitPayment, setSplitPayment] = useState(false)
  const [installments, setInstallments] = useState<Array<{ amount: string; due_date: string }>>([])

  // Líneas con base + IVA. La factura SIEMPRE tiene al menos 1 línea.
  // Si la factura solo tiene 1 línea, equivale visualmente al flujo legacy
  // (un único IVA). Con N líneas, soporta multi-base (ej: género 21% + transporte 0%).
  const [lines, setLines] = useState<Array<{ description: string; base: string; tax_rate: string }>>([
    { description: '', base: '', tax_rate: '21' },
  ])

  const selectedSupplier = suppliers.find((s) => s.id === form.supplier_id) || null
  // IVA por defecto del proveedor seleccionado, usado como default del tax_rate de
  // las líneas nuevas. OJO: 0 es un IVA válido (exento) → comparar con != null, NO
  // con truthy, para que un 0 legítimo no caiga al fallback 21.
  const supplierDefaultTaxRate = selectedSupplier?.default_tax_rate != null ? String(selectedSupplier.default_tax_rate) : '21'

  const loadKpis = useCallback(async () => {
    const r = await getSupplierInvoicesKpis()
    if (r.success) setKpis(r.data)
  }, [])

  const loadList = useCallback(async () => {
    setLoading(true)
    setSelectedIds(new Set())
    const r = await listSupplierInvoices({
      status: statusFilter === 'all' ? undefined : statusFilter,
      supplierSearch: supplierSearch.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      paymentMethod: paymentMethodFilter === 'all' ? undefined : paymentMethodFilter,
    })
    console.log('[DEBUG] listSupplierInvoices result:', r.success, r.success ? r.data?.length : (r as any).error)
    if (r.success) {
      setRows(r.data)
      const ids = r.data.map((x) => x.id)
      if (ids.length > 0) {
        const pm = await getSupplierInvoicesPaidMap({ invoice_ids: ids })
        if (pm.success) setPaidMap(pm.data)
      } else {
        setPaidMap({})
      }
    } else {
      console.error('[listSupplierInvoices]', r)
      toast.error((r as any).error || 'Error al cargar facturas')
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
      // El bucket es privado: guardamos solo el path. Al ver el PDF se genera
      // una signed URL al vuelo (handleOpenAttachment).
      setForm((f) => ({ ...f, attachment_url: path }))
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

  const handleExportExcel = async () => {
    if (rows.length === 0) {
      toast.error('No hay facturas para exportar')
      return
    }
    const data = rows.map(row => {
      const paid = paidMap[row.id] ?? 0
      const pendiente = Math.max(0, Number(row.total_amount) - paid)
      return {
        'Proveedor': row.supplier_name,
        'NIF': row.supplier_cif ?? '',
        'Nº Factura': row.invoice_number,
        'Fecha': row.invoice_date,
        'Vencimiento': row.due_date,
        'Base Imponible': Number(row.amount) || 0,
        'IVA': Number(row.tax_amount) || 0,
        'Total': Number(row.total_amount) || 0,
        'Pagado': paid,
        'Pendiente': pendiente,
        'Estado': STATUS_BADGE[row.status]?.label ?? row.status,
        'Método Pago': row.payment_method ?? '',
      }
    })
    const range = dateFrom && dateTo ? `-${dateFrom}_a_${dateTo}` : ''
    await downloadExcel(data, `facturas-proveedores${range}`, 'Facturas proveedor')
  }

  /** Abre el PDF de factura proveedor generando signed URL al vuelo.
   *  Soporta retrocompat: si `attachmentPath` viene como URL pública legacy
   *  (con /storage/v1/object/public/supplier-invoices/), extrae el path. */
  const handleOpenAttachment = async (attachmentPath: string) => {
    if (!attachmentPath) return
    const supabase = createSupabaseClient()
    let path = attachmentPath
    const publicMarker = '/storage/v1/object/public/supplier-invoices/'
    if (path.includes(publicMarker)) {
      path = path.split(publicMarker)[1]
    }
    const { data, error } = await supabase.storage
      .from('supplier-invoices')
      .createSignedUrl(path, 3600)
    if (error || !data?.signedUrl) {
      toast.error('No se pudo abrir el archivo')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const openCreate = () => {
    setEditingId(null)
    setEditingIsRectifying(false)
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
      retention_rate: '0',
      total_amount: '',
      payment_method: '',
      notes: '',
      attachment_url: '',
      is_proforma: false,
    })
    setSelectedDeliveryNoteIds([])
    setDeliveryNotes([])
    setTotalTouched(false)
    setAttachmentName(null)
    setSplitPayment(false)
    setInstallments([])
    setLines([{ description: '', base: '', tax_rate: '21' }])
    setDialogOpen(true)
  }

  const openEdit = async (row: ApSupplierInvoiceRow) => {
    setEditingId(row.id)
    setEditingIsRectifying(row.is_rectifying === true)
    // Reconstruir el IVA % real a partir de los importes guardados (los datos
    // de la factura solo guardan los importes, no el porcentaje).
    const reconstructedTaxRate = row.amount > 0
      ? Math.round((row.tax_amount / row.amount) * 10000) / 100
      : 21
    setForm({
      supplier_id: row.supplier_id || '',
      supplier_name: row.supplier_name,
      supplier_cif: row.supplier_cif || '',
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      amount: String(row.amount),
      tax_rate: String(reconstructedTaxRate),
      shipping_amount: row.shipping_amount ? String(row.shipping_amount) : '',
      retention_rate: String(row.retention_rate ?? 0),
      total_amount: String(row.total_amount),
      payment_method: row.payment_method || '',
      notes: row.notes || '',
      attachment_url: row.attachment_url || '',
      is_proforma: row.is_proforma === true,
    })
    setTotalTouched(true)
    setAttachmentName(deriveFilenameFromUrl(row.attachment_url))
    setDialogOpen(true)
    // Cargar líneas existentes. Si la factura es legacy (sin filas en
    // ap_supplier_invoice_lines) sintetizamos 1 línea desde la cabecera para
    // que la usuaria vea el equivalente a lo que ya tenía.
    const linesResp = await getSupplierInvoiceLines(row.id)
    if (linesResp.success && linesResp.data.length > 0) {
      setLines(linesResp.data.map((l) => ({
        description: l.description ?? '',
        base: String(l.base),
        tax_rate: String(l.tax_rate),
      })))
    } else {
      setLines([{
        description: '',
        base: String(row.amount),
        tax_rate: String(reconstructedTaxRate),
      }])
    }
    // Cargar cuotas existentes; si hay más de 1 activamos el editor
    const inst = await listSupplierInvoiceInstallments({ invoice_id: row.id })
    if (inst.success && inst.data.length > 0) {
      setInstallments(inst.data.map((c) => ({
        amount: String(c.amount),
        due_date: c.due_date,
      })))
      setSplitPayment(inst.data.length > 1)
    } else {
      setInstallments([])
      setSplitPayment(false)
    }
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
    // 0 es válido (exento) → != null, no truthy, para no caer al fallback 21.
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
    // El IVA real de la factura sale del tax_rate de cada LÍNEA (no de form.tax_rate).
    // Propagar el IVA del proveedor SOLO a las líneas VACÍAS (sin descripción ni base):
    // es el default de las líneas nuevas, pero NUNCA pisa un IVA que la usuaria ya
    // haya ajustado a mano en una línea con datos.
    setLines((prev) => prev.map((l) =>
      l.description.trim() === '' && String(l.base).trim() === ''
        ? { ...l, tax_rate: supplierTaxRate }
        : l
    ))
    setSupplierPopoverOpen(false)
    setSelectedDeliveryNoteIds([])
    loadDeliveryNotesForSupplier(supplierId, editingId)
  }

  const toggleDeliveryNote = (noteId: string) => {
    // La base se sincroniza vía useEffect (solo cuando hay 1 línea).
    // Con N líneas el usuario gestiona las bases manualmente.
    setSelectedDeliveryNoteIds((prev) =>
      prev.includes(noteId) ? prev.filter((id) => id !== noteId) : [...prev, noteId],
    )
  }

  const selectedDeliveryNotesTotal = selectedDeliveryNoteIds.reduce((sum, id) => {
    const note = deliveryNotes.find((n) => n.id === id)
    return sum + (note?.total_amount ?? 0)
  }, 0)

  // Base imponible total e IVA total derivados de las líneas.
  const linesBase = lines.reduce(
    (s, l) => s + (parseFloat(String(l.base).replace(',', '.')) || 0),
    0,
  )
  const linesTax = lines.reduce((s, l) => {
    const b = parseFloat(String(l.base).replace(',', '.')) || 0
    const r = parseFloat(String(l.tax_rate).replace(',', '.')) || 0
    return s + (b * r) / 100
  }, 0)
  const amountNum = Math.round(linesBase * 100) / 100
  const taxAmountNum = Math.round(linesTax * 100) / 100
  const shippingNum = parseFloat(String(form.shipping_amount).replace(',', '.')) || 0
  const retentionRateNum = parseFloat(String(form.retention_rate).replace(',', '.')) || 0
  const retentionAmountNum = Math.round((amountNum * retentionRateNum / 100) * 100) / 100
  const computedTotal = amountNum + taxAmountNum + shippingNum - retentionAmountNum
  const totalNum = totalTouched && form.total_amount.trim() !== ''
    ? parseFloat(String(form.total_amount).replace(',', '.')) || computedTotal
    : computedTotal

  // Recalcular el total mostrado siempre que cambien los componentes derivados.
  // Si el usuario tocó manualmente el total (totalTouched), respetamos su valor.
  useEffect(() => {
    if (totalTouched) return
    const total = Math.round(computedTotal * 100) / 100
    setForm((f) => ({ ...f, total_amount: total > 0 ? String(total) : '' }))
  }, [computedTotal, totalTouched])

  // Si hay albaranes seleccionados y solo hay 1 línea, auto-rellenar su base
  // con el total de los albaranes. Con N líneas no tocamos (el usuario gestiona).
  useEffect(() => {
    if (selectedDeliveryNoteIds.length === 0) return
    if (lines.length !== 1) return
    const base = Math.round(selectedDeliveryNotesTotal * 100) / 100
    if (base <= 0) return
    setLines((prev) => prev.map((l, i) => (i === 0 ? { ...l, base: String(base) } : l)))
  }, [selectedDeliveryNoteIds.length, selectedDeliveryNotesTotal, lines.length])

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
    // Validar líneas: al menos una con base > 0
    const cleanedLines = lines
      .map((l, idx) => {
        const base = parseFloat(String(l.base).replace(',', '.')) || 0
        const rate = parseFloat(String(l.tax_rate).replace(',', '.'))
        return {
          description: l.description.trim() || null,
          base,
          tax_rate: Number.isFinite(rate) ? rate : 21,
          sort_order: idx,
        }
      })
      .filter((l) => l.base > 0)
    if (cleanedLines.length === 0) {
      toast.error('Añade al menos una línea con base imponible mayor que 0')
      return
    }

    // Si la usuaria activó plazos múltiples, validar que las cuotas cuadren.
    let installmentsPayload: Array<{ amount: number; due_date: string }> | undefined
    if (splitPayment) {
      const cleaned = installments
        .map((it) => ({
          amount: parseFloat(String(it.amount).replace(',', '.')) || 0,
          due_date: it.due_date,
        }))
        .filter((it) => it.amount > 0 && it.due_date)
      if (cleaned.length === 0) {
        toast.error('Añade al menos una cuota o desactiva los plazos')
        return
      }
      const sum = Math.round(cleaned.reduce((s, c) => s + c.amount, 0) * 100) / 100
      const diff = Math.abs(sum - Math.round(totalNum * 100) / 100)
      if (diff > 0.05) {
        toast.error(`La suma de cuotas (${formatCurrency(sum)}) no coincide con el total (${formatCurrency(totalNum)})`)
        return
      }
      installmentsPayload = cleaned
    }

    setSaving(true)
    const payload: ApSupplierInvoiceInput = {
      supplier_id: form.supplier_id || null,
      supplier_name: form.supplier_name.trim(),
      supplier_cif: form.supplier_cif.trim() || null,
      invoice_number: form.invoice_number.trim(),
      invoice_date: form.invoice_date,
      due_date: form.due_date,
      amount: amountNum,
      tax_amount: taxAmountNum,
      shipping_amount: shippingNum,
      retention_rate: retentionRateNum,
      retention_amount: retentionAmountNum,
      total_amount: totalNum,
      payment_method: form.payment_method.trim() || null,
      notes: form.notes.trim() || null,
      attachment_url: form.attachment_url.trim() || null,
      delivery_note_ids: selectedDeliveryNoteIds,
      installments: installmentsPayload,
      lines: cleanedLines,
      is_proforma: form.is_proforma,
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

  // Las proformas se ven por defecto; el toggle "ocultar proformas" las filtra (cliente).
  const visibleRows = hideProformas ? rows.filter((r) => r.is_proforma !== true) : rows

  // ─── Selección múltiple para pago en lote ───────────────────────────────────
  const pendingOf = (row: ApSupplierInvoiceRow) =>
    Math.max(0, Math.round((row.total_amount - (paidMap[row.id] ?? 0)) * 100) / 100)
  // Solo se pueden marcar como pagadas las facturas con pendiente > 0 (no proformas).
  const selectableRows = visibleRows.filter((r) => !r.is_proforma && pendingOf(r) > 0)
  const selectedRows = visibleRows.filter((r) => selectedIds.has(r.id))
  const selectedTotal = Math.round(selectedRows.reduce((s, r) => s + pendingOf(r), 0) * 100) / 100
  const allSelectableSelected =
    selectableRows.length > 0 && selectableRows.every((r) => selectedIds.has(r.id))

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }
  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(selectableRows.map((r) => r.id)) : new Set())
  }

  const openBulkPay = () => {
    setBulkPayDate(today())
    setBulkPayMethod('transfer')
    setBulkPayOpen(true)
  }

  const runBulkPay = async () => {
    const ids = selectedRows.filter((r) => pendingOf(r) > 0).map((r) => r.id)
    if (ids.length === 0) {
      toast.error('No hay facturas con importe pendiente seleccionadas')
      return
    }
    setBulkPaying(true)
    const r = await registerBulkSupplierInvoicePayments({
      ids,
      payment_date: bulkPayDate,
      payment_method: bulkPayMethod as any,
    })
    setBulkPaying(false)
    if (r.success) {
      const { paid, skipped, failed } = r.data
      let msg = `${paid} factura(s) marcada(s) como pagada(s)`
      if (skipped > 0) msg += ` · ${skipped} ya estaban al día`
      if (failed > 0) msg += ` · ${failed} con error`
      if (failed > 0) toast.warning(msg)
      else toast.success(msg)
      setBulkPayOpen(false)
      setSelectedIds(new Set())
      loadList()
      loadKpis()
    } else {
      toast.error(r.error || 'No se pudieron registrar los pagos')
    }
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
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="h-4 w-4 mr-1" /> Descargar Excel
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Nueva factura
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Total pendiente</p>
              <p className="text-xl font-bold">{formatCurrency(kpis.totalPendiente)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">facturas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Vencidas</p>
              <p className="text-xl font-bold text-red-600">{kpis.countVencidas}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">facturas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Próximas 30 días</p>
              <p className="text-xl font-bold text-amber-600">{kpis.countProximas30}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">facturas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Pagadas este mes</p>
              <p className="text-xl font-bold text-green-600">{kpis.countPagadasEsteMes}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">facturas + cuotas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">Cuotas pedidos</p>
              <p className="text-xl font-bold text-purple-600">
                {kpis.countVencidasPedidos} <span className="text-xs font-medium text-purple-600/80">vencida{kpis.countVencidasPedidos === 1 ? '' : 's'}</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                {formatCurrency(kpis.totalPendientePedidos)} pendiente
              </p>
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
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox
            checked={hideProformas}
            onCheckedChange={(checked) => setHideProformas(checked === true)}
          />
          Ocultar proformas
        </label>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setDateFrom('')
            setDateTo('')
            setSupplierSearch('')
            setStatusFilter('all')
            setPaymentMethodFilter('all')
            setHideProformas(false)
          }}
        >
          Limpiar
        </Button>
      </div>

      {/* Barra de acción para selección múltiple */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm text-amber-900">
            <span className="font-semibold">{selectedIds.size}</span> factura{selectedIds.size === 1 ? '' : 's'} seleccionada{selectedIds.size === 1 ? '' : 's'}
            {' · '}Pendiente total: <span className="font-semibold tabular-nums">{formatCurrency(selectedTotal)}</span>
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Quitar selección
            </Button>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={openBulkPay}>
              <CreditCard className="h-4 w-4 mr-1" /> Marcar como pagadas
            </Button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-lg border">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="mx-auto h-12 w-12 mb-4 opacity-30" />
            <p>No hay facturas con los filtros indicados.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelectableSelected}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    disabled={selectableRows.length === 0}
                    aria-label="Seleccionar todas"
                  />
                </TableHead>
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
              {visibleRows.map((row) => {
                const badge = displayStatus(row)
                const paid = paidMap[row.id] ?? 0
                const pending = Math.max(0, Math.round((row.total_amount - paid) * 100) / 100)
                const paymentLabel = row.payment_method
                  ? (PAYMENT_METHOD_LABEL[row.payment_method] ?? row.payment_method)
                  : null
                const selectable = !row.is_proforma && pending > 0
                return (
                  <TableRow key={row.id} data-state={selectedIds.has(row.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
                        disabled={!selectable}
                        aria-label={`Seleccionar factura ${row.invoice_number}`}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{row.supplier_name}</span>
                      {row.supplier_cif && (
                        <span className="text-xs text-muted-foreground block">{row.supplier_cif}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {row.invoice_number}
                      {row.is_rectifying && (
                        <span className="ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-700 align-middle">Abono</span>
                      )}
                    </TableCell>
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
                      {row.is_proforma ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          Proforma
                        </span>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      )}
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
                        {row.attachment_url?.trim() && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-blue-600"
                            onClick={() => handleOpenAttachment(row.attachment_url!)}
                            title="Ver PDF de la factura"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-amber-600"
                          onClick={() => openPaymentDialog(row)}
                          title={pending > 0 ? 'Registrar pago' : 'Ver pagos'}
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                        </Button>
                        {!row.is_rectifying && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-rose-600"
                            onClick={() => setCreditNoteTarget(row)}
                            title="Registrar abono (rectificativa recibida)"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {can('supplier_invoices.manage') && (
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
              const totalIrpf = rows.reduce((s, r) => s + Number(r.retention_amount ?? 0), 0)
              const totalFacturado = rows.reduce((s, r) => s + r.total_amount, 0)
              const totalPagado = rows.reduce((s, r) => s + (paidMap[r.id] ?? 0), 0)
              const totalPendiente = rows.reduce(
                (s, r) => s + Math.max(0, Math.round((r.total_amount - (paidMap[r.id] ?? 0)) * 100) / 100),
                0,
              )
              return (
                <TableFooter className="bg-muted/60">
                  <TableRow className="font-normal">
                    <TableCell colSpan={5} className="text-right text-muted-foreground">
                      Base imponible
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totalBruto)}</TableCell>
                    <TableCell colSpan={5}></TableCell>
                  </TableRow>
                  <TableRow className="font-normal">
                    <TableCell colSpan={5} className="text-right text-muted-foreground">
                      IVA
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(totalIva)}</TableCell>
                    <TableCell colSpan={5}></TableCell>
                  </TableRow>
                  {totalIrpf > 0 && (
                    <TableRow className="font-normal">
                      <TableCell colSpan={5} className="text-right text-muted-foreground">
                        IRPF retenido
                      </TableCell>
                      <TableCell className="text-right tabular-nums">−{formatCurrency(totalIrpf)}</TableCell>
                      <TableCell colSpan={5}></TableCell>
                    </TableRow>
                  )}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell colSpan={5} className="text-right">
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
              <div className="col-span-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.is_proforma}
                    disabled={editingIsRectifying}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, is_proforma: checked === true }))}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium">Es proforma (sin validez fiscal)</span>
                    <p className="text-xs text-muted-foreground">
                      {editingId
                        ? 'Desmarcar la convierte en la factura definitiva: empezará a contar para IVA y deuda, y se generarán sus cuotas de pago.'
                        : 'Una proforma no cuenta para IVA ni contabilidad, ni genera vencimientos, hasta que la conviertas en factura real.'}
                    </p>
                    {editingIsRectifying && (
                      <p className="text-xs text-rose-600">No disponible: esta factura es un abono.</p>
                    )}
                  </div>
                </label>
              </div>
              <div className="col-span-2 rounded-md border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Bases imponibles</Label>
                  <span className="text-xs text-muted-foreground">
                    Base total: {formatCurrency(amountNum)} · IVA total: {formatCurrency(taxAmountNum)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  Una línea por tipo de IVA. Ejemplo: género al 21% + transporte exento al 0%.
                </p>
                <div className="space-y-2">
                  {lines.map((l, idx) => {
                    const lineBase = parseFloat(String(l.base).replace(',', '.')) || 0
                    const lineRate = parseFloat(String(l.tax_rate).replace(',', '.')) || 0
                    const lineTax = Math.round((lineBase * lineRate) / 100 * 100) / 100
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4">
                          {idx === 0 && <Label className="text-xs text-muted-foreground">Descripción</Label>}
                          <Input
                            value={l.description}
                            placeholder="Género / Transporte / …"
                            onChange={(e) => {
                              const v = e.target.value
                              setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, description: v } : x)))
                            }}
                          />
                        </div>
                        <div className="col-span-3">
                          {idx === 0 && <Label className="text-xs text-muted-foreground">Base (€)</Label>}
                          <Input
                            type="number"
                            step="0.01"
                            value={l.base}
                            onChange={(e) => {
                              const v = e.target.value
                              setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, base: v } : x)))
                            }}
                          />
                        </div>
                        <div className="col-span-2">
                          {idx === 0 && <Label className="text-xs text-muted-foreground">IVA %</Label>}
                          <Select
                            value={l.tax_rate}
                            onValueChange={(v) => {
                              setLines((prev) => prev.map((x, i) => (i === idx ? { ...x, tax_rate: v } : x)))
                            }}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {SUPPLIER_INVOICE_TAX_RATES.map((n) => (
                                <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          {idx === 0 && <Label className="text-xs text-muted-foreground">IVA (€)</Label>}
                          <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm tabular-nums">
                            {formatCurrency(lineTax)}
                          </div>
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-red-600 hover:text-red-700 disabled:opacity-30"
                            disabled={lines.length <= 1}
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                            title={lines.length <= 1 ? 'Debe quedar al menos una línea' : 'Eliminar línea'}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setLines((prev) => [...prev, { description: '', base: '', tax_rate: supplierDefaultTaxRate }])}
                  >
                    <Plus className="h-3 w-3" /> Añadir línea
                  </Button>
                </div>
              </div>
              <div>
                <Label>IRPF %</Label>
                <Select
                  value={form.retention_rate}
                  onValueChange={(v) => {
                    setForm((f) => ({ ...f, retention_rate: v }))
                    setTotalTouched(false)
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 7, 10, 15, 19].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {retentionAmountNum > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">−{formatCurrency(retentionAmountNum)}</p>
                )}
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

            {/* Editor de plazos de pago */}
            <div className="rounded-md border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium">Plazos de pago</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Activa esto si la factura se paga en varias cuotas (1 plazo por defecto).
                  </p>
                </div>
                <Switch
                  checked={splitPayment}
                  onCheckedChange={(checked) => {
                    setSplitPayment(checked)
                    if (checked && installments.length === 0) {
                      // Pre-rellenar con 2 cuotas iguales a 30 y 60 días desde la factura
                      const half = Math.round(totalNum * 50) / 100
                      const rest = Math.round((totalNum - half) * 100) / 100
                      const d30 = addDays(form.invoice_date, 30)
                      const d60 = addDays(form.invoice_date, 60)
                      setInstallments([
                        { amount: String(half), due_date: d30 },
                        { amount: String(rest), due_date: d60 },
                      ])
                    }
                  }}
                />
              </div>
              {splitPayment && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {[2, 3, 4].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          const each = Math.floor((totalNum / n) * 100) / 100
                          const last = Math.round((totalNum - each * (n - 1)) * 100) / 100
                          const next = Array.from({ length: n }).map((_, i) => ({
                            amount: String(i === n - 1 ? last : each),
                            due_date: addDays(form.invoice_date, 30 * (i + 1)),
                          }))
                          setInstallments(next)
                        }}
                      >
                        Repartir en {n} cuotas
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {installments.map((it, idx) => (
                      <div key={idx} className="flex items-end gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Cuota {idx + 1} - Importe (€)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={it.amount}
                            onChange={(e) => {
                              const v = e.target.value
                              setInstallments((prev) => prev.map((x, i) => i === idx ? { ...x, amount: v } : x))
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Vencimiento</Label>
                          <DatePickerPopover
                            value={it.due_date}
                            onChange={(date) => {
                              setInstallments((prev) => prev.map((x, i) => i === idx ? { ...x, due_date: date } : x))
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-red-600 hover:text-red-700"
                          onClick={() => setInstallments((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => {
                        const lastDate = installments.length > 0
                          ? addDays(installments[installments.length - 1].due_date, 30)
                          : addDays(form.invoice_date, 30)
                        setInstallments((prev) => [...prev, { amount: '0', due_date: lastDate }])
                      }}
                    >
                      <Plus className="h-3 w-3" /> Añadir cuota
                    </Button>
                  </div>
                  {(() => {
                    const sum = installments.reduce((s, it) => s + (parseFloat(String(it.amount).replace(',', '.')) || 0), 0)
                    const diff = Math.round((totalNum - sum) * 100) / 100
                    if (Math.abs(diff) < 0.01) {
                      return <p className="text-xs text-emerald-700">Suma de cuotas: {formatCurrency(sum)} (cuadra con el total)</p>
                    }
                    return (
                      <p className="text-xs text-rose-700">
                        Suma de cuotas: {formatCurrency(sum)} · Diferencia con el total: {formatCurrency(diff)}
                      </p>
                    )
                  })()}
                </div>
              )}
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
                  <button
                    type="button"
                    onClick={() => handleOpenAttachment(form.attachment_url)}
                    className="flex-1 text-left text-sm truncate text-prats-navy hover:underline cursor-pointer"
                    title={attachmentName || form.attachment_url}
                  >
                    {attachmentName || 'Ver factura'}
                  </button>
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

      {/* Modal: marcar varias facturas como pagadas */}
      <Dialog open={bulkPayOpen} onOpenChange={(open) => { if (!bulkPaying) setBulkPayOpen(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar {selectedRows.length} factura{selectedRows.length === 1 ? '' : 's'} como pagada{selectedRows.length === 1 ? '' : 's'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Se registrará el pago íntegro del importe pendiente de cada factura con la misma
              fecha y método. Total a pagar:{' '}
              <span className="font-semibold text-foreground tabular-nums">{formatCurrency(selectedTotal)}</span>.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha de pago</Label>
                <DatePickerPopover value={bulkPayDate} onChange={(d) => setBulkPayDate(d)} />
              </div>
              <div>
                <Label>Método de pago</Label>
                <Select value={bulkPayMethod} onValueChange={setBulkPayMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
              {selectedRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <span className="truncate">
                    <span className="font-medium">{r.supplier_name}</span>
                    <span className="text-muted-foreground"> · {r.invoice_number}</span>
                  </span>
                  <span className="tabular-nums shrink-0">{formatCurrency(pendingOf(r))}</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPayOpen(false)} disabled={bulkPaying}>Cancelar</Button>
            <Button onClick={runBulkPay} disabled={bulkPaying || !bulkPayDate}>
              {bulkPaying && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreditNoteDialog
        invoice={creditNoteTarget}
        open={!!creditNoteTarget}
        onOpenChange={(open) => { if (!open) setCreditNoteTarget(null) }}
        onCreated={() => { loadList(); loadKpis() }}
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
