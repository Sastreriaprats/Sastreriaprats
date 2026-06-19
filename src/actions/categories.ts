'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { buildAuditDiff } from '@/lib/audit'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ProductCategoryRow = {
  id: string
  name: string
  slug: string
  description: string | null
  parent_id: string | null
  level: number
  path: string | null
  product_type: string | null
  is_visible_web: boolean
  is_active: boolean
  sort_order: number
  image_url: string | null
  product_count: number
  parent_name: string | null
}

export type CategoryInput = {
  name: string
  slug?: string | null
  parent_id?: string | null
  product_type?: string | null
  is_visible_web?: boolean
  sort_order?: number | null
  description?: string | null
  image_url?: string | null
}

const VALID_PRODUCT_TYPES = ['boutique', 'tailoring_fabric', 'accessory', 'service'] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function computePathAndLevel(
  adminClient: any,
  parentId: string | null | undefined,
  slug: string,
): Promise<{ level: number; path: string }> {
  if (!parentId) return { level: 0, path: `/${slug}` }
  const { data: parent } = await adminClient
    .from('product_categories')
    .select('id, level, path')
    .eq('id', parentId)
    .maybeSingle()
  if (!parent) return { level: 0, path: `/${slug}` }
  const parentLevel = Number(parent.level ?? 0)
  const parentPath = (parent.path ?? `/${parent.id}`).replace(/\/+$/, '')
  return { level: parentLevel + 1, path: `${parentPath}/${slug}` }
}

// ─── listCategories ─────────────────────────────────────────────────────────

export const listCategories = protectedAction<void, ProductCategoryRow[]>(
  { permission: 'products.view', auditModule: 'config' },
  async (ctx) => {
    const { data: cats, error } = await ctx.adminClient
      .from('product_categories')
      .select('id, name, slug, description, parent_id, level, path, product_type, is_visible_web, is_active, sort_order, image_url')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) return failure(error.message)
    const list = (cats ?? []) as Array<Record<string, unknown>>

    // Conteo de productos por categoría (una sola query agrupada manualmente).
    const ids = list.map((c) => String(c.id))
    const productCountByCat = new Map<string, number>()
    if (ids.length > 0) {
      const { data: prods } = await ctx.adminClient
        .from('products')
        .select('category_id')
        .in('category_id', ids)
      for (const p of (prods ?? []) as Array<{ category_id: string | null }>) {
        if (!p.category_id) continue
        productCountByCat.set(p.category_id, (productCountByCat.get(p.category_id) ?? 0) + 1)
      }
    }

    const nameById = new Map<string, string>()
    for (const c of list) nameById.set(String(c.id), String(c.name ?? ''))

    const rows: ProductCategoryRow[] = list.map((c) => ({
      id: String(c.id),
      name: String(c.name ?? ''),
      slug: String(c.slug ?? ''),
      description: (c.description as string) ?? null,
      parent_id: (c.parent_id as string) ?? null,
      level: Number(c.level ?? 0),
      path: (c.path as string) ?? null,
      product_type: (c.product_type as string) ?? null,
      is_visible_web: c.is_visible_web !== false,
      is_active: c.is_active !== false,
      sort_order: Number(c.sort_order ?? 0),
      image_url: (c.image_url as string) ?? null,
      product_count: productCountByCat.get(String(c.id)) ?? 0,
      parent_name: c.parent_id ? nameById.get(String(c.parent_id)) ?? null : null,
    }))

    return success(rows)
  }
)

// ─── createCategoryAction ───────────────────────────────────────────────────

