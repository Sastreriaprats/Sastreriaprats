'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Textarea } from '@/components/ui/textarea'
import { updateSupplierOrderStatusAction, createSupplierOrderAction, updateSupplierOrderFinanceAction } from '@/actions/suppliers'
import { searchTailoringOrdersByNumber } from '@/actions/orders'
import { createClient } from '@/lib/supabase/client'
import { searchSupplierFabrics, searchSupplierProducts } from '@/actions/suppliers'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createSupplierDeliveryNote, uploadSupplierDeliveryNoteAttachment, upsertSupplierDeliveryNoteForOrder } from '@/actions/delivery-notes'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft, User, Phone, Mail, MapPin, CreditCard, Truck,
  AlertTriangle, ShoppingBag, Plus, Loader2, FileText,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'

const orderStatusLabels: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviado', confirmed: 'Confirmado',
  partially_received: 'Parcial', received: 'Recibido', incident: 'Incidencia', cancelled: 'Cancelado',
}
const orderStatusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', sent: 'bg-blue-100 text-blue-700', confirmed: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-orange-100 text-orange-700', received: 'bg-green-100 text-green-700',
  incident: 'bg-red-100 text-red-700', cancelled: 'bg-red-100 text-red-700',
}
const fabricStatusLabels: Record<string, string> = { active: 'Disponible', seasonal: 'Temporada', out_of_stock: 'Agotado', discontinued: 'Descatalogado' }
const fabricStatusColors: Record<string, string> = { active: 'bg-green-100 text-green-700', seasonal: 'bg-blue-100 text-blue-700', out_of_stock: 'bg-red-100 text-red-700', discontinued: 'bg-gray-100 text-gray-700' }

