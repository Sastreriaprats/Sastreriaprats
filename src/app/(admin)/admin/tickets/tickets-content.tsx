'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, FileDown, Receipt, ChevronLeft, ChevronRight, FileText, Gift, Trash2, AlertTriangle, Pencil, X, CreditCard, Plus, Package } from 'lucide-react'
import { formatCurrency, formatDateTime, cn } from '@/lib/utils'
import { listTickets, getSaleForTicket, previewSaleDeletion, deleteSaleCompletely, updateSaleClientNotes, updateSalePayments, previewSaleEdit, editSaleLines, searchProductsForPos } from '@/actions/pos'
import { listClients } from '@/actions/clients'
import { createInvoiceFromSaleAction, generateInvoicePdfAction } from '@/actions/accounting'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'
import { getStorePdfData } from '@/lib/pdf/pdf-company'
import { usePermissions } from '@/hooks/use-permissions'
import { toast } from 'sonner'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  bizum: 'Bizum',
  transfer: 'Transferencia',
  voucher: 'Vale',
  mixed: 'Varios',
}

const CASH_FIELD_LABELS: Record<string, string> = {
  total_cash_sales: 'Ventas efectivo',
  total_card_sales: 'Ventas tarjeta',
  total_bizum_sales: 'Ventas Bizum',
  total_transfer_sales: 'Ventas transferencia',
  total_voucher_sales: 'Ventas vale',
  total_sales: 'Ventas totales',
}

type DeleteRow = { id: string; ticket_number: string }

type SaleEditLine = {
  product_variant_id: string | null
  description: string
  sku: string | null
  quantity: string
  unit_price: string
  discount_percentage: string
  tax_rate: number
}

type SaleEditPreview = {
  blockers?: string[]
  warnings?: string[]
  auto_actions?: string[]
  can_edit?: boolean
}

type DeletionPreview = {
  can_delete?: boolean
  blockers?: string[]
  warnings?: string[]
  auto_actions?: string[]
  sale?: { total?: number }
  lines?: unknown[]
  stock_to_return?: { quantity?: number }[]
  journal_entries_to_delete?: unknown[]
  invoice?: { invoice_number?: string } | null
  cash_adjustment?: {
    session_status?: string
    adjustments?: { total_field: string; current_value: number; delta: number }[]
  }
  withdrawals_in_session?: { id: string; amount: number; reason: string; withdrawn_at: string }[]
}

