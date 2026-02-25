'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft, Phone, Mail,
  Ruler, StickyNote, Scissors, Shirt, ShoppingBag, History, Pencil, CalendarDays,
} from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'
import { getInitials, formatCurrency, formatDate } from '@/lib/utils'
import { ClientDataTab } from './tabs/client-data-tab'
import { ClientMeasurementsTab } from './tabs/client-measurements-tab'
import { ClientNotesTab } from './tabs/client-notes-tab'
import { ClientOrdersTab } from './tabs/client-orders-tab'
import { ClientSalesTab } from './tabs/client-sales-tab'
import { ClientAlterationsTab } from './tabs/client-alterations-tab'
import { ClientAppointmentsTab } from './tabs/client-appointments-tab'

const categoryColors: Record<string, string> = {
  standard: 'bg-gray-100 text-gray-700',
  vip: 'bg-amber-100 text-amber-700',
  premium: 'bg-purple-100 text-purple-700',
  gold: 'bg-yellow-100 text-yellow-800',
  ambassador: 'bg-prats-navy/10 text-prats-navy',
}

function ClientSummaryTab({ client }: { client: any }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Datos personales</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {client.email && <p><span className="text-muted-foreground">Email:</span> {client.email}</p>}
          {client.phone && <p><span className="text-muted-foreground">Teléfono:</span> {client.phone}</p>}
          {client.date_of_birth && <p><span className="text-muted-foreground">Nacimiento:</span> {formatDate(client.date_of_birth)}</p>}
          {client.document_number && <p><span className="text-muted-foreground">{client.document_type}:</span> {client.document_number}</p>}
          {client.address && <p><span className="text-muted-foreground">Dirección:</span> {client.address}, {client.city} {client.postal_code}</p>}
          {client.nationality && <p><span className="text-muted-foreground">Nacionalidad:</span> {client.nationality}</p>}
          <p><span className="text-muted-foreground">Alta:</span> {formatDate(client.created_at)}</p>
          {client.source && <p><span className="text-muted-foreground">Origen:</span> {client.source}</p>}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push(`${basePath}/clientes`)}>
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
                <h1 className="text-2xl font-bold">{client.full_name}</h1>
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
        </div>
      </div>

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

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="resumen" className="gap-1"><History className="h-4 w-4" /> Resumen</TabsTrigger>
          <TabsTrigger value="datos" className="gap-1"><Pencil className="h-4 w-4" /> Datos</TabsTrigger>
          {can('clients.view') && (
            <TabsTrigger value="medidas" className="gap-1"><Ruler className="h-4 w-4" /> Medidas</TabsTrigger>
          )}
          <TabsTrigger value="notas" className="gap-1"><StickyNote className="h-4 w-4" /> Notas</TabsTrigger>
          <TabsTrigger value="pedidos" className="gap-1"><Scissors className="h-4 w-4" /> Pedidos</TabsTrigger>
          <TabsTrigger value="ventas" className="gap-1"><ShoppingBag className="h-4 w-4" /> Ventas</TabsTrigger>
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
          <TabsContent value="notas">
            <ClientNotesTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="pedidos">
            <ClientOrdersTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="ventas">
            <ClientSalesTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="arreglos">
            <ClientAlterationsTab clientId={client.id} />
          </TabsContent>
          <TabsContent value="citas">
            <ClientAppointmentsTab clientId={client.id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
