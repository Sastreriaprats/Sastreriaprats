'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { buildAuditDiff } from '@/lib/audit'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SeasonRow = {
  id: string
  name: string
  slug: string
  start_date: string | null
  end_date: string | null
  is_active: boolean
  sort_order: number
  description: string | null
  product_count: number
}

export type SeasonInput = {
  name: string
  slug?: string | null
  start_date?: string | null
  end_date?: string | null
  is_active?: boolean
  sort_order?: number | null
  description?: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function ensureUniqueSlug(adminClient: any, base: string, ignoreId?: string): Promise<string> {
  let slug = base
  let n = 2
  while (true) {
    let q = adminClient.from('seasons').select('id').eq('slug', slug)
    if (ignoreId) q = q.neq('id', ignoreId)
    const { data: clash } = await q.maybeSingle()
    if (!clash) return slug
    slug = `${base}-${n++}`
    if (n > 50) throw new Error('No se pudo generar un slug único')
  }
}

// ─── listSeasons ────────────────────────────────────────────────────────────

export const listSeasons = protectedAction<void, SeasonRow[]>(
  { permission: 'products.view', auditModule: 'config' },
  async (ctx) => {
    const { data: seasons, error } = await ctx.adminClient
      .from('seasons')
      .select('id, name, slug, start_date, end_date, is_active, sort_order, description')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) return failure(error.message)
    const list = (seasons ?? []) as Array<Record<string, unknown>>

    // Conteo de productos por slug
    const slugs = list.map((s) => String(s.slug ?? ''))
    const countBySlug = new Map<string, number>()
    if (slugs.length > 0) {
      const { data: prods } = await ctx.adminClient
        .from('products')
        .select('season')
        .in('season', slugs)
      for (const p of (prods ?? []) as Array<{ season: string | null }>) {
        if (!p.season) continue
        countBySlug.set(p.season, (countBySlug.get(p.season) ?? 0) + 1)
      }
    }

    const rows: SeasonRow[] = list.map((s) => ({
      id: String(s.id),
      name: String(s.name ?? ''),
      slug: String(s.slug ?? ''),
      start_date: (s.start_date as string) ?? null,
      end_date: (s.end_date as string) ?? null,
      is_active: s.is_active !== false,
      sort_order: Number(s.sort_order ?? 0),
      description: (s.description as string) ?? null,
      product_count: countBySlug.get(String(s.slug ?? '')) ?? 0,
    }))
    return success(rows)
  }
)

// ─── listActiveSeasonSlugs (uso interno desde el catálogo público) ──────────

/** Devuelve los slugs de temporadas que: están is_active=true y hoy cae
 *  dentro de [start_date, end_date] (si no tienen fechas, también cuentan). */
export async function listActiveSeasonSlugs(): Promise<string[]> {
  // Importación dinámica para no acoplar al wrapper de protectedAction
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await admin
    .from('seasons')
    .select('slug, start_date, end_date, is_active')
    .eq('is_active', true)
  const rows = (data ?? []) as Array<{ slug: string; start_date: string | null; end_date: string | null }>
  return rows
    .filter((r) => {
      if (r.start_date && r.start_date > today) return false
      if (r.end_date && r.end_date < today) return false
      return true
    })
    .map((r) => r.slug)
}

// ─── createSeasonAction ─────────────────────────────────────────────────────

export const createSeasonAction = protectedAction<SeasonInput, { id: string; name: string }>(
  {
    permission: 'config.manage_stores',
    auditModule: 'config',
    auditAction: 'create',
    auditEntity: 'season',
    revalidate: ['/admin/configuracion/temporadas'],
  },
  async (ctx, input) => {
    const name = input.name?.trim()
    if (!name) return failure('El nombre es obligatorio', 'VALIDATION')

    const baseSlug = (input.slug?.trim() || slugify(name)).slice(0, 80)
    if (!baseSlug) return failure('No se pudo generar slug', 'VALIDATION')

    let slug: string
    try {
      slug = await ensureUniqueSlug(ctx.adminClient, baseSlug)
    } catch (e) {
      return failure(e instanceof Error ? e.message : 'Error al validar slug', 'VALIDATION')
    }

    const { data: season, error } = await ctx.adminClient
      .from('seasons')
      .insert({
        name,
        slug,
        start_date: input.start_date || null,
        end_date: input.end_date || null,
        is_active: input.is_active !== false,
        sort_order: typeof input.sort_order === 'number' ? input.sort_order : 0,
        description: input.description?.trim() || null,
      })
      .select('id, name')
      .single()

    if (error || !season) return failure(error?.message ?? 'Error al crear la temporada')
    return success({
      id: String(season.id),
      name: String(season.name),
      auditDescription: `Temporada creada: ${name}`,
    } as any)
  }
)