export function SupplierDetailContent({ supplier }: { supplier: any }) {
  const router = useRouter()
  const { can } = usePermissions()
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [markingReceivedOrderId, setMarkingReceivedOrderId] = useState<string | null>(null)
  const [newDeliveryOpen, setNewDeliveryOpen] = useState(false)
  const [creatingDelivery, setCreatingDelivery] = useState(false)
  const [uploadingOrderPdfId, setUploadingOrderPdfId] = useState<string | null>(null)
  const [financeOpen, setFinanceOpen] = useState(false)
  const [savingFinance, setSavingFinance] = useState(false)
  const [financeOrderId, setFinanceOrderId] = useState<string>('')
  const [financeForm, setFinanceForm] = useState({ total: '', payment_due_date: '', notes: '' })
  const [uploadingDeliveryNoteId, setUploadingDeliveryNoteId] = useState<string | null>(null)
  const [deliveryOrderId, setDeliveryOrderId] = useState<string>('')
  const [deliveryFile, setDeliveryFile] = useState<File | null>(null)
  const [selectedDeliveryNoteId, setSelectedDeliveryNoteId] = useState<string | null>(null)
  const selectedDeliveryNoteIdRef = useRef<string | null>(null)
  const [uploadedNoteUrls, setUploadedNoteUrls] = useState<Record<string, string>>({})
  const uploadPdfInputRef = useRef<HTMLInputElement | null>(null)
  const orderUploadInputRef = useRef<HTMLInputElement | null>(null)
  const selectedOrderIdForUploadRef = useRef<string | null>(null)
  const [newDeliveryForm, setNewDeliveryForm] = useState({
    supplier_reference: '',
    delivery_date: '',
    notes: '',
  })
  const [newOrderForm, setNewOrderForm] = useState({
    payment_due_date: '',
    estimated_delivery_date: '',
    notes: '',
    tailoring_order_id: '',
  })
  const [orderLines, setOrderLines] = useState<Array<{
    tempId: string
    type: 'fabric' | 'product' | 'custom'
    fabric_id?: string
    product_id?: string
    description: string
    reference: string
    quantity: string
    unit: string
    unit_price: string
    newFabric?: { name: string; fabric_code: string; reference: string; unit: string }
  }>>([])
  const [tailoringSearchQuery, setTailoringSearchQuery] = useState('')
  const [tailoringSearchResults, setTailoringSearchResults] = useState<{ id: string; order_number: string; client_name: string }[]>([])
  const [tailoringSearchOpen, setTailoringSearchOpen] = useState(false)
  const [tailoringSearching, setTailoringSearching] = useState(false)
  const tailoringSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedTailoringLabel, setSelectedTailoringLabel] = useState('')
  const [fabricSearchForLine, setFabricSearchForLine] = useState<string | null>(null)
  const [fabricSearchQuery, setFabricSearchQuery] = useState('')
  const [fabricSearchResults, setFabricSearchResults] = useState<{ id: string; fabric_code: string | null; name: string }[]>([])
  const [productSearchForLine, setProductSearchForLine] = useState<string | null>(null)
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [productSearchResults, setProductSearchResults] = useState<{ id: string; sku: string; name: string }[]>([])
  const [newFabricForLine, setNewFabricForLine] = useState<string | null>(null)
  const [newFabricForm, setNewFabricForm] = useState({ name: '', fabric_code: '', reference: '', unit: 'meters' })
  const fabricSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const productSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!newOrderOpen) return
    const q = tailoringSearchQuery.trim()
    if (q.length < 2) {
      setTailoringSearchResults([])
      return
    }
    if (tailoringSearchRef.current) clearTimeout(tailoringSearchRef.current)
    tailoringSearchRef.current = setTimeout(() => {
      setTailoringSearching(true)
      searchTailoringOrdersByNumber({ query: q }).then((res) => {
        setTailoringSearching(false)
        if (res.success) setTailoringSearchResults(res.data)
        else setTailoringSearchResults([])
      })
    }, 300)
    return () => {
      if (tailoringSearchRef.current) clearTimeout(tailoringSearchRef.current)
    }
  }, [tailoringSearchQuery, newOrderOpen])

  useEffect(() => {
    if (!newOrderOpen || !fabricSearchForLine) return
    if (fabricSearchTimeoutRef.current) clearTimeout(fabricSearchTimeoutRef.current)
    fabricSearchTimeoutRef.current = setTimeout(() => {
      searchSupplierFabrics({ supplierId: supplier.id, query: fabricSearchQuery }).then((res) => {
        if (res.success) setFabricSearchResults(res.data)
        else setFabricSearchResults([])
      })
    }, 250)
    return () => { if (fabricSearchTimeoutRef.current) clearTimeout(fabricSearchTimeoutRef.current) }
  }, [newOrderOpen, fabricSearchForLine, fabricSearchQuery, supplier.id])

  useEffect(() => {
    console.log('[useEffect productos] triggered, query:', productSearchQuery)
    if (!newOrderOpen || !productSearchForLine) return
    if (productSearchTimeoutRef.current) clearTimeout(productSearchTimeoutRef.current)
    productSearchTimeoutRef.current = setTimeout(() => {
      console.log('[searchSupplierProducts] query:', productSearchQuery, 'supplierId:', supplier.id)
      searchSupplierProducts({ supplierId: supplier.id, query: productSearchQuery }).then((res) => {
        console.log('[searchSupplierProducts] result:', res)
        if (res.success) setProductSearchResults(res.data)
        else setProductSearchResults([])
      })
    }, 250)
    return () => { if (productSearchTimeoutRef.current) clearTimeout(productSearchTimeoutRef.current) }
  }, [newOrderOpen, productSearchForLine, productSearchQuery, supplier.id])

  const addOrderLine = () => {
    setOrderLines((prev) => [...prev, {
      tempId: `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'custom',
      description: '',
      reference: '',
      quantity: '1',
      unit: 'unidades',
      unit_price: '',
    }])
  }
  const updateOrderLine = (tempId: string, upd: Partial<typeof orderLines[0]>) => {
    setOrderLines((prev) => prev.map((l) => l.tempId === tempId ? { ...l, ...upd } : l))
  }
  const removeOrderLine = (tempId: string) => {
    setOrderLines((prev) => prev.filter((l) => l.tempId !== tempId))
    if (newFabricForLine === tempId) setNewFabricForLine(null)
    if (fabricSearchForLine === tempId) setFabricSearchForLine(null)
    if (productSearchForLine === tempId) setProductSearchForLine(null)
  }
  const computedOrderTotal = orderLines.reduce((sum, l) => {
    const q = parseFloat(String(l.quantity).replace(',', '.'))
    const p = parseFloat(String(l.unit_price).replace(',', '.'))
    if (Number.isFinite(q) && Number.isFinite(p)) return sum + q * p
    return sum
  }, 0)

  const contacts = supplier.supplier_contacts || []
  const fabrics = supplier.fabrics || []
  const orders = supplier.supplier_orders || []
  const supplierDeliveryNotes = (supplier.supplier_delivery_notes_all || orders
    .flatMap((order: any) => (order.supplier_delivery_notes || []).map((note: any) => ({
      ...note,
      order_id: order.id,
      order_number: order.order_number,
    }))))
    .sort((a: any, b: any) => new Date(b.created_at || b.delivery_date || 0).getTime() - new Date(a.created_at || a.delivery_date || 0).getTime())
  const dueDates = supplier.supplier_due_dates || []

  const pendingDueDates = dueDates.filter((d: any) => !d.is_paid)
  const totalPendingDebt = pendingDueDates.reduce((sum: number, d: any) => sum + d.amount, 0)
  const overdueDates = pendingDueDates.filter((d: any) => new Date(d.due_date) < new Date())

  const requestUploadForDeliveryNote = (deliveryNoteId: string) => {
    selectedDeliveryNoteIdRef.current = deliveryNoteId
    setSelectedDeliveryNoteId(deliveryNoteId)
    uploadPdfInputRef.current?.click()
  }

  const handleUploadDeliveryNotePdf = async (file: File) => {
    const targetId = selectedDeliveryNoteIdRef.current || selectedDeliveryNoteId
    if (!targetId) {
      toast.error('No se pudo identificar el albarán para subir el PDF')
      return
    }
    setUploadingDeliveryNoteId(targetId)
    const fd = new FormData()
    fd.append('id', targetId)
    fd.append('file', file)
    console.log('[upload-albaran] id del albarán:', targetId)
    console.log('[upload-albaran] archivo:', file?.name, file?.size, file?.type)
    const uploaded = await uploadSupplierDeliveryNoteAttachment(fd)
    setUploadingDeliveryNoteId(null)
    selectedDeliveryNoteIdRef.current = null
    setSelectedDeliveryNoteId(null)
    if (!uploaded.success) {
      toast.error(uploaded.error || 'No se pudo subir el PDF')
      return
    }
    if (uploaded.data?.url) {
      setUploadedNoteUrls((prev) => ({ ...prev, [targetId]: uploaded.data.url }))
    }
    toast.success('PDF subido correctamente')
    router.refresh()
  }

  const requestUploadFromOrder = (orderId: string) => {
    selectedOrderIdForUploadRef.current = orderId
    orderUploadInputRef.current?.click()
  }

  const handleUploadOrderPdf = async (file: File) => {
    const orderId = selectedOrderIdForUploadRef.current
    selectedOrderIdForUploadRef.current = null
    if (!orderId) {
      toast.error('No se pudo identificar el pedido')
      return
    }
    setUploadingOrderPdfId(orderId)
    const upsert = await upsertSupplierDeliveryNoteForOrder({
      supplier_id: supplier.id,
      supplier_order_id: orderId,
      delivery_date: new Date().toISOString().slice(0, 10),
    })
    if (!upsert.success || !upsert.data?.id) {
      setUploadingOrderPdfId(null)
      toast.error(upsert.success ? 'No se pudo preparar el albarán' : upsert.error)
      return
    }
    const targetNoteId = upsert.data.id
    const fd = new FormData()
    fd.append('id', targetNoteId)
    fd.append('file', file)
    console.log('[upload-albaran] id del albarán:', targetNoteId)
    console.log('[upload-albaran] archivo:', file?.name, file?.size, file?.type)
    const uploaded = await uploadSupplierDeliveryNoteAttachment(fd)
    setUploadingOrderPdfId(null)
    if (!uploaded.success) {
      toast.error(uploaded.error || 'No se pudo subir el PDF')
      return
    }
    if (uploaded.data?.url) {
      setUploadedNoteUrls((prev) => ({ ...prev, [targetNoteId]: uploaded.data.url }))
    }
    toast.success('Albarán PDF subido correctamente')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{supplier.name}</h1>
            <Badge variant="outline" className="font-mono">{supplier.supplier_code}</Badge>
            {overdueDates.length > 0 && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {overdueDates.length} vencidos</Badge>}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            {supplier.nif_cif && <span>{supplier.nif_cif}</span>}
            {supplier.contact_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{supplier.contact_email}</span>}
            {supplier.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{supplier.city}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Total pagado</p><p className="text-xl font-bold">{formatCurrency(supplier.total_paid || 0)}</p></CardContent></Card>
        <Card className={totalPendingDebt > 0 ? 'ring-1 ring-red-300' : ''}>
          <CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Deuda pendiente</p><p className={`text-xl font-bold ${totalPendingDebt > 0 ? 'text-red-600' : ''}`}>{formatCurrency(totalPendingDebt)}</p></CardContent>
        </Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Tejidos</p><p className="text-xl font-bold">{fabrics.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Pedidos</p><p className="text-xl font-bold">{orders.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Cond. pago</p><p className="text-lg font-bold">{supplier.payment_days || 30} días</p></CardContent></Card>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info" className="gap-1"><User className="h-4 w-4" /> Info</TabsTrigger>
          <TabsTrigger value="fabrics" className="gap-1"><ShoppingBag className="h-4 w-4" /> Tejidos ({fabrics.length})</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1"><Truck className="h-4 w-4" /> Pedidos ({orders.length})</TabsTrigger>
          <TabsTrigger value="delivery-notes" className="gap-1"><FileText className="h-4 w-4" /> Albaranes ({supplierDeliveryNotes.length})</TabsTrigger>
          <TabsTrigger value="payments" className="gap-1"><CreditCard className="h-4 w-4" /> Vencimientos ({dueDates.length})</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="info">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Datos fiscales</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p><span className="text-muted-foreground">Razón social:</span> {supplier.legal_name || supplier.name}</p>
                  <p><span className="text-muted-foreground">NIF/CIF:</span> {supplier.nif_cif || '-'}</p>
                  <p><span className="text-muted-foreground">Dirección:</span> {supplier.address || '-'}{supplier.city && `, ${supplier.city}`}{supplier.postal_code && ` ${supplier.postal_code}`}</p>
                  <p><span className="text-muted-foreground">País:</span> {supplier.country || 'España'}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Datos bancarios</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p><span className="text-muted-foreground">Banco:</span> {supplier.bank_name || '-'}</p>
                  <p><span className="text-muted-foreground">IBAN:</span> {supplier.bank_iban || '-'}</p>
                  <p><span className="text-muted-foreground">SWIFT:</span> {supplier.bank_swift || '-'}</p>
                  <p><span className="text-muted-foreground">Pedido mínimo:</span> {supplier.minimum_order ? formatCurrency(supplier.minimum_order) : 'Sin mínimo'}</p>
                  <p><span className="text-muted-foreground">Envío incluido:</span> {supplier.shipping_included ? 'Sí' : 'No'}</p>
                </CardContent>
              </Card>
              {contacts.length > 0 && (
                <Card className="md:col-span-2">
                  <CardHeader><CardTitle className="text-base">Contactos</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-3 gap-4">
                      {contacts.map((c: any) => (
                        <div key={c.id} className="p-3 border rounded-lg">
                          <p className="font-medium">{c.name}</p>
                          {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
                          {c.email && <p className="text-sm flex items-center gap-1 mt-1"><Mail className="h-3 w-3" />{c.email}</p>}
                          {c.phone && <p className="text-sm flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="fabrics">
            <div className="rounded-lg border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Composición</TableHead>
                  <TableHead>Color</TableHead><TableHead>&euro;/metro</TableHead><TableHead>Stock</TableHead><TableHead>Estado</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {fabrics.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin tejidos</TableCell></TableRow>
                  ) : fabrics.map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-sm">{f.fabric_code}</TableCell>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell className="text-sm">{f.composition}</TableCell>
                      <TableCell className="text-sm">{f.color_name || '-'}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(f.price_per_meter)}</TableCell>
                      <TableCell>{f.stock_meters?.toFixed(1) || '0'} m</TableCell>
                      <TableCell><Badge className={`text-xs ${fabricStatusColors[f.status] || ''}`}>{fabricStatusLabels[f.status] || f.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="orders">
            <div className="space-y-4">
              {can('suppliers.create_order') && (
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10)
                      setNewOrderForm({ payment_due_date: '', estimated_delivery_date: today, notes: '', tailoring_order_id: '' })
                      setOrderLines([])
                      setNewOrderOpen(true)
                    }}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" /> Nuevo pedido
                  </Button>
                </div>
              )}
            <div className="rounded-lg border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>N&ordm; Pedido</TableHead><TableHead>Estado</TableHead><TableHead>Total</TableHead>
                  <TableHead>Pago</TableHead><TableHead>Fecha</TableHead><TableHead>Fecha pago</TableHead><TableHead>Entrega est.</TableHead><TableHead className="w-28">Acciones</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin pedidos</TableCell></TableRow>
                  ) : [...orders].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono">{o.order_number}</TableCell>
                      <TableCell><Badge className={`text-xs ${orderStatusColors[o.status] || ''}`}>{orderStatusLabels[o.status] || o.status}</Badge></TableCell>
                      <TableCell className="font-medium">{formatCurrency(o.total)}</TableCell>
                      <TableCell>
                        <Badge variant={o.payment_status === 'pagado' ? 'default' : 'destructive'} className="text-xs">
                          {o.payment_status === 'pagado' ? 'Pagado' : 'No pagado'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(o.created_at)}</TableCell>
                      <TableCell className="text-sm">{o.payment_due_date ? formatDate(o.payment_due_date) : '-'}</TableCell>
                      <TableCell className="text-sm">{formatDate(o.estimated_delivery_date)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              setFinanceOrderId(o.id)
                              setFinanceForm({
                                total: String(o.total ?? ''),
                                payment_due_date: o.payment_due_date || '',
                                notes: o.internal_notes || '',
                              })
                              setFinanceOpen(true)
                            }}
                          >
                            Completar pago/coste
                          </Button>
                          {o.status !== 'received' && o.status !== 'cancelled' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              disabled={markingReceivedOrderId !== null}
                              onClick={async () => {
                                setMarkingReceivedOrderId(o.id)
                                const res = await updateSupplierOrderStatusAction({ supplierOrderId: o.id, status: 'received' })
                                setMarkingReceivedOrderId(null)
                                if (res?.success) {
                                  const warnings = Number((res.data as any)?.stock_warnings || 0)
                                  if (warnings > 0) {
                                    toast.warning('Pedido recibido. Algunas líneas no actualizaron stock (sin variante asociada).')
                                  } else {
                                    toast.success('Pedido marcado como recibido. Stock actualizado correctamente.')
                                  }
                                  router.refresh()
                                } else {
                                  toast.error((res as any)?.error || 'No se pudo marcar el pedido como recibido')
                                }
                              }}
                            >
                              {markingReceivedOrderId === o.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                              Marcar recibido
                            </Button>
                          ) : null}
                          {o.supplier_delivery_notes?.[0] ? (
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => router.push('/admin/almacen/albaranes?tab=proveedor')}
                              >
                                <FileText className="h-3 w-3 mr-1" /> Ver albarán
                              </Button>
                              {o.supplier_delivery_notes?.[0]?.attachment_url && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs"
                                  onClick={() => window.open(o.supplier_delivery_notes[0].attachment_url, '_blank')}
                                >
                                  Ver PDF
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                disabled={uploadingOrderPdfId !== null}
                                onClick={() => requestUploadFromOrder(o.id)}
                              >
                                {uploadingOrderPdfId === o.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                                {o.supplier_delivery_notes?.[0]?.attachment_url ? 'Reemplazar PDF' : 'Subir albarán PDF'}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                disabled={uploadingOrderPdfId !== null}
                                onClick={() => requestUploadFromOrder(o.id)}
                              >
                                {uploadingOrderPdfId === o.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                                Subir albarán PDF
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs"
                                onClick={() => {
                                  const today = new Date().toISOString().slice(0, 10)
                                  setDeliveryOrderId(o.id)
                                  setNewDeliveryForm({ supplier_reference: '', delivery_date: today, notes: '' })
                                  setDeliveryFile(null)
                                  setNewDeliveryOpen(true)
                                }}
                              >
                                Registrar albarán recibido
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            </div>
          </TabsContent>

          <TabsContent value="delivery-notes">
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h3 className="text-sm font-semibold">Albaranes recibidos del proveedor</h3>
                <Badge variant="secondary">{supplierDeliveryNotes.length}</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Fecha entrega</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha registro</TableHead>
                    <TableHead className="w-44 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierDeliveryNotes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Sin albaranes registrados para este proveedor
                      </TableCell>
                    </TableRow>
                  ) : supplierDeliveryNotes.map((n: any) => {
                    const fileUrl = uploadedNoteUrls[n.id] || n.attachment_url || ''
                    return (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono text-xs">{n.supplier_reference || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{n.order_number || '-'}</TableCell>
                      <TableCell className="text-sm">{n.delivery_date ? formatDate(n.delivery_date) : '-'}</TableCell>
                      <TableCell>
                        <Badge variant={n.status === 'recibido' ? 'default' : n.status === 'incidencia' ? 'destructive' : 'secondary'}>
                          {n.status === 'recibido' ? 'Recibido' : n.status === 'incidencia' ? 'Incidencia' : 'Pendiente'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(n.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            disabled={uploadingDeliveryNoteId !== null}
                            onClick={() => requestUploadForDeliveryNote(n.id)}
                          >
                            {uploadingDeliveryNoteId === n.id ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <FileText className="h-3 w-3 mr-1" />
                            )}
                            {fileUrl ? 'Reemplazar PDF' : 'Subir PDF'}
                          </Button>
                          {fileUrl ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => window.open(fileUrl, '_blank')}
                            >
                              Ver PDF
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="payments">
            <div className="rounded-lg border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Vencimiento</TableHead><TableHead>Importe</TableHead>
                  <TableHead>Estado</TableHead><TableHead>Alerta</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dueDates.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin vencimientos</TableCell></TableRow>
                  ) : [...dueDates].sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map((d: any) => {
                    const isOverdue = !d.is_paid && new Date(d.due_date) < new Date()
                    return (
                      <TableRow key={d.id} className={isOverdue ? 'bg-red-50' : ''}>
                        <TableCell className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>{formatDate(d.due_date)}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(d.amount)}</TableCell>
                        <TableCell>
                          {d.is_paid ? <Badge className="bg-green-100 text-green-700 text-xs">Pagado</Badge>
                            : isOverdue ? <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" /> Vencido</Badge>
                            : <Badge variant="outline" className="text-xs">Pendiente</Badge>}
                        </TableCell>
                        <TableCell>{d.alert_sent ? <Badge variant="secondary" className="text-xs">Enviada</Badge> : <span className="text-xs text-muted-foreground">No</span>}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      <Dialog
        open={newOrderOpen}
        onOpenChange={(open) => {
          setNewOrderOpen(open)
          if (!open) {
            setNewOrderForm((f) => ({ ...f, tailoring_order_id: '' }))
            setSelectedTailoringLabel('')
            setTailoringSearchQuery('')
            setTailoringSearchResults([])
            setTailoringSearchOpen(false)
            setOrderLines([])
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" /> Nuevo pedido a proveedor
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se creará el pedido y, si tienes permiso de facturas proveedores, se generará la factura en Contabilidad → Facturas proveedores.
          </p>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-order-payment">Fecha de pago al proveedor</Label>
              <DatePickerPopover
                id="new-order-payment"
                value={newOrderForm.payment_due_date}
                onChange={(date) => setNewOrderForm((f) => ({ ...f, payment_due_date: date }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-order-delivery">Fecha de entrega estimada *</Label>
              <DatePickerPopover
                id="new-order-delivery"
                value={newOrderForm.estimated_delivery_date}
                onChange={(date) => setNewOrderForm((f) => ({ ...f, estimated_delivery_date: date }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-order-tailoring">Pedido de sastrería (opcional)</Label>
              {newOrderForm.tailoring_order_id ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-muted/50">
                  <span>{selectedTailoringLabel}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setNewOrderForm((f) => ({ ...f, tailoring_order_id: '' }))
                      setSelectedTailoringLabel('')
                    }}
                  >
                    ×
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    id="new-order-tailoring"
                    placeholder="Buscar por nº pedido (ej. PED-2026-0008)"
                    value={tailoringSearchQuery}
                    onChange={(e) => {
                      setTailoringSearchQuery(e.target.value)
                      setTailoringSearchOpen(true)
                    }}
                    onFocus={() => tailoringSearchResults.length > 0 && setTailoringSearchOpen(true)}
                  />
                  {tailoringSearching && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Buscando...</span>}
                  {tailoringSearchOpen && tailoringSearchResults.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover py-1 text-sm shadow-md max-h-48 overflow-auto">
                      {tailoringSearchResults.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-muted"
                            onClick={() => {
                              setNewOrderForm((f) => ({ ...f, tailoring_order_id: row.id }))
                              setSelectedTailoringLabel(`${row.order_number} — ${row.client_name}`)
                              setTailoringSearchQuery('')
                              setTailoringSearchResults([])
                              setTailoringSearchOpen(false)
                            }}
                          >
                            {row.order_number} — {row.client_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Líneas del pedido</Label>
                <Button type="button" variant="outline" size="sm" onClick={addOrderLine} className="gap-1">
                  <Plus className="h-3 w-3" /> Añadir línea
                </Button>
              </div>
              <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                {orderLines.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Añade al menos una línea con tipo, descripción y cantidad.</p>
                )}
                {orderLines.map((line) => (
                  <div key={line.tempId} className="flex flex-wrap items-start gap-2 rounded border bg-background p-2">
                    <Select
                      value={line.type}
                      onValueChange={(v: 'fabric' | 'product' | 'custom') => updateOrderLine(line.tempId, { type: v, fabric_id: undefined, product_id: undefined, description: line.type === 'custom' ? line.description : '' })}
                    >
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fabric">Tejido</SelectItem>
                        <SelectItem value="product">Producto</SelectItem>
                        <SelectItem value="custom">Descripción libre</SelectItem>
                      </SelectContent>
                    </Select>
                    {line.type === 'fabric' && (
                      <>
                        {line.newFabric ? (
                          <div className="flex items-center gap-2 flex-1 min-w-[160px] text-sm">
                            <span>{line.description}</span>
                            <Badge variant="secondary" className="text-xs">nuevo</Badge>
                          </div>
                        ) : newFabricForLine === line.tempId ? (
                          <div className="flex-1 min-w-[200px] space-y-2 rounded border p-2 bg-muted/50">
                            <Input placeholder="Nombre *" value={newFabricForm.name} onChange={(e) => setNewFabricForm((f) => ({ ...f, name: e.target.value }))} className="h-8" />
                            <div className="flex gap-2 flex-wrap">
                              <Input placeholder="Código" value={newFabricForm.fabric_code} onChange={(e) => setNewFabricForm((f) => ({ ...f, fabric_code: e.target.value }))} className="h-8 flex-1 min-w-[80px]" />
                              <Input placeholder="Referencia" value={newFabricForm.reference} onChange={(e) => setNewFabricForm((f) => ({ ...f, reference: e.target.value }))} className="h-8 flex-1 min-w-[80px]" />
                              <Select value={newFabricForm.unit} onValueChange={(v) => setNewFabricForm((f) => ({ ...f, unit: v }))}>
                                <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="meters">metros</SelectItem><SelectItem value="pieces">unidades</SelectItem></SelectContent>
                              </Select>
                            </div>
                            <div className="flex gap-1">
                              <Button type="button" size="sm" onClick={() => {
                                if (!newFabricForm.name.trim()) { toast.error('Nombre obligatorio'); return }
                                updateOrderLine(line.tempId, {
                                  newFabric: {
                                    name: newFabricForm.name.trim(),
                                    fabric_code: newFabricForm.fabric_code.trim(),
                                    reference: newFabricForm.reference.trim(),
                                    unit: newFabricForm.unit,
                                  },
                                  description: newFabricForm.name.trim(),
                                })
                                setNewFabricForLine(null)
                                setNewFabricForm({ name: '', fabric_code: '', reference: '', unit: 'meters' })
                              }}>Crear y usar</Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => { setNewFabricForLine(null); setNewFabricForm({ name: '', fabric_code: '', reference: '', unit: 'meters' }) }}>Cancelar</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative flex-1 min-w-[160px]">
                            <Input
                              placeholder="Buscar tejido..."
                              className="h-9"
                              value={fabricSearchForLine === line.tempId ? fabricSearchQuery : (line.description || '')}
                              onChange={(e) => { setFabricSearchForLine(line.tempId); setFabricSearchQuery(e.target.value) }}
                              onFocus={() => setFabricSearchForLine(line.tempId)}
                            />
                            {fabricSearchForLine === line.tempId && fabricSearchResults.length > 0 && (
                              <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover py-1 text-sm shadow-md max-h-40 overflow-auto">
                                {fabricSearchResults.map((f) => (
                                  <li key={f.id}>
                                    <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-muted" onClick={() => { updateOrderLine(line.tempId, { fabric_id: f.id, description: f.name }); setFabricSearchForLine(null); setFabricSearchQuery('') }}>{f.fabric_code ? `${f.fabric_code} — ` : ''}{f.name}</button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => { setNewFabricForLine(line.tempId); setNewFabricForm({ name: '', fabric_code: '', reference: '', unit: 'meters' }) }}>Nuevo tejido</Button>
                          </div>
                        )}
                      </>
                    )}
                    {line.type === 'product' && (
                      <div className="relative flex-1 min-w-[160px] overflow-visible">
                        <Input
                          placeholder="Buscar producto..."
                          className="h-9"
                          value={productSearchForLine === line.tempId ? productSearchQuery : (line.description || '')}
                          onChange={(e) => { const value = e.target.value; setProductSearchForLine(line.tempId); setProductSearchQuery(value) }}
                          onFocus={() => setProductSearchForLine(line.tempId)}
                        />
                        {productSearchForLine === line.tempId && productSearchResults.length > 0 && (
                          <ul className="absolute left-0 right-0 top-full z-[100] mt-1 min-w-full rounded-md border border-border bg-popover py-1 text-sm shadow-lg max-h-40 overflow-auto">
                            {productSearchResults.map((p) => (
                              <li key={p.id}>
                                <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-muted" onClick={() => { updateOrderLine(line.tempId, { product_id: p.id, description: p.name }); setProductSearchForLine(null); setProductSearchQuery('') }}>{p.sku} — {p.name}</button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {line.type === 'custom' && (
                      <Input placeholder="Descripción" className="h-9 flex-1 min-w-[140px]" value={line.description} onChange={(e) => updateOrderLine(line.tempId, { description: e.target.value })} />
                    )}
                    <Input type="number" min="0" step="0.01" placeholder="Cant." className="w-20 h-9" value={line.quantity} onChange={(e) => updateOrderLine(line.tempId, { quantity: e.target.value })} />
                    <Select value={line.unit} onValueChange={(v) => updateOrderLine(line.tempId, { unit: v })}>
                      <SelectTrigger className="w-[100px] h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="metros">metros</SelectItem>
                        <SelectItem value="unidades">unidades</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" min="0" step="0.01" placeholder="P. unit." className="w-24 h-9" value={line.unit_price} onChange={(e) => updateOrderLine(line.tempId, { unit_price: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeOrderLine(line.tempId)}>×</Button>
                  </div>
                ))}
              </div>
              {orderLines.length > 0 && (
                <p className="text-sm font-medium">Total: {formatCurrency(computedOrderTotal)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-order-notes">Notas</Label>
              <Textarea
                id="new-order-notes"
                rows={2}
                className="resize-none"
                placeholder="Opcional"
                value={newOrderForm.notes}
                onChange={(e) => setNewOrderForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOrderOpen(false)}>Cancelar</Button>
            <Button
              disabled={creating || !newOrderForm.estimated_delivery_date || orderLines.length === 0 || orderLines.every((l) => !l.description.trim() || !Number(l.quantity))}
              onClick={async () => {
                const validLines = orderLines.filter((l) => l.description.trim() && Number(l.quantity) > 0)
                if (validLines.length === 0) {
                  toast.error('Añade al menos una línea con descripción y cantidad')
                  return
                }
                setCreating(true)
                const supabase = createClient()
                const linesWithFabricIds: Array<{ fabric_id?: string | null; product_id?: string | null; description: string; reference?: string | null; quantity: number; unit: string; unit_price: number }> = []
                for (const l of validLines) {
                  let fabricId: string | null = l.type === 'fabric' ? (l.fabric_id || null) : null
                  if (l.type === 'fabric' && l.newFabric) {
                    const { data: newFabric, error: fabricErr } = await supabase
                      .from('fabrics')
                      .insert({
                        name: l.newFabric.name,
                        fabric_code: l.newFabric.fabric_code || null,
                        supplier_reference: l.newFabric.reference || null,
                        supplier_id: supplier.id,
                        unit: l.newFabric.unit || 'meters',
                        is_active: true,
                        status: 'active',
                      })
                      .select('id')
                      .single()
                    if (fabricErr) {
                      setCreating(false)
                      toast.error(fabricErr.message || 'Error al crear el tejido')
                      return
                    }
                    fabricId = newFabric?.id ?? null
                  }
                  linesWithFabricIds.push({
                    fabric_id: l.type === 'fabric' ? fabricId : null,
                    product_id: l.type === 'product' ? (l.product_id || null) : null,
                    description: l.description.trim(),
                    reference: (l.newFabric?.reference ?? l.reference)?.trim() || null,
                    quantity: parseFloat(String(l.quantity).replace(',', '.')) || 0,
                    unit: l.unit || 'unidades',
                    unit_price: parseFloat(String(l.unit_price).replace(',', '.')) || 0,
                  })
                }
                const total = orderLines.reduce((sum, l) => {
                  const q = parseFloat(String(l.quantity).replace(',', '.'))
                  const p = parseFloat(String(l.unit_price).replace(',', '.'))
                  if (Number.isFinite(q) && Number.isFinite(p)) return sum + q * p
                  return sum
                }, 0)
                const res = await createSupplierOrderAction({
                  supplier_id: supplier.id,
                  total,
                  payment_due_date: newOrderForm.payment_due_date || null,
                  estimated_delivery_date: newOrderForm.estimated_delivery_date,
                  notes: newOrderForm.notes?.trim() || null,
                  alert_on_payment: true,
                  alert_on_delivery: true,
                  tailoring_order_id: newOrderForm.tailoring_order_id?.trim() || undefined,
                  lines: linesWithFabricIds,
                })
                setCreating(false)
                if (res?.success && res.data) {
                  setNewOrderOpen(false)
                  router.refresh()
                  toast.success(res.data.ap_invoice_id
                    ? 'Pedido creado. Factura generada en Facturas proveedores.'
                    : 'Pedido creado.')
                  if (res.data.ap_invoice_id) {
                    // Opcional: enlace en el toast o dejamos que vaya a contabilidad
                  }
                } else {
                  toast.error(res && 'error' in res ? res.error : 'Error al crear el pedido')
                }
              }}
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Crear pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newDeliveryOpen} onOpenChange={setNewDeliveryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Registrar albarán de proveedor
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="delivery-ref">Referencia proveedor</Label>
              <Input
                id="delivery-ref"
                value={newDeliveryForm.supplier_reference}
                onChange={(e) => setNewDeliveryForm((f) => ({ ...f, supplier_reference: e.target.value }))}
                placeholder="Número de albarán del proveedor"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-date">Fecha entrega</Label>
              <DatePickerPopover
                id="delivery-date"
                value={newDeliveryForm.delivery_date}
                onChange={(date) => setNewDeliveryForm((f) => ({ ...f, delivery_date: date }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-notes">Notas</Label>
              <Textarea
                id="delivery-notes"
                rows={2}
                className="resize-none"
                value={newDeliveryForm.notes}
                onChange={(e) => setNewDeliveryForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Observaciones de recepción"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-pdf">PDF albarán (opcional)</Label>
              <Input
                id="delivery-pdf"
                type="file"
                accept="application/pdf"
                onChange={(e) => setDeliveryFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDeliveryOpen(false)}>Cancelar</Button>
            <Button
              disabled={creatingDelivery || !deliveryOrderId}
              onClick={async () => {
                setCreatingDelivery(true)
                const created = await createSupplierDeliveryNote({
                  supplier_id: supplier.id,
                  supplier_order_id: deliveryOrderId,
                  supplier_reference: newDeliveryForm.supplier_reference?.trim() || null,
                  delivery_date: newDeliveryForm.delivery_date || null,
                  notes: newDeliveryForm.notes?.trim() || null,
                })
                if (!created.success || !created.data?.id) {
                  setCreatingDelivery(false)
                  toast.error(created.success ? 'No se pudo crear el albarán' : created.error)
                  return
                }
                if (deliveryFile) {
                  const fd = new FormData()
                  fd.append('id', created.data.id)
                  fd.append('file', deliveryFile)
                  console.log('[upload-albaran] id del albarán:', created.data.id)
                  console.log('[upload-albaran] archivo:', deliveryFile?.name, deliveryFile?.size, deliveryFile?.type)
                  const uploaded = await uploadSupplierDeliveryNoteAttachment(fd)
                  if (!uploaded.success) {
                    setCreatingDelivery(false)
                    toast.error(uploaded.error || 'Albarán creado, pero no se pudo subir el PDF')
                    router.refresh()
                    setNewDeliveryOpen(false)
                    return
                  }
                }
                setCreatingDelivery(false)
                setNewDeliveryOpen(false)
                toast.success('Albarán de proveedor registrado')
                router.refresh()
              }}
            >
              {creatingDelivery && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar albarán
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={financeOpen} onOpenChange={setFinanceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Completar pago y coste del pedido</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="finance-total">Coste total (€) *</Label>
              <Input
                id="finance-total"
                type="number"
                min="0"
                step="0.01"
                value={financeForm.total}
                onChange={(e) => setFinanceForm((f) => ({ ...f, total: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="finance-payment-date">Fecha de pago (opcional)</Label>
              <DatePickerPopover
                id="finance-payment-date"
                value={financeForm.payment_due_date}
                onChange={(date) => setFinanceForm((f) => ({ ...f, payment_due_date: date }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="finance-notes">Notas</Label>
              <Textarea
                id="finance-notes"
                rows={2}
                value={financeForm.notes}
                onChange={(e) => setFinanceForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinanceOpen(false)}>Cancelar</Button>
            <Button
              disabled={savingFinance || !financeOrderId || financeForm.total === '' || Number(financeForm.total) < 0}
              onClick={async () => {
                const total = parseFloat(String(financeForm.total).replace(',', '.'))
                if (Number.isNaN(total) || total < 0) {
                  toast.error('Coste no válido')
                  return
                }
                setSavingFinance(true)
                const res = await updateSupplierOrderFinanceAction({
                  supplierOrderId: financeOrderId,
                  total,
                  payment_due_date: financeForm.payment_due_date || null,
                  notes: financeForm.notes?.trim() || null,
                  alert_on_payment: true,
                })
                setSavingFinance(false)
                if (!res.success) {
                  toast.error(res.error || 'No se pudo actualizar el pedido')
                  return
                }
                toast.success('Pedido actualizado')
                setFinanceOpen(false)
                router.refresh()
              }}
            >
              {savingFinance && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input
        ref={uploadPdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.currentTarget.value = ''
          if (!file) return
          handleUploadDeliveryNotePdf(file)
        }}
      />
      <input
        ref={orderUploadInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.currentTarget.value = ''
          if (!file) return
          handleUploadOrderPdf(file)
        }}
      />
    </div>
  )
}
