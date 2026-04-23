'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

export type SizeGuideColumn = { key: string; label: string }
export type SizeGuideRow = Record<string, string>

export interface SizeGuideItem {
  id: string
  name: string
  slug: string
  description: string | null
  columns: SizeGuideColumn[]
  rows: SizeGuideRow[]
  footer_note: string | null
  is_active: boolean
  category_count: number
  product_count: number
  created_at: string
  updated_at: string
}

export interface SizeGuideListItem {
  id: string
  name: string
  slug: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function normalizeColumns(raw: unknown): SizeGuideColumn[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: SizeGuideColumn[] = []
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue
    const label = String((c as any).label ?? '').trim()
    if (!label) continue
    let key = String((c as any).key ?? '').trim()
    if (!key) key = slugify(label).replace(/-/g, '_')
    if (!key) continue
    let unique = key
    let i = 2
    while (seen.has(unique)) unique = `${key}_${i++}`
    seen.add(unique)
    out.push({ key: unique, label })
  }
  return out
}

function normalizeRows(raw: unknown, columns: SizeGuideColumn[]): SizeGuideRow[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r) => {
      if (!r || typeof r !== 'object') return null
      const row: SizeGuideRow = {}
      for (const col of columns) {
        const v = (r as any)[col.key]
        row[col.key] = v == null ? '' : String(v)
      }
      return row
    })
    .filter((r): r is SizeGuideRow => r !== null)
}

// ---------------------------------------------------------------------------
// Listado para admin (con conteo de categorías/productos asociados)
// ---------------------------------------------------------------------------
export const listSizeGuidesAdmin = protectedAction<void, SizeGuideItem[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx) => {
    const { data: rows, error } = await ctx.adminClient
      .from('size_guides')
      .select('id, name, slug, description, columns, rows, footer_note, is_active, created_at, updated_at')
      .order('name', { ascending: true })
    if (error) return failure(error.message)

    const ids = (rows ?? []).map((r: any) => r.id as string)
    const catCounts = new Map<string, number>()
    const prodCounts = new Map<string, number>()
    if (ids.length > 0) {
      const { data: cats } = await ctx.adminClient
        .from('product_categories')
        .select('size_guide_id')
        .in('size_guide_id', ids)
      for (const c of cats ?? []) {
        const id = (c as any).size_guide_id as string
        catCounts.set(id, (catCounts.get(id) ?? 0) + 1)
      }
      const { data: prods } = await ctx.adminClient
        .from('products')
        .select('size_guide_id')
        .in('size_guide_id', ids)
      for (const p of prods ?? []) {
        const id = (p as any).size_guide_id as string
        prodCounts.set(id, (prodCounts.get(id) ?? 0) + 1)
      }
    }

    return success(
      (rows ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        columns: normalizeColumns(r.columns),
        rows: normalizeRows(r.rows, normalizeColumns(r.columns)),
        footer_note: r.footer_note,
        is_active: r.is_active,
        category_count: catCounts.get(r.id) ?? 0,
        product_count: prodCounts.get(r.id) ?? 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    )
  },
)

// ---------------------------------------------------------------------------
// Listado ligero para poblar selects (form de producto)
// ---------------------------------------------------------------------------
export const listSizeGuideOptions = protectedAction<void, SizeGuideListItem[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('size_guides')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (error) return failure(error.message)
    return success((data ?? []) as SizeGuideListItem[])
  },
)

// ---------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------
export const createSizeGuide = protectedAction<
  {
    name: string
    description?: string | null
    footer_note?: string | null
    columns?: SizeGuideColumn[]
    rows?: SizeGuideRow[]
  },
  { id: string; name: string; slug: string }
>(
  {
    permission: 'products.create',
    auditModule: 'stock',
    auditAction: 'create',
    auditEntity: 'size_guide',
    revalidate: ['/admin/configuracion', '/admin/stock'],
  },
  async (ctx, input) => {
    const name = String(input?.name ?? '').trim()
    if (!name) return failure('El nombre es obligatorio', 'VALIDATION')

    const columns = normalizeColumns(input.columns)
    const rows = normalizeRows(input.rows, columns)

    // Generar slug único
    let baseSlug = slugify(name) || 'guia'
    let slug = baseSlug
    let i = 2
    while (true) {
      const { data: exists } = await ctx.adminClient
        .from('size_guides').select('id').eq('slug', slug).maybeSingle()
      if (!exists) break
      slug = `${baseSlug}-${i++}`
    }

    const { data, error } = await ctx.adminClient
      .from('size_guides')
      .insert({
        name,
        slug,
        description: input.description ?? null,
        footer_note: input.footer_note ?? null,
        columns,
        rows,
      })
      .select('id, name, slug')
      .single()
    if (error) return failure(error.message)
    return success({
      id: (data as any).id,
      name: (data as any).name,
      slug: (data as any).slug,
      auditDescription: `Guía de tallas creada: ${name}`,
      auditNewData: data,
    } as any)
  },
)

