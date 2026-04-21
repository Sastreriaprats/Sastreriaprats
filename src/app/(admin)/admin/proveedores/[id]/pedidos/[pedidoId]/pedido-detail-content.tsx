'use client'

import { useState } from 'react'
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
import { ArrowLeft, Loader2, Truck, FileText, Trash2, AlertTriangle, Check } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  updateSupplierOrderStatusAction,
  getSupplierOrderLines,
  receiveSupplierOrderLines,
  markSupplierInvoicePaid,
  deleteSupplierOrderAction,
  type SupplierOrderLineForReceipt,
  type ReceiveSupplierOrderLineInput,
} from '@/actions/suppliers'

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

  // Delete
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Incident dialog
  const [incidentLineId, setIncidentLineId] = useState<string | null>(null)
  const [incidentText, setIncidentText] = useState('')

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
    const res = await getSupplierOrderLines(order.id)
    setReceptionLinesLoading(false)
    if (res.success && res.data) {
      setReceptionLines(res.data)
      const init: Record<string, { selected: boolean; quantityReceived: string }> = {}
      for (const l of res.data) {
        const remaining = Math.max(0, l.quantity - l.quantity_received)
        init[l.id] = { selected: remaining > 0, quantityReceived: remaining > 0 ? String(remaining) : '0' }
      }
      setReceptionLineState(init)
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

    const res = await receiveSupplierOrderLines({ orderId: order.id, lines })
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
            {Array.isArray(order.payment_schedule) && order.payment_schedule.length > 0 ? (
              <div className="space-y-1">
                <span className="text-muted-foreground">{order.payment_schedule.length > 1 ? 'Plazos de pago' : 'Fecha de pago'}</span>
                <ul className="space-y-1">
                  {order.payment_schedule.map((p: any, idx: number) => (
                    <li key={p.id || idx} className="flex items-center justify-between text-sm">
                      <span>
                        {order.payment_schedule.length > 1 && (
                          <span className="text-xs text-muted-foreground mr-2">Plazo {idx + 1}</span>
                        )}
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
            ) : order.payment_due_date ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha pago</span>
                <span>{formatDate(order.payment_due_date)}</span>
              </div>
            ) : null}
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
