'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { queryList, queryById } from '@/lib/server/query-helpers'
import { createProductSchema, updateProductSchema, createVariantSchema } from '@/lib/validations/products'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'
import { generateEAN13, validateEAN13 } from '@/lib/barcode/ean13'

/** Listado por variante (producto + talla) para códigos de barras. Cada variante tiene su propio EAN-13. */
export const listVariantsForBarcodes = protectedAction<ListParams, ListResult<any>>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, params) => {
    const admin = ctx.adminClient
    const page = params.page || 1
    const pageSize = Math.min(params.pageSize || 50, 100)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const search = params.search?.trim()
    const sortBy = params.sortBy || 'product_name'
    const sortOrder = params.sortOrder === 'asc' ? true : false

    let query = admin
      .from('product_variants')
      .select(`
        id,
        variant_sku,
        size,
        color,
        barcode,
        price_override,
        product_id,
        products!inner(id, sku, name, base_price, is_active)
      `, { count: 'exact' })
      .eq('products.is_active', true)
      .eq('is_active', true)

    if (search) {
      query = query.or(
        `barcode.ilike.%${search}%,variant_sku.ilike.%${search}%,products.sku.ilike.%${search}%,products.name.ilike.%${search}%`
      )
    }

    if (sortBy === 'product_name') {
      query = query.order('product_id', { ascending: sortOrder })
    } else if (sortBy === 'sku' || sortBy === 'variant_sku') {
      query = query.order('variant_sku', { ascending: sortOrder })
    } else if (sortBy === 'size') {
      query = query.order('size', { ascending: sortOrder })
    } else {
      query = query.order('product_id', { ascending: true })
    }

    query = query.range(from, to)

    const { data, count, error } = await query

    if (error) {
      console.error('[listVariantsForBarcodes]', error)
      return success({ data: [], total: 0, page, pageSize, totalPages: 0 })
    }

    const rows = (data || []).map((v: any) => {
      const p = v.products || {}
      const price = v.price_override != null ? Number(v.price_override) : Number(p.base_price ?? 0)
      return {
        id: v.id,
        product_id: v.product_id,
        variant_sku: v.variant_sku,
        size: v.size,
        color: v.color,
        barcode: v.barcode,
        name: p.name,
        sku: p.sku,
        base_price: price,
      }
    })

    const total = count ?? 0
    return success({
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  }
)

/** Listado ligero para página de códigos de barras (id, sku, name, barcode, base_price). @deprecated Use listVariantsForBarcodes */
export const listProductsForBarcodes = protectedAction<ListParams, ListResult<any>>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, params) => {
    const result = await queryList('products', {
      ...params,
      searchFields: ['sku', 'name', 'barcode'],
    }, 'id, sku, name, barcode, barcode_generated_at, base_price, is_active')
    return success(result)
  }
)

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
    const { data: variant } = await ctx.adminClient
      .from('product_variants')
      .select('id, product_id')
      .eq('id', variantId)
      .single()
    let productName = 'Producto'
    if (variant?.product_id) {
      const { data: product } = await ctx.adminClient
        .from('products')
        .select('name')
        .eq('id', variant.product_id)
        .single()
      if (product) productName = (product as any).name ?? productName
    }
    const auditDescription = `Stock: ${productName} · Cantidad: ${delta >= 0 ? '+' : ''}${delta}`
    return success({ ...movement, auditDescription })
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

    const { data: toLevelExisting } = await ctx.adminClient
      .from('stock_levels')
      .select('id, quantity')
      .eq('product_variant_id', variantId)
      .eq('warehouse_id', toWarehouseId)
      .single()

    let toLevel: { id: string; quantity: number }
    if (toLevelExisting) {
      toLevel = toLevelExisting
    } else {
      const { data: newLevel, error: insertLevelError } = await ctx.adminClient
        .from('stock_levels')
        .insert({
          product_variant_id: variantId,
          warehouse_id: toWarehouseId,
          quantity: 0,
          reserved: 0,
        })
        .select('id, quantity')
        .single()
      if (insertLevelError || !newLevel) {
        return failure(insertLevelError?.message || 'No se pudo crear el registro de stock en el almacén de destino')
      }
      toLevel = newLevel
    }

    const fromBefore = fromLevel.quantity
    const fromAfter = fromBefore - quantity
    const toBefore = toLevel.quantity
    const toAfter = toBefore + quantity

    const reasonText = reason?.trim() || 'Traspaso entre almacenes'
    const { error: insertError } = await ctx.adminClient.from('stock_movements').insert([
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
    if (insertError) {
      console.error('[moveStockBetweenWarehouses] stock_movements insert:', insertError)
      return failure(insertError.message || 'Error al registrar el movimiento de stock')
    }

    await ctx.adminClient.from('stock_levels').update({ quantity: fromAfter, last_movement_at: new Date().toISOString() }).eq('id', fromLevel.id)
    await ctx.adminClient.from('stock_levels').update({ quantity: toAfter, last_movement_at: new Date().toISOString() }).eq('id', toLevel.id)

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

/** Listado de movimientos de almacén para la pestaña Movimientos (usa admin para evitar RLS en joins). */
export const listStockMovements = protectedAction<
  { page?: number; pageSize?: number; typeFilter?: string },
  { data: any[]; total: number }
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, { page = 0, pageSize = 30, typeFilter = 'all' }) => {
    const from = page * pageSize
    const to = from + pageSize - 1
    let query = ctx.adminClient
      .from('stock_movements')
      .select(
        `
        id, product_variant_id, warehouse_id, movement_type, quantity, stock_before, stock_after,
        reason, notes, created_by, created_at,
        product_variants ( variant_sku, products ( name ) ),
        warehouses ( name, code ),
        profiles!created_by ( full_name )
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to)
    if (typeFilter !== 'all') query = query.eq('movement_type', typeFilter)
    const { data, count, error } = await query
    if (error) {
      console.error('[listStockMovements]', error)
      return failure(error.message || 'Error al cargar movimientos', 'INTERNAL')
    }
    return success({ data: data ?? [], total: count ?? 0 })
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

// ─── Códigos de barras EAN-13 ─────────────────────────────────────────────────

/** Genera EAN-13 para todas las variantes que no tienen barcode (cada talla tiene su propio código). */
export const generateBarcodesForAllVariants = protectedAction<void, { generated: number; errors: string[] }>(
  { permission: 'products.edit', auditModule: 'stock', auditAction: 'update', auditEntity: 'product' },
  async (ctx) => {
    const { data: activeProductIds } = await ctx.adminClient
      .from('products')
      .select('id')
      .eq('is_active', true)
    const ids = (activeProductIds ?? []).map((p: { id: string }) => p.id)
    if (!ids.length) return success({ generated: 0, errors: [] })

    const { data: variants } = await ctx.adminClient
      .from('product_variants')
      .select('id, variant_sku, product_id, products!inner(sku, name)')
      .in('product_id', ids)
      .or('barcode.is.null,barcode.eq.')
      .eq('is_active', true)

    if (!variants?.length) return success({ generated: 0, errors: [] })

    const used = new Set<string>()
    const errors: string[] = []
    let generated = 0

    for (const v of variants) {
      const p = (v as any).products || {}
      const label = `${p.sku || ''} ${v.variant_sku || ''}`.trim()
      let code: string
      let attempts = 0
      do {
        code = generateEAN13()
        if (attempts++ > 50) {
          errors.push(`${label}: no se pudo generar código único`)
          break
        }
      } while (used.has(code))

      if (!code || used.has(code)) continue
      used.add(code)

      const { error } = await ctx.adminClient
        .from('product_variants')
        .update({ barcode: code })
        .eq('id', v.id)

      if (error) errors.push(`${label}: ${error.message}`)
      else generated++
    }

    return success({ generated, errors })
  }
)

/** Genera EAN-13 para todos los productos que no tienen barcode. @deprecated Use generateBarcodesForAllVariants */
export const generateBarcodesForAllProducts = protectedAction<void, { generated: number; errors: string[] }>(
  { permission: 'products.edit', auditModule: 'stock', auditAction: 'update', auditEntity: 'product' },
  async (ctx) => {
    const { data: products } = await ctx.adminClient
      .from('products')
      .select('id, sku, name')
      .or('barcode.is.null,barcode.eq.')
      .eq('is_active', true)

    if (!products?.length) return success({ generated: 0, errors: [] })

    const used = new Set<string>()
    const errors: string[] = []
    let generated = 0

    for (const p of products) {
      let code: string
      let attempts = 0
      do {
        code = generateEAN13()
        if (attempts++ > 50) {
          errors.push(`${p.sku}: no se pudo generar código único`)
          break
        }
      } while (used.has(code))

      if (!code || used.has(code)) continue
      used.add(code)

      const { error } = await ctx.adminClient
        .from('products')
        .update({ barcode: code, barcode_generated_at: new Date().toISOString() })
        .eq('id', p.id)

      if (error) errors.push(`${p.sku}: ${error.message}`)
      else generated++
    }

    return success({ generated, errors })
  }
)

/** Busca por código de barras: primero en variantes (cada talla tiene su código), luego en producto legacy. Devuelve variante con stock para TPV. */
export const getProductByBarcode = protectedAction<
  { barcode: string; storeId?: string },
  { id: string; name: string; sku: string; base_price: number; variant: any; stock: number } | null
>(
  { permission: ['products.view', 'pos.access'], auditModule: 'stock' },
  async (ctx, { barcode, storeId }) => {
    const trimmed = barcode?.trim()
    if (!trimmed) return success(null)

    let warehouseId: string | null = null
    if (storeId) {
      const { data: wh } = await ctx.adminClient
        .from('warehouses')
        .select('id')
        .eq('store_id', storeId)
        .eq('is_main', true)
        .single()
      warehouseId = wh?.id ?? null
    }

    // 1) Buscar por variante (cada talla tiene su propio código)
    const { data: variantRow } = await ctx.adminClient
      .from('product_variants')
      .select(`
        id, variant_sku, size, color, price_override, product_id, is_active,
        products!inner(id, sku, name, base_price, tax_rate, main_image_url, cost_price, is_active),
        stock_levels(quantity, available, warehouse_id)
      `)
      .eq('barcode', trimmed)
      .eq('is_active', true)
      .eq('products.is_active', true)
      .single()

    if (variantRow) {
      const variant = variantRow as any
      const product = variant.products
      const stockLevels = variant.stock_levels || []
      const level = warehouseId
        ? stockLevels.find((sl: any) => sl.warehouse_id === warehouseId)
        : stockLevels[0]
      const available = level?.available ?? level?.quantity ?? 0
      const price = variant.price_override != null ? Number(variant.price_override) : Number(product?.base_price ?? 0)
      return success({
        id: product.id,
        name: product.name,
        sku: product.sku,
        base_price: price,
        variant: {
          id: variant.id,
          variant_sku: variant.variant_sku,
          size: variant.size,
          color: variant.color,
          price_override: variant.price_override,
          products: product,
          stock_levels: stockLevels,
        },
        stock: Number(available) || 0,
      })
    }

    // 2) Fallback: buscar por producto (legacy, un código por producto)
    const { data: product } = await ctx.adminClient
      .from('products')
      .select('id, sku, name, base_price, tax_rate, cost_price, main_image_url')
      .eq('barcode', trimmed)
      .eq('is_active', true)
      .single()

    if (!product) return success(null)

    const { data: variants } = await ctx.adminClient
      .from('product_variants')
      .select(`
        id, variant_sku, size, color, price_override, is_active,
        products!inner(id, sku, name, base_price, tax_rate, main_image_url, cost_price),
        stock_levels(quantity, available, warehouse_id)
      `)
      .eq('product_id', product.id)
      .eq('is_active', true)

    if (!variants?.length) return success(null)

    const v = variants[0] as any
    const stockLevels = v.stock_levels || []
    const level = warehouseId
      ? stockLevels.find((sl: any) => sl.warehouse_id === warehouseId)
      : stockLevels[0]
    const available = level?.available ?? level?.quantity ?? 0

    return success({
      id: product.id,
      name: product.name,
      sku: product.sku,
      base_price: product.base_price,
      variant: {
        id: v.id,
        variant_sku: v.variant_sku,
        size: v.size,
        color: v.color,
        price_override: v.price_override,
        products: v.products,
        stock_levels: stockLevels,
      },
      stock: Number(available) || 0,
    })
  }
)

/** Actualiza el barcode de una variante (producto + talla). */
export const updateVariantBarcode = protectedAction<{ variantId: string; barcode: string }, any>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'product',
    revalidate: ['/admin/stock', '/admin/stock/codigos-barras'],
  },
  async (ctx, { variantId, barcode }) => {
    const trimmed = barcode?.trim()
    if (trimmed && !validateEAN13(trimmed)) return failure('Código EAN-13 no válido (13 dígitos)', 'VALIDATION')

    const { data, error } = await ctx.adminClient
      .from('product_variants')
      .update({ barcode: trimmed || null })
      .eq('id', variantId)
      .select()
      .single()

    if (error) return failure(error.message)
    return success(data)
  }
)

/** Actualiza el barcode de un producto manualmente. @deprecated Use updateVariantBarcode por variante/talla */
export const updateProductBarcode = protectedAction<{ productId: string; barcode: string }, any>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'product',
    revalidate: ['/admin/stock', '/admin/stock/codigos-barras'],
  },
  async (ctx, { productId, barcode }) => {
    const trimmed = barcode?.trim()
    if (trimmed && !validateEAN13(trimmed)) return failure('Código EAN-13 no válido (13 dígitos)', 'VALIDATION')

    const { data, error } = await ctx.adminClient
      .from('products')
      .update({
        barcode: trimmed || null,
        barcode_generated_at: trimmed ? new Date().toISOString() : null,
      })
      .eq('id', productId)
      .select()
      .single()

    if (error) return failure(error.message)
    return success(data)
  }
)

/** Importa códigos de barras por SKU (desde archivo externo). */
export const importProductBarcodes = protectedAction<
  { data: { sku: string; barcode: string }[] },
  { updated: number; errors: string[] }
>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'product',
    revalidate: ['/admin/stock', '/admin/stock/codigos-barras'],
  },
  async (ctx, { data: rows }) => {
    const errors: string[] = []
    let updated = 0

    for (const row of rows) {
      const barcode = row.barcode?.trim()
      if (!barcode) continue
      if (!validateEAN13(barcode)) {
        errors.push(`${row.sku}: código no válido`)
        continue
      }

      const { data: product, error: findErr } = await ctx.adminClient
        .from('products')
        .select('id')
        .eq('sku', row.sku)
        .single()

      if (findErr || !product) {
        errors.push(`${row.sku}: producto no encontrado`)
        continue
      }

      const { error: updateErr } = await ctx.adminClient
        .from('products')
        .update({ barcode, barcode_generated_at: new Date().toISOString() })
        .eq('id', product.id)

      if (updateErr) errors.push(`${row.sku}: ${updateErr.message}`)
      else updated++
    }

    return success({ updated, errors })
  }
)

/** Obtiene variantes por IDs para impresión de etiquetas (por talla; cada variante con su barcode). */
export const getVariantsByIdsForLabels = protectedAction<
  string[],
  { id: string; variant_sku: string; size: string | null; color: string | null; sku: string; name: string; barcode: string | null; base_price: number }[]
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, variantIds) => {
    if (!variantIds.length) return success([])
    const { data } = await ctx.adminClient
      .from('product_variants')
      .select('id, variant_sku, size, color, barcode, price_override, product_id, products!inner(sku, name, base_price)')
      .in('id', variantIds)
      .eq('is_active', true)
    const list = (data || []).map((v: any) => {
      const p = v.products || {}
      const price = v.price_override != null ? Number(v.price_override) : Number(p.base_price ?? 0)
      return {
        id: v.id,
        variant_sku: v.variant_sku,
        size: v.size,
        color: v.color,
        sku: p.sku,
        name: p.name,
        barcode: v.barcode,
        base_price: price,
      }
    }).filter((x: any) => x.barcode)
    return success(list)
  }
)

/** Obtiene productos por IDs para impresión de etiquetas (id, sku, name, barcode, base_price). @deprecated Use getVariantsByIdsForLabels */
export const getProductsByIdsForLabels = protectedAction<string[], { id: string; sku: string; name: string; barcode: string | null; base_price: number }[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, ids) => {
    if (!ids.length) return success([])
    const { data } = await ctx.adminClient
      .from('products')
      .select('id, sku, name, barcode, base_price')
      .in('id', ids)
      .eq('is_active', true)
    const list = (data || []).filter((p: any) => p.barcode)
    return success(list)
  }
)
