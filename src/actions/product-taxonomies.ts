'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

export interface TaxonomyItem {
  id: string
  name: string
  description: string | null
  is_active: boolean
  product_count: number
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Colecciones
// ---------------------------------------------------------------------------

/** Listado de colecciones con nº de productos asociados. Panel admin. */
export const listCollectionsAdmin = protectedAction<void, TaxonomyItem[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx) => {
    const { data: rows, error } = await ctx.adminClient
      .from('product_collections')
      .select('id, name, description, is_active, created_at, updated_at')
      .order('name', { ascending: true })
    if (error) return failure(error.message)

    const names = (rows ?? []).map((r: any) => r.name as string)
    const counts = new Map<string, number>()
    if (names.length > 0) {
      const { data: prodRows } = await ctx.adminClient
        .from('products')
        .select('collection')
        .in('collection', names)
      for (const p of prodRows ?? []) {
        const name = (p as any).collection as string
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }

    return success(
      (rows ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        is_active: r.is_active,
        product_count: counts.get(r.name) ?? 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    )
  },
)

/** Listado ligero para poblar selects en el formulario de producto. */
export const listCollectionNames = protectedAction<void, { id: string; name: string }[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('product_collections')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (error) return failure(error.message)
    return success((data ?? []) as { id: string; name: string }[])
  },
)

export const createCollection = protectedAction<
  { name: string; description?: string | null },
  { id: string; name: string }
>(
  {
    permission: 'products.create',
    auditModule: 'stock',
    auditAction: 'create',
    auditEntity: 'product_collection',
    revalidate: ['/admin/configuracion', '/admin/stock'],
  },
  async (ctx, input) => {
    const name = String(input?.name ?? '').trim()
    if (!name) return failure('El nombre es obligatorio', 'VALIDATION')

    const { data: existing } = await ctx.adminClient
      .from('product_collections').select('id').eq('name', name).maybeSingle()
    if (existing) return failure('Ya existe una colección con ese nombre', 'CONFLICT')

    const { data, error } = await ctx.adminClient
      .from('product_collections')
      .insert({ name, description: input.description ?? null })
      .select('id, name')
      .single()
    if (error) return failure(error.message)
    return success({
      id: (data as any).id,
      name: (data as any).name,
      auditDescription: `Colección creada: ${name}`,
      auditNewData: data,
    } as any)
  },
)

export const updateCollection = protectedAction<
  { id: string; name?: string; description?: string | null; is_active?: boolean },
  { id: string; name: string }
>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'product_collection',
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
    if (patch.is_active !== undefined) update.is_active = !!patch.is_active

    const { data: before } = await ctx.adminClient
      .from('product_collections').select('*').eq('id', id).single()

    const { data, error } = await ctx.adminClient
      .from('product_collections').update(update).eq('id', id).select('id, name').single()
    if (error) return failure(error.message)
    return success({
      id: (data as any).id,
      name: (data as any).name,
      auditDescription: `Colección actualizada: ${(data as any).name}`,
      auditOldData: before,
      auditNewData: data,
    } as any)
  },
)

export const deleteCollection = protectedAction<string, { id: string }>(
  {
    permission: 'products.delete',
    auditModule: 'stock',
    auditAction: 'delete',
    auditEntity: 'product_collection',
    revalidate: ['/admin/configuracion', '/admin/stock'],
  },
  async (ctx, id) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    const { data: before } = await ctx.adminClient
      .from('product_collections').select('*').eq('id', id).single()
    const { error } = await ctx.adminClient
      .from('product_collections').delete().eq('id', id)
    if (error) return failure(error.message)
    return success({
      id,
      auditDescription: `Colección eliminada: ${(before as any)?.name ?? id}`,
      auditOldData: before,
    } as any)
  },
)

/** Devuelve la lista de productos (con flag si pertenecen a esta colección).
 *  Usado por el diálogo "Asignar productos a colección". */
export const listProductsForTaxonomy = protectedAction<
  { taxonomy: 'collection' | 'season'; id: string; search?: string | null },
  { id: string; name: string; sku: string; brand: string | null; assigned: boolean }[]
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, { taxonomy, id, search }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    const tableName = taxonomy === 'collection' ? 'product_collections' : 'product_seasons'
    const column = taxonomy === 'collection' ? 'collection' : 'season'

    const { data: tax, error: taxErr } = await ctx.adminClient
      .from(tableName).select('name').eq('id', id).single()
    if (taxErr || !tax) return failure('Registro no encontrado', 'NOT_FOUND')
    const taxName = (tax as any).name as string

    let q = ctx.adminClient
      .from('products')
      .select(`id, name, sku, brand, ${column}`)
      .neq('product_type', 'tailoring_fabric')
      .order('name', { ascending: true })
      .limit(5000)
    if (search && search.trim()) {
      const s = search.trim().replace(/[%_\\]/g, '\\$&')
      const like = `%${s}%`
      q = q.or(`sku.ilike.${like},name.ilike.${like},brand.ilike.${like}`)
    }
    const { data, error } = await q
    if (error) return failure(error.message)

    return success(
      (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        brand: p.brand,
        assigned: p[column] === taxName,
      })),
    )
  },
)

/** Asigna en bulk la colección/temporada a un conjunto de productos.
 *  A los que estaban asignados y ya no lo están se les pone a NULL. */
export const setTaxonomyProducts = protectedAction<
  { taxonomy: 'collection' | 'season'; id: string; productIds: string[] },
  { assigned: number; unassigned: number }
