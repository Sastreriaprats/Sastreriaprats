'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft, Phone, Mail, Trash2, GitMerge, Ban, UserCheck,
  Ruler, StickyNote, Scissors, Shirt, ShoppingBag, History, Pencil, CalendarDays, Receipt, Building2, BookmarkCheck, CalendarClock,
} from 'lucide-react'
import { toast } from 'sonner'
import { usePermissions } from '@/hooks/use-permissions'
import { hardDeleteClientAction, deleteClientAction, reactivateClientAction } from '@/actions/clients'
import { MergeClientDialog } from './merge-client-dialog'
import { clientSourceLabel } from '@/lib/clients/sources'
import { getInitials, formatCurrency, formatDate } from '@/lib/utils'
import { ClientDataTab } from './tabs/client-data-tab'
import { ClientMeasurementsTab } from './tabs/client-measurements-tab'
import { ClientCamiseriaTab } from './tabs/client-camiseria-tab'
import { ClientNotesTab } from './tabs/client-notes-tab'
import { ClientOrdersTab } from './tabs/client-orders-tab'
import { ClientSalesTab } from './tabs/client-sales-tab'
import { ClientTicketsTab } from './tabs/client-tickets-tab'
import { ClientAlterationsTab } from './tabs/client-alterations-tab'
import { ClientAppointmentsTab } from './tabs/client-appointments-tab'
import { ClientCompaniesTab } from './tabs/client-companies-tab'
import { ClientReservationsTab } from './tabs/client-reservations-tab'
import { listClientAppointments } from '@/actions/calendar'

const categoryColors: Record<string, string> = {
  standard: 'bg-gray-100 text-gray-700',
  vip: 'bg-amber-100 text-amber-700',
}

const salutationLabels: Record<string, string> = { sr: 'Sr.', sra: 'Sra.' }

const appointmentTypeLabels: Record<string, string> = {
  fitting: 'Prueba', delivery: 'Entrega', consultation: 'Consulta',
  boutique: 'Boutique', meeting: 'Reunión', measurement: 'Toma de medidas',
  pickup: 'Recogida', other: 'Otro',
}

// Banner destacado con la próxima cita futura del cliente (si la tiene).
// Reutiliza listClientAppointments; no requiere action nueva ni migración.
function NextAppointmentBanner({ clientId, onOpen }: { clientId: string; onOpen: () => void }) {
  const [next, setNext] = useState<any | null>(null)

  useEffect(() => {
    let active = true
    listClientAppointments({ client_id: clientId })
      .then(result => {
        if (!active || !result.success || !result.data) return
        const now = new Date()
        const today = now.toISOString().slice(0, 10)
        const nowTime = now.toTimeString().slice(0, 5)
        const upcoming = (result.data as any[])
          .filter(a => (a.status === 'scheduled' || a.status === 'confirmed'))
          .filter(a => {
            const d = String(a.date)
            const t = String(a.start_time || '').slice(0, 5)
            return d > today || (d === today && t >= nowTime)
          })
          .sort((a, b) => {
            const da = `${a.date} ${String(a.start_time || '')}`
            const db = `${b.date} ${String(b.start_time || '')}`
            return da < db ? -1 : da > db ? 1 : 0
          })[0]
        setNext(upcoming || null)
      })
      .catch(err => console.error('[NextAppointmentBanner]', err))
    return () => { active = false }
  }, [clientId])

  if (!next) return null

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left transition hover:bg-blue-100"
    >
      <CalendarClock className="h-5 w-5 shrink-0 text-blue-600" />
      <div className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <span className="font-semibold text-blue-800">Próxima cita:</span>
        <span className="font-medium text-blue-900">
          {formatDate(next.date)} · {String(next.start_time).slice(0, 5)}
        </span>
        <Badge variant="outline" className="border-blue-200 bg-white text-xs text-blue-700">
          {appointmentTypeLabels[next.type] || next.type}
        </Badge>
        {next.title && <span className="text-blue-700">{next.title}</span>}
        {next.stores?.name && <span className="text-blue-600/80">· {next.stores.name}</span>}
      </div>
      <span className="text-xs font-medium text-blue-600">Ver citas →</span>
    </button>
  )
}

