'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

/**
 * Categorías de cliente editables (mig 285). `clients.category` guarda el
 * `code`, que se genera al crear y no cambia nunca: renombrar toca solo `name`,
 * así ningún cliente pierde su categoría.
 *
 * 'standard' y 'vip' son de sistema: el alta usa 'standard' por defecto y la
 * newsletter tiene un segmento fijo 'vip'. Se pueden renombrar, pero no borrar
 * (ni desactivar 'standard', que es la categoría por defecto).
 */

export type ClientCategoryAdmin = {
  id: string
  code: string
  name: string
  sort_order: number
  is_active: boolean
  clients_count: number
  is_system: boolean
}

const SYSTEM_CODES = new Set(['standard', 'vip'])

function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export const listClientCategoriesAdmin = protectedAction<void, ClientCategoryAdmin[]>(
  { permission: 'clients.view', auditModule: 'clients' },
  async (ctx) => {
    const { data: rows, error } = await ctx.adminClient
      .from('client_categories')
      .select('id, code, name, sort_order, is_active')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) return failure(error.message)

    // Conteo por categoría con count exacto (evita el tope de 1000 filas).
    const counts = await Promise.all((rows ?? []).map(async (r: any) => {
      const { count } = await ctx.adminClient
        .from('clients').select('id', { count: 'exact', head: true }).eq('category', r.code)
      return [r.code as string, count ?? 0] as const
    }))
    const countByCode = new Map(counts)

    return success((rows ?? []).map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      sort_order: r.sort_order,
      is_active: r.is_active,
      clients_count: countByCode.get(r.code) ?? 0,
      is_system: SYSTEM_CODES.has(r.code),
    })))
  }
)

export const createClientCategory = protectedAction<{ name: string }, { id: string; code: string }>(
  {
    permission: 'clients.edit',
    auditModule: 'clients',
    auditAction: 'create',
    auditEntity: 'client_category',
    revalidate: ['/admin/configuracion', '/admin/clientes'],
  },
  async (ctx, input) => {
    const name = String(input?.name ?? '').trim()
    if (!name) return failure('El nombre es obligatorio', 'VALIDATION')
    if (name.length > 60) return failure('El nombre es demasiado largo (máximo 60 caracteres)', 'VALIDATION')

    const { data: sameName } = await ctx.adminClient
      .from('client_categories').select('id').ilike('name', name).maybeSingle()
    if (sameName) return failure('Ya existe una categoría con ese nombre', 'CONFLICT')

    const base = slugifyCategory(name)
    if (!base) return failure('El nombre necesita al menos una letra o número', 'VALIDATION')
    // Code único: si ya existe (p. ej. se borró y se vuelve a crear con otro
    // nombre que da el mismo slug), se añade sufijo.
    let code = base
    for (let i = 2; i < 50; i++) {
      const { data: taken } = await ctx.adminClient
        .from('client_categories').select('id').eq('code', code).maybeSingle()
      if (!taken) break
      code = `${base}_${i}`
    }

    const { data: last } = await ctx.adminClient
      .from('client_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1)
    const sortOrder = ((last?.[0] as any)?.sort_order ?? 0) + 1

    const { data, error } = await ctx.adminClient
      .from('client_categories')
      .insert({ code, name, sort_order: sortOrder, is_active: true })
      .select('id, code')
      .single()
    if (error || !data) return failure(error?.message ?? 'No se pudo crear la categoría')

    return success({
      id: (data as any).id,
      code: (data as any).code,
      auditEntityId: (data as any).id,
      auditDescription: `Categoría de cliente creada: ${name}`,
    } as { id: string; code: string })
  }
)

export const updateClientCategory = protectedAction<
  { id: string; name?: string; is_active?: boolean; sort_order?: number },
  { id: string }
>(
  {
    permission: 'clients.edit',
    auditModule: 'clients',
    auditAction: 'update',
    auditEntity: 'client_category',
    revalidate: ['/admin/configuracion', '/admin/clientes'],
  },
  async (ctx, { id, ...patch }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    const { data: before } = await ctx.adminClient
      .from('client_categories').select('id, code, name, is_active').eq('id', id).single()
    if (!before) return failure('Categoría no encontrada', 'NOT_FOUND')

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.name !== undefined) {
      const name = String(patch.name).trim()
      if (!name) return failure('El nombre no puede estar vacío', 'VALIDATION')
      if (name.length > 60) return failure('El nombre es demasiado largo (máximo 60 caracteres)', 'VALIDATION')
      const { data: sameName } = await ctx.adminClient
        .from('client_categories').select('id').ilike('name', name).neq('id', id).maybeSingle()
      if (sameName) return failure('Ya existe una categoría con ese nombre', 'CONFLICT')
      update.name = name
    }
    if (patch.is_active !== undefined) {
      if ((before as any).code === 'standard' && !patch.is_active) {
        return failure('"Normal" es la categoría por defecto y no se puede desactivar', 'VALIDATION')
      }
      update.is_active = !!patch.is_active
    }
    if (patch.sort_order !== undefined) update.sort_order = Math.round(Number(patch.sort_order) || 0)

    const { error } = await ctx.adminClient.from('client_categories').update(update).eq('id', id)
    if (error) return failure(error.message)

    return success({
      id,
      auditEntityId: id,
      auditDescription: `Categoría de cliente "${(before as any).name}" actualizada`,
      auditOldData: { name: (before as any).name, activa: (before as any).is_active },
      auditNewData: { name: update.name ?? (before as any).name, activa: update.is_active ?? (before as any).is_active },
    } as { id: string })
  }
)

export const deleteClientCategory = protectedAction<string, { id: string }>(
  {
    permission: 'clients.edit',
    auditModule: 'clients',
    auditAction: 'delete',
    auditEntity: 'client_category',
    revalidate: ['/admin/configuracion', '/admin/clientes'],
  },
  async (ctx, id) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    const { data: before } = await ctx.adminClient
      .from('client_categories').select('id, code, name').eq('id', id).single()
    if (!before) return failure('Categoría no encontrada', 'NOT_FOUND')
    if (SYSTEM_CODES.has((before as any).code)) {
      return failure(`"${(before as any).name}" es una categoría del sistema: se puede renombrar, pero no borrar`, 'VALIDATION')
    }
    // Con clientes dentro no se borra (la FK lo impediría igualmente): se
    // desactiva, y así los clientes la conservan.
    const { count } = await ctx.adminClient
      .from('clients').select('id', { count: 'exact', head: true }).eq('category', (before as any).code)
    if ((count ?? 0) > 0) {
      return failure(`La usan ${count} cliente(s). Desactívala en lugar de borrarla, o cámbiales antes la categoría.`, 'CONFLICT')
    }

    const { error } = await ctx.adminClient.from('client_categories').delete().eq('id', id)
    if (error) return failure(error.message)
    return success({
      id,
      auditEntityId: id,
      auditDescription: `Categoría de cliente borrada: ${(before as any).name}`,
    } as { id: string })
  }
)