export const createCategoryAction = protectedAction<CategoryInput, { id: string; name: string }>(
  {
    permission: 'config.edit',
    auditModule: 'config',
    auditAction: 'create',
    auditEntity: 'product_category',
    revalidate: ['/admin/configuracion/categorias'],
  },
  async (ctx, input) => {
    const name = input.name?.trim()
    if (!name) return failure('El nombre es obligatorio', 'VALIDATION')

    let slug = (input.slug?.trim() || slugify(name)).slice(0, 80)
    if (!slug) return failure('No se pudo generar slug', 'VALIDATION')

    if (input.product_type && !VALID_PRODUCT_TYPES.includes(input.product_type as any)) {
      return failure('Tipo de producto inválido', 'VALIDATION')
    }

    // Asegurar slug único: si existe, añadir sufijo numérico.
    const baseSlug = slug
    let n = 2
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: clash } = await ctx.adminClient
        .from('product_categories')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (!clash) break
      slug = `${baseSlug}-${n++}`
      if (n > 50) return failure('Demasiados intentos generando slug', 'VALIDATION')
    }

    const { level, path } = await computePathAndLevel(ctx.adminClient, input.parent_id ?? null, slug)

    const { data: cat, error } = await ctx.adminClient
      .from('product_categories')
      .insert({
        name,
        slug,
        description: input.description?.trim() || null,
        parent_id: input.parent_id || null,
        level,
        path,
        product_type: input.product_type || null,
        is_visible_web: input.is_visible_web !== false,
        sort_order: typeof input.sort_order === 'number' ? input.sort_order : 0,
        image_url: input.image_url?.trim() || null,
      })
      .select('id, name')
      .single()

    if (error || !cat) return failure(error?.message ?? 'Error al crear la categoría')

    return success({
      id: String(cat.id),
      name: String(cat.name),
      auditDescription: `Categoría creada: ${name}`,
    } as any)
  }
)

// ─── updateCategoryAction ───────────────────────────────────────────────────

export const updateCategoryAction = protectedAction<
  { id: string } & Partial<CategoryInput>,
  { id: string }
>(
  {
    permission: 'config.edit',
    auditModule: 'config',
    auditAction: 'update',
    auditEntity: 'product_category',
    revalidate: ['/admin/configuracion/categorias'],
  },
  async (ctx, { id, ...input }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')

    const { data: before } = await ctx.adminClient
      .from('product_categories')
      .select('*')
      .eq('id', id)
      .single()
    if (!before) return failure('Categoría no encontrada', 'NOT_FOUND')

    if (input.product_type && !VALID_PRODUCT_TYPES.includes(input.product_type as any)) {
      return failure('Tipo de producto inválido', 'VALIDATION')
    }

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) {
      const n = input.name.trim()
      if (!n) return failure('El nombre no puede quedar vacío', 'VALIDATION')
      patch.name = n
    }
    if (input.description !== undefined) patch.description = input.description?.trim() || null
    if (input.product_type !== undefined) patch.product_type = input.product_type || null
    if (input.is_visible_web !== undefined) patch.is_visible_web = input.is_visible_web
    if (input.sort_order !== undefined && input.sort_order !== null) patch.sort_order = Number(input.sort_order)
    if (input.image_url !== undefined) patch.image_url = input.image_url?.trim() || null

    let nextSlug = (before as any).slug as string
    if (input.slug !== undefined) {
      const s = (input.slug?.trim() || slugify(String(patch.name ?? (before as any).name))).slice(0, 80)
      if (!s) return failure('Slug inválido', 'VALIDATION')
      if (s !== nextSlug) {
        const { data: clash } = await ctx.adminClient
          .from('product_categories')
          .select('id')
          .eq('slug', s)
          .neq('id', id)
          .maybeSingle()
        if (clash) return failure('Ya existe una categoría con ese slug', 'VALIDATION')
        patch.slug = s
        nextSlug = s
      }
    }

    // Si cambian parent_id o slug, recalcular path/level
    const parentChanged = input.parent_id !== undefined && input.parent_id !== (before as any).parent_id
    const slugChanged = patch.slug !== undefined
    if (parentChanged) {
      if (input.parent_id === id) return failure('Una categoría no puede ser su propio padre', 'VALIDATION')
      patch.parent_id = input.parent_id || null
    }
    if (parentChanged || slugChanged) {
      const parentForCalc = parentChanged ? (input.parent_id ?? null) : (before as any).parent_id
      const { level, path } = await computePathAndLevel(ctx.adminClient, parentForCalc, nextSlug)
      patch.level = level
      patch.path = path
    }

    if (Object.keys(patch).length === 0) {
      return success({ id, auditDescription: `Categoría sin cambios: ${(before as any).name}` } as any)
    }

    const { data: after, error } = await ctx.adminClient
      .from('product_categories')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) return failure(error.message)

    const diff = buildAuditDiff(
      before as Record<string, unknown> | null,
      after as Record<string, unknown> | null,
    )
    return success({
      id,
      auditDescription: `Categoría: ${(after as any)?.name ?? id}`,
      auditOldData: diff?.auditOldData,
      auditNewData: diff?.auditNewData,
    } as any)
  }
)

