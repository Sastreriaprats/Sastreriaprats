import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { ConfigTabs } from './config-tabs'

export const metadata: Metadata = { title: 'Configuración' }

export default async function ConfigPage(props: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requirePermission('config.view')
  const searchParams = await props.searchParams

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Gestión de usuarios, roles, tiendas y parámetros del sistema.
        </p>
      </div>
      <ConfigTabs activeTab={searchParams.tab || 'users'} />
    </div>
  )
}
