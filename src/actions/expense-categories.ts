'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

/**
 * Categorías de gasto de las facturas de proveedor (mig 295). Petición de David
 * (28-sep-2026): en el informe para socios, poder poner cada factura en una
 * categoría y ver los gastos desglosados por ellas.
 *
 * `ap_supplier_invoices.expense_category` guarda el `code`, que se genera al
 * crear y no cambia nunca: renombrar toca solo `name`. Mismo patrón que las
 * categorías de cliente (src/actions/client-categories.ts).
 */

const PERMISSION = 'supplier_invoices.manage'

export type ExpenseCategoryAdmin = {
  id: string
  code: string
  name: string
  sort_order: number
  is_active: boolean
  invoices_count: number
}

function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export const listExpenseCategoriesAdmin = protectedAction<void, ExpenseCategoryAdmin[]>(
  { permission: PERMISSION, auditModule: 'accounting' },
  async (ctx) => {
    const { data: rows, error } = await ctx.adminClient
      .from('expense_categories')
      .select('id, code, name, sort_order, is_active')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) return failure(error.message)

    // Conteo con count exacto: la tabla de facturas pasa de 1.000 filas.
    const counts = await Promise.all((rows ?? []).map(async (r: any) => {
      const { count } = await ctx.adminClient
        .from('ap_supplier_invoices').select('id', { count: 'exact', head: true }).eq('expense_category', r.code)
      return [r.code as string, count ?? 0] as const
    }))
    const countByCode = new Map(counts)

    return success((rows ?? []).map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      sort_order: r.sort_order,
      is_active: r.is_active,
      invoices_count: countByCode.get(r.code) ?? 0,
    })))
  }
)

export const createExpenseCategory = protectedAction<{ name: string }, { id: string; code: string }>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'create',
    auditEntity: 'expense_category',
    revalidate: ['/admin/configuracion', '/admin/reporting'],
  },
  async (ctx, input) => {
    const name = String(input?.name ?? '').trim()
    if (!name) return failure('El nombre es obligatorio', 'VALIDATION')
    if (name.length > 60) return failure('El nombre es demasiado largo (máximo 60 caracteres)', 'VALIDATION')

    const { data: sameName } = await ctx.adminClient
      .from('expense_categories').select('id').ilike('name', name).maybeSingle()
    if (sameName) return failure('Ya existe una categoría con ese nombre', 'CONFLICT')

    const base = slugifyCategory(name)
    if (!base) return failure('El nombre necesita al menos una letra o número', 'VALIDATION')
    let code = base
    for (let i = 2; i < 50; i++) {
      const { data: taken } = await ctx.adminClient
        .from('expense_categories').select('id').eq('code', code).maybeSingle()
      if (!taken) break
      code = `${base}_${i}`
    }

    const { data: last } = await ctx.adminClient
      .from('expense_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1)
    const sortOrder = ((last?.[0] as any)?.sort_order ?? 0) + 1

    const { data, error } = await ctx.adminClient
      .from('expense_categories')
      .insert({ code, name, sort_order: sortOrder, is_active: true })
      .select('id, code')
      .single()
    if (error || !data) return failure(error?.message ?? 'No se pudo crear la categoría')

    return success({
      id: (data as any).id,
      code: (data as any).code,
      auditEntityId: (data as any).id,
      auditDescription: `Categoría de gasto creada: ${name}`,
    } as { id: string; code: string })
  }
)

export const updateExpenseCategory = protectedAction<
  { id: string; name?: string; is_active?: boolean },
  { id: string }
>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'update',
    auditEntity: 'expense_category',
    revalidate: ['/admin/configuracion', '/admin/reporting'],
  },
  async (ctx, { id, ...patch }) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    const { data: before } = await ctx.adminClient
      .from('expense_categories').select('id, code, name, is_active').eq('id', id).single()
    if (!before) return failure('Categoría no encontrada', 'NOT_FOUND')

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.name !== undefined) {
      const name = String(patch.name).trim()
      if (!name) return failure('El nombre no puede estar vacío', 'VALIDATION')
      if (name.length > 60) return failure('El nombre es demasiado largo (máximo 60 caracteres)', 'VALIDATION')
      const { data: sameName } = await ctx.adminClient
        .from('expense_categories').select('id').ilike('name', name).neq('id', id).maybeSingle()
      if (sameName) return failure('Ya existe una categoría con ese nombre', 'CONFLICT')
      update.name = name
    }
    if (patch.is_active !== undefined) update.is_active = !!patch.is_active

    const { error } = await ctx.adminClient.from('expense_categories').update(update).eq('id', id)
    if (error) return failure(error.message)

    return success({
      id,
      auditEntityId: id,
      auditDescription: `Categoría de gasto "${(before as any).name}" actualizada`,
      auditOldData: { name: (before as any).name, activa: (before as any).is_active },
      auditNewData: { name: update.name ?? (before as any).name, activa: update.is_active ?? (before as any).is_active },
    } as { id: string })
  }
)

