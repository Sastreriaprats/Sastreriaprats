/**
 * Qué productos enseña el catálogo público. Lo comparten la API de la web
 * (/api/public/catalog) y la pantalla de Tienda Online → Orden en la web, para
 * que lo que se ordena sea exactamente lo que se ve.
 */

type AdminClient = { from: (table: string) => any }

/**
 * Slugs de temporada activos y dentro de fechas. Los productos sin temporada
 * (NULL o '') se muestran siempre.
 */
export async function getActiveSeasonSlugs(admin: AdminClient): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await admin
    .from('seasons')
    .select('slug, start_date, end_date')
    .eq('is_active', true)
  return ((data ?? []) as Array<{ slug: string; start_date: string | null; end_date: string | null }>)
    .filter((r) => (!r.start_date || r.start_date <= today) && (!r.end_date || r.end_date >= today))
    .map((r) => r.slug)
}

/** Filtro PostgREST `or` de temporada: sin temporada, o con un slug activo. */
export function seasonOrFilter(activeSeasonSlugs: string[]): string {
  const parts = ['season.is.null', 'season.eq.']
  for (const slug of activeSeasonSlugs) {
    // Escapar caracteres especiales del slug en el filtro PostgREST
    const safe = slug.replace(/[(),]/g, '')
    parts.push(`season.eq.${safe}`)
  }
  return parts.join(',')
}

/**
 * IDs de categoría que entran al filtrar por `slug`: la propia, su padre (si es
 * subcategoría, para que los productos asignados al padre también aparezcan al
 * filtrar por una de sus hijas), sus hijas y sus nietas. `null` = categoría
 * inexistente (sin filtro, como hacía la web).
 */
export async function resolveCatalogCategoryIds(admin: AdminClient, slug: string): Promise<string[] | null> {
  const { data: cat } = await admin
    .from('product_categories')
    .select('id, parent_id')
    .eq('slug', slug)
    .single()
  if (!cat) return null
  const ids: string[] = [cat.id]
  if (cat.parent_id) ids.push(cat.parent_id)
  const { data: children } = await admin
    .from('product_categories')
    .select('id')
    .eq('parent_id', cat.id)
  if (children && children.length > 0) {
    const childIds = (children as Array<{ id: string }>).map((c) => c.id)
    ids.push(...childIds)
    const { data: grandchildren } = await admin
      .from('product_categories')
      .select('id')
      .in('parent_id', childIds)
    if (grandchildren) ids.push(...(grandchildren as Array<{ id: string }>).map((c) => c.id))
  }
  return ids
}
