import { Metadata } from 'next'
import { requirePermission } from '@/actions/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NewProductForm } from './new-product-form'

export const metadata: Metadata = { title: 'Nuevo producto' }

export default async function NewProductPage() {
  await requirePermission('products.create')
  const admin = createAdminClient()
  const [{ data: categories }, { data: suppliers }] = await Promise.all([
    admin
      .from('product_categories')
      .select('id, name, slug, product_type, parent_id, sort_order, is_visible_web')
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
    admin.from('suppliers').select('id, name, nif_cif, supplier_code').eq('is_active', true).order('name'),
  ])
  return <NewProductForm categories={categories || []} suppliers={suppliers || []} />
}
