'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  ShoppingBag, Globe, FileText, Settings, Package, Mail,
  Loader2, ExternalLink, RefreshCw,
} from 'lucide-react'
import { getOnlineOrdersList, type OnlineOrderRow } from '@/actions/online-orders'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pago pendiente',
  paid: 'Pagado',
  processing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}

export function TiendaOnlineContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || 'dashboard'
  const [orders, setOrders] = useState<OnlineOrderRow[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  const loadOrders = async () => {
    setOrdersLoading(true)
    const res = await getOnlineOrdersList({ limit: 30 })
    if (res.success && res.data) setOrders(res.data)
    setOrdersLoading(false)
  }

  useEffect(() => {
    if (tab === 'pedidos') loadOrders()
  }, [tab])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tienda Online</h1>
        <p className="text-muted-foreground">Configuración y gestión de la tienda online</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => router.push(`/admin/tienda-online${v !== 'dashboard' ? `?tab=${v}` : ''}`)}>
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1"><ShoppingBag className="h-4 w-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="pedidos" className="gap-1">Pedidos online</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => router.push('/admin/cms')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4 text-prats-navy" /> CMS y contenido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Páginas, blog y bloques de contenido de la web.</p>
                <Button variant="ghost" size="sm" className="mt-2 gap-1">Abrir CMS <ExternalLink className="h-3 w-3" /></Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => router.push('/admin/tienda-online?tab=pedidos')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-prats-navy" /> Pedidos online
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Ver y gestionar pedidos de la tienda online.</p>
                <Button variant="ghost" size="sm" className="mt-2 gap-1">Ver pedidos <ExternalLink className="h-3 w-3" /></Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => router.push('/admin/stock')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-prats-navy" /> Productos y stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Productos de la boutique y stock por almacén.</p>
                <Button variant="ghost" size="sm" className="mt-2 gap-1">Ir a Stock <ExternalLink className="h-3 w-3" /></Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => router.push('/admin/configuracion?tab=settings')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="h-4 w-4 text-prats-navy" /> Parámetros
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Configuración general, email, tienda online.</p>
                <Button variant="ghost" size="sm" className="mt-2 gap-1">Configuración <ExternalLink className="h-3 w-3" /></Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => router.push('/admin/emails')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4 text-prats-navy" /> Emails
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Plantillas y campañas de email para la tienda.</p>
                <Button variant="ghost" size="sm" className="mt-2 gap-1">Emails <ExternalLink className="h-3 w-3" /></Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pedidos" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Pedidos online</CardTitle>
              <Button variant="outline" size="sm" className="gap-1" onClick={loadOrders} disabled={ordersLoading}>
                <RefreshCw className={`h-4 w-4 ${ordersLoading ? 'animate-spin' : ''}`} /> Actualizar
              </Button>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-prats-navy" /></div>
              ) : orders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No hay pedidos online todavía.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº pedido</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Pago</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                        <TableCell><Badge variant="outline">{STATUS_LABELS[o.status] ?? o.status}</Badge></TableCell>
                        <TableCell>{formatCurrency(o.total)}</TableCell>
                        <TableCell className="text-muted-foreground">{o.payment_method ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatDateTime(o.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