>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'product_collection',
    revalidate: ['/admin/configuracion', '/admin/stock'],
  },
  async (ctx, { taxonomy, id, productIds }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    if (!Array.isArray(productIds)) return failure('productIds inválido', 'VALIDATION')

    const tableName = taxonomy === 'collection' ? 'product_collections' : 'product_seasons'
    const column = taxonomy === 'collection' ? 'collection' : 'season'

    const { data: tax, error: taxErr } = await ctx.adminClient
      .from(tableName).select('name').eq('id', id).single()
    if (taxErr || !tax) return failure('Registro no encontrado', 'NOT_FOUND')
    const taxName = (tax as any).name as string

    // Asignar los seleccionados
    let assigned = 0
    if (productIds.length > 0) {
      const { error: updErr, count } = await ctx.adminClient
        .from('products')
        .update({ [column]: taxName }, { count: 'exact' })
        .in('id', productIds)
      if (updErr) return failure(updErr.message)
      assigned = count ?? productIds.length
    }

    // Desasignar los que estaban y ya no están
    let desasignQ = ctx.adminClient
      .from('products')
      .update({ [column]: null }, { count: 'exact' })
      .eq(column, taxName)
    if (productIds.length > 0) {
      desasignQ = desasignQ.not('id', 'in', `(${productIds.map(x => `"${x}"`).join(',')})`)
    }
    const { error: delErr, count: unassignedCount } = await desasignQ
    if (delErr) return failure(delErr.message)

    return success({
      assigned,
      unassigned: unassignedCount ?? 0,
      auditDescription: `${taxonomy === 'collection' ? 'Colección' : 'Temporada'} "${taxName}": ${assigned} asignados, ${unassignedCount ?? 0} desasignados`,
      auditNewData: { taxonomy, id, productIds },
    } as any)
  },
)

// ---------------------------------------------------------------------------
// Temporadas (mismo patrón, tabla distinta)
// ---------------------------------------------------------------------------

export const listSeasonsAdmin = protectedAction<void, TaxonomyItem[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx) => {
    const { data: rows, error } = await ctx.adminClient
      .from('product_seasons')
      .select('id, name, description, is_active, created_at, updated_at')
      .order('name', { ascending: true })
    if (error) return failure(error.message)

    const names = (rows ?? []).map((r: any) => r.name as string)
    const counts = new Map<string, number>()
    if (names.length > 0) {
      const { data: prodRows } = await ctx.adminClient
        .from('products')
        .select('season')
        .in('season', names)
      for (const p of prodRows ?? []) {
        const name = (p as any).season as string
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }

    return success(
      (rows ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        is_active: r.is_active,
        product_count: counts.get(r.name) ?? 0,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    )
  },
)

export const listSeasonNames = protectedAction<void, { id: string; name: string }[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('product_seasons')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (error) return failure(error.message)
    return success((data ?? []) as { id: string; name: string }[])
  },
)

export const createSeason = protectedAction<
  { name: string; description?: string | null },
  { id: string; name: string }
>(
  {
    permission: 'products.create',
    auditModule: 'stock',
    auditAction: 'create',
    auditEntity: 'product_season',
    revalidate: ['/admin/configuracion', '/admin/stock'],
  },
  async (ctx, input) => {
    const name = String(input?.name ?? '').trim()
    if (!name) return failure('El nombre es obligatorio', 'VALIDATION')

    const { data: existing } = await ctx.adminClient
      .from('product_seasons').select('id').eq('name', name).maybeSingle()
    if (existing) return failure('Ya existe una temporada con ese nombre', 'CONFLICT')

    const { data, error } = await ctx.adminClient
      .from('product_seasons')
      .insert({ name, description: input.description ?? null })
      .select('id, name')
      .single()
    if (error) return failure(error.message)
    return success({
      id: (data as any).id,
      name: (data as any).name,
      auditDescription: `Temporada creada: ${name}`,
      auditNewData: data,
    } as any)
  },
)

export const updateSeason = protectedAction<
  { id: string; name?: string; description?: string | null; is_active?: boolean },
  { id: string; name: string }
>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'product_season',
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
    if (patch.is_active !== undefined) update.is_active = !!patch.is_active

    const { data: before } = await ctx.adminClient
      .from('product_seasons').select('*').eq('id', id).single()

    const { data, error } = await ctx.adminClient
      .from('product_seasons').update(update).eq('id', id).select('id, name').single()
    if (error) return failure(error.message)
    return success({
      id: (data as any).id,
      name: (data as any).name,
      auditDescription: `Temporada actualizada: ${(data as any).name}`,
      auditOldData: before,
      auditNewData: data,
    } as any)
  },
)

export const deleteSeason = protectedAction<string, { id: string }>(
  {
    permission: 'products.delete',
    auditModule: 'stock',
    auditAction: 'delete',
    auditEntity: 'product_season',
    revalidate: ['/admin/configuracion', '/admin/stock'],
  },
  async (ctx, id) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    const { data: before } = await ctx.adminClient
      .from('product_seasons').select('*').eq('id', id).single()
    const { error } = await ctx.adminClient
      .from('product_seasons').delete().eq('id', id)
    if (error) return failure(error.message)
    return success({
      id,
      auditDescription: `Temporada eliminada: ${(before as any)?.name ?? id}`,
      auditOldData: before,
    } as any)
  },
)