// ---------------------------------------------------------------------------
// Actualizar
// ---------------------------------------------------------------------------
export const updateSizeGuide = protectedAction<
  {
    id: string
    name?: string
    description?: string | null
    footer_note?: string | null
    columns?: SizeGuideColumn[]
    rows?: SizeGuideRow[]
    is_active?: boolean
  },
  { id: string; name: string }
>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'size_guide',
    revalidate: ['/admin/configuracion', '/admin/stock'],
  },
  async (ctx, { id, ...patch }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')

    const update: Record<string, unknown> = {}
    if (patch.name !== undefined) {
      const name = String(patch.name).trim()
      if (!name) return failure('El nombre no puede estar vacío', 'VALIDATION')
      update.name = name
    }
    if (patch.description !== undefined) update.description = patch.description ?? null
    if (patch.footer_note !== undefined) update.footer_note = patch.footer_note ?? null
    if (patch.is_active !== undefined) update.is_active = !!patch.is_active
    if (patch.columns !== undefined) {
      const columns = normalizeColumns(patch.columns)
      update.columns = columns
      if (patch.rows !== undefined) update.rows = normalizeRows(patch.rows, columns)
    } else if (patch.rows !== undefined) {
      // Si solo se envían filas, reusar las columnas existentes
      const { data: current } = await ctx.adminClient
        .from('size_guides').select('columns').eq('id', id).single()
      const columns = normalizeColumns((current as any)?.columns)
      update.rows = normalizeRows(patch.rows, columns)
    }

    const { data: before } = await ctx.adminClient
      .from('size_guides').select('*').eq('id', id).single()

    const { data, error } = await ctx.adminClient
      .from('size_guides').update(update).eq('id', id)
      .select('id, name').single()
    if (error) return failure(error.message)
    return success({
      id: (data as any).id,
      name: (data as any).name,
      auditDescription: `Guía de tallas actualizada: ${(data as any).name}`,
      auditOldData: before,
      auditNewData: data,
    } as any)
  },
)

// ---------------------------------------------------------------------------
// Eliminar
// ---------------------------------------------------------------------------
export const deleteSizeGuide = protectedAction<string, { id: string }>(
  {
    permission: 'products.delete',
    auditModule: 'stock',
    auditAction: 'delete',
    auditEntity: 'size_guide',
    revalidate: ['/admin/configuracion', '/admin/stock'],
  },
  async (ctx, id) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    const { data: before } = await ctx.adminClient
      .from('size_guides').select('*').eq('id', id).single()
    const { error } = await ctx.adminClient
      .from('size_guides').delete().eq('id', id)
    if (error) return failure(error.message)
    return success({
      id,
      auditDescription: `Guía de tallas eliminada: ${(before as any)?.name ?? id}`,
      auditOldData: before,
    } as any)
  },
)

// ---------------------------------------------------------------------------
// Categorías asignables (para el diálogo "Asignar a categorías")
// ---------------------------------------------------------------------------
export const listCategoriesForSizeGuide = protectedAction<
  string,
  { id: string; name: string; slug: string; assigned: boolean; current_guide_id: string | null }[]
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, sizeGuideId) => {
    if (!sizeGuideId) return failure('ID requerido', 'VALIDATION')
    const { data, error } = await ctx.adminClient
      .from('product_categories')
      .select('id, name, slug, size_guide_id')
      .order('name', { ascending: true })
    if (error) return failure(error.message)
    return success(
      (data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        current_guide_id: c.size_guide_id ?? null,
        assigned: c.size_guide_id === sizeGuideId,
      })),
    )
  },
)

/** Asigna en bulk la guía a un conjunto de categorías. A las que la tenían y ya
 *  no están en la selección se les limpia el campo. */
export const setSizeGuideCategories = protectedAction<
  { id: string; categoryIds: string[] },
  { assigned: number; unassigned: number }
>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'size_guide',
    revalidate: ['/admin/configuracion', '/admin/stock'],
  },
  async (ctx, { id, categoryIds }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    if (!Array.isArray(categoryIds)) return failure('categoryIds inválido', 'VALIDATION')

    let assigned = 0
    if (categoryIds.length > 0) {
      const { error: updErr, count } = await ctx.adminClient
        .from('product_categories')
        .update({ size_guide_id: id }, { count: 'exact' })
        .in('id', categoryIds)
      if (updErr) return failure(updErr.message)
      assigned = count ?? categoryIds.length
    }

    let desQ = ctx.adminClient
      .from('product_categories')
      .update({ size_guide_id: null }, { count: 'exact' })
      .eq('size_guide_id', id)
    if (categoryIds.length > 0) {
      desQ = desQ.not('id', 'in', `(${categoryIds.map(x => `"${x}"`).join(',')})`)
    }
    const { error: delErr, count: unassignedCount } = await desQ
    if (delErr) return failure(delErr.message)

    return success({
      assigned,
      unassigned: unassignedCount ?? 0,
      auditDescription: `Guía de tallas ${id}: ${assigned} categorías asignadas, ${unassignedCount ?? 0} desasignadas`,
      auditNewData: { id, categoryIds },
    } as any)
  },
)
