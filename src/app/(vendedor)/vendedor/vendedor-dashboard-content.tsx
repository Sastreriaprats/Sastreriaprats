'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Package, CircleDollarSign, ShoppingCart, Tag, Calendar } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { usePermissions } from '@/hooks/use-permissions'

const quickLinks = [
  { label: 'Clientes', href: '/vendedor/clientes', icon: Users, description: 'Ver y gestionar clientes' },
  { label: 'Productos y Stock', href: '/vendedor/stock', icon: Package, description: 'Consultar productos y existencias' },
  { label: 'Cobros', href: '/vendedor/cobros', icon: CircleDollarSign, description: 'Cobros pendientes' },
  { label: 'Caja TPV', href: '/vendedor/caja', icon: ShoppingCart, description: 'Abrir caja / TPV' },
  { label: 'Calendario', href: '/admin/calendario', icon: Calendar, description: 'Citas y agenda', permission: 'calendar.view' as const },
  { label: 'Etiquetas y Códigos', href: '/admin/stock/codigos-barras', icon: Tag, description: 'Códigos de barras e imprimir etiquetas', permission: 'barcodes.manage' as const },
]

export function VendedorDashboardContent() {
  const router = useRouter()
  const { profile } = useAuth()
  const { can } = usePermissions()

  const visibleLinks = quickLinks.filter((item) => !('permission' in item) || can((item as { permission?: string }).permission!))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Buenos días, {profile?.fullName?.split(' ')[0] ?? ''}
        </h1>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {visibleLinks.map((item) => {
          const Icon = item.icon
          return (
            <Card
              key={item.href}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(item.href)}
            >
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#1a2744]/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-[#1a2744]" />
                </div>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
