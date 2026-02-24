import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProductDetailContent } from './product-detail-content'

export const metadata: Metadata = { title: 'Ficha de producto' }

export default async function ProductDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('products.view')
  const params = await props.params
  const admin = createAdminClient()

  const [
    { data: product },
    { data: categories },
    { data: suppliers },
    { data: physicalWarehouses },
  ] = await Promise.all([
    admin
      .from('products')
      .select(`
        *, product_categories(name, slug), suppliers(id, name),
        product_variants(
          *, stock_levels(*, warehouses(name, code, stores(name, code, store_type)))
        )
      `)
      .eq('id', params.id)
      .single(),
    admin.from('product_categories').select('id, name, slug, product_type').eq('is_active', true).order('sort_order').order('name'),
    admin.from('suppliers').select('id, name').eq('is_active', true).order('name'),
    (async () => {
      const { data: physicalStores } = await admin.from('stores').select('id').eq('store_type', 'physical').eq('is_active', true)
      const storeIds = (physicalStores ?? []).map((s: { id: string }) => s.id)
      if (!storeIds.length) return { data: [] }
      const { data } = await admin.from('warehouses').select('id, name, code').eq('is_active', true).in('store_id', storeIds).order('name')
      return { data: data ?? [] }
    })(),
  ])

  if (!product) notFound()
  return (
    <ProductDetailContent
      product={product}
      categories={categories || []}
      suppliers={suppliers || []}
      physicalWarehouses={physicalWarehouses || []}
    />
  )
}
