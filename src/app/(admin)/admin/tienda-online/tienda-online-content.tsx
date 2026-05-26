'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ShoppingBag, Globe, Settings, Package, Mail, ExternalLink, Layout, BookOpen,
} from 'lucide-react'
import { HomeContentEditor } from './home-content-editor'
import { OnlineOrdersList } from './online-orders-list'

export function TiendaOnlineContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || 'dashboard'

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
          <TabsTrigger value="contenido-web" className="gap-1"><Layout className="h-4 w-4" /> Contenido Web</TabsTrigger>
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

            <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => router.push('/admin/cms?tab=blog')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-prats-navy" /> Blog
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Artículos del blog Prats &amp; Co.</p>
                <Button variant="ghost" size="sm" className="mt-2 gap-1">Gestionar <ExternalLink className="h-3 w-3" /></Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pedidos" className="mt-6">
          {tab === 'pedidos' && <OnlineOrdersList />}
        </TabsContent>

        <TabsContent value="contenido-web" className="mt-6">
          <HomeContentEditor />
        </TabsContent>
      </Tabs>
    </div>
  )
}
