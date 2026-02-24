'use client'

import { useState, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/components/providers/auth-provider'
import { Users, Shield, Store, Settings, Shirt } from 'lucide-react'
import { UsersSection } from './sections/users-section'
import { RolesSection } from './sections/roles-section'
import { StoresSection } from './sections/stores-section'
import { GarmentTypesSection } from './sections/garment-types-section'
import { SettingsSection } from './sections/settings-section'

// Cada pestaña acepta cualquiera de los posibles códigos de permiso que puedan existir
// según la migración activa (001 usa nombres distintos a 010).
const ALL_TABS = [
  {
    value: 'users',
    label: 'Usuarios',
    icon: Users,
    perms: ['config.users', 'config.manage_users', 'config.edit', 'config.view', 'config.access'],
  },
  {
    value: 'roles',
    label: 'Roles y Permisos',
    icon: Shield,
    perms: ['config.edit', 'config.manage_roles', 'config.view', 'config.access'],
  },
  {
    value: 'stores',
    label: 'Tiendas',
    icon: Store,
    perms: ['config.edit', 'config.manage_stores', 'config.view', 'config.access'],
  },
  {
    value: 'garments',
    label: 'Prendas y Medidas',
    icon: Shirt,
    perms: ['config.edit', 'config.manage_garment_types', 'config.view', 'config.access'],
  },
  {
    value: 'settings',
    label: 'Parámetros',
    icon: Settings,
    perms: ['config.view', 'config.access'],
  },
]

export function ConfigTabs({ activeTab }: { activeTab: string }) {
  const { permissions, isAdmin, profile } = useAuth()
  const [currentTab, setCurrentTab] = useState(() =>
    ALL_TABS.some(t => t.value === activeTab) ? activeTab : 'users'
  )

  const onTabChange = useCallback((v: string) => {
    setCurrentTab(v)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', v)
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }, [])

  const canTab = (perms: string[]) =>
    isAdmin || perms.some(p => permissions.has(p))

  const visibleTabs = ALL_TABS.filter(t => canTab(t.perms))

  // Mientras el perfil no está disponible, mostrar skeleton de pestañas
  if (!profile || visibleTabs.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex gap-1 rounded-lg bg-muted p-1 h-10">
          {ALL_TABS.map(t => (
            <div key={t.value} className="flex-1 rounded-md bg-background/60 animate-pulse" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-14 w-full rounded-lg border bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <Tabs value={currentTab} onValueChange={onTabChange}>
      <TabsList
        className="grid w-full"
        style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)` }}
      >
        {visibleTabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className="gap-2">
            <tab.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="mt-6">
        <TabsContent value="users"><UsersSection /></TabsContent>
        <TabsContent value="roles"><RolesSection /></TabsContent>
        <TabsContent value="stores"><StoresSection /></TabsContent>
        <TabsContent value="garments"><GarmentTypesSection /></TabsContent>
        <TabsContent value="settings"><SettingsSection /></TabsContent>
      </div>
    </Tabs>
  )
}
