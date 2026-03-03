'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Plus,
  FileDown,
  Upload,
  Calendar,
  CheckCircle,
  Pencil,
  Trash2,
  FileText,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import Papa from 'papaparse'
import {
  getSupplierInvoicesKpis,
  listSupplierInvoices,
  createSupplierInvoiceAction,
  updateSupplierInvoiceAction,
  markSupplierInvoicePaidAction,
  importSupplierInvoicesCsvAction,
  type ApSupplierInvoiceRow,
  type ApSupplierInvoiceInput,
  type SupplierInvoicesKpis,
} from '@/actions/supplier-invoices'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'vencida', label: 'Vencida' },
  { value: 'parcial', label: 'Parcial' },
  { value: 'pagada', label: 'Pagada' },
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
  vencida: { label: 'Vencida', className: 'bg-red-100 text-red-800' },
  parcial: { label: 'Parcial', className: 'bg-blue-100 text-blue-800' },
  pagada: { label: 'Pagada', className: 'bg-green-100 text-green-800' },
}

const PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta', 'Bizum', 'Otro']

function today() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function SupplierInvoicesContent() {
  const [kpis, setKpis] = useState<SupplierInvoicesKpis | null>(null)
  const [rows, setRows] = useState<ApSupplierInvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)

  const [form, setForm] = useState({
    supplier_name: '',
    supplier_cif: '',
    invoice_number: '',
    invoice_date: today(),
    due_date: addDays(today(), 15),
    amount: '',
    tax_rate: '21',
    total_amount: '',
    payment_method: '',
    notes: '',
    attachment_url: '',
  })

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
    })
    if (r.success) setRows(r.data)
    setLoading(false)
  }, [statusFilter, supplierSearch, dateFrom, dateTo])

  useEffect(() => {
    loadKpis()
  }, [loadKpis])

  useEffect(() => {
    loadList()
  }, [loadList])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      supplier_name: '',
      supplier_cif: '',
      invoice_number: '',
      invoice_date: today(),
      due_date: addDays(today(), 15),
      amount: '',
      tax_rate: '21',
      total_amount: '',
      payment_method: '',
      notes: '',
      attachment_url: '',
    })
    setDialogOpen(true)
  }

  const openEdit = (row: ApSupplierInvoiceRow) => {
    setEditingId(row.id)
    setForm({
      supplier_name: row.supplier_name,
      supplier_cif: row.supplier_cif || '',
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      amount: String(row.amount),
      tax_rate: '21',
      total_amount: String(row.total_amount),
      payment_method: row.payment_method || '',
      notes: row.notes || '',
      attachment_url: row.attachment_url || '',
    })
    setDialogOpen(true)
  }

  const amountNum = parseFloat(String(form.amount).replace(',', '.')) || 0
  const taxRateNum = parseFloat(String(form.tax_rate).replace(',', '.')) || 21
  const computedTotal = amountNum * (1 + taxRateNum / 100)
  const totalNum = parseFloat(String(form.total_amount).replace(',', '.')) || computedTotal

  const handleSave = async () => {
    if (!form.supplier_name.trim()) {
      toast.error('El nombre del proveedor es obligatorio')
      return
    }
    if (!form.invoice_number.trim()) {
      toast.error('El número de factura es obligatorio')
      return
    }
    if (new Date(form.due_date) <= new Date(form.invoice_date)) {
      toast.error('La fecha de vencimiento debe ser posterior a la fecha de factura')
      return
    }
    if (totalNum <= 0) {
      toast.error('El total debe ser mayor que 0')
      return
    }

    setSaving(true)
    const tax_amount = totalNum - amountNum
    const payload: ApSupplierInvoiceInput = {
      supplier_name: form.supplier_name.trim(),
      supplier_cif: form.supplier_cif.trim() || null,
      invoice_number: form.invoice_number.trim(),
      invoice_date: form.invoice_date,
      due_date: form.due_date,
      amount: amountNum,
      tax_amount,
      total_amount: totalNum,
      payment_method: form.payment_method.trim() || null,
      notes: form.notes.trim() || null,
      attachment_url: form.attachment_url.trim() || null,
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

  const handleMarkPaid = async (id: string) => {
    setMarkingPaidId(id)
    const r = await markSupplierInvoicePaidAction({
      id,
      payment_date: today(),
      payment_method: 'Transferencia',
    })
    setMarkingPaidId(null)
    if (r.success) {
      toast.success('Marcada como pagada')
      loadList()
      loadKpis()
    } else {
      toast.error(r.error)
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
        <Button variant="secondary" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setSupplierSearch(''); setStatusFilter('all') }}>
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
                <TableHead className="text-right">Importe</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-32">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const badge = displayStatus(row)
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
                    <TableCell className="text-right font-semibold">{formatCurrency(row.total_amount)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(row)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {(row.status === 'pendiente' || row.status === 'vencida') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-green-600"
                            onClick={() => handleMarkPaid(row.id)}
                            disabled={markingPaidId === row.id}
                          >
                            {markingPaidId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Modal Nueva / Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar factura proveedor' : 'Nueva factura proveedor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <Label>Proveedor *</Label>
                <Input
                  value={form.supplier_name}
                  onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                  placeholder="Nombre del proveedor"
                />
              </div>
              <div>
                <Label>CIF / NIF</Label>
                <Input
                  value={form.supplier_cif}
                  onChange={(e) => setForm((f) => ({ ...f, supplier_cif: e.target.value }))}
                  placeholder="B12345678"
                />
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
                  onChange={(date) => setForm((f) => ({ ...f, invoice_date: date }))}
                />
              </div>
              <div>
                <Label>Fecha vencimiento *</Label>
                <div className="flex gap-1">
                  <DatePickerPopover
                    value={form.due_date}
                    onChange={(date) => setForm((f) => ({ ...f, due_date: date }))}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, due_date: addDays(f.invoice_date, 15) }))}>
                    +15
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setForm((f) => ({ ...f, due_date: addDays(f.invoice_date, 30) }))}>
                    +30
                  </Button>
                </div>
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
                    setForm((f) => ({ ...f, amount: v, total_amount: String(amt * (1 + rate / 100)) }))
                  }}
                />
              </div>
              <div>
                <Label>IVA %</Label>
                <Select
                  value={form.tax_rate}
                  onValueChange={(v) => {
                    const amt = parseFloat(String(form.amount).replace(',', '.')) || 0
                    setForm((f) => ({ ...f, tax_rate: v, total_amount: String(amt * (1 + parseFloat(v) / 100)) }))
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
                <Label>Total (€) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.total_amount}
                  onChange={(e) => setForm((f) => ({ ...f, total_amount: e.target.value }))}
                />
              </div>
              <div>
                <Label>Método de pago</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div>
              <Label>URL adjunto (PDF)</Label>
              <Input
                value={form.attachment_url}
                onChange={(e) => setForm((f) => ({ ...f, attachment_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editingId ? 'Guardar' : 'Crear factura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  )
}
