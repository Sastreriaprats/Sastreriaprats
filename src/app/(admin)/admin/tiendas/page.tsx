import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { TiendasContent } from './tiendas-content'

export const metadata: Metadata = { title: 'Tiendas — Stocks y ventas' }

export default async function TiendasPage() {
  await requirePermission('config.view')
  return <TiendasContent />
}
