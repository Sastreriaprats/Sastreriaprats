'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, FileDown, Printer, Save, Ban, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'
import { usePermissions } from '@/hooks/use-permissions'
import { createClient } from '@/lib/supabase/client'
import { updateAlteration, cancelAlteration, deleteAlteration, markAlterationCharged, clearAlterationCharge } from '@/actions/alterations'
import {
  type AlterationWithRelations,
  type AlterationStatus,
  ALTERATION_STATUS_LABELS,
  ALTERATION_STATUS_COLORS,
} from '@/types/alterations'
import { downloadAlterationPdf, printAlterationPdf } from '@/lib/pdf/alteration-pdf'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  bizum: 'Bizum',
}

export function AlterationDetailContent({ alteration, basePath = '/admin' }: { alteration: AlterationWithRelations; basePath?: string }) {
  const router = useRouter()
  const { can, isAdmin } = usePermissions()
  // Marcar cobrado / dejar pendiente pide el mismo permiso que la action
  // (pos.sell). El panel del sastre queda fuera: no maneja caja y su listado ni
  // siquiera muestra el estado de cobro.
  const canCharge = basePath !== '/sastre' && (isAdmin || can('pos.sell'))

  // ── Form state (todos los campos editables) ───────────────────────────────
  const [phone, setPhone] = useState(alteration.phone ?? '')
  const [garmentType, setGarmentType] = useState(alteration.garment_type ?? '')
  const [officialId, setOfficialId] = useState(alteration.official_id ?? '')
  const [description, setDescription] = useState(alteration.description ?? '')
  const [costPrice, setCostPrice] = useState(alteration.cost_price != null ? String(alteration.cost_price) : '')
  const [salePrice, setSalePrice] = useState(alteration.sale_price != null ? String(alteration.sale_price) : '')
  const [alterationDate, setAlterationDate] = useState(alteration.alteration_date ?? '')
  const [workshopSent, setWorkshopSent] = useState(alteration.workshop_sent_date ?? '')
  const [clientDelivery, setClientDelivery] = useState(alteration.client_delivery_date ?? '')
  const [estimated, setEstimated] = useState(alteration.estimated_completion ?? '')
  const [status, setStatus] = useState<AlterationStatus>(alteration.status)
  const [notes, setNotes] = useState(alteration.notes ?? '')

  const [officials, setOfficials] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  // ── Cancelar ──────────────────────────────────────────────────────────────
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // ── Eliminar ──────────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Cobro ─────────────────────────────────────────────────────────────────
  // Mientras no esté marcado como cobrado, el arreglo cuenta como deuda del
  // cliente (aviso del TPV, ficha del cliente y Cobros pendientes).
  const isCharged = Boolean(alteration.sale_id) || Boolean(alteration.payment_method)
  const [chargeMethod, setChargeMethod] = useState('cash')
  const [charging, setCharging] = useState(false)

  // Cargar oficiales activos (mismo patrón que nueva-venta-ficha-client)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('officials')
          .select('id, name')
          .eq('is_active', true)
          .order('name')
        if (!cancelled && data) setOfficials(data as { id: string; name: string }[])
      } catch (err) {
        console.error('[AlterationDetail] loadOfficials', err)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await updateAlteration({
        id: alteration.id,
        data: {
          phone: phone.trim() || null,
          garment_type: garmentType.trim() || null,
          official_id: officialId || null,
          description: description.trim() || null,
          cost_price: costPrice.trim() === '' ? 0 : Number(costPrice.replace(',', '.')),
          sale_price: salePrice.trim() === '' ? 0 : Number(salePrice.replace(',', '.')),
          alteration_date: alterationDate || undefined,
          workshop_sent_date: workshopSent || null,
          client_delivery_date: clientDelivery || null,
          estimated_completion: estimated || null,
          status,
          notes: notes.trim() || null,
        },
      })
      if (!res.success) {
        toast.error('error' in res ? res.error : 'Error al guardar')
        return
      }
      toast.success('Cambios guardados')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const res = await cancelAlteration({ id: alteration.id })
      if (!res.success) {
        toast.error('error' in res ? res.error : 'Error al cancelar')
        return
      }
      toast.success('Arreglo cancelado')
      setCancelOpen(false)
      router.refresh()
    } finally {
      setCancelling(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await deleteAlteration({ id: alteration.id })
      if (!res.success) {
        toast.error('error' in res ? res.error : 'Error al eliminar')
        return
      }
      const clientId = res.data?.client_id ?? alteration.client_id
      toast.success('Arreglo eliminado')
      router.push(`${basePath}/clientes/${clientId}?tab=arreglos`)
    } finally {
      setDeleting(false)
    }
  }

  const handleMarkCharged = async () => {
    setCharging(true)
    try {
      const res = await markAlterationCharged({ alterationId: alteration.id, paymentMethod: chargeMethod })
      if (!res.success) {
        toast.error('error' in res ? res.error : 'Error al marcar como cobrado')
        return
      }
      toast.success('Arreglo marcado como cobrado')
      router.refresh()
    } finally {
      setCharging(false)
    }
  }

  const handleClearCharge = async () => {
    setCharging(true)
    try {
      const res = await clearAlterationCharge({ alterationId: alteration.id })
      if (!res.success) {
        toast.error('error' in res ? res.error : 'Error al dejarlo pendiente')
        return
      }
      toast.success('Arreglo marcado como pendiente de cobro')
      router.refresh()
    } finally {
      setCharging(false)
    }
  }

  const canCancel = alteration.status !== 'cancelled'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight font-mono">{alteration.alteration_number}</h1>
          {alteration.clients && (
            <p className="text-sm text-muted-foreground mt-1">
              <Link href={`${basePath}/clientes/${alteration.client_id}?tab=arreglos`} className="hover:underline">
                {alteration.clients.full_name}
              </Link>
              {' · '}
              Creado el {formatDate(alteration.created_at)}
            </p>
          )}
        </div>
        <Badge variant="outline" className={ALTERATION_STATUS_COLORS[alteration.status]}>
          {ALTERATION_STATUS_LABELS[alteration.status]}
        </Badge>
        <Button variant="outline" onClick={() => downloadAlterationPdf(alteration.id)} className="gap-1">
          <FileDown className="h-4 w-4" /> Descargar PDF
        </Button>
        <Button variant="outline" onClick={() => printAlterationPdf(alteration.id)} className="gap-1">
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Columna 1: Datos del cliente / prenda / oficial / descripción ── */}
        <Card>
          <CardHeader><CardTitle className="text-base">Datos del arreglo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1 text-sm">
              <Label className="text-muted-foreground text-xs">Cliente</Label>
              <p className="font-medium">
                {alteration.clients?.full_name ?? '—'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" />
              </div>
              <div className="space-y-1">
                <Label>Tipo de prenda</Label>
                <Input value={garmentType} onChange={(e) => setGarmentType(e.target.value)} placeholder="Pantalón, americana…" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Oficial</Label>
              <Select value={officialId || 'none'} onValueChange={(v) => setOfficialId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="— Sin asignar —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin asignar —</SelectItem>
                  {officials.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Arreglos</Label>
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe los arreglos…"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Precio de coste (€)</Label>
                <Input type="number" min="0" step="0.01" inputMode="decimal" value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label>Precio de venta (€)</Label>
                <Input type="number" min="0" step="0.01" inputMode="decimal" value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)} placeholder="0,00" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Tipo</Label>
              <p className="text-sm text-muted-foreground">{alteration.alteration_type}</p>
            </div>

            {/* Cobro: sin marca de cobro el arreglo asoma como deuda del cliente.
                El ESTADO tiene que verse también desde /vendedor: ahí el listado ya
                pinta "Debe X €" y la ficha no ofrecía nada, así que el vendedor veía
                la deuda y no podía ni consultarla ni saldarla. */}
            {basePath !== '/sastre' && (
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-muted-foreground text-xs">Cobro</Label>
                  {isCharged ? (
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                      Cobrado{alteration.payment_method ? ` · ${PAYMENT_METHOD_LABELS[alteration.payment_method] ?? alteration.payment_method}` : ''}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">
                      Pendiente de cobro
                    </Badge>
                  )}
                </div>
                {canCharge && (isCharged ? (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {alteration.sale_id ? 'Cobrado en un ticket de caja.' : 'Marcado como cobrado a mano.'}
                    </p>
                    {!alteration.sale_id && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs" disabled={charging} onClick={handleClearCharge}>
                        {charging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Dejar pendiente'}
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Lo normal es cobrarlo en caja al entregarlo (sale como pendiente del cliente en el TPV).
                      Usa esto solo si ya se cobró fuera del TPV.
                    </p>
                    <div className="flex items-center gap-2">
                      <Select value={chargeMethod} onValueChange={setChargeMethod}>
                        <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" className="h-8 text-xs" disabled={charging} onClick={handleMarkCharged}>
                        {charging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Marcar cobrado'}
                      </Button>
                    </div>
                  </>
                ))}
              </div>
            )}

            {alteration.tailoring_orders && (
              <div className="space-y-1">
                <Label>Pedido vinculado</Label>
                <Link
                  // El panel del sastre tiene su propia ruta de pedidos y el
                  // middleware saca a /sastre cualquier /admin, asi que el
                  // enlace fijo lo dejaba en el dashboard. El del vendedor NO
                  // tiene /vendedor/pedidos: para el sigue valiendo /admin
                  // (excepcion isPedidosRoute del middleware).
                  href={`${basePath === '/sastre' ? '/sastre' : '/admin'}/pedidos/${alteration.tailoring_orders.id}`}
                  className="text-sm font-mono hover:underline block"
                >
                  {alteration.tailoring_orders.order_number}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Columna 2: Fechas, estado, notas ── */}
        <Card>
          <CardHeader><CardTitle className="text-base">Gestión y fechas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AlterationStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ALTERATION_STATUS_LABELS) as AlterationStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>{ALTERATION_STATUS_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fecha del arreglo</Label>
                <Input
                  type="date"
                  value={alterationDate}
                  onChange={(e) => setAlterationDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Fecha estimada</Label>
                <Input type="date" value={estimated} onChange={(e) => setEstimated(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fecha envío taller</Label>
                <Input type="date" value={workshopSent} onChange={(e) => setWorkshopSent(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Fecha entrega cliente</Label>
                <Input type="date" value={clientDelivery} onChange={(e) => setClientDelivery(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Observaciones internas</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Acciones inferiores ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
        <div className="flex gap-2">
          {canCancel && (
            <Button variant="outline" onClick={() => setCancelOpen(true)} className="gap-1">
              <Ban className="h-4 w-4" /> Cancelar arreglo
            </Button>
          )}
          {/* El borrado es fisico: solo lo ensenamos a quien puede borrar
              clientes (el server action exige el mismo permiso). */}
          {can('clients.delete') && (
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <Trash2 className="h-4 w-4" /> Eliminar permanentemente
            </Button>
          )}
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </Button>
      </div>

      {/* ── Dialog: Cancelar arreglo (no destructive) ── */}
      <Dialog open={cancelOpen} onOpenChange={(o) => { if (!o && !cancelling) setCancelOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5" /> Cancelar arreglo
            </DialogTitle>
            <DialogDescription>
              ¿Cancelar el arreglo <span className="font-mono font-medium">{alteration.alteration_number}</span>?
              Podrás reactivarlo después cambiando el estado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Volver
            </Button>
            <Button onClick={handleCancel} disabled={cancelling}>
              {cancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sí, cancelar arreglo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog: Eliminar permanentemente (destructive) ── */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => { if (!o && !deleting) setDeleteOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700">Eliminar arreglo permanentemente</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar el arreglo <span className="font-mono font-medium">{alteration.alteration_number}</span> de forma permanente.
              Esta acción no se puede deshacer. El arreglo desaparecerá del histórico del cliente y no quedará rastro en el sistema. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete() }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sí, eliminar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
