import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeSearchTerm } from '@/lib/utils'
import { getActiveSeasonSlugs, resolveCatalogCategoryIds, seasonOrFilter } from '@/lib/web/catalog-scope'

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
  const sort = searchParams.get('sort') || 'featured'
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 24

  const admin = createAdminClient()

  // Temporada y categoría con el mismo criterio que Tienda Online → Orden en la
  // web (catalog-scope.ts): lo que se ordena allí es exactamente lo que sale aquí.
  const activeSeasonSlugs = await getActiveSeasonSlugs(admin)
  const categoryIds = category ? await resolveCatalogCategoryIds(admin, category) : null

  let query = admin
    .from('products')
    .select(`
      id, name, web_slug, web_title, web_description, description, base_price, price_with_tax, tax_rate, brand, collection, season,
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
  query = query.or(seasonOrFilter(activeSeasonSlugs))

  if (categoryIds && categoryIds.length > 0) query = query.in('category_id', categoryIds)
  if (search) {
    // Multi-palabra sin acentos: cada token debe aparecer (AND) en search_text
    // (name+sku+barcode, unaccent — mig 142), brand, description o los textos web
    // (título/descripción, que pueden diferir del nombre interno). Antes era un
    // patrón único contiguo: "americana lana" no encontraba "Americana de lana".
    const tokens = normalizeSearchTerm(sanitizeSearchPattern(search)).split(/\s+/).filter(Boolean)
    for (const t of tokens) {
      query = query.or(`search_text.ilike.%${t}%,brand.ilike.%${t}%,description.ilike.%${t}%,web_title.ilike.%${t}%,web_description.ilike.%${t}%`)
    }
  }
  if (minPrice) query = query.gte('price_with_tax', parseFloat(minPrice))
  if (maxPrice) query = query.lte('price_with_tax', parseFloat(maxPrice))

  if (sort === 'price_asc') query = query.order('price_with_tax', { ascending: true })
  else if (sort === 'price_desc') query = query.order('price_with_tax', { ascending: false })
  else if (sort === 'newest') query = query.order('created_at', { ascending: false })
  else if (sort === 'name') query = query.order('name', { ascending: true })
  // "Recomendados": el orden que fijan en Tienda Online → Orden en la web. Lo no
  // colocado (NULL) va detrás, por nombre; con nada colocado es el A-Z de siempre.
  // El id desempata para que la paginación no repita ni salte productos.
  else query = query
    .order('web_sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
    .order('id', { ascending: true })

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
