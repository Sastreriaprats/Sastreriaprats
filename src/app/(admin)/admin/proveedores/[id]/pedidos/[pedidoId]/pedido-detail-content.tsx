'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2, Truck, FileText, Trash2, AlertTriangle, Check, Pencil, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  updateSupplierOrderStatusAction,
  getSupplierOrderLines,
  receiveSupplierOrderLines,
  updateSupplierOrderLinesAction,
  searchSupplierProducts,
  searchSupplierFabrics,
  markSupplierInvoicePaid,
  deleteSupplierOrderAction,
  updateSupplierOrderFinanceAction,
  listActiveWarehouses,
  type SupplierOrderLineForReceipt,
  type ReceiveSupplierOrderLineInput,
  type EditSupplierOrderLineInput,
} from '@/actions/suppliers'
import { getProductVariantsById } from '@/actions/products'

type WarehouseOption = {
  id: string
  name: string
  code: string | null
  store_id: string | null
  store_name: string | null
  is_main: boolean
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  confirmed: 'Confirmado',
  partially_received: 'Recibido parcial',
  received: 'Recibido',
  incident: 'Incidencia',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-orange-100 text-orange-700',
  received: 'bg-green-100 text-green-700',
  incident: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-700',
}

type LineType = {
  id: string
  description: string
  reference: string | null
  quantity: number
  quantity_received: number
  unit: string | null
  unit_price: number | null
  total_price: number | null
  fabric_id: string | null
  product_id: string | null
  product_variant_id?: string | null
  product_variants?: {
    id: string
    size: string | null
    color: string | null
    variant_sku: string | null
  } | null
  is_fully_received: boolean
}

type VariantOption = { id: string; size: string | null; color: string | null }

type EditLineState = {
  key: string
  id: string | null
  type: 'fabric' | 'product' | 'custom'
  fabric_id: string | null
  product_id: string | null
  product_variant_id: string | null
  description: string
  reference: string
  quantity: string
  unit: string
  unit_price: string
  quantity_received: string
  prevReceived: number
}

type DeliveryNoteType = {
  id: string
  supplier_reference: string | null
  delivery_date: string | null
  status: string | null
  attachment_url: string | null
  notes: string | null
  created_at: string
}

