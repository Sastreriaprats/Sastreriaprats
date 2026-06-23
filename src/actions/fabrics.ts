'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { createAdminClient } from '@/lib/supabase/admin'
import { success, failure } from '@/lib/errors'
import { normalizeSearchTerm } from '@/lib/utils'

/** Lista tejidos activos para el selector de la ficha de confección (sin restricción de permiso, solo autenticado). */
export const listActiveFabricsForFicha = protectedAction<
  void,
  { id: string; fabric_code: string | null; name: string; price_per_meter: number | null; stock_meters: number | null; composition: string | null }[]
>(
  {},
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('fabrics')
      .select('id, fabric_code, name, price_per_meter, stock_meters, composition')
      .eq('is_active', true)
      .order('fabric_code', { ascending: true })
    if (error) return failure(error.message)
    return success((data ?? []) as { id: string; fabric_code: string | null; name: string; price_per_meter: number | null; stock_meters: number | null; composition: string | null }[])
  }
)

/**
 * Genera el siguiente fabric_code en formato AT##### (AT + 5 dígitos).
 *
 * Estrategia: ORDER BY fabric_code DESC LIMIT 1 sobre el patrón canónico
 * para obtener el máximo real. NO usar COUNT(*) — si en algún momento se
 * borra un tejido, COUNT colisiona con el UNIQUE constraint del siguiente
 * insert.
 *
 * El argumento del proveedor ya no se usa (formato anterior era XXXX-TEL-NNN
 * derivado del nombre del proveedor); se mantiene la lista limpia con un
 * único correlativo global que la tienda usa físicamente en sus etiquetas.
 */
export async function generateFabricCode(adminClient: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data } = await adminClient
    .from('fabrics')
    .select('fabric_code')
    .ilike('fabric_code', 'AT%')
    .order('fabric_code', { ascending: false })
    .limit(1)

  let maxNum = 0
  for (const row of data ?? []) {
    const match = String((row as { fabric_code?: string | null }).fabric_code ?? '').match(/^AT(\d{5})$/)
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10))
  }
  const next = maxNum + 1
  return `AT${String(next).padStart(5, '0')}`
}

/** Lista tejidos con búsqueda y filtros (usa cliente admin para evitar RLS). */
export const listFabrics = protectedAction<
  { search?: string; limit?: number; supplierId?: string; isActive?: boolean; createdFrom?: string; createdTo?: string },
  { data: any[] }
>(
  { permission: 'stock.view', auditModule: 'stock' },
  async (ctx, params) => {
    let query = ctx.adminClient
      .from('fabrics')
      .select('*, suppliers(id, name)', { count: 'exact' })
      .order('name', { ascending: true })

    if (params.isActive !== undefined) {
      query = query.eq('is_active', params.isActive)
    }
    if (params.supplierId?.trim()) {
      query = query.eq('supplier_id', params.supplierId.trim())
    }
    // Filtro por fecha de alta (created_at). El input es una fecha 'YYYY-MM-DD';
    // para "hasta" incluimos el día completo hasta las 23:59:59.999.
    if (params.createdFrom?.trim()) {
      query = query.gte('created_at', `${params.createdFrom.trim()}T00:00:00.000`)
    }
    if (params.createdTo?.trim()) {
      query = query.lte('created_at', `${params.createdTo.trim()}T23:59:59.999`)
    }
    if (params.search?.trim()) {
      const normalized = normalizeSearchTerm(params.search)
      if (normalized) {
        query = query.ilike('search_text', `%${normalized}%`)
      }
    }
    const limit = Math.min(params.limit ?? 200, 500)
    const { data, error } = await query.limit(limit)

    if (error) return failure(error.message)
    return success({ data: data ?? [] })
  }
)

/** Lista tejidos de un proveedor concreto (admin client, sin problemas de RLS en cliente). */
export const listFabricsBySupplier = protectedAction<
  { supplierId: string; limit?: number },
  { data: any[] }
