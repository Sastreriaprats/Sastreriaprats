'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { createAdminClient } from '@/lib/supabase/admin'
import { success, failure } from '@/lib/errors'

/** Lista tejidos con búsqueda (usa cliente admin para evitar RLS). */
export const listFabrics = protectedAction<{ search?: string; limit?: number }, { data: any[] }>(
  { permission: 'stock.view', auditModule: 'stock' },
  async (ctx, params) => {
    let query = ctx.adminClient
      .from('fabrics')
      .select('*, suppliers(name)', { count: 'exact' })
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`
      query = query.or(`name.ilike.${term},fabric_code.ilike.${term},composition.ilike.${term},color_name.ilike.${term}`)
    }
    const limit = Math.min(params.limit ?? 200, 500)
    const { data, error } = await query.limit(limit)

    if (error) return failure(error.message)
    return success({ data: data ?? [] })
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
    const { data, error } = await ctx.adminClient
      .from('fabrics')
      .insert({
        fabric_code: input.fabric_code || null,
        name: input.name,
        description: input.description || null,
        supplier_id: input.supplier_id,
        category_id: input.category_id || null,
        composition: input.composition || null,
        color_name: input.color_name || null,
        color_hex: input.color_hex || null,
        price_per_meter: input.price_per_meter ?? null,
        stock_meters: input.stock_meters ?? 0,
        min_stock_meters: input.min_stock_meters ?? null,
        warehouse_id: input.warehouse_id || null,
        status: input.status || 'active',
      })
      .select()
      .single()
    if (error) return failure(error.message)
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
      'fabric_code', 'name', 'description', 'supplier_id', 'category_id', 'composition',
      'color_name', 'color_hex', 'price_per_meter', 'min_stock_meters', 'warehouse_id', 'status',
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
