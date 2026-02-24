import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { TiendaOnlineContent } from './tienda-online-content'

export const metadata: Metadata = { title: 'Tienda Online — Configuración' }

export default async function TiendaOnlinePage() {
  await requirePermission('config.view')
  return <TiendaOnlineContent />
}
