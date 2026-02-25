'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { queryList, queryById } from '@/lib/server/query-helpers'
import { createProductSchema, updateProductSchema, createVariantSchema } from '@/lib/validations/products'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'

export const listProducts = protectedAction<ListParams, ListResult<any>>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, params) => {
    const result = await queryList('products', {
      ...params,
      searchFields: ['sku', 'name', 'brand', 'barcode'],
    }, `
      id, sku, name, product_type, brand, collection, season,
      base_price, cost_price, main_image_url, color, fabric_meters_used,
      category_id, supplier_id, is_visible_web, is_active, is_sample,
      created_at,
      suppliers(name),
      product_variants(
        id,
        stock_levels(quantity, warehouse_id, warehouses(id, name, code))
      )
    `)
    return success(result)
  }
)

/** Listado solo lectura para panel sastre (products.view). Incluye categoría, stock y campos para telas. */
export const listProductsForSastre = protectedAction<ListParams, ListResult<any>>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, params) => {
    const result = await queryList('products', {
      ...params,
      searchFields: ['sku', 'name', 'brand', 'barcode'],
    }, `
      id, sku, name, base_price, category_id, product_type, material, fabric_meters_used,
      product_categories!products_category_id_fkey(name),
      product_variants(id, stock_levels(quantity))
    `)
    return success(result)
  }
)

export const getProduct = protectedAction<string, any>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, productId) => {
    const product = await queryById('products', productId, `
      *,
      product_variants (
        id, variant_sku, size, color, barcode,
        price_override, cost_price_override, is_active,
        stock_levels ( id, warehouse_id, quantity, reserved, warehouses(name, code, stores(name, code, store_type)) )
      )
    `)
    if (!product) return failure('Producto no encontrado', 'NOT_FOUND')
    return success(product)
  }
)

export const createProductAction = protectedAction<any, any>(
  {
    permission: 'products.create',
    auditModule: 'stock',
    auditAction: 'create',
    auditEntity: 'product',
    revalidate: ['/admin/stock'],
  },
  async (ctx, input) => {
    const parsed = createProductSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

    const { data: existing } = await ctx.adminClient
      .from('products').select('id').eq('sku', parsed.data.sku).single()
    if (existing) return failure('Ya existe un producto con este SKU', 'CONFLICT')

    const data = { ...parsed.data, created_by: ctx.userId }
    if (data.category_id === '' || data.category_id == null) data.category_id = null
    if (data.supplier_id === '' || data.supplier_id == null) data.supplier_id = null

    const { data: product, error } = await ctx.adminClient
      .from('products')
      .insert(data)
      .select()
      .single()

    if (error) return failure(error.message)
    return success(product)
  }
)

export const updateProductAction = protectedAction<{ id: string; data: any }, any>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'product',
    revalidate: ['/admin/stock'],
  },
  async (ctx, { id, data: input }) => {
    const parsed = updateProductSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

    const { data: product, error } = await ctx.adminClient
      .from('products').update(parsed.data).eq('id', id).select().single()

    if (error) return failure(error.message)
    return success(product)
  }
)

export const createVariantAction = protectedAction<any, any>(
  {
    permission: 'products.create',
    auditModule: 'stock',
    auditAction: 'create',
    auditEntity: 'product_variant',
    revalidate: ['/admin/stock'],
  },
  async (ctx, input) => {
    const parsed = createVariantSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

    const { data: variant, error } = await ctx.adminClient
      .from('product_variants')
      .insert(parsed.data)
      .select()
      .single()

    if (error) return failure(error.message)

    if (variant) {
      const { data: physicalStores } = await ctx.adminClient.from('stores').select('id').eq('store_type', 'physical')
      const storeIds = (physicalStores ?? []).map((s: any) => s.id)
      const { data: warehouses } = storeIds.length > 0
        ? await ctx.adminClient.from('warehouses').select('id').eq('is_active', true).in('store_id', storeIds)
        : { data: [] }
      if (warehouses?.length) {
        await ctx.adminClient.from('stock_levels').insert(
          warehouses.map((w: any) => ({
            product_variant_id: variant.id,
            warehouse_id: w.id,
            quantity: 0,
            reserved: 0,
          }))
        )
      }
    }

    return success(variant)
  }
)

