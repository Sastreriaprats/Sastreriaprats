import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// El catálogo público debe reflejar los cambios del admin de forma inmediata
// (subir/cambiar imágenes, ajustar precios, marcar productos como visibles).
// Sin esto, Vercel Edge cachea la respuesta JSON y los cambios tardan en
// propagarse, lo que provoca que las nuevas fotos aparezcan como rotas.
export const dynamic = 'force-dynamic'

/** Cabeceras anti-caché aplicadas a TODAS las respuestas (200 y errores).
 *  Defense in depth ante proxies intermedios y CDN externos. */
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
}

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
  const sort = searchParams.get('sort') || 'name'
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 24

  const admin = createAdminClient()

  // Filtrar por temporada: leemos los slugs de seasons activas y dentro de fechas.
  // Los productos sin temporada (NULL o '') se muestran siempre.
  const today = new Date().toISOString().slice(0, 10)
  const { data: activeSeasonsRaw } = await admin
    .from('seasons')
    .select('slug, start_date, end_date')
    .eq('is_active', true)
  const activeSeasonSlugs = ((activeSeasonsRaw ?? []) as Array<{ slug: string; start_date: string | null; end_date: string | null }>)
    .filter((r) => (!r.start_date || r.start_date <= today) && (!r.end_date || r.end_date >= today))
    .map((r) => r.slug)

  // Si hay filtro de categoría, buscar su ID + IDs del padre (si es subcategoría) + descendientes
  let categoryIds: string[] | null = null
  if (category) {
    const { data: cat } = await admin
      .from('product_categories')
      .select('id, parent_id')
      .eq('slug', category)
      .single()
    if (cat) {
      categoryIds = [cat.id]
      // Padre (si la categoría seleccionada es una subcategoría): así los productos
      // asignados al padre también aparecen cuando se filtra por una de sus hijas.
      if (cat.parent_id) categoryIds.push(cat.parent_id)
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
    .not('main_image_url', 'is', null)
    .neq('main_image_url', '')

  // Productos sin temporada (NULL/'') siempre, más los que tengan slug en activos.
  const seasonOrParts = ['season.is.null', 'season.eq.']
  for (const slug of activeSeasonSlugs) {
    // Escapar caracteres especiales del slug en el filtro PostgREST
    const safe = slug.replace(/[(),]/g, '')
    seasonOrParts.push(`season.eq.${safe}`)
  }
  query = query.or(seasonOrParts.join(','))

  if (categoryIds && categoryIds.length > 0) query = query.in('category_id', categoryIds)
  if (search) {
    const s = sanitizeSearchPattern(search)
    query = query.or(`name.ilike.%${s}%,brand.ilike.%${s}%,description.ilike.%${s}%`)
  }
  if (minPrice) query = query.gte('price_with_tax', parseFloat(minPrice))
  if (maxPrice) query = query.lte('price_with_tax', parseFloat(maxPrice))

  if (sort === 'price_asc') query = query.order('price_with_tax', { ascending: true })
  else if (sort === 'price_desc') query = query.order('price_with_tax', { ascending: false })
  else if (sort === 'newest') query = query.order('created_at', { ascending: false })
  else query = query.order('name', { ascending: true })

  query = query.range((page - 1) * limit, page * limit - 1)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS })

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
  }, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('[catalog]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: NO_STORE_HEADERS })
  }
}
