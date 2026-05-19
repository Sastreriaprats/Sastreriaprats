import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Mismo motivo que /api/public/catalog: el detalle público debe ver al
// instante los cambios del admin (nueva imagen, precio, descripción).
export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
  const { slug } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('products')
    .select(`
      *, product_categories!products_category_id_fkey(name, slug, size_guide_id),
      product_variants(
        id, variant_sku, size, color, color_hex, barcode, price_override, is_active, image_url,
        stock_levels(quantity, available, warehouses(name))
      )
    `)
    .eq('web_slug', slug)
    .eq('is_active', true)
    .eq('is_visible_web', true)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Product not found' }, { status: 404, headers: NO_STORE_HEADERS })

  // Resolver guía de tallas: override del producto → guía de la categoría.
  const productGuideId = (data as any).size_guide_id as string | null
  const categoryGuideId = ((data as any).product_categories as any)?.size_guide_id as string | null
  const resolvedGuideId = productGuideId ?? categoryGuideId ?? null

  let sizeGuide: Record<string, unknown> | null = null
  if (resolvedGuideId) {
    const { data: guide } = await admin
      .from('size_guides')
      .select('id, name, slug, columns, rows, footer_note')
      .eq('id', resolvedGuideId)
      .eq('is_active', true)
      .maybeSingle()
    if (guide) sizeGuide = guide as Record<string, unknown>
  }

  const product = {
    ...data,
    slug: data.web_slug,
    size_guide: sizeGuide,
    product_variants: data.product_variants
      ?.filter((v: Record<string, unknown>) => v.is_active)
      .map((v: Record<string, unknown>) => ({
        ...v,
        total_stock: ((v.stock_levels as Record<string, unknown>[]) || []).reduce(
          (sum: number, sl: Record<string, unknown>) => sum + ((sl.available as number) || 0), 0
        ),
      })),
  }

  return NextResponse.json(product, { headers: NO_STORE_HEADERS })
  } catch (err) {
    console.error('[catalog/slug]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: NO_STORE_HEADERS })
  }
}
