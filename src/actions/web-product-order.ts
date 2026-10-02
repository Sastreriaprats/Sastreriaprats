'use server'

import { revalidatePath } from 'next/cache'
import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { readAllPaged } from '@/lib/server/paged'
import { getActiveSeasonSlugs, resolveCatalogCategoryIds, seasonOrFilter } from '@/lib/web/catalog-scope'

// Orden manual de los productos en la web (mig 296, petición de Isma).
// `products.web_sort_order` es una posición GLOBAL: la web la usa en
// "Recomendados" (orden por defecto) y ordenar una categoría reparte entre sus
// productos los huecos que ya ocupaban, así conserva su sitio en la boutique.

export type WebOrderCategory = { slug: string; name: string; parentName: string | null }

export type WebOrderProduct = {
  id: string
  name: string
  imageUrl: string | null
  price: number
  categoryName: string | null
  /** null = sin colocar todavía (va al final, por nombre). */
  position: number | null
}

/** Mismo orden que el catálogo público en "Recomendados". */
const byWebOrder = (q: any) => q
  .order('web_sort_order', { ascending: true, nullsFirst: false })
  .order('name', { ascending: true })
  .order('id', { ascending: true })

export const getWebProductOrder = protectedAction<
  { categorySlug?: string | null },
  { categories: WebOrderCategory[]; products: WebOrderProduct[] }
>(
  { permission: 'config.view', auditModule: 'cms' },
  async (ctx, { categorySlug }) => {
    const admin = ctx.adminClient

    const { data: cats, error: catErr } = await admin
      .from('product_categories')
      .select('id, slug, name, parent_id, sort_order')
      .eq('is_active', true)
      .eq('is_visible_web', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (catErr) return failure(catErr.message)
    const catRows = (cats ?? []) as Array<{ id: string; slug: string; name: string; parent_id: string | null }>
    const nameById = new Map(catRows.map((c) => [c.id, c.name]))
    const categories: WebOrderCategory[] = catRows
      .map((c) => ({ slug: c.slug, name: c.name, parentName: c.parent_id ? nameById.get(c.parent_id) ?? null : null }))
      .sort((a, b) => (a.parentName ?? a.name).localeCompare(b.parentName ?? b.name, 'es') || (a.parentName ? 1 : 0) - (b.parentName ? 1 : 0) || a.name.localeCompare(b.name, 'es'))

    // Exactamente lo que enseña la web (catalog-scope.ts): activo, visible, con
    // foto principal y de temporada vigente (o sin temporada).
    const seasons = await getActiveSeasonSlugs(admin)
    const categoryIds = categorySlug ? await resolveCatalogCategoryIds(admin, categorySlug) : null
    const rows = await readAllPaged<any>((f, t) => {
      let q = admin
        .from('products')
        .select('id, name, web_title, main_image_url, price_with_tax, web_sort_order, product_categories!products_category_id_fkey(name)')
        .eq('is_active', true)
        .eq('is_visible_web', true)
        .not('main_image_url', 'is', null)
        .neq('main_image_url', '')
        .or(seasonOrFilter(seasons))
      if (categoryIds && categoryIds.length > 0) q = q.in('category_id', categoryIds)
      return byWebOrder(q).range(f, t)
    }, 'getWebProductOrder.products')

    const products: WebOrderProduct[] = rows.map((p) => {
      const cat = Array.isArray(p.product_categories) ? p.product_categories[0] : p.product_categories
      return {
        id: String(p.id),
        name: String(p.web_title || p.name || ''),
        imageUrl: p.main_image_url ? String(p.main_image_url) : null,
        price: Number(p.price_with_tax) || 0,
        categoryName: cat?.name ? String(cat.name) : null,
        position: p.web_sort_order == null ? null : Number(p.web_sort_order),
      }
    })
    return success({ categories, products })
  }
)

export const saveWebProductOrder = protectedAction<
  { orderedIds: string[]; categoryLabel?: string | null },
  { updated: number; auditDescription: string }
>(
  { permission: 'cms.edit', auditModule: 'cms', auditAction: 'update', auditEntity: 'product' },
  async (ctx, { orderedIds, categoryLabel }) => {
    const ids = (orderedIds ?? []).map(String).filter(Boolean)
    if (ids.length === 0) return failure('No hay productos que ordenar', 'VALIDATION')
    if (new Set(ids).size !== ids.length) return failure('Hay productos repetidos en la lista', 'VALIDATION')

    // Todo lo visible en la web, en su orden actual (incluidos los que hoy no
    // salen por temporada o por foto): así nadie pierde su sitio relativo.
    const universe = await readAllPaged<{ id: string }>((f, t) => byWebOrder(
      ctx.adminClient
        .from('products')
        .select('id')
        .eq('is_active', true)
        .eq('is_visible_web', true)
    ).range(f, t), 'saveWebProductOrder.universe')

    const order = universe.map((p) => String(p.id))
    const rank = new Map(order.map((id, i) => [id, i]))
    const missing = ids.filter((id) => !rank.has(id))
    if (missing.length > 0) {
      return failure('Algún producto ya no está visible en la web. Recarga la lista y vuelve a ordenar.', 'VALIDATION')
    }

    // Los productos ordenados se reparten los huecos que ya ocupaban, en el
    // nuevo orden. El resto de la boutique no se mueve.
    const slots = ids.map((id) => rank.get(id)!).sort((a, b) => a - b)
    slots.forEach((slot, k) => { order[slot] = ids[k] })
    const positions = order.map((_, i) => (i + 1) * 10)

    const { data, error } = await ctx.adminClient.rpc('rpc_set_products_web_sort_order', {
      p_ids: order,
      p_positions: positions,
    })
    if (error) return failure(error.message)

    revalidatePath('/boutique', 'layout')
    const where = categoryLabel ? ` en ${categoryLabel}` : ' en toda la boutique'
    return success({
      updated: Number(data) || 0,
      auditDescription: `Orden de la web: ${ids.length} productos reordenados${where}`,
    })
  }
)