export const adjustStock = protectedAction<{
  variantId: string; warehouseId: string; quantity: number;
  reason: string; movementType: 'adjustment_positive' | 'adjustment_negative';
}, any>(
  {
    permission: 'stock.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'stock',
    revalidate: ['/admin/stock'],
  },
  async (ctx, { variantId, warehouseId, quantity, reason, movementType }) => {
    const { data: current } = await ctx.adminClient
      .from('stock_levels')
      .select('id, quantity')
      .eq('product_variant_id', variantId)
      .eq('warehouse_id', warehouseId)
      .single()

    if (!current) return failure('Stock no encontrado')

    const stockBefore = current.quantity
    const delta = movementType === 'adjustment_positive' ? Math.abs(quantity) : -Math.abs(quantity)
    const stockAfter = stockBefore + delta

    if (stockAfter < 0) return failure('El stock no puede ser negativo')

    await ctx.adminClient
      .from('stock_levels')
      .update({ quantity: stockAfter, last_movement_at: new Date().toISOString() })
      .eq('id', current.id)

    const { data: movement, error } = await ctx.adminClient
      .from('stock_movements')
      .insert({
        product_variant_id: variantId,
        warehouse_id: warehouseId,
        movement_type: movementType,
        quantity: delta,
        stock_before: stockBefore,
        stock_after: stockAfter,
        reason,
        created_by: ctx.userId,
      })
      .select()
      .single()

    if (error) return failure(error.message)
    return success(movement)
  }
)

/** Traspaso de stock entre almacenes (mueve unidades de un almacén a otro). */
export const moveStockBetweenWarehouses = protectedAction<
  { variantId: string; fromWarehouseId: string; toWarehouseId: string; quantity: number; reason?: string },
  any
>(
  {
    permission: 'stock.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'stock',
    revalidate: ['/admin/stock'],
  },
  async (ctx, { variantId, fromWarehouseId, toWarehouseId, quantity, reason }) => {
    if (fromWarehouseId === toWarehouseId) return failure('Origen y destino deben ser distintos')
    if (quantity <= 0) return failure('La cantidad debe ser mayor que 0')

    const { data: fromLevel } = await ctx.adminClient
      .from('stock_levels')
      .select('id, quantity')
      .eq('product_variant_id', variantId)
      .eq('warehouse_id', fromWarehouseId)
      .single()
    if (!fromLevel) return failure('No hay stock en el almacén de origen')
    if (fromLevel.quantity < quantity) return failure(`Solo hay ${fromLevel.quantity} unidades en el almacén de origen`)

    const { data: toLevel } = await ctx.adminClient
      .from('stock_levels')
      .select('id, quantity')
      .eq('product_variant_id', variantId)
      .eq('warehouse_id', toWarehouseId)
      .single()
    if (!toLevel) return failure('El almacén de destino no tiene registro para esta variante')

    const fromBefore = fromLevel.quantity
    const fromAfter = fromBefore - quantity
    const toBefore = toLevel.quantity
    const toAfter = toBefore + quantity

    await ctx.adminClient.from('stock_levels').update({ quantity: fromAfter, last_movement_at: new Date().toISOString() }).eq('id', fromLevel.id)
    await ctx.adminClient.from('stock_levels').update({ quantity: toAfter, last_movement_at: new Date().toISOString() }).eq('id', toLevel.id)

    const reasonText = reason?.trim() || 'Traspaso entre almacenes'
    await ctx.adminClient.from('stock_movements').insert([
      {
        product_variant_id: variantId,
        warehouse_id: fromWarehouseId,
        movement_type: 'transfer_out',
        quantity: -quantity,
        stock_before: fromBefore,
        stock_after: fromAfter,
        reason: reasonText,
        created_by: ctx.userId,
      },
      {
        product_variant_id: variantId,
        warehouse_id: toWarehouseId,
        movement_type: 'transfer_in',
        quantity,
        stock_before: toBefore,
        stock_after: toAfter,
        reason: reasonText,
        created_by: ctx.userId,
      },
    ])

    return success({ fromAfter, toAfter })
  }
)