// ─── deleteCategoryAction ───────────────────────────────────────────────────

export const deleteCategoryAction = protectedAction<{ id: string }, { deleted: true }>(
  {
    permission: 'config.edit',
    auditModule: 'config',
    auditAction: 'delete',
    auditEntity: 'product_category',
    revalidate: ['/admin/configuracion/categorias'],
  },
  async (ctx, { id }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')

    const { data: cat } = await ctx.adminClient
      .from('product_categories')
      .select('id, name')
      .eq('id', id)
      .single()
    if (!cat) return failure('Categoría no encontrada', 'NOT_FOUND')

    const [{ count: productsCount }, { count: childrenCount }] = await Promise.all([
      ctx.adminClient
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', id),
      ctx.adminClient
        .from('product_categories')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', id),
    ])

    const products = productsCount ?? 0
    const children = childrenCount ?? 0
    if (products > 0 || children > 0) {
      const parts: string[] = []
      if (products > 0) parts.push(`${products} producto${products !== 1 ? 's' : ''}`)
      if (children > 0) parts.push(`${children} subcategoría${children !== 1 ? 's' : ''}`)
      return failure(`No se puede eliminar: tiene ${parts.join(' y ')} asignada(s).`, 'CONFLICT')
    }

    const { error } = await ctx.adminClient
      .from('product_categories')
      .delete()
      .eq('id', id)
    if (error) return failure(error.message)

    return success({
      deleted: true,
      auditDescription: `Categoría eliminada: ${(cat as any).name}`,
    } as any)
  }
)

// ─── moveCategorySortOrder ──────────────────────────────────────────────────

export const moveCategorySortOrderAction = protectedAction<
  { id: string; direction: 'up' | 'down' },
  { id: string }
>(
  {
    permission: 'config.edit',
    auditModule: 'config',
    auditAction: 'update',
    auditEntity: 'product_category',
    revalidate: ['/admin/configuracion/categorias'],
  },
  async (ctx, { id, direction }) => {
    const { data: cat } = await ctx.adminClient
      .from('product_categories')
      .select('id, parent_id, sort_order')
      .eq('id', id)
      .single()
    if (!cat) return failure('Categoría no encontrada', 'NOT_FOUND')

    let siblingsQ = ctx.adminClient
      .from('product_categories')
      .select('id, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if ((cat as any).parent_id) {
      siblingsQ = siblingsQ.eq('parent_id', (cat as any).parent_id)
    } else {
      siblingsQ = siblingsQ.is('parent_id', null)
    }

    const { data: siblings } = await siblingsQ
    const ordered = (siblings ?? []) as Array<{ id: string; sort_order: number | null }>
    const idx = ordered.findIndex((s) => s.id === id)
    if (idx === -1) return failure('Categoría no encontrada en su nivel', 'INTERNAL')
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= ordered.length) return success({ id })

    const a = ordered[idx]
    const b = ordered[swapIdx]
    const aOrder = Number(a.sort_order ?? idx)
    const bOrder = Number(b.sort_order ?? swapIdx)
    // Si tenían el mismo sort_order, asignamos diferenciados.
    const newA = bOrder
    const newB = aOrder === bOrder ? aOrder + (direction === 'up' ? 1 : -1) : aOrder

    await ctx.adminClient.from('product_categories').update({ sort_order: newA }).eq('id', a.id)
    await ctx.adminClient.from('product_categories').update({ sort_order: newB }).eq('id', b.id)

    return success({ id })
  }
)
