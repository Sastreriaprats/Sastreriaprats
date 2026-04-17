import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function sanitizeSearchPattern(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

export async function GET(request: NextRequest) {
  try {
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

  // Filtrar por temporada: oct-mar → incluir 'aw', abr-sep → incluir 'ss', siempre incluir 'all'/null
  const currentMonth = new Date().getMonth() + 1 // 1-12
  const currentSeason = currentMonth >= 4 && currentMonth <= 9 ? 'ss' : 'aw'

  // Si hay filtro de categoría, buscar su ID + IDs de todas las descendientes (hijas y nietas)
  let categoryIds: string[] | null = null
  if (category) {
    const { data: cat } = await admin
      .from('product_categories')
      .select('id')
      .eq('slug', category)
      .single()
    if (cat) {
      categoryIds = [cat.id]
      // Hijas directas
      const { data: children } = await admin
        .from('product_categories')
        .select('id')
        .eq('parent_id', cat.id)
      if (children && children.length > 0) {
        const childIds = children.map(c => c.id)
        categoryIds.push(...childIds)
        // Nietas (hijas de las hijas)
        const { data: grandchildren } = await admin
          .from('product_categories')
          .select('id')
          .in('parent_id', childIds)
        if (grandchildren) categoryIds.push(...grandchildren.map(c => c.id))
      }
    }
  }

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
    .or(`season.is.null,season.eq.all,season.eq.,season.eq.${currentSeason}`)

  if (categoryIds && categoryIds.length > 0) query = query.in('category_id', categoryIds)
  if (search) {
    const s = sanitizeSearchPattern(search)
    query = query.or(`name.ilike.%${s}%,brand.ilike.%${s}%,description.ilike.%${s}%`)
  }
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
  } catch (err) {
    console.error('[catalog]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