// ─── updateSeasonAction ─────────────────────────────────────────────────────

export const updateSeasonAction = protectedAction<
  { id: string } & Partial<SeasonInput>,
  { id: string }
>(
  {
    permission: 'config.manage_stores',
    auditModule: 'config',
    auditAction: 'update',
    auditEntity: 'season',
    revalidate: ['/admin/configuracion/temporadas'],
  },
  async (ctx, { id, ...input }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')

    const { data: before } = await ctx.adminClient
      .from('seasons')
      .select('*')
      .eq('id', id)
      .single()
    if (!before) return failure('Temporada no encontrada', 'NOT_FOUND')

    const patch: Record<string, unknown> = {}

    if (input.name !== undefined) {
      const n = input.name.trim()
      if (!n) return failure('El nombre no puede quedar vacío', 'VALIDATION')
      patch.name = n
    }
    if (input.description !== undefined) patch.description = input.description?.trim() || null
    if (input.start_date !== undefined) patch.start_date = input.start_date || null
    if (input.end_date !== undefined) patch.end_date = input.end_date || null
    if (input.is_active !== undefined) patch.is_active = input.is_active
    if (input.sort_order !== undefined && input.sort_order !== null) patch.sort_order = Number(input.sort_order)

    if (input.slug !== undefined) {
      const base = (input.slug?.trim() || slugify(String(patch.name ?? (before as any).name))).slice(0, 80)
      if (!base) return failure('Slug inválido', 'VALIDATION')
      if (base !== (before as any).slug) {
        try {
          patch.slug = await ensureUniqueSlug(ctx.adminClient, base, id)
        } catch (e) {
          return failure(e instanceof Error ? e.message : 'Error al validar slug', 'VALIDATION')
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      return success({ id, auditDescription: `Temporada sin cambios: ${(before as any).name}` } as any)
    }

    const { data: after, error } = await ctx.adminClient
      .from('seasons')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) return failure(error.message)

    // Si el slug cambió, propagamos a products.season
    const oldSlug = (before as any).slug as string
    const newSlug = patch.slug as string | undefined
    if (newSlug && newSlug !== oldSlug) {
      await ctx.adminClient
        .from('products')
        .update({ season: newSlug })
        .eq('season', oldSlug)
    }

    const diff = buildAuditDiff(
      before as Record<string, unknown> | null,
      after as Record<string, unknown> | null,
    )
    return success({
      id,
      auditDescription: `Temporada: ${(after as any)?.name ?? id}`,
      auditOldData: diff?.auditOldData,
      auditNewData: diff?.auditNewData,
    } as any)
  }
)

// ─── toggleSeasonAction ─────────────────────────────────────────────────────

export const toggleSeasonAction = protectedAction<
  { id: string; is_active: boolean },
  { id: string; is_active: boolean }
>(
  {
    permission: 'config.manage_stores',
    auditModule: 'config',
    auditAction: 'state_change',
    auditEntity: 'season',
    revalidate: ['/admin/configuracion/temporadas'],
  },
  async (ctx, { id, is_active }) => {
    const { data: before } = await ctx.adminClient
      .from('seasons')
      .select('id, name, is_active')
      .eq('id', id)
      .single()
    if (!before) return failure('Temporada no encontrada', 'NOT_FOUND')

    const { error } = await ctx.adminClient
      .from('seasons')
      .update({ is_active })
      .eq('id', id)
    if (error) return failure(error.message)

    return success({
      id,
      is_active,
      auditDescription: `Temporada ${(before as any).name}: ${is_active ? 'activada' : 'desactivada'}`,
    } as any)
  }
)

// ─── deleteSeasonAction ─────────────────────────────────────────────────────

export const deleteSeasonAction = protectedAction<{ id: string }, { deleted: true }>(
  {
    permission: 'config.edit',
    auditModule: 'config',
    auditAction: 'delete',
    auditEntity: 'season',
    revalidate: ['/admin/configuracion/temporadas'],
  },
  async (ctx, { id }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')

    const { data: season } = await ctx.adminClient
      .from('seasons')
      .select('id, name, slug')
      .eq('id', id)
      .single()
    if (!season) return failure('Temporada no encontrada', 'NOT_FOUND')

    const { count: productsCount } = await ctx.adminClient
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('season', (season as any).slug)
    const products = productsCount ?? 0
    if (products > 0) {
      return failure(
        `No se puede eliminar: ${products} producto(s) tienen esta temporada asignada. Desactívala o reasigna los productos.`,
        'CONFLICT',
      )
    }

    const { error } = await ctx.adminClient
      .from('seasons')
      .delete()
      .eq('id', id)
    if (error) return failure(error.message)

    return success({
      deleted: true,
      auditDescription: `Temporada eliminada: ${(season as any).name}`,
    } as any)
  }
)