export const getStockDashboardStats = protectedAction<void, { totalProducts: number; lowStock: number; outOfStock: number; pendingOrders: number }>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx) => {
    const [products, lowStock, outOfStock, pendingOrders] = await Promise.all([
      ctx.adminClient.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ctx.adminClient.from('stock_levels').select('id', { count: 'exact', head: true }).not('min_stock', 'is', null).filter('quantity', 'lte', 'min_stock'),
      ctx.adminClient.from('stock_levels').select('id', { count: 'exact', head: true }).eq('quantity', 0),
      ctx.adminClient.from('supplier_orders').select('id', { count: 'exact', head: true }).in('status', ['draft', 'sent', 'confirmed', 'partially_received']),
    ])
    return success({
      totalProducts: products.count || 0,
      lowStock: lowStock.count || 0,
      outOfStock: outOfStock.count || 0,
      pendingOrders: pendingOrders.count || 0,
    })
  }
)

export const listPhysicalWarehouses = protectedAction<void, any[]>(
  { permission: ['products.view', 'stock.view'], auditModule: 'stock' },
  async (ctx) => {
    try {
      const { data: stores } = await ctx.adminClient
        .from('stores')
        .select('id, name, code')
        .eq('store_type', 'physical')
        .eq('is_active', true)

      if (!stores?.length) return success([])

      const storeIds = stores.map((s: any) => s.id)
      const { data: warehouses, error: whError } = await ctx.adminClient
        .from('warehouses')
        .select('id, name, code, store_id')
        .eq('is_active', true)
        .in('store_id', storeIds)
        .order('name')

      if (whError) return failure(whError.message || 'Error al cargar almacenes', 'INTERNAL')
      if (!warehouses?.length) return success([])

      const storeMap = Object.fromEntries(stores.map((s: any) => [s.id, s.name || s.code]))
      return success(warehouses.map((w: any) => ({
        id: w.id,
        name: w.name || w.code,
        code: w.code,
        storeName: storeMap[w.store_id] || '',
      })))
    } catch (err: any) {
      return failure(err?.message || 'Error al cargar almacenes', 'INTERNAL')
    }
  }
)

export const listStockByWarehouse = protectedAction<{ warehouseId?: string; search?: string }, any[]>(
  { permission: ['products.view', 'stock.view'], auditModule: 'stock' },
  async (ctx, { warehouseId, search }) => {
    try {
      let slQuery = ctx.adminClient
        .from('stock_levels')
        .select('id, quantity, reserved, warehouse_id, product_variant_id')
        .order('quantity', { ascending: false })

      if (warehouseId && warehouseId !== 'all') {
        slQuery = slQuery.eq('warehouse_id', warehouseId)
      }

      const { data: slData, error: slError } = await slQuery
      if (slError) return failure(slError.message || 'Error al cargar stock', 'INTERNAL')
      if (!slData?.length) return success([])

      const variantIds = [...new Set(slData.map((sl: any) => sl.product_variant_id))]
      const { data: variantsData } = await ctx.adminClient
        .from('product_variants')
        .select('id, variant_sku, size, color, product_id')
        .in('id', variantIds)

      if (!variantsData?.length) return success([])

      const productIds = [...new Set(variantsData.map((v: any) => v.product_id))]
      const { data: productsData } = await ctx.adminClient
        .from('products')
        .select('id, sku, name, product_type, main_image_url, supplier_id, suppliers(name)')
        .in('id', productIds)

      if (!productsData?.length) return success([])

      const variantMap = Object.fromEntries(variantsData.map((v: any) => [v.id, v]))
      const productMap = Object.fromEntries(productsData.map((p: any) => [p.id, p]))
      const s = search?.toLowerCase() ?? ''

      const rows: any[] = []
      for (const sl of slData) {
        const v = variantMap[sl.product_variant_id]
        if (!v) continue
        const p = productMap[v.product_id]
        if (!p) continue
        if (s) {
          const haystack = `${p.name} ${p.sku} ${v.variant_sku}`.toLowerCase()
          if (!haystack.includes(s)) continue
        }
        const qty = Number(sl.quantity) || 0
        const res = Number(sl.reserved) || 0
        rows.push({
          product_id: p.id,
          product_name: p.name,
          product_sku: p.sku,
          product_type: p.product_type,
          main_image_url: p.main_image_url,
          supplier_name: (p.suppliers as any)?.name ?? null,
          variant_sku: v.variant_sku,
          size: v.size,
          color: v.color,
          quantity: qty,
          reserved: res,
          available: qty - res,
        })
      }

      return success(rows)
    } catch (err: any) {
      return failure(err?.message || 'Error al cargar stock', 'INTERNAL')
    }
  }
)
