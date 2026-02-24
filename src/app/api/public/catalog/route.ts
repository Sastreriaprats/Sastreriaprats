import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category')
  const search = searchParams.get('search')
  const minPrice = searchParams.get('min_price')
  const maxPrice = searchParams.get('max_price')
  const size = searchParams.get('size')
  const color = searchParams.get('color')
  const sort = searchParams.get('sort') || 'newest'
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 24

  const admin = createAdminClient()

  let query = admin
    .from('products')
    .select(`
      id, name, web_slug, description, base_price, price_with_tax, tax_rate, cost_price, brand, collection, season,
      material, main_image_url, is_visible_web, product_type, images,
      category_id, product_categories!products_category_id_fkey(name, slug),
      product_variants(id, variant_sku, size, color, color_hex, barcode, price_override, is_active,
        stock_levels(quantity, available)
      )
    `, { count: 'exact' })
    .eq('is_active', true)
    .eq('is_visible_web', true)

  if (category) query = query.eq('product_categories.slug', category)
  if (search) query = query.or(`name.ilike.%${search}%,brand.ilike.%${search}%,description.ilike.%${search}%`)
  if (minPrice) query = query.gte('base_price', parseFloat(minPrice))
  if (maxPrice) query = query.lte('base_price', parseFloat(maxPrice))

  if (sort === 'price_asc') query = query.order('base_price', { ascending: true })
  else if (sort === 'price_desc') query = query.order('base_price', { ascending: false })
  else if (sort === 'name') query = query.order('name', { ascending: true })
  else query = query.order('created_at', { ascending: false })

  query = query.range((page - 1) * limit, page * limit - 1)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let products = (data || []).map((p: Record<string, unknown>) => ({
    ...p,
    slug: (p as Record<string, unknown>).web_slug,
    product_variants: ((p as Record<string, unknown>).product_variants as Record<string, unknown>[] || [])
      .filter((v: Record<string, unknown>) => v.is_active)
      .map((v: Record<string, unknown>) => ({
        ...v,
        total_stock: ((v.stock_levels as Record<string, unknown>[]) || []).reduce(
          (sum: number, sl: Record<string, unknown>) => sum + ((sl.available as number) || 0), 0
        ),
      })),
  }))

  if (size) {
    products = products.filter((p: Record<string, unknown>) =>
      (p.product_variants as Record<string, unknown>[])?.some((v: Record<string, unknown>) => v.size === size)
    )
  }
  if (color) {
    products = products.filter((p: Record<string, unknown>) =>
      (p.product_variants as Record<string, unknown>[])?.some(
        (v: Record<string, unknown>) => (v.color as string)?.toLowerCase().includes(color.toLowerCase())
      )
    )
  }

  return NextResponse.json({
    products,
    total: count || 0,
    page,
    totalPages: Math.ceil((count || 0) / limit),
  })
}