export const deleteExpenseCategory = protectedAction<string, { id: string }>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'delete',
    auditEntity: 'expense_category',
    revalidate: ['/admin/configuracion', '/admin/reporting'],
  },
  async (ctx, id) => {
    if (!id) return failure('ID requerido', 'VALIDATION')
    const { data: before } = await ctx.adminClient
      .from('expense_categories').select('id, code, name').eq('id', id).single()
    if (!before) return failure('Categoría no encontrada', 'NOT_FOUND')
    // Con facturas dentro no se borra (la FK lo impediría igualmente): se
    // desactiva y las facturas la conservan.
    const { count } = await ctx.adminClient
      .from('ap_supplier_invoices').select('id', { count: 'exact', head: true }).eq('expense_category', (before as any).code)
    if ((count ?? 0) > 0) {
      return failure(`La tienen ${count} factura(s). Desactívala en lugar de borrarla, o cámbiales antes la categoría.`, 'CONFLICT')
    }

    const { error } = await ctx.adminClient.from('expense_categories').delete().eq('id', id)
    if (error) return failure(error.message)
    return success({
      id,
      auditEntityId: id,
      auditDescription: `Categoría de gasto borrada: ${(before as any).name}`,
    } as { id: string })
  }
)

/**
 * Pone (o quita, con `category: null`) la categoría de una factura.
 *
 * Con `apply_to_supplier`, además: la guarda como categoría por defecto del
 * proveedor —sus facturas NUEVAS la heredan por trigger— y la pone en todas
 * sus facturas que aún no tienen ninguna. Las que ya tienen otra categoría no
 * se tocan: alguien la eligió a propósito.
 */
export const setSupplierInvoiceExpenseCategory = protectedAction<
  { invoice_id: string; category: string | null; apply_to_supplier?: boolean },
  { updated: number; supplier_name: string | null }
>(
  {
    permission: PERMISSION,
    auditModule: 'accounting',
    auditAction: 'update',
    auditEntity: 'supplier_invoice',
    revalidate: ['/admin/reporting'],
  },
  async (ctx, { invoice_id, category, apply_to_supplier = false }) => {
    if (!invoice_id) return failure('Falta la factura', 'VALIDATION')
    const code = category ? String(category).trim() : null

    const { data: inv } = await ctx.adminClient
      .from('ap_supplier_invoices')
      .select('id, invoice_number, supplier_id, supplier_name, expense_category')
      .eq('id', invoice_id)
      .single()
    if (!inv) return failure('Factura no encontrada', 'NOT_FOUND')

    let categoryName = 'Sin categoría'
    if (code) {
      const { data: cat } = await ctx.adminClient
        .from('expense_categories').select('code, name').eq('code', code).maybeSingle()
      if (!cat) return failure('Esa categoría no existe', 'VALIDATION')
      categoryName = (cat as any).name
    }
    if (apply_to_supplier && !code) return failure('Elige una categoría para aplicarla al proveedor', 'VALIDATION')
    if (apply_to_supplier && !(inv as any).supplier_id) {
      return failure('La factura no está enlazada a una ficha de proveedor', 'VALIDATION')
    }

    const { error } = await ctx.adminClient
      .from('ap_supplier_invoices').update({ expense_category: code }).eq('id', invoice_id)
    if (error) return failure(error.message)
    let updated = 1

    if (apply_to_supplier) {
      const supplierId = String((inv as any).supplier_id)
      const { error: supErr } = await ctx.adminClient
        .from('suppliers').update({ default_expense_category: code }).eq('id', supplierId)
      if (supErr) return failure(supErr.message)
      const { data: rest, error: restErr } = await ctx.adminClient
        .from('ap_supplier_invoices')
        .update({ expense_category: code })
        .eq('supplier_id', supplierId)
        .is('expense_category', null)
        .select('id')
      if (restErr) return failure(restErr.message)
      updated += (rest ?? []).length
    }

    const supplierName = (inv as any).supplier_name ?? null
    return success({
      updated,
      supplier_name: supplierName,
      auditEntityId: invoice_id,
      auditDescription: apply_to_supplier
        ? `Categoría de gasto "${categoryName}" para ${supplierName ?? 'el proveedor'} (${updated} factura(s) y las nuevas)`
        : `Factura ${(inv as any).invoice_number}: categoría de gasto "${categoryName}"`,
      auditOldData: { expense_category: (inv as any).expense_category ?? null },
      auditNewData: { expense_category: code },
    } as { updated: number; supplier_name: string | null })
  }
)
