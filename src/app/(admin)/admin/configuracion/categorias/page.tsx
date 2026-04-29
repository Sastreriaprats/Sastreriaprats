import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { listCategories } from '@/actions/categories'
import { CategoriesContent } from './categories-content'

export const metadata: Metadata = { title: 'Categorías de productos' }

export default async function CategoriesPage() {
  await requirePermission('products.view')
  const res = await listCategories()
  const initialCategories = res.success && res.data ? res.data : []
  return <CategoriesContent initialCategories={initialCategories} />
}