function ClientSummaryTab({ client }: { client: any }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Datos personales</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {client.salutation && <p><span className="text-muted-foreground">Tratamiento:</span> {salutationLabels[client.salutation]}</p>}
          {client.email && <p><span className="text-muted-foreground">Email:</span> {client.email}</p>}
          {client.phone && <p><span className="text-muted-foreground">Teléfono:</span> {client.phone}</p>}
          {client.date_of_birth && <p><span className="text-muted-foreground">Nacimiento:</span> {formatDate(client.date_of_birth)}</p>}
          {client.document_number && <p><span className="text-muted-foreground">{client.document_type}:</span> {client.document_number}</p>}
          {client.address && <p><span className="text-muted-foreground">Dirección:</span> {client.address}, {client.city} {client.postal_code}</p>}
          {client.nationality && <p><span className="text-muted-foreground">Nacionalidad:</span> {client.nationality}</p>}
          <p><span className="text-muted-foreground">Alta:</span> {formatDate(client.created_at)}</p>
          {client.source && <p><span className="text-muted-foreground">Origen:</span> {clientSourceLabel(client.source)}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Preferencias y tallas</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {client.standard_sizes && Object.keys(client.standard_sizes).length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(client.standard_sizes).map(([key, val]) => (
                <p key={key}><span className="text-muted-foreground capitalize">{key}:</span> {val as string}</p>
              ))}
            </div>
          ) : <p className="text-muted-foreground">Sin tallas registradas</p>}
          {client.tags && client.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
              {client.tags.map((tag: string) => (<Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>))}
            </div>
          )}
          {client.internal_notes && (
            <div className="mt-3 p-2 rounded bg-muted text-xs">{client.internal_notes}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function ClientDetailContent({ client, initialTab, basePath = '/admin' }: { client: any; initialTab: string; basePath?: string }) {
  const router = useRouter()
  const { can } = usePermissions()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [activeTab, setActiveTab] = useState(initialTab)

  // Toggle desactivar/reactivar (soft). Distinto del hard delete (admin) de abajo.
  const handleToggleActive = async () => {
    setIsToggling(true)
    const result = client.is_active
      ? await deleteClientAction(client.id)
      : await reactivateClientAction(client.id)
    setIsToggling(false)
    if (result.success) {
      toast.success(client.is_active ? 'Cliente desactivado' : 'Cliente reactivado')
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  const handleHardDelete = async () => {
    setIsDeleting(true)
    const result = await hardDeleteClientAction(client.id)
    setIsDeleting(false)
    if (result.success) {
      toast.success('Cliente eliminado permanentemente')
      router.push(`${basePath}/clientes`)
    } else {
      toast.error(result.error)
      setShowDeleteDialog(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex flex-1 items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-prats-navy text-white text-lg">
                {getInitials(client.full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">
                  {client.salutation && <span className="text-muted-foreground font-semibold">{salutationLabels[client.salutation]} </span>}
                  {client.full_name}
                </h1>
                <Badge className={`text-xs ${categoryColors[client.category] || ''}`}>
                  {client.category?.toUpperCase()}
                </Badge>
                {!client.is_active && <Badge variant="destructive" className="text-xs">Inactivo</Badge>}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                <span className="font-mono">{client.client_code}</span>
                {client.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{client.phone}</span>}
                {client.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{client.email}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {can('clients.merge') && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowMergeDialog(true)}>
                <GitMerge className="h-4 w-4" /> Fusionar con…
              </Button>
            )}
            {can('clients.delete') && (
              <Button variant="outline" size="sm" className="gap-2" onClick={handleToggleActive} disabled={isToggling}>
                {client.is_active
                  ? <><Ban className="h-4 w-4" /> Desactivar</>
                  : <><UserCheck className="h-4 w-4" /> Reactivar</>}
              </Button>
            )}
            {can('clients.delete') && (
              <Button variant="destructive" size="sm" className="gap-2" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="h-4 w-4" /> Eliminar cliente
              </Button>
            )}
          </div>
        </div>
      </div>

      {can('clients.merge') && (
        <MergeClientDialog
          open={showMergeDialog}
          onOpenChange={setShowMergeDialog}
          source={{ id: client.id, full_name: client.full_name }}
          basePath={basePath}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Total gastado</p>
            <p className="text-xl font-bold">{formatCurrency(client.total_spent)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Pendiente cobro</p>
            <p className={`text-xl font-bold ${client.total_pending > 0 ? 'text-amber-600' : ''}`}>
              {formatCurrency(client.total_pending)}
            </p>
            {client.total_pending > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {[
                  Number(client.total_pending_orders) > 0 && `Pedidos ${formatCurrency(client.total_pending_orders)}`,
                  Number(client.total_pending_sales) > 0 && `Tickets ${formatCurrency(client.total_pending_sales)}`,
                  Number(client.total_pending_reservations) > 0 && `Reservas ${formatCurrency(client.total_pending_reservations)}`,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Ticket medio</p>
            <p className="text-xl font-bold">{formatCurrency(client.average_ticket)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Nº compras</p>
            <p className="text-xl font-bold">{client.purchase_count || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Descuento</p>
            <p className="text-xl font-bold">{client.discount_percentage || 0}%</p>
          </CardContent>
        </Card>
      </div>

      <NextAppointmentBanner clientId={client.id} onOpen={() => setActiveTab('citas')} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="resumen" className="gap-1"><History className="h-4 w-4" /> Resumen</TabsTrigger>
          <TabsTrigger value="datos" className="gap-1"><Pencil className="h-4 w-4" /> Datos</TabsTrigger>
          <TabsTrigger value="empresa" className="gap-1"><Building2 className="h-4 w-4" /> Empresa</TabsTrigger>
          {can('clients.view') && (
            <>
              <TabsTrigger value="medidas" className="gap-1"><Ruler className="h-4 w-4" /> Medidas</TabsTrigger>
              <TabsTrigger value="camiseria" className="gap-1"><Shirt className="h-4 w-4" /> Camisería</TabsTrigger>
            </>
          )}
          <TabsTrigger value="notas" className="gap-1"><StickyNote className="h-4 w-4" /> Notas</TabsTrigger>
          <TabsTrigger value="pedidos" className="gap-1"><Scissors className="h-4 w-4" /> Pedidos</TabsTrigger>
          <TabsTrigger value="ventas" className="gap-1"><ShoppingBag className="h-4 w-4" /> Ventas</TabsTrigger>
          <TabsTrigger value="reservas" className="gap-1"><BookmarkCheck className="h-4 w-4" /> Reservas</TabsTrigger>
          <TabsTrigger value="tickets" className="gap-1"><Receipt className="h-4 w-4" /> Tickets</TabsTrigger>
          <TabsTrigger value="arreglos" className="gap-1"><Shirt className="h-4 w-4" /> Arreglos</TabsTrigger>
          <TabsTrigger value="citas" className="gap-1"><CalendarDays className="h-4 w-4" /> Citas</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="resumen">
            <ClientSummaryTab client={client} />
          </TabsContent>
          <TabsContent value="datos">
            <ClientDataTab client={client} />
          </TabsContent>
          <TabsContent value="medidas">
            <ClientMeasurementsTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="camiseria">
            <ClientCamiseriaTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="notas">
            <ClientNotesTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="pedidos">
            <ClientOrdersTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="ventas">
            <ClientSalesTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="reservas">
            <ClientReservationsTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="tickets">
            <ClientTicketsTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="empresa">
            <ClientCompaniesTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="arreglos">
            <ClientAlterationsTab clientId={client.id} clientName={client.full_name} clientPhone={client.phone} basePath={basePath} />
          </TabsContent>
          <TabsContent value="citas">
            <ClientAppointmentsTab clientId={client.id} />
          </TabsContent>
        </div>
      </Tabs>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cliente permanentemente</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar a <strong>{client.full_name}</strong>? Esta acción no se puede deshacer y se perderán todos los datos asociados al cliente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleHardDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