const STATUS_BADGE: Record<string, { label: string; className: string } | null> = {
  completed: null,
  partially_returned: { label: 'Dev. parcial', className: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100' },
  fully_returned:    { label: 'Devuelta',     className: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100' },
  voided:            { label: 'Anulada',      className: 'bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-200' },
}

export function TicketsContent() {
  const router = useRouter()
  const { can } = usePermissions()
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [clientSearch, setClientSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [invoiceLoadingId, setInvoiceLoadingId] = useState<string | null>(null)
  const [invoiceConfirmRow, setInvoiceConfirmRow] = useState<any | null>(null)

  // Eliminar ticket (borrado físico)
  const [deleteRow, setDeleteRow] = useState<DeleteRow | null>(null)
  const [preview, setPreview] = useState<DeletionPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedWithdrawals, setSelectedWithdrawals] = useState<Set<string>>(new Set())
  const [confirmText, setConfirmText] = useState('')

  // Editar ticket (cliente + notas) — Fase E1
  const [editRow, setEditRow] = useState<DeleteRow | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editClientId, setEditClientId] = useState<string | null>(null)
  const [editClientName, setEditClientName] = useState<string>('')
  const [editNotes, setEditNotes] = useState<string>('')
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<{ id: string; full_name: string; client_code: string | null }[]>([])
  const [clientSearching, setClientSearching] = useState(false)

  // Editar pagos (método de pago) — Fase E2
  const [payRow, setPayRow] = useState<DeleteRow | null>(null)
  const [payLoading, setPayLoading] = useState(false)
  const [savingPay, setSavingPay] = useState(false)
  const [payList, setPayList] = useState<{ payment_method: string; amount: string }[]>([])
  const [payTotal, setPayTotal] = useState(0)

  // Editar líneas/precio/descuento — Fase E3
  const [linesRow, setLinesRow] = useState<DeleteRow | null>(null)
  const [linesLoading, setLinesLoading] = useState(false)
  const [savingLines, setSavingLines] = useState(false)
  const [editLines, setEditLines] = useState<SaleEditLine[]>([])
  const [lineDiscount, setLineDiscount] = useState('0')
  const [salePaid, setSalePaid] = useState(0)
  const [saleStoreId, setSaleStoreId] = useState<string | null>(null)
  const [linesPreview, setLinesPreview] = useState<SaleEditPreview | null>(null)
  const [linesConfirmText, setLinesConfirmText] = useState('')
  const [prodQuery, setProdQuery] = useState('')
  const [prodResults, setProdResults] = useState<{ id: string; description: string; sku: string | null; unit_price: number; tax_rate: number }[]>([])
  const [prodSearching, setProdSearching] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listTickets({
        page,
        pageSize,
        clientSearch: clientSearch.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        productSearch: productSearch.trim() || undefined,
      })
      if (result.success && result.data) {
        setData(result.data.data ?? [])
        setTotal(result.data.total ?? 0)
        setTotalPages(result.data.totalPages ?? 0)
      }
    } catch (e) {
      console.error('[TicketsContent] load:', e)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, clientSearch, dateFrom, dateTo, productSearch])

  useEffect(() => {
    load()
  }, [load])

  // Buscador de cliente para el diálogo de edición (debounced)
  useEffect(() => {
    if (!editRow) return
    const q = clientQuery.trim()
    if (q.length < 2) { setClientResults([]); return }
    let cancelled = false
    setClientSearching(true)
    const timer = setTimeout(() => {
      listClients({ search: q, pageSize: 8 })
        .then((res) => {
          if (cancelled) return
          if (res.success) {
            const payload = res.data as { data?: { id: string; full_name?: string; client_code?: string | null }[] }
            const rows = Array.isArray(payload?.data) ? payload.data : []
            setClientResults(rows.map((c) => ({ id: String(c.id), full_name: c.full_name ?? '', client_code: c.client_code ?? null })))
          }
        })
        .finally(() => { if (!cancelled) setClientSearching(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [clientQuery, editRow])

  // Buscador de productos para el editor de líneas (debounced)
  useEffect(() => {
    if (!linesRow || !saleStoreId) return
    const q = prodQuery.trim()
    if (q.length < 2) { setProdResults([]); return }
    let cancelled = false
    setProdSearching(true)
    const timer = setTimeout(() => {
      searchProductsForPos({ query: q, storeId: saleStoreId })
        .then((res) => {
          if (cancelled) return
          if (res.success && Array.isArray(res.data)) {
            setProdResults(res.data.slice(0, 8).map((v: { id: string; variant_sku?: string | null; size?: string | null; products?: { name?: string; base_price?: number; price_with_tax?: number; tax_rate?: number } }) => {
              const prod = v.products || {}
              return {
                id: v.id,
                description: `${prod.name ?? ''}${v.size ? ' T.' + v.size : ''}`.trim() || (v.variant_sku ?? 'Producto'),
                sku: v.variant_sku ?? null,
                unit_price: Number(prod.price_with_tax ?? prod.base_price ?? 0),
                tax_rate: Number(prod.tax_rate ?? 21),
              }
            }))
          }
        })
        .finally(() => { if (!cancelled) setProdSearching(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [prodQuery, linesRow, saleStoreId])

  const handleDownloadPdf = async (saleId: string) => {
    setDownloadingId(saleId)
    try {
      const result = await getSaleForTicket(saleId)
      if (result.success && result.data) {
        const { sale, lines, payments, clientName, clientCode, storeName } = result.data
        const storeConfig = getStorePdfData(storeName)
        await generateTicketPdf({
          sale: {
            ticket_number: sale.ticket_number,
            created_at: sale.created_at,
            client_id: sale.client_id,
            subtotal: sale.subtotal,
            discount_amount: sale.discount_amount,
            discount_percentage: sale.discount_percentage,
            tax_amount: sale.tax_amount,
            total: sale.total,
            payment_method: sale.payment_method,
            is_tax_free: sale.is_tax_free,
          },
          lines: lines.map((l: any) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_percentage: l.discount_percentage ?? 0,
            line_total: l.line_total,
          })),
          payments,
          clientName,
          clientCode,
          storeAddress: storeConfig.address,
          storeSubtitle: storeConfig.subtitle ?? null,
          storePhones: storeConfig.phones,
        })
      }
    } catch (e) {
      console.error('[TicketsContent] download PDF:', e)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleFacturaDraft = async (saleId: string) => {
    setInvoiceLoadingId(saleId)
    try {
      const res = await createInvoiceFromSaleAction({ saleId, draft: true })
      if (!res.success || !res.data) {
        toast.error('error' in res ? res.error : 'Error al crear la factura')
        return
      }
      toast.success(`Borrador ${res.data.invoice_number} creado. Redirigiendo al editor…`)
      router.push(`/admin/contabilidad?tab=facturas&edit=${res.data.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear la factura')
    } finally {
      setInvoiceLoadingId(null)
      setInvoiceConfirmRow(null)
    }
  }

  const openDelete = async (row: DeleteRow) => {
    setDeleteRow(row)
    setPreview(null)
    setSelectedWithdrawals(new Set())
    setConfirmText('')
    setPreviewLoading(true)
    try {
      const res = await previewSaleDeletion({ saleId: row.id })
      if (res.success) setPreview(res.data)
      else toast.error('error' in res ? res.error : 'Error al cargar el detalle')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar el detalle')
    } finally {
      setPreviewLoading(false)
    }
  }

  const toggleWithdrawal = (id: string) => {
    setSelectedWithdrawals((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const confirmDelete = async () => {
    if (!deleteRow) return
    setDeleting(true)
    try {
      const res = await deleteSaleCompletely({ saleId: deleteRow.id, withdrawalIds: [...selectedWithdrawals] })
      if (res.success) {
        toast.success(res.data?.message || 'Venta eliminada por completo')
        setDeleteRow(null)
        load()
      } else {
        toast.error('error' in res ? res.error : 'No se pudo eliminar la venta')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar la venta')
    } finally {
      setDeleting(false)
    }
  }

  const openEdit = async (row: DeleteRow) => {
    setEditRow(row)
    setEditLoading(true)
    setClientQuery('')
    setClientResults([])
    setEditClientId(null)
    setEditClientName('')
    setEditNotes('')
    try {
      const res = await getSaleForTicket(row.id)
      if (res.success && res.data) {
        const d = res.data as { sale: { client_id?: string | null; notes?: string | null }; clientName?: string | null }
        setEditClientId(d.sale.client_id ?? null)
        setEditClientName(d.clientName ?? '')
        setEditNotes(d.sale.notes ?? '')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar la venta')
    } finally {
      setEditLoading(false)
    }
  }

  const selectEditClient = (c: { id: string; full_name: string; client_code: string | null }) => {
    setEditClientId(c.id)
    setEditClientName(c.full_name + (c.client_code ? ` (${c.client_code})` : ''))
    setClientQuery('')
    setClientResults([])
  }

  const confirmEdit = async () => {
    if (!editRow) return
    setSavingEdit(true)
    try {
      const res = await updateSaleClientNotes({ saleId: editRow.id, clientId: editClientId, notes: editNotes.trim() || null })
      if (res.success) {
        toast.success('Venta actualizada')
        setEditRow(null)
        load()
      } else {
        toast.error('error' in res ? res.error : 'No se pudo actualizar la venta')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar la venta')
    } finally {
      setSavingEdit(false)
    }
  }

  const openPayments = async (row: DeleteRow) => {
    setPayRow(row)
    setPayLoading(true)
    setPayList([])
    setPayTotal(0)
    try {
      const res = await getSaleForTicket(row.id)
      if (res.success && res.data) {
        const d = res.data as { sale: { total: number }; payments: { payment_method: string; amount: number }[] }
        const pays = d.payments ?? []
        // El objetivo es el importe COBRADO (suma de pagos actuales), no el total
        // de la venta: una venta parcial corrige el método sin cambiar lo cobrado.
        setPayTotal(Math.round(pays.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100)
        setPayList(pays.map((p) => ({ payment_method: p.payment_method, amount: String(p.amount) })))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar la venta')
    } finally {
      setPayLoading(false)
    }
  }

  const paySum = payList.reduce((s, p) => s + (parseFloat(String(p.amount).replace(',', '.')) || 0), 0)
  const payDiff = Math.round((payTotal - paySum) * 100) / 100
  const payBalanced = Math.abs(payDiff) < 0.01

  const confirmPayments = async () => {
    if (!payRow || !payBalanced) return
    setSavingPay(true)
    try {
      const res = await updateSalePayments({
        saleId: payRow.id,
        payments: payList.map((p) => ({ payment_method: p.payment_method, amount: parseFloat(String(p.amount).replace(',', '.')) || 0 })),
      })
      if (res.success) {
        toast.success(res.data?.message || 'Pagos actualizados')
        setPayRow(null)
        load()
      } else {
        toast.error('error' in res ? res.error : 'No se pudieron actualizar los pagos')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al actualizar los pagos')
    } finally {
      setSavingPay(false)
    }
  }

  // ── Editar líneas (E3) ──
  const mapLinesForRpc = (lines: SaleEditLine[]) => lines.map((l) => ({
    product_variant_id: l.product_variant_id,
    description: l.description,
    sku: l.sku,
    quantity: parseInt(l.quantity) || 0,
    unit_price: parseFloat(String(l.unit_price).replace(',', '.')) || 0,
    discount_percentage: parseFloat(String(l.discount_percentage).replace(',', '.')) || 0,
    tax_rate: l.tax_rate,
  }))

  const openLines = async (row: DeleteRow) => {
    setLinesRow(row)
    setLinesLoading(true)
    setLinesConfirmText('')
    setLinesPreview(null)
    setProdQuery('')
    setProdResults([])
    setEditLines([])
    setLineDiscount('0')
    setSalePaid(0)
    setSaleStoreId(null)
    try {
      const res = await getSaleForTicket(row.id)
      if (res.success && res.data) {
        const d = res.data as {
          sale: { store_id?: string | null; discount_percentage?: number }
          lines: { product_variant_id?: string | null; description: string; sku?: string | null; quantity: number; unit_price: number; discount_percentage?: number; tax_rate?: number }[]
          payments: { amount: number }[]
        }
        setSaleStoreId(d.sale.store_id ?? null)
        setSalePaid(Math.round((d.payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100)
        setLineDiscount(String(d.sale.discount_percentage ?? 0))
        const mapped: SaleEditLine[] = (d.lines ?? []).map((l) => ({
          product_variant_id: l.product_variant_id ?? null,
          description: l.description,
          sku: l.sku ?? null,
          quantity: String(l.quantity),
          unit_price: String(l.unit_price),
          discount_percentage: String(l.discount_percentage ?? 0),
          tax_rate: Number(l.tax_rate ?? 21),
        }))
        setEditLines(mapped)
        const pv = await previewSaleEdit({ saleId: row.id, lines: mapLinesForRpc(mapped), discount: { discount_percentage: Number(d.sale.discount_percentage ?? 0) } })
        if (pv.success) setLinesPreview(pv.data)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar la venta')
    } finally {
      setLinesLoading(false)
    }
  }

  const addProductLine = (p: { id: string; description: string; sku: string | null; unit_price: number; tax_rate: number }) => {
    setEditLines((prev) => [...prev, {
      product_variant_id: p.id, description: p.description, sku: p.sku,
      quantity: '1', unit_price: String(p.unit_price), discount_percentage: '0', tax_rate: p.tax_rate,
    }])
    setProdQuery('')
    setProdResults([])
  }

  const linesPvp = editLines.reduce((s, l) =>
    s + (parseFloat(String(l.unit_price).replace(',', '.')) || 0) * (parseInt(l.quantity) || 0)
      * (1 - (parseFloat(String(l.discount_percentage).replace(',', '.')) || 0) / 100), 0)
  const linesGlobalDisc = parseFloat(String(lineDiscount).replace(',', '.')) || 0
  const linesNewTotal = Math.round(linesPvp * (1 - linesGlobalDisc / 100) * 100) / 100
  const linesSaldoDiff = Math.round((linesNewTotal - salePaid) * 100) / 100
  const linesValid = editLines.length > 0 && editLines.every((l) => (parseInt(l.quantity) || 0) > 0 && (parseFloat(String(l.unit_price).replace(',', '.')) || 0) >= 0)

  const confirmLines = async () => {
    if (!linesRow) return
    setSavingLines(true)
    try {
      const res = await editSaleLines({
        saleId: linesRow.id,
        lines: mapLinesForRpc(editLines),
        discount: { discount_percentage: linesGlobalDisc },
      })
      if (res.success) {
        toast.success(res.data?.message || 'Venta actualizada')
        setLinesRow(null)
        load()
      } else {
        toast.error('error' in res ? res.error : 'No se pudo editar la venta')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al editar la venta')
    } finally {
      setSavingLines(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-7 w-7" />
            Tickets
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Listado de tickets de venta. Descarga el PDF desde aquí o desde la ficha del cliente.</p>
        </div>
        <Link href="/admin/tickets/vales">
          <Button variant="outline" size="sm" className="gap-1">
            <Gift className="h-4 w-4" />
            Vales
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Cliente</label>
            <Input
              placeholder="Nombre o código..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="w-48"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Desde</label>
            <DatePickerPopover
              containerClassName="w-40"
              value={dateFrom}
              onChange={(date) => setDateFrom(date)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Hasta</label>
            <DatePickerPopover
              containerClassName="w-40"
              value={dateTo}
              onChange={(date) => setDateTo(date)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Producto</label>
            <Input
              placeholder="Texto en descripción..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-48"
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => { setPage(1); load() }}>Buscar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p>No hay tickets con los filtros indicados.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Ticket</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Productos (resumen)</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Tienda</TableHead>
                    <TableHead className="w-[280px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => {
                    const statusBadge = STATUS_BADGE[row.status] ?? null
                    const isDimmed = row.status === 'fully_returned' || row.status === 'voided'
                    return (
                    <TableRow key={row.id} className={cn(isDimmed && 'opacity-60')}>
                      <TableCell className="font-mono">{row.ticket_number}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                      <TableCell>
                        {row.client_name ? (
                          <span>{row.client_name}{row.client_code ? ` (${row.client_code})` : ''}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm" title={row.products_summary}>
                        {row.products_summary}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.total_returned > 0 ? (
                          <div className="flex items-baseline gap-2">
                            <span className="line-through text-muted-foreground text-xs">{formatCurrency(row.total)}</span>
                            {row.status !== 'fully_returned' && (
                              <span className="text-sm font-bold">{formatCurrency(Number(row.total) - Number(row.total_returned))}</span>
                            )}
                          </div>
                        ) : (
                          formatCurrency(row.total)
                        )}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{PAYMENT_LABELS[row.payment_method] ?? row.payment_method}</TableCell>
                      <TableCell>
                        {statusBadge ? (
                          <Badge variant="outline" className={cn('text-xs font-medium', statusBadge.className)}>
                            {statusBadge.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{row.salesperson_name ?? '—'}</TableCell>
                      <TableCell className="text-sm">{row.store_name ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={downloadingId === row.id}
                            onClick={() => handleDownloadPdf(row.id)}
                          >
                            {downloadingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                            Descargar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={invoiceLoadingId === row.id}
                            onClick={() => setInvoiceConfirmRow(row)}
                          >
                            {invoiceLoadingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                            Factura
                          </Button>
                          {can('sales.edit') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="h-3 w-3" />
                              Editar
                            </Button>
                          )}
                          {can('sales.edit') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => openPayments(row)}
                            >
                              <CreditCard className="h-3 w-3" />
                              Pagos
                            </Button>
                          )}
                          {can('sales.edit') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => openLines(row)}
                            >
                              <Package className="h-3 w-3" />
                              Líneas
                            </Button>
                          )}
                          {can('sales.delete') && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                              onClick={() => openDelete(row)}
                            >
                              <Trash2 className="h-3 w-3" />
                              Eliminar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    {total} ticket{total !== 1 ? 's' : ''} · Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(invoiceConfirmRow)} onOpenChange={(v) => { if (!v) setInvoiceConfirmRow(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Generar factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Se creará una factura en borrador para el ticket{' '}
              <span className="font-mono font-semibold">{invoiceConfirmRow?.ticket_number ?? ''}</span>
              {' '}del cliente{' '}
              <span className="font-semibold">{invoiceConfirmRow?.client_name || 'Sin cliente'}</span>.
              {' '}Total:{' '}
              <span className="font-semibold">{formatCurrency(Number(invoiceConfirmRow?.total) || 0)}</span>.
              {' '}Podrás editarla antes de emitirla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={invoiceLoadingId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={invoiceLoadingId !== null}
              onClick={(e) => {
                e.preventDefault()
                if (invoiceConfirmRow?.id) handleFacturaDraft(invoiceConfirmRow.id)
              }}
            >
              {invoiceLoadingId !== null ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear factura
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(deleteRow)} onOpenChange={(v) => { if (!v && !deleting) setDeleteRow(null) }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Eliminar ticket {deleteRow?.ticket_number}
            </DialogTitle>
            <DialogDescription>
              Borrado físico total e irreversible: venta, líneas, pagos, stock, caja y contabilidad. Revisa el detalle antes de confirmar.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : preview ? (
            <div className="space-y-4 text-sm">
              {/* Bloqueos */}
              {Array.isArray(preview.blockers) && preview.blockers.length > 0 && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 space-y-1">
                  <p className="font-semibold text-red-800 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> No se puede eliminar:</p>
                  <ul className="list-disc pl-5 text-red-700">
                    {preview.blockers.map((b: string, i: number) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              )}

              {/* Avisos */}
              {Array.isArray(preview.warnings) && preview.warnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-1">
                  {preview.warnings.map((w: string, i: number) => (
                    <p key={i} className="text-amber-800 flex items-start gap-1.5"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {w}</p>
                  ))}
                </div>
              )}

              {/* Acciones automáticas (informativo) */}
              {Array.isArray(preview.auto_actions) && preview.auto_actions.length > 0 && (
                <div className="rounded-md border border-blue-300 bg-blue-50 p-3 space-y-1">
                  <p className="font-medium text-blue-800">Al eliminar también:</p>
                  <ul className="list-disc pl-5 text-blue-700">
                    {preview.auto_actions.map((a: string, i: number) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}

              {/* Resumen de lo que se borrará */}
              <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Total venta</span><span className="font-semibold">{formatCurrency(Number(preview.sale?.total) || 0)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Líneas</span><span>{(preview.lines ?? []).length}</span></div>
                {Array.isArray(preview.stock_to_return) && preview.stock_to_return.length > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Devolver al stock</span><span>{preview.stock_to_return.reduce((s, x) => s + Number(x.quantity || 0), 0)} ud.</span></div>
                )}
                {Array.isArray(preview.journal_entries_to_delete) && preview.journal_entries_to_delete.length > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Asientos contables</span><span>{preview.journal_entries_to_delete.length}</span></div>
                )}
                {preview.invoice && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Factura</span><span className="font-mono">{preview.invoice.invoice_number}</span></div>
                )}
              </div>

              {/* Ajuste de caja */}
              {(preview.cash_adjustment?.adjustments?.length ?? 0) > 0 && (
                <div className="rounded-md border p-3 space-y-1">
                  <p className="font-medium">Ajuste de caja {preview.cash_adjustment?.session_status === 'closed' ? '(sesión cerrada)' : ''}</p>
                  {preview.cash_adjustment!.adjustments!.map((a, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{CASH_FIELD_LABELS[a.total_field] ?? a.total_field}</span>
                      <span className="tabular-nums">{formatCurrency(Number(a.current_value) || 0)} → {formatCurrency((Number(a.current_value) || 0) + (Number(a.delta) || 0))}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Checklist de retiradas de la sesión */}
              {Array.isArray(preview.withdrawals_in_session) && preview.withdrawals_in_session.length > 0 && (
                <div className="rounded-md border p-3 space-y-2">
                  <p className="font-medium">Retiradas de esta sesión de caja</p>
                  <p className="text-xs text-muted-foreground -mt-1">Marca las que quieras borrar también (por defecto ninguna).</p>
                  {preview.withdrawals_in_session.map((w) => (
                    <label key={w.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={selectedWithdrawals.has(w.id)} onCheckedChange={() => toggleWithdrawal(w.id)} />
                      <span className="flex-1 text-xs">
                        <span className="font-semibold">{formatCurrency(Number(w.amount) || 0)}</span>
                        {' · '}{w.reason || 'Sin motivo'}
                        {' · '}<span className="text-muted-foreground">{formatDateTime(w.withdrawn_at)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Confirmación anti-clic: escribir el número de ticket */}
              {preview.can_delete && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">
                    Para confirmar, escribe el número de ticket <span className="font-mono font-semibold">{deleteRow?.ticket_number}</span>:
                  </label>
                  <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={deleteRow?.ticket_number} />
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRow(null)} disabled={deleting}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleting || !preview?.can_delete || confirmText !== deleteRow?.ticket_number}
              onClick={confirmDelete}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editRow)} onOpenChange={(v) => { if (!v && !savingEdit) setEditRow(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Editar ticket {editRow?.ticket_number}
            </DialogTitle>
            <DialogDescription>
              Corrige el cliente o las notas de la venta. No afecta a productos, importes ni caja.
            </DialogDescription>
          </DialogHeader>

          {editLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cliente */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Cliente</label>
                <div className="flex items-center gap-2 text-sm rounded-md border bg-muted/30 px-3 py-2">
                  <span className="flex-1 truncate">{editClientName || <span className="text-muted-foreground">Sin cliente (consumidor final)</span>}</span>
                  {editClientId && (
                    <Button
                      type="button" variant="ghost" size="icon" className="h-6 w-6 text-red-600 hover:text-red-700"
                      title="Quitar cliente"
                      onClick={() => { setEditClientId(null); setEditClientName('') }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <Input
                  placeholder="Buscar otro cliente (nombre o código)…"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
                {clientSearching && <p className="text-xs text-muted-foreground">Buscando…</p>}
                {clientResults.length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
                    {clientResults.map((c) => (
                      <button
                        key={c.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50"
                        onClick={() => selectEditClient(c)}
                      >
                        {c.full_name}{c.client_code ? ` (${c.client_code})` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Notas */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Notas</label>
                <Textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notas de la venta…" />
              </div>

              <p className="text-xs text-muted-foreground">
                Si la venta tiene factura, se actualizarán también sus datos de cliente. Una factura enviada a Hacienda no permite cambiar el cliente.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)} disabled={savingEdit}>Cancelar</Button>
            <Button onClick={confirmEdit} disabled={savingEdit || editLoading}>
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(payRow)} onOpenChange={(v) => { if (!v && !savingPay) setPayRow(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Editar pagos · {payRow?.ticket_number}
            </DialogTitle>
            <DialogDescription>
              Corrige cómo se cobró (efectivo, tarjeta, bizum, transferencia). No cambia el total ni el stock; solo ajusta la caja.
            </DialogDescription>
          </DialogHeader>

          {payLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {payList.map((p, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    {idx === 0 && <label className="text-xs text-muted-foreground">Método</label>}
                    <Select
                      value={p.payment_method}
                      onValueChange={(v) => setPayList((prev) => prev.map((x, i) => i === idx ? { ...x, payment_method: v } : x))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="card">Tarjeta</SelectItem>
                        <SelectItem value="bizum">Bizum</SelectItem>
                        <SelectItem value="transfer">Transferencia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28">
                    {idx === 0 && <label className="text-xs text-muted-foreground">Importe (€)</label>}
                    <Input
                      type="number" step="0.01" value={p.amount}
                      onChange={(e) => setPayList((prev) => prev.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))}
                    />
                  </div>
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-9 w-9 text-red-600 hover:text-red-700 disabled:opacity-30"
                    disabled={payList.length <= 1}
                    onClick={() => setPayList((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <Button
                type="button" variant="outline" size="sm" className="gap-1"
                onClick={() => setPayList((prev) => [...prev, { payment_method: 'card', amount: '' }])}
              >
                <Plus className="h-3 w-3" /> Añadir pago
              </Button>

              <div className={cn('rounded-md border px-3 py-2 text-sm flex justify-between',
                payBalanced ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-rose-300 bg-rose-50 text-rose-800')}>
                <span>Suma: {formatCurrency(paySum)} · Cobrado: {formatCurrency(payTotal)}</span>
                <span className="font-semibold">
                  {payBalanced ? 'Cuadra' : (payDiff > 0 ? `Faltan ${formatCurrency(payDiff)}` : `Sobran ${formatCurrency(Math.abs(payDiff))}`)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRow(null)} disabled={savingPay}>Cancelar</Button>
            <Button onClick={confirmPayments} disabled={savingPay || payLoading || !payBalanced}>
              {savingPay && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar pagos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linesRow)} onOpenChange={(v) => { if (!v && !savingLines) setLinesRow(null) }}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Editar líneas · {linesRow?.ticket_number}
            </DialogTitle>
            <DialogDescription>
              Corrige productos, cantidades, precios y descuento. Reajusta stock y contabilidad; los pagos no se tocan.
            </DialogDescription>
          </DialogHeader>

          {linesLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
          ) : (linesPreview?.blockers && linesPreview.blockers.length > 0) ? (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 space-y-1">
              <p className="font-semibold text-red-800 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> No se puede editar:</p>
              <ul className="list-disc pl-5 text-red-700">
                {linesPreview.blockers.map((b: string, i: number) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              {/* Líneas */}
              <div className="space-y-2">
                {editLines.map((l, idx) => {
                  const lt = (parseFloat(String(l.unit_price).replace(',', '.')) || 0) * (parseInt(l.quantity) || 0) * (1 - (parseFloat(String(l.discount_percentage).replace(',', '.')) || 0) / 100)
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        {idx === 0 && <label className="text-xs text-muted-foreground">Descripción</label>}
                        <Input value={l.description} onChange={(e) => setEditLines((prev) => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="text-xs text-muted-foreground">Cant.</label>}
                        <Input type="number" min="1" value={l.quantity} onChange={(e) => setEditLines((prev) => prev.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <label className="text-xs text-muted-foreground">Precio</label>}
                        <Input type="number" step="0.01" value={l.unit_price} onChange={(e) => setEditLines((prev) => prev.map((x, i) => i === idx ? { ...x, unit_price: e.target.value } : x))} />
                      </div>
                      <div className="col-span-2 text-right text-xs tabular-nums pb-2">{formatCurrency(Math.round(lt * 100) / 100)}</div>
                      <div className="col-span-1 flex justify-end">
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-600 hover:text-red-700 disabled:opacity-30"
                          disabled={editLines.length <= 1}
                          onClick={() => setEditLines((prev) => prev.filter((_, i) => i !== idx))}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Añadir producto / línea libre */}
              <div className="space-y-1.5">
                <Input placeholder="Buscar producto para añadir (nombre o SKU)…" value={prodQuery} onChange={(e) => setProdQuery(e.target.value)} />
                {prodSearching && <p className="text-xs text-muted-foreground">Buscando…</p>}
                {prodResults.length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
                    {prodResults.map((p) => (
                      <button key={p.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between"
                        onClick={() => addProductLine(p)}>
                        <span>{p.description}{p.sku ? ` · ${p.sku}` : ''}</span>
                        <span className="tabular-nums text-muted-foreground">{formatCurrency(p.unit_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" className="gap-1"
                  onClick={() => setEditLines((prev) => [...prev, { product_variant_id: null, description: '', sku: null, quantity: '1', unit_price: '0', discount_percentage: '0', tax_rate: 21 }])}>
                  <Plus className="h-3 w-3" /> Añadir línea libre
                </Button>
              </div>

              {/* Descuento global + resumen */}
              <div className="flex items-end gap-3">
                <div className="w-32">
                  <label className="text-xs text-muted-foreground">Descuento global %</label>
                  <Input type="number" step="0.01" value={lineDiscount} onChange={(e) => setLineDiscount(e.target.value)} />
                </div>
                <div className="flex-1 text-right">
                  <div className="text-sm">Total nuevo: <span className="font-bold">{formatCurrency(linesNewTotal)}</span></div>
                  <div className="text-xs text-muted-foreground">Cobrado: {formatCurrency(salePaid)}</div>
                </div>
              </div>

              {/* Avisos del preview (saldo, caja cerrada) */}
              {!linesValid && <p className="text-xs text-rose-700">Cada línea necesita cantidad ≥ 1 y precio válido.</p>}
              {Math.abs(linesSaldoDiff) >= 0.01 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  {linesSaldoDiff > 0
                    ? `Quedará un saldo pendiente de ${formatCurrency(linesSaldoDiff)} (cobrado < total). Ajusta los pagos si el cliente abona la diferencia.`
                    : `Quedará un saldo a favor del cliente de ${formatCurrency(Math.abs(linesSaldoDiff))} (cobrado > total).`}
                </div>
              )}
              {Array.isArray(linesPreview?.warnings) && linesPreview.warnings.length > 0 && linesPreview.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {w}</p>
              ))}
              {Array.isArray(linesPreview?.auto_actions) && linesPreview.auto_actions.length > 0 && (
                <div className="rounded-md border border-blue-300 bg-blue-50 p-2 text-xs text-blue-700">
                  {linesPreview.auto_actions.map((a, i) => <p key={i}>• {a}</p>)}
                </div>
              )}

              {/* Anti-clic */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Para confirmar, escribe el número de ticket <span className="font-mono font-semibold">{linesRow?.ticket_number}</span>:
                </label>
                <Input value={linesConfirmText} onChange={(e) => setLinesConfirmText(e.target.value)} placeholder={linesRow?.ticket_number} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinesRow(null)} disabled={savingLines}>Cancelar</Button>
            <Button onClick={confirmLines}
              disabled={savingLines || linesLoading || !linesPreview?.can_edit || !linesValid || linesConfirmText !== linesRow?.ticket_number}>
              {savingLines && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar líneas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