>(
  { permission: 'suppliers.create_order', auditModule: 'stock' },
  async (ctx, { supplierId, limit = 300 }) => {
    if (!supplierId?.trim()) return failure('Proveedor obligatorio', 'VALIDATION')
    const normalizedSupplierId = supplierId.trim()
    const { data, error } = await ctx.adminClient
      .from('fabrics')
      .select('id, fabric_code, name, composition, color_name, supplier_id, is_active, status')
      .eq('supplier_id', normalizedSupplierId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(Math.min(limit, 500))
    if (error) {
      console.error('[listFabricsBySupplier] error', {
        supplierId: normalizedSupplierId,
        message: error.message,
        code: (error as any)?.code,
      })
      return failure(error.message || 'No se pudieron cargar los tejidos')
    }

    if (!data || data.length === 0) {
      const { count: totalForSupplier } = await ctx.adminClient
        .from('fabrics')
        .select('*', { count: 'exact', head: true })
        .eq('supplier_id', normalizedSupplierId)
      console.warn('[listFabricsBySupplier] sin resultados activos', {
        supplierId: normalizedSupplierId,
        totalForSupplier: totalForSupplier ?? 0,
      })
    }

    return success({ data: data || [] })
  }
)

/** Busca tejidos de un proveedor por nombre (para selector en pedido a proveedor). */
export const searchFabricsBySupplier = protectedAction<
  { supplierId: string; query?: string },
  { id: string; fabric_code: string | null; name: string }[]
>(
  { permission: 'suppliers.create_order', auditModule: 'stock' },
  async (ctx, { supplierId, query }) => {
    if (!supplierId?.trim()) return success([])
    let q = ctx.adminClient
      .from('fabrics')
      .select('id, fabric_code, name')
      .eq('supplier_id', supplierId.trim())
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(20)
    if (query?.trim()) {
      q = q.ilike('name', `%${query.trim()}%`)
    }
    const { data, error } = await q
    if (error) return failure(error.message)
    return success((data ?? []) as { id: string; fabric_code: string | null; name: string }[])
  }
)

/** Obtiene un tejido por id. */
export const getFabric = protectedAction<string, any>(
  { permission: 'stock.view', auditModule: 'stock' },
  async (ctx, id) => {
    const { data, error } = await ctx.adminClient
      .from('fabrics')
      .select('*, suppliers(id, name), fabric_categories(id, name), warehouses(id, name, code, stores(name, code))')
      .eq('id', id)
      .single()
    if (error || !data) return failure('Tejido no encontrado', 'NOT_FOUND')
    return success(data)
  }
)

/** Crea un tejido. */
export const createFabricAction = protectedAction<
  {
    fabric_code?: string
    name: string
    description?: string
    supplier_id: string
    supplier_reference?: string
    unit?: string
    category_id?: string
    composition?: string
    color_name?: string
    color_hex?: string
    price_per_meter?: number
    stock_meters?: number
    min_stock_meters?: number
    warehouse_id?: string
    status?: string
  },
  any
>(
  {
    permission: 'stock.create_product',
    auditModule: 'stock',
    auditAction: 'create',
    auditEntity: 'fabric',
    revalidate: ['/admin/stock'],
  },
  async (ctx, input) => {
    if (!input.supplier_id?.trim()) return failure('Proveedor obligatorio', 'VALIDATION')
    const unitVal = input.unit === 'yards' || input.unit === 'pieces' ? input.unit : 'meters'
    const fabricCode = input.fabric_code?.trim()
      || await generateFabricCode(ctx.adminClient)
    const { data, error } = await ctx.adminClient
      .from('fabrics')
      .insert({
        fabric_code: fabricCode,
        name: input.name,
        description: input.description || null,
        supplier_id: input.supplier_id,
        supplier_reference: input.supplier_reference || null,
        unit: unitVal,
        category_id: input.category_id || null,
        composition: input.composition || null,
        color_name: input.color_name || null,
        color_hex: input.color_hex || null,
        price_per_meter: input.price_per_meter ?? null,
        stock_meters: input.stock_meters ?? 0,
        min_stock_meters: input.min_stock_meters ?? null,
        warehouse_id: input.warehouse_id || null,
        status: input.status || 'active',
        is_active: true,
      })
      .select()
      .single()
    if (error) {
      console.error('[createFabricAction] error al crear tejido', {
        supplier_id: input.supplier_id,
        name: input.name,
        message: error.message,
        code: (error as any)?.code,
      })
      return failure(error.message)
    }
    return success(data)
  }
)

/** Actualiza un tejido. */
export const updateFabricAction = protectedAction<{ id: string; data: any }, any>(
  {
    permission: 'stock.create_product',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'fabric',
    revalidate: ['/admin/stock'],
  },
  async (ctx, { id, data: input }) => {
    const allowed = [
      'fabric_code', 'name', 'description', 'supplier_id', 'supplier_reference', 'category_id', 'composition',
      'color_name', 'color_hex', 'price_per_meter', 'min_stock_meters', 'warehouse_id', 'status', 'is_active',
    ]
    const payload: Record<string, unknown> = {}
    for (const k of allowed) {
      if (input[k] !== undefined) payload[k] = input[k]
    }
    const { data, error } = await ctx.adminClient
      .from('fabrics')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) return failure(error.message)
    return success(data)
  }
)

/** Entrada de stock de tejido (suma metros al stock actual). */
export const addFabricStockAction = protectedAction<
  { fabricId: string; meters: number; reason?: string },
  any
>(
  {
    permission: 'stock.create_product',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'fabric',
    revalidate: ['/admin/stock'],
  },
  async (ctx, { fabricId, meters }) => {
    if (meters <= 0) return failure('Los metros deben ser mayor que 0')
    const { data: fabric, error: fetchError } = await ctx.adminClient
      .from('fabrics')
      .select('id, stock_meters')
      .eq('id', fabricId)
      .single()
    if (fetchError || !fabric) return failure('Tejido no encontrado', 'NOT_FOUND')
    const current = Number(fabric.stock_meters) || 0
    const newStock = current + meters
    const { data: updated, error } = await ctx.adminClient
      .from('fabrics')
      .update({ stock_meters: newStock })
      .eq('id', fabricId)
      .select()
      .single()
    if (error) return failure(error.message)
    return success(updated)
  }
)

