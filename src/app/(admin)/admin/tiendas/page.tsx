import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { getStoresWithStats } from '@/actions/dashboard'
import { TiendasContent } from './tiendas-content'

export const metadata: Metadata = { title: 'Tiendas — Stocks y ventas' }

export default async function TiendasPage() {
  await requirePermission('config.view')
  const res = await getStoresWithStats(undefined)
  const initialStores = res.success && res.data ? res.data : []
  return <TiendasContent initialStores={initialStores} />
}
