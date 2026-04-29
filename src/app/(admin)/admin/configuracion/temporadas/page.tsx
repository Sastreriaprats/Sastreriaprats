import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { listSeasons } from '@/actions/seasons'
import { TemporadasContent } from './temporadas-content'

export const metadata: Metadata = { title: 'Temporadas' }

export default async function TemporadasPage() {
  await requirePermission('products.view')
  const res = await listSeasons()
  const initialSeasons = res.success && res.data ? res.data : []
  return <TemporadasContent initialSeasons={initialSeasons} />
}