/** Salida/consumo de tejido (resta metros del stock cuando lo usas). */
export const subtractFabricStockAction = protectedAction<
  { fabricId: string; meters: number; reason?: string },
  any
>(
  {
    permission: 'stock.create_product',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'fabric',
    revalidate: ['/admin/stock'],
  },
  async (ctx, { fabricId, meters }) => {
    if (meters <= 0) return failure('Los metros deben ser mayor que 0')
    const { data: fabric, error: fetchError } = await ctx.adminClient
      .from('fabrics')
      .select('id, stock_meters')
      .eq('id', fabricId)
      .single()
    if (fetchError || !fabric) return failure('Tejido no encontrado', 'NOT_FOUND')
    const current = Number(fabric.stock_meters) || 0
    const newStock = Math.max(0, current - meters)
    if (current < meters) return failure(`Solo hay ${current.toFixed(1)} m en stock. No se pueden descontar ${meters} m.`)
    const { data: updated, error } = await ctx.adminClient
      .from('fabrics')
      .update({ stock_meters: newStock })
      .eq('id', fabricId)
      .select()
      .single()
    if (error) return failure(error.message)
    return success(updated)
  }
)

/**
 * Ajuste manual de stock de tejido. Cubre los 4 casos operativos:
 *   - reception          (+) entrada de proveedor
 *   - adjustment_positive (+) corrección al alza
 *   - adjustment_negative (-) corrección a la baja (rotura, error)
 *   - inventory_set       (=) recuento físico, sobreescribe la cantidad
 *
 * Cada llamada registra una fila en fabric_stock_movements con
 * reference_type='manual' para que el histórico distinga los ajustes
 * humanos de los consumos automáticos por ficha (reference_type='tailoring_order').
 */
export const adjustFabricStock = protectedAction<
  {
    fabricId: string
    quantity: number
    movementType: 'reception' | 'adjustment_positive' | 'adjustment_negative' | 'inventory_set'
    reason: string
  },
  { stock_before: number; stock_after: number }
>(
  {
    permission: 'stock.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'fabric',
    revalidate: ['/admin/stock'],
  },
  async (ctx, { fabricId, quantity, movementType, reason }) => {
    if (!fabricId?.trim()) return failure('ID de tejido requerido', 'VALIDATION')
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return failure('La cantidad debe ser mayor que cero', 'VALIDATION')
    }
    if ((movementType === 'adjustment_negative' || movementType === 'inventory_set') && !reason?.trim()) {
      return failure('Indica un motivo para este tipo de ajuste', 'VALIDATION')
    }

    const { data: row, error: fetchError } = await ctx.adminClient
      .from('fabrics')
      .select('stock_meters, name, fabric_code')
      .eq('id', fabricId)
      .single()
    if (fetchError || !row) return failure('Tejido no encontrado', 'NOT_FOUND')

    const before = Number(row.stock_meters) || 0
    let after: number
    let delta: number
    if (movementType === 'inventory_set') {
      after = quantity
      delta = quantity - before
    } else {
      const sign = movementType === 'reception' || movementType === 'adjustment_positive' ? 1 : -1
      delta = sign * quantity
      after = before + delta
    }
    // Redondear a 2 decimales para evitar arrastre de coma flotante.
    after = Math.round(after * 100) / 100
    delta = Math.round(delta * 100) / 100

    if (after < 0) {
      return failure(`El stock no puede ser negativo (actual: ${before.toFixed(2)} m, resultado: ${after.toFixed(2)} m)`, 'VALIDATION')
    }

    const { error: updateError } = await ctx.adminClient
      .from('fabrics')
      .update({ stock_meters: after, updated_at: new Date().toISOString() })
      .eq('id', fabricId)
    if (updateError) return failure(updateError.message, 'INTERNAL')

    const { error: movementError } = await ctx.adminClient
      .from('fabric_stock_movements')
      .insert({
        fabric_id: fabricId,
        movement_type: movementType,
        quantity_delta: delta,
        stock_before: before,
        stock_after: after,
        reason: reason?.trim() || null,
        reference_type: 'manual',
        reference_id: null,
        created_by: ctx.userId !== 'system' ? ctx.userId : null,
      })
    if (movementError) {
      // El UPDATE ya fue. No podemos rollback aquí; logueamos para auditar.
      console.error('[adjustFabricStock] failed to insert movement row:', movementError)
    }

    return success({
      stock_before: before,
      stock_after: after,
      auditEntityId: String(fabricId),
      auditDescription: `Ajuste de stock de tejido "${(row as any).name}" (${before}→${after})`,
    } as unknown as { stock_before: number; stock_after: number })
  }
)
