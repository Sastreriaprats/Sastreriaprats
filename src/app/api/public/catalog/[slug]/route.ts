import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('products')
    .select(`
      *, product_categories!products_category_id_fkey(name, slug),
      product_variants(
        id, variant_sku, size, color, color_hex, barcode, price_override, is_active, image_url,
        stock_levels(quantity, available, warehouses(name))
      )
    `)
    .eq('web_slug', slug)
    .eq('is_active', true)
    .eq('is_visible_web', true)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const product = {
    ...data,
    slug: data.web_slug,
    product_variants: data.product_variants
      ?.filter((v: Record<string, unknown>) => v.is_active)
      .map((v: Record<string, unknown>) => ({
        ...v,
        total_stock: ((v.stock_levels as Record<string, unknown>[]) || []).reduce(
          (sum: number, sl: Record<string, unknown>) => sum + ((sl.available as number) || 0), 0
        ),
      })),
  }

  return NextResponse.json(product)
}