export function PedidoDetailContent({
  order,
  supplier,
}: {
  order: any
  supplier: { id: string; name: string }
}) {
  const router = useRouter()
  const [currentStatus, setCurrentStatus] = useState<string>(order.status)
  const [currentInvoice, setCurrentInvoice] = useState<any>(order.ap_invoice)
  const [loading, setLoading] = useState<string | null>(null)

  // Reception dialog
  const [receptionOpen, setReceptionOpen] = useState(false)
  const [receptionLines, setReceptionLines] = useState<SupplierOrderLineForReceipt[]>([])
  const [receptionLinesLoading, setReceptionLinesLoading] = useState(false)
  const [receptionSubmitting, setReceptionSubmitting] = useState(false)
  const [receptionLineState, setReceptionLineState] = useState<
    Record<string, { selected: boolean; quantityReceived: string }>
  >({})
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [warehouseId, setWarehouseId] = useState<string>('')

  // Delete
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Incident dialog
  const [incidentLineId, setIncidentLineId] = useState<string | null>(null)
  const [incidentText, setIncidentText] = useState('')

  // Edición de líneas del pedido
  const [editOpen, setEditOpen] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editLines, setEditLines] = useState<EditLineState[]>([])
  const [deletedLineIds, setDeletedLineIds] = useState<string[]>([])
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, VariantOption[]>>({})
  const [addSearchType, setAddSearchType] = useState<'product' | 'fabric' | null>(null)
  const [addSearchQuery, setAddSearchQuery] = useState('')
  const [addSearchResults, setAddSearchResults] = useState<any[]>([])
  const [addSearching, setAddSearching] = useState(false)
  const addSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editKeyCounter = useRef(0)

  // Edición manual de la fecha de pago (payment_due_date).
  const [paymentDueDate, setPaymentDueDate] = useState<string | null>(order.payment_due_date ?? null)
  const [editingPaymentDate, setEditingPaymentDate] = useState(false)
  const [paymentDateDraft, setPaymentDateDraft] = useState('')
  const [savingPaymentDate, setSavingPaymentDate] = useState(false)

  // Normaliza una fecha (ISO o 'YYYY-MM-DD') al formato del <input type="date">.
  const toDateInput = (d: string | null | undefined): string => (d ? String(d).slice(0, 10) : '')

  async function savePaymentDate() {
    setSavingPaymentDate(true)
    const res = await updateSupplierOrderFinanceAction({
      supplierOrderId: order.id,
      total: Number(order.total) || 0,
      payment_due_date: paymentDateDraft || null,
      notes: order.internal_notes ?? null,
    })
    setSavingPaymentDate(false)
    if (res.success) {
      setPaymentDueDate(paymentDateDraft || null)
      setEditingPaymentDate(false)
      toast.success('Fecha de pago actualizada')
      router.refresh()
    } else {
      toast.error((res as { error?: string })?.error || 'Error al actualizar la fecha de pago')
    }
  }

  // Búsqueda (debounce) de productos/tejidos para añadir líneas en la edición.
  useEffect(() => {
    if (!addSearchType) return
    if (addSearchTimer.current) clearTimeout(addSearchTimer.current)
    addSearchTimer.current = setTimeout(async () => {
      setAddSearching(true)
      const res = addSearchType === 'product'
        ? await searchSupplierProducts({ supplierId: supplier.id, query: addSearchQuery })
        : await searchSupplierFabrics({ supplierId: supplier.id, query: addSearchQuery })
      setAddSearching(false)
      setAddSearchResults(res.success && res.data ? res.data : [])
    }, 250)
    return () => { if (addSearchTimer.current) clearTimeout(addSearchTimer.current) }
  }, [addSearchType, addSearchQuery, supplier.id])

  function makeKey() {
    return `edit-${editKeyCounter.current++}`
  }

  function openEditDialog() {
    const initial: EditLineState[] = (order.lines || []).map((l: LineType) => ({
      key: makeKey(),
      id: l.id,
      type: (l.fabric_id ? 'fabric' : l.product_id ? 'product' : 'custom') as EditLineState['type'],
      fabric_id: l.fabric_id,
      product_id: l.product_id,
      product_variant_id: l.product_variant_id ?? null,
      description: l.description || '',
      reference: l.reference || '',
      quantity: String(l.quantity ?? ''),
      unit: l.unit || (l.fabric_id ? 'metros' : 'unidades'),
      unit_price: l.unit_price != null ? String(l.unit_price) : '',
      quantity_received: String(l.quantity_received ?? 0),
      prevReceived: Number(l.quantity_received ?? 0),
    }))
    setEditLines(initial)
    setDeletedLineIds([])
    setAddSearchType(null)
    setAddSearchQuery('')
    setAddSearchResults([])
    setEditOpen(true)
    // Cargar variantes de cada producto presente para poder cambiar la talla.
    const productIds = Array.from(new Set(initial.filter((l) => l.product_id).map((l) => l.product_id as string)))
    productIds.forEach((pid) => { void loadVariants(pid) })
  }

  async function loadVariants(productId: string) {
    if (variantsByProduct[productId]) return variantsByProduct[productId]
    const res = await getProductVariantsById(productId)
    if (res.success && res.data) {
      setVariantsByProduct((prev) => ({ ...prev, [productId]: res.data }))
      return res.data
    }
    return []
  }

  function updateEditLine(key: string, upd: Partial<EditLineState>) {
    setEditLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...upd } : l)))
  }

  function removeEditLine(key: string) {
    setEditLines((prev) => {
      const target = prev.find((l) => l.key === key)
      if (target?.id) setDeletedLineIds((ids) => [...ids, target.id as string])
      return prev.filter((l) => l.key !== key)
    })
  }

  function addCustomLine() {
    setEditLines((prev) => [...prev, {
      key: makeKey(), id: null, type: 'custom',
      fabric_id: null, product_id: null, product_variant_id: null,
      description: '', reference: '', quantity: '1', unit: 'unidades', unit_price: '', quantity_received: '0', prevReceived: 0,
    }])
  }

  async function addProductLine(p: { id: string; name: string; sku: string; cost_price: number | null }) {
    const variants = await loadVariants(p.id)
    setEditLines((prev) => [...prev, {
      key: makeKey(), id: null, type: 'product',
      fabric_id: null, product_id: p.id,
      product_variant_id: variants.length === 1 ? variants[0].id : null,
      description: p.name, reference: p.sku || '', quantity: '1', unit: 'unidades',
      unit_price: p.cost_price != null ? String(p.cost_price) : '', quantity_received: '0', prevReceived: 0,
    }])
    setAddSearchType(null)
    setAddSearchQuery('')
    setAddSearchResults([])
  }

  function addFabricLine(f: { id: string; name: string; fabric_code: string | null; unit: string | null }) {
    setEditLines((prev) => [...prev, {
      key: makeKey(), id: null, type: 'fabric',
      fabric_id: f.id, product_id: null, product_variant_id: null,
      description: f.name, reference: f.fabric_code || '', quantity: '1', unit: f.unit || 'metros',
      unit_price: '', quantity_received: '0', prevReceived: 0,
    }])
    setAddSearchType(null)
    setAddSearchQuery('')
    setAddSearchResults([])
  }

  async function submitEdit() {
    // Validación de cliente: cantidad pedida > 0 y recibido >= 0.
    for (const l of editLines) {
      if (!l.description.trim()) { toast.error('Todas las líneas deben tener descripción'); return }
      const qty = Number(l.quantity)
      if (!Number.isFinite(qty) || qty <= 0) { toast.error(`Cantidad pedida no válida en "${l.description}"`); return }
      const recv = Number(l.quantity_received)
      if (!Number.isFinite(recv) || recv < 0) { toast.error(`Cantidad recibida no válida en "${l.description}"`); return }
      if (l.type === 'product' && recv > l.prevReceived && !l.product_variant_id) {
        toast.error(`Selecciona la talla de "${l.description}" antes de aumentar lo recibido`); return
      }
    }
    setEditSubmitting(true)
    const payload: EditSupplierOrderLineInput[] = editLines.map((l) => ({
      id: l.id,
      type: l.type,
      fabric_id: l.fabric_id,
      product_id: l.product_id,
      product_variant_id: l.product_variant_id,
      description: l.description.trim(),
      reference: l.reference.trim() || null,
      quantity: Number(l.quantity),
      unit: l.unit,
      unit_price: Number(l.unit_price) || 0,
      quantity_received: Number(l.quantity_received),
    }))
    const res = await updateSupplierOrderLinesAction({ orderId: order.id, lines: payload, deletedLineIds })
    setEditSubmitting(false)
    if (res.success && res.data) {
      setCurrentStatus(res.data.status)
      setEditOpen(false)
      const warnings = Number(res.data.stock_warnings || 0)
      if (warnings > 0) {
        toast.warning('Pedido actualizado. Algunas líneas no ajustaron stock (sin variante/tejido asociado).')
      } else {
        toast.success('Pedido actualizado correctamente.')
      }
      router.refresh()
    } else {
      toast.error((res as any)?.error || 'Error al actualizar el pedido')
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const res = await deleteSupplierOrderAction(order.id)
    setDeleting(false)
    if (res.success) {
      toast.success('Pedido eliminado')
      router.push(`/admin/proveedores/${supplier.id}`)
    } else {
      toast.error((res as any)?.error || 'Error al eliminar')
    }
  }

  async function openReceptionDialog() {
    setReceptionLines([])
    setReceptionLineState({})
    setReceptionOpen(true)
    setReceptionLinesLoading(true)
    const [linesRes, whRes] = await Promise.all([
      getSupplierOrderLines(order.id),
      listActiveWarehouses(),
    ])
    setReceptionLinesLoading(false)
    if (linesRes.success && linesRes.data) {
      setReceptionLines(linesRes.data)
      const init: Record<string, { selected: boolean; quantityReceived: string }> = {}
      for (const l of linesRes.data) {
        const remaining = Math.max(0, l.quantity - l.quantity_received)
        init[l.id] = { selected: remaining > 0, quantityReceived: remaining > 0 ? String(remaining) : '0' }
      }
      setReceptionLineState(init)
    }
    if (whRes.success && whRes.data) {
      const list = whRes.data as WarehouseOption[]
      setWarehouses(list)
      // Preselección: primero main, si no el primero
      const preferred = list.find(w => w.is_main) ?? list[0]
      setWarehouseId(prev => prev || preferred?.id || '')
    }
  }

  async function submitReception() {
    setReceptionSubmitting(true)
    const lines: ReceiveSupplierOrderLineInput[] = receptionLines
      .filter((l) => {
        const s = receptionLineState[l.id]
        return s?.selected && Number(s.quantityReceived) > 0
      })
      .map((l) => ({
        lineId: l.id,
        quantityReceived: Number(receptionLineState[l.id].quantityReceived),
        type: (l.fabric_id ? 'fabric' : 'product') as 'fabric' | 'product',
        referenceId: (l.fabric_id || l.product_id) ?? '',
      }))
      .filter((l) => l.referenceId)

    if (lines.length === 0) {
      toast.error('Selecciona al menos una línea con cantidad recibida')
      setReceptionSubmitting(false)
      return
    }

    if (!warehouseId) {
      toast.error('Selecciona el almacén donde entra la mercancía')
      setReceptionSubmitting(false)
      return
    }

    const res = await receiveSupplierOrderLines({ orderId: order.id, lines, warehouseId })
    setReceptionSubmitting(false)
    if (res.success && res.data) {
      const newStatus = res.data.status
      setCurrentStatus(newStatus)
      setReceptionOpen(false)
      const warnings = Number(res.data.stock_warnings || 0)
      if (warnings > 0) {
        toast.warning('Recepción registrada. Algunas líneas no actualizaron stock (sin variante asociada).')
      } else {
        toast.success('Recepción registrada correctamente.')
      }
      router.refresh()
    } else {
      toast.error((res as any)?.error || 'Error al registrar la recepción')
    }
  }

  async function changeStatus(newStatus: string) {
    setLoading(newStatus)
    const res = await updateSupplierOrderStatusAction({ supplierOrderId: order.id, status: newStatus as any })
    setLoading(null)
    if (res.success) {
      setCurrentStatus(newStatus)
      if (newStatus === 'received') {
        const warnings = Number((res as any)?.data?.stock_warnings || 0)
        const skipped = Boolean((res as any)?.data?.stock_update_skipped)
        if (skipped) {
          toast.success('Estado actualizado: Recibido (stock ya actualizado previamente)')
        } else if (warnings > 0) {
          toast.warning('Recibido. Algunas líneas no actualizaron stock (sin variante asociada).')
        } else {
          toast.success('Recibido. Stock actualizado correctamente.')
        }
      } else {
        toast.success(`Estado actualizado: ${STATUS_LABELS[newStatus] || newStatus}`)
      }
      router.refresh()
    } else {
      toast.error((res as any)?.error || 'Error al actualizar el estado')
    }
  }

  async function markAsPaid() {
    setLoading('paid')
    const res = await markSupplierInvoicePaid({ orderId: order.id })
    setLoading(null)
    if (res.success) {
      setCurrentInvoice((prev: any) => ({ ...prev, status: 'pagada', payment_date: new Date().toISOString().slice(0, 10) }))
      toast.success('Factura marcada como pagada')
      router.refresh()
    } else {
      toast.error((res as any)?.error || 'Error al marcar como pagado')
    }
  }

  const lines: LineType[] = order.lines || []
  const deliveryNotes: DeliveryNoteType[] = order.delivery_notes || []
  const total = lines.reduce((s: number, l: LineType) => s + (Number(l.total_price) || 0), 0)
  const isPaid = currentInvoice?.status === 'pagada'

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* CABECERA */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/admin/proveedores/${supplier.id}`}>
              <ArrowLeft className="h-4 w-4 mr-1" /> {supplier.name}
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{order.order_number}</h1>
              <Badge className={`text-sm ${STATUS_COLORS[currentStatus] || ''}`}>
                {STATUS_LABELS[currentStatus] || currentStatus}
              </Badge>
              {isPaid && (
                <Badge className="text-sm bg-green-100 text-green-700">Pagado</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {supplier.name} · {order.order_date ? formatDate(order.order_date) : formatDate(order.created_at)}
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={currentStatus}
            disabled={loading !== null}
            onValueChange={(val) => { if (val !== currentStatus) changeStatus(val) }}
          >
            <SelectTrigger className="w-48">
              {loading !== null
                ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Actualizando…</span>
                : <SelectValue />
              }
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(currentStatus === 'confirmed' || currentStatus === 'partially_received') && (
            <Button
              size="sm"
              disabled={loading !== null}
              onClick={openReceptionDialog}
            >
              <Truck className="h-4 w-4 mr-2" /> Registrar recepción
            </Button>
          )}

          {currentStatus !== 'cancelled' && (
            <Button
              size="sm"
              variant="outline"
              disabled={loading !== null}
              onClick={openEditDialog}
            >
              <Pencil className="h-4 w-4 mr-2" /> Editar pedido
            </Button>
          )}

          {(currentStatus === 'draft' || currentStatus === 'sent' || currentStatus === 'confirmed') && (
            <Button
              size="sm"
              variant="destructive"
              disabled={loading !== null}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          )}

          {currentStatus === 'received' && !isPaid && currentInvoice?.id && (
            <Button
              size="sm"
              disabled={loading !== null}
              onClick={markAsPaid}
            >
              {loading === 'paid' && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Marcar como pagado
            </Button>
          )}
        </div>
      </div>

      {/* INFORMACIÓN DEL PEDIDO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Información del pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Proveedor</span>
              <span className="font-medium">{supplier.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fecha</span>
              <span>{order.order_date ? formatDate(order.order_date) : formatDate(order.created_at)}</span>
            </div>
            {order.estimated_delivery_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entrega estimada</span>
                <span>{formatDate(order.estimated_delivery_date)}</span>
              </div>
            )}
            {order.actual_delivery_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entrega real</span>
                <span>{formatDate(order.actual_delivery_date)}</span>
              </div>
            )}
            {order.tailoring_order && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pedido sastrería</span>
                <span className="font-mono">{(order.tailoring_order as any).order_number}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pago y notas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {/* Plazos de pago (solo lectura) cuando hay más de uno. */}
            {Array.isArray(order.payment_schedule) && order.payment_schedule.length > 1 && (
              <div className="space-y-1">
                <span className="text-muted-foreground">Plazos de pago</span>
                <ul className="space-y-1">
                  {order.payment_schedule.map((p: any, idx: number) => (
                    <li key={p.id || idx} className="flex items-center justify-between text-sm">
                      <span>
                        <span className="text-xs text-muted-foreground mr-2">Plazo {idx + 1}</span>
                        {formatDate(p.due_date)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{Number(p.amount ?? 0).toFixed(2)} €</span>
                        <Badge variant={p.is_paid ? 'default' : 'destructive'} className="text-xs">
                          {p.is_paid ? 'Pagado' : 'Pendiente'}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Fecha de pago editable manualmente. */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Fecha pago</span>
              {editingPaymentDate ? (
                <span className="flex items-center gap-1">
                  <Input
                    type="date"
                    value={paymentDateDraft}
                    onChange={(e) => setPaymentDateDraft(e.target.value)}
                    className="h-7 w-[150px] text-sm"
                    disabled={savingPaymentDate}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={savePaymentDate} disabled={savingPaymentDate}>
                    {savingPaymentDate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingPaymentDate(false)} disabled={savingPaymentDate}>
                    <span className="text-sm">✕</span>
                  </Button>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span>{paymentDueDate ? formatDate(paymentDueDate) : '—'}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => { setPaymentDateDraft(toDateInput(paymentDueDate)); setEditingPaymentDate(true) }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado factura</span>
              <Badge
                variant={isPaid ? 'default' : 'destructive'}
                className="text-xs"
              >
                {isPaid ? 'Pagada' : 'No pagada'}
              </Badge>
            </div>
            {currentInvoice?.payment_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha de pago</span>
                <span>{formatDate(currentInvoice.payment_date)}</span>
              </div>
            )}
            {order.internal_notes && (
              <div className="pt-1">
                <p className="text-muted-foreground mb-1">Notas internas</p>
                <p className="text-sm">{order.internal_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* LÍNEAS DEL PEDIDO */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Líneas del pedido</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-b-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Talla</TableHead>
                  <TableHead>Ref.</TableHead>
                  <TableHead className="text-right">Pedido</TableHead>
                  <TableHead className="text-right">Recibido</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Sin líneas
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((line) => {
                    const variantSize = line.product_variants?.size?.trim() || null
                    const variantColor = line.product_variants?.color?.trim() || null
                    let talla: string | null = null
                    let descClean = line.description
                    if (variantSize || variantColor) {
                      talla = [variantSize, variantColor].filter(Boolean).join(' / ')
                      descClean = line.description.replace(/\s*(?:—|–|-)\s*.+$/, '').trim() || line.description
                    } else {
                      const tallaMatch = (line.description || '').match(/\s*(?:—|–|-)\s*(?:Talla\s+)?(\S+)\s*$/)
                      talla = tallaMatch ? tallaMatch[1] : null
                      descClean = talla ? line.description.replace(/\s*(?:—|–|-)\s*(?:Talla\s+)?\S+\s*$/, '').trim() : line.description
                    }

                    const isComplete = line.quantity_received >= line.quantity
                    const isPartial = line.quantity_received > 0 && !isComplete
                    const hasIncident = (line as any).has_incident

                    let statusBadge: React.ReactNode
                    if (hasIncident) {
                      statusBadge = <Badge className="bg-red-100 text-red-700 text-xs">Incidencia</Badge>
                    } else if (isComplete) {
                      statusBadge = <Badge className="bg-green-100 text-green-700 text-xs">Completo</Badge>
                    } else if (isPartial) {
                      statusBadge = <Badge className="bg-amber-100 text-amber-700 text-xs">Parcial</Badge>
                    } else {
                      statusBadge = <Badge className="bg-gray-100 text-gray-600 text-xs">Pendiente</Badge>
                    }

                    return (
                      <TableRow key={line.id} className={isComplete ? 'opacity-60' : ''}>
                        <TableCell className="max-w-[200px]"><span className="truncate block">{descClean || '-'}</span></TableCell>
                        <TableCell className="font-medium">{talla || '-'}</TableCell>
                        <TableCell className="font-mono text-xs">{line.reference || '-'}</TableCell>
                        <TableCell className="text-right">{line.quantity}</TableCell>
                        <TableCell className="text-right font-medium">
                          <span className={isComplete ? 'text-green-600' : isPartial ? 'text-amber-600' : ''}>{line.quantity_received}</span>
                        </TableCell>
                        <TableCell className="text-sm">{line.unit || '-'}</TableCell>
                        <TableCell className="text-right">{line.unit_price != null ? formatCurrency(line.unit_price) : '-'}</TableCell>
                        <TableCell className="text-right font-medium">{line.total_price != null ? formatCurrency(line.total_price) : '-'}</TableCell>
                        <TableCell>{statusBadge}</TableCell>
                      </TableRow>
                    )
                  })
                )}
                {lines.length > 0 && (
                  <TableRow className="border-t-2">
                    <TableCell colSpan={7} className="text-right font-medium">Total</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(order.total ?? total)}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN RECEPCIONES */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4" /> Recepciones registradas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-b-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referencia albarán</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Adjunto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveryNotes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Sin recepciones registradas
                    </TableCell>
                  </TableRow>
                ) : (
                  deliveryNotes.map((note) => (
                    <TableRow key={note.id}>
                      <TableCell className="font-mono text-xs">{note.supplier_reference || '-'}</TableCell>
                      <TableCell className="text-sm">
                        {note.delivery_date ? formatDate(note.delivery_date) : formatDate(note.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {note.status || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{note.notes || '-'}</TableCell>
                      <TableCell>
                        {note.attachment_url ? (
                          <Button variant="outline" size="sm" className="text-xs" asChild>
                            <a href={note.attachment_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-3 w-3 mr-1" /> Ver PDF
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* DIÁLOGO RECEPCIÓN */}
      <Dialog open={receptionOpen} onOpenChange={setReceptionOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" /> Registrar recepción
              <span className="font-mono text-muted-foreground font-normal text-sm">{order.order_number}</span>
            </DialogTitle>
          </DialogHeader>

          {receptionLinesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : receptionLines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">No hay líneas en este pedido.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reception-warehouse" className="text-sm font-medium">
                  Almacén de destino <span className="text-red-600">*</span>
                </Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger id="reception-warehouse">
                    <SelectValue placeholder="Selecciona el almacén donde entra la mercancía" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                        {w.store_name ? <span className="text-muted-foreground"> — {w.store_name}</span> : null}
                        {w.is_main ? <span className="text-muted-foreground"> (principal)</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  El stock recibido se sumará en este almacén. Cámbialo si la mercancía entra en otra tienda.
                </p>
              </div>
              <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Pedido</TableHead>
                    <TableHead className="text-right">Ya recibido</TableHead>
                    <TableHead className="text-right">Recibir ahora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receptionLines.map((line) => {
                    const state = receptionLineState[line.id] || { selected: false, quantityReceived: '0' }
                    const remaining = Math.max(0, line.quantity - line.quantity_received)
                    return (
                      <TableRow key={line.id} className={line.quantity_received >= line.quantity ? 'opacity-50' : ''}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={state.selected}
                            disabled={remaining <= 0}
                            onChange={(e) =>
                              setReceptionLineState((prev) => ({
                                ...prev,
                                [line.id]: { ...prev[line.id], selected: e.target.checked },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{line.description}</div>
                          {line.reference && (
                            <div className="text-xs text-muted-foreground font-mono">{line.reference}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {line.quantity} {line.unit || ''}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {line.quantity_received}
                        </TableCell>
                        <TableCell className="text-right">
                          <input
                            type="number"
                            min={0}
                            max={remaining}
                            step="any"
                            className="w-20 border rounded px-2 py-1 text-sm text-right"
                            value={state.quantityReceived}
                            disabled={!state.selected}
                            onChange={(e) =>
                              setReceptionLineState((prev) => ({
                                ...prev,
                                [line.id]: { ...prev[line.id], quantityReceived: e.target.value },
                              }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReceptionOpen(false)} disabled={receptionSubmitting}>
              Cancelar
            </Button>
            <Button onClick={submitReception} disabled={receptionSubmitting || receptionLinesLoading}>
              {receptionSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar recepción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO EDITAR PEDIDO */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!editSubmitting) setEditOpen(o) }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" /> Editar pedido
              <span className="font-mono text-muted-foreground font-normal text-sm">{order.order_number}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Cambiar la <strong>cantidad recibida</strong> ajusta el stock del almacén destino del pedido
              (suma o resta la diferencia). Si el pedido ya está facturado, revisa la factura/contabilidad a mano.
            </p>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Descripción</TableHead>
                  <TableHead>Ref.</TableHead>
                  <TableHead className="min-w-[120px]">Talla</TableHead>
                  <TableHead className="text-right w-20">Pedido</TableHead>
                  <TableHead className="w-24">Unidad</TableHead>
                  <TableHead className="text-right w-24">Precio</TableHead>
                  <TableHead className="text-right w-24">Recibido</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {editLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                      Sin líneas. Añade una abajo.
                    </TableCell>
                  </TableRow>
                ) : editLines.map((l) => {
                  const variants = l.product_id ? (variantsByProduct[l.product_id] || []) : []
                  return (
                    <TableRow key={l.key}>
                      <TableCell>
                        <Input
                          value={l.description}
                          onChange={(e) => updateEditLine(l.key, { description: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.reference}
                          onChange={(e) => updateEditLine(l.key, { reference: e.target.value })}
                          className="h-8 text-sm w-24 font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        {l.type === 'product' ? (
                          <Select
                            value={l.product_variant_id || ''}
                            onValueChange={(v) => updateEditLine(l.key, { product_variant_id: v })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Talla…" />
                            </SelectTrigger>
                            <SelectContent>
                              {variants.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  {[v.size, v.color].filter(Boolean).join(' / ') || v.id.slice(0, 6)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number" min={0} step="any"
                          value={l.quantity}
                          onChange={(e) => updateEditLine(l.key, { quantity: e.target.value })}
                          className="h-8 text-sm text-right w-16"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.unit}
                          onChange={(e) => updateEditLine(l.key, { unit: e.target.value })}
                          className="h-8 text-sm w-20"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number" min={0} step="any"
                          value={l.unit_price}
                          onChange={(e) => updateEditLine(l.key, { unit_price: e.target.value })}
                          className="h-8 text-sm text-right w-20"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number" min={0} step="any"
                          value={l.quantity_received}
                          onChange={(e) => updateEditLine(l.key, { quantity_received: e.target.value })}
                          className="h-8 text-sm text-right w-16"
                        />
                        {l.prevReceived > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">antes: {l.prevReceived}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => removeEditLine(l.key)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Añadir líneas */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Añadir línea:</span>
              <Button variant="outline" size="sm" onClick={() => { setAddSearchType('product'); setAddSearchQuery(''); setAddSearchResults([]) }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Producto
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setAddSearchType('fabric'); setAddSearchQuery(''); setAddSearchResults([]) }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Tejido
              </Button>
              <Button variant="outline" size="sm" onClick={addCustomLine}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Libre
              </Button>
              <div className="ml-auto text-sm">
                Total: <span className="font-bold">{formatCurrency(editLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0))}</span>
              </div>
            </div>

            {addSearchType && (
              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder={addSearchType === 'product' ? 'Buscar producto por nombre o SKU…' : 'Buscar tejido por nombre…'}
                    value={addSearchQuery}
                    onChange={(e) => setAddSearchQuery(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button variant="ghost" size="sm" onClick={() => setAddSearchType(null)}>Cerrar</Button>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y">
                  {addSearching ? (
                    <div className="py-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline-block text-muted-foreground" /></div>
                  ) : addSearchResults.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground text-center">Sin resultados</p>
                  ) : addSearchResults.map((r: any) => (
                    <button
                      key={r.id}
                      type="button"
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted/50 flex items-center justify-between"
                      onClick={() => addSearchType === 'product' ? addProductLine(r) : addFabricLine(r)}
                    >
                      <span>{r.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{addSearchType === 'product' ? r.sku : r.fabric_code}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSubmitting}>Cancelar</Button>
            <Button onClick={submitEdit} disabled={editSubmitting}>
              {editSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" /> Eliminar pedido
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Eliminar el pedido <span className="font-mono font-bold">{order.order_number}</span> y todas sus líneas?
            Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
