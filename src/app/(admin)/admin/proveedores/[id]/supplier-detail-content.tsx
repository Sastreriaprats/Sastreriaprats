'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Textarea } from '@/components/ui/textarea'
import { updateSupplierOrderStatusAction, createSupplierOrderAction } from '@/actions/suppliers'
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
  AlertTriangle, ShoppingBag, Plus, Loader2,
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
  const [newOrderForm, setNewOrderForm] = useState({
    total: '',
    payment_due_date: '',
    estimated_delivery_date: '',
    notes: '',
  })

  const contacts = supplier.supplier_contacts || []
  const fabrics = supplier.fabrics || []
  const orders = supplier.supplier_orders || []
  const dueDates = supplier.supplier_due_dates || []

  const pendingDueDates = dueDates.filter((d: any) => !d.is_paid)
  const totalPendingDebt = pendingDueDates.reduce((sum: number, d: any) => sum + d.amount, 0)
  const overdueDates = pendingDueDates.filter((d: any) => new Date(d.due_date) < new Date())

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/admin/proveedores')}><ArrowLeft className="h-5 w-5" /></Button>
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
                      setNewOrderForm({ total: '', payment_due_date: today, estimated_delivery_date: today, notes: '' })
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
                  <TableHead>Fecha</TableHead><TableHead>Fecha pago</TableHead><TableHead>Entrega est.</TableHead><TableHead className="w-28">Acciones</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin pedidos</TableCell></TableRow>
                  ) : [...orders].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono">{o.order_number}</TableCell>
                      <TableCell><Badge className={`text-xs ${orderStatusColors[o.status] || ''}`}>{orderStatusLabels[o.status] || o.status}</Badge></TableCell>
                      <TableCell className="font-medium">{formatCurrency(o.total)}</TableCell>
                      <TableCell className="text-sm">{formatDate(o.created_at)}</TableCell>
                      <TableCell className="text-sm">{o.payment_due_date ? formatDate(o.payment_due_date) : '-'}</TableCell>
                      <TableCell className="text-sm">{formatDate(o.estimated_delivery_date)}</TableCell>
                      <TableCell>
                        {o.status !== 'received' && o.status !== 'cancelled' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={async () => {
                              const res = await updateSupplierOrderStatusAction({ supplierOrderId: o.id, status: 'received' })
                              if (res?.success) router.refresh()
                            }}
                          >
                            Marcar recibido
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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

      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent className="max-w-md">
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
              <Label htmlFor="new-order-total">Coste total (€) *</Label>
              <Input
                id="new-order-total"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={newOrderForm.total}
                onChange={(e) => setNewOrderForm((f) => ({ ...f, total: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-order-payment">Fecha de pago al proveedor *</Label>
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
              disabled={creating || !newOrderForm.total || !newOrderForm.payment_due_date || !newOrderForm.estimated_delivery_date || Number(newOrderForm.total) < 0}
              onClick={async () => {
                const total = parseFloat(String(newOrderForm.total).replace(',', '.'))
                if (total < 0) {
                  toast.error('El coste debe ser mayor o igual a 0')
                  return
                }
                setCreating(true)
                const res = await createSupplierOrderAction({
                  supplier_id: supplier.id,
                  total,
                  payment_due_date: newOrderForm.payment_due_date,
                  estimated_delivery_date: newOrderForm.estimated_delivery_date,
                  notes: newOrderForm.notes?.trim() || null,
                  alert_on_payment: true,
                  alert_on_delivery: true,
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
    </div>
  )
}
