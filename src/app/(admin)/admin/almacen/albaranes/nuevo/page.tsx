import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { NuevoAlbaranForm } from './nuevo-albaran-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Nuevo Albarán' }

export default async function NuevoAlbaranPage() {
  await requirePermission('products.edit')
  return <NuevoAlbaranForm />
}
