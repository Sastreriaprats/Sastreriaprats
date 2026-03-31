'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber } from '@/lib/server/query-helpers'
import { createProductSchema, updateProductSchema, createVariantSchema } from '@/lib/validations/products'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'
import { generateEAN13, validateEAN13 } from '@/lib/barcode/ean13'
import { generateSkuBase } from '@/lib/utils/sku'
import { generateFabricCode } from '@/actions/fabrics'

/** Obtiene el siguiente número correlativo para un SKU base. Cuenta productos con sku LIKE 'skuBase-%' y retorna (count+1) con pad 3. Si el SKU completo ya existe (race), reintenta con el siguiente. */
export const getNextSkuNumber = protectedAction<
  { skuBase: string },
  { number: string }
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, { skuBase }) => {
    const base = String(skuBase || '').trim()
    if (!base) return failure('skuBase requerido', 'VALIDATION')
    const pattern = `${base}-%`
    const { count } = await ctx.adminClient
      .from('products')
      .select('id', { count: 'exact', head: true })
      .like('sku', pattern)
    let n = (count ?? 0) + 1
    for (let i = 0; i < 20; i++) {
      const numStr = String(n).padStart(3, '0')
      const fullSku = `${base}-${numStr}`
      const { data: existing } = await ctx.adminClient
        .from('products')
        .select('id')
        .eq('sku', fullSku)
        .maybeSingle()
      if (!existing) return success({ number: numStr })
      n++
    }
    return failure('No se pudo generar un SKU único', 'INTERNAL')
  }
)

/** Genera un SKU completo automático para un producto. Combina generateSkuBase + getNextSkuNumber. */
export const generateProductSkuAction = protectedAction<
  { productType: string; productName: string },
  { sku: string }
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, { productType, productName }) => {
    const name = String(productName || '').trim()
    if (!name) return failure('Escribe el nombre del producto primero', 'VALIDATION')
    const skuBase = generateSkuBase(productType, name)
    const pattern = `${skuBase}-%`
    const { count } = await ctx.adminClient
      .from('products')
      .select('id', { count: 'exact', head: true })
      .like('sku', pattern)
    let n = (count ?? 0) + 1
    for (let i = 0; i < 20; i++) {
      const numStr = String(n).padStart(3, '0')
      const fullSku = `${skuBase}-${numStr}`
      const { data: existing } = await ctx.adminClient
        .from('products')
        .select('id')
        .eq('sku', fullSku)
        .maybeSingle()
      if (!existing) return success({ sku: fullSku })
      n++
    }
    return failure('No se pudo generar un SKU único', 'INTERNAL')
  }
)

async function generateDeliveryNoteNumberSafe(adminClient: any): Promise<string> {
  try {
    const { data, error } = await adminClient.rpc('generate_delivery_note_number')
    if (!error && typeof data === 'string' && data.trim()) return data
  } catch {
    // Fallback below
  }
  const year = new Date().getFullYear()
  const { data: rows } = await adminClient
    .from('delivery_notes')
    .select('number')
    .like('number', `ALB-${year}-%`)
    .order('number', { ascending: false })
    .limit(1)
  let next = 1
  const last = rows?.[0]?.number as string | undefined
  if (last) {
    const seq = Number(last.split('-').at(-1))
    if (!Number.isNaN(seq)) next = seq + 1
  }
  return `ALB-${year}-${String(next).padStart(4, '0')}`
}

/** Listado agrupado por producto para códigos de barras. Devuelve productos con array de variantes. */
export const getProductsWithVariantsForBarcodes = protectedAction<
  { page?: number; pageSize?: number; search?: string; filter?: 'all' | 'with' | 'without' | 'partial' },
  { data: any[]; total: number; page: number; pageSize: number; totalPages: number; withoutBarcodeCount: number }
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, params) => {
    const admin = ctx.adminClient
    const search = params.search?.trim()
    const filter = params.filter || 'all'
    const page = params.page || 1
    const pageSize = Math.min(params.pageSize || 50, 100)

    let query = admin
      .from('product_variants')
      .select(`
        id, variant_sku, size, color, barcode, price_override, product_id,
        products!inner(id, sku, name, base_price, price_with_tax, tax_rate, is_active)
      `)
      .eq('products.is_active', true)
      .eq('is_active', true)

    if (search) {
      query = query.or(
        `barcode.ilike.%${search}%,variant_sku.ilike.%${search}%,products.sku.ilike.%${search}%,products.name.ilike.%${search}%`
      )
    }

    const { data: raw, error } = await query.order('product_id', { ascending: true }).order('size', { ascending: true }).limit(5000)

    if (error) {
      console.error('[getProductsWithVariantsForBarcodes]', error)
      return success({ data: [], total: 0, page, pageSize, totalPages: 0, withoutBarcodeCount: 0 })
    }

    const rows = raw || []
    const byProduct = new Map<string, { product_id: string; product_name: string; product_sku: string; base_price: number; tax_rate_pct: number; variants: any[] }>()
    let withoutBarcodeCount = 0

    for (const v of rows) {
      const rawProducts = v.products
      const p = Array.isArray(rawProducts) ? rawProducts[0] ?? {} : (rawProducts ?? {}) as { id?: string; sku?: string; name?: string; base_price?: number; tax_rate?: number; is_active?: boolean }
      const productId = v.product_id
      const priceOverride = v.price_override != null ? Number(v.price_override) : null
      const basePrice = priceOverride ?? Number(p.base_price ?? 0)
      const taxRatePct = Number(p.tax_rate ?? 21)
      const priceWithTax = Math.round(basePrice * (1 + taxRatePct / 100) * 100) / 100
      const hasBarcode = Boolean(v.barcode && String(v.barcode).trim())
      if (!hasBarcode) withoutBarcodeCount++

      const variant = {
        variant_id: v.id,
        variant_sku: v.variant_sku,
        size: v.size,
        color: v.color,
        barcode: v.barcode,
        price_with_tax: priceWithTax,
        has_barcode: hasBarcode,
      }

      if (!byProduct.has(productId)) {
        byProduct.set(productId, {
          product_id: productId,
          product_name: p.name || '',
          product_sku: p.sku || '',
          base_price: basePrice,
          tax_rate_pct: taxRatePct,
          variants: [],
        })
      }
      byProduct.get(productId)!.variants.push(variant)
    }

    const products = Array.from(byProduct.values())
    const filtered = products.filter((prod) => {
      const allWith = prod.variants.every((v: any) => v.has_barcode)
      const allWithout = prod.variants.every((v: any) => !v.has_barcode)
      const partial = !allWith && !allWithout
      if (filter === 'with') return allWith
      if (filter === 'without') return allWithout
      if (filter === 'partial') return partial
      return true
    })

    filtered.sort((a, b) => a.product_name.localeCompare(b.product_name))
    const total = filtered.length
    const from = (page - 1) * pageSize
    const paginated = filtered.slice(from, from + pageSize)

    return success({
      data: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      withoutBarcodeCount,
    })
  }
)

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
        products!inner(id, sku, name, base_price, price_with_tax, is_active)
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
      filters: {
        ...(params.filters?.product_type === undefined ? { product_type: '!=tailoring_fabric' } : {}),
        ...params.filters,
      },
    }, `
      id, sku, name, product_type, brand, collection, season,
      base_price, price_with_tax, cost_price, main_image_url, color, fabric_meters_used,
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
      id, sku, name, base_price, price_with_tax, category_id, product_type, material, fabric_meters_used,
      product_categories!products_category_id_fkey(name),
      product_variants(id, stock_levels(quantity))
    `)
    return success(result)
  }
)

/** Busca productos de un proveedor por nombre (para selector en pedido a proveedor). */
export const searchProductsBySupplier = protectedAction<
  { supplierId: string; query?: string },
  { id: string; sku: string; name: string }[]
>(
  { permission: 'suppliers.create_order', auditModule: 'stock' },
  async (ctx, { supplierId, query }) => {
    if (!supplierId?.trim()) return success([])
    let q = ctx.adminClient
      .from('products')
      .select('id, sku, name')
      .eq('supplier_id', supplierId.trim())
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(20)
    if (query?.trim()) {
      q = q.ilike('name', `%${query.trim()}%`)
    }
    const { data, error } = await q
    if (error) return failure(error.message)
    return success((data ?? []) as { id: string; sku: string; name: string }[])
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

    const { metros_iniciales, ...productFields } = parsed.data
    const data = { ...productFields, created_by: ctx.userId }
    if (data.category_id === '' || data.category_id == null) data.category_id = null
    if (data.supplier_id === '' || data.supplier_id == null) data.supplier_id = null

    // Telas: INSERT solo en fabrics, sin tocar products
    if (data.product_type === 'tailoring_fabric') {
      if (!data.supplier_id) {
        return failure('Para crear una tela debes seleccionar un proveedor', 'VALIDATION')
      }

      const fabricCode = await generateFabricCode(ctx.adminClient, data.supplier_id)
      const { data: fabric, error: fabricError } = await ctx.adminClient
        .from('fabrics')
        .insert({
          fabric_code: fabricCode,
          name: data.name,
          supplier_id: data.supplier_id,
          supplier_reference: data.supplier_reference || null,
          category_id: null,
          collection: data.collection || null,
          season: data.season || null,
          description: data.description || null,
          stock_meters: metros_iniciales != null ? metros_iniciales : 0,
          is_active: data.is_active !== false,
        })
        .select()
        .single()

      if (fabricError) return failure(fabricError.message)
      return success({ ...fabric, product_type: 'tailoring_fabric', sku: data.sku })
    }

    // Otros tipos: INSERT en products
    const { data: existing } = await ctx.adminClient
      .from('products').select('id').eq('sku', data.sku).single()
    if (existing) return failure('Ya existe un producto con este SKU', 'CONFLICT')

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

    const { metros_iniciales, ...updateFields } = parsed.data

    const { data: product, error } = await ctx.adminClient
      .from('products').update(updateFields).eq('id', id).select().single()

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

    // Generar albarán automáticamente para traspaso directo.
    // Si falla, no bloquea el movimiento de stock.
    try {
      const [{ data: fromWh }, { data: variant }] = await Promise.all([
        ctx.adminClient.from('warehouses').select('id, store_id').eq('id', fromWarehouseId).single(),
        ctx.adminClient
          .from('product_variants')
          .select('id, variant_sku, price_override, products!inner(name, sku, base_price, price_with_tax)')
          .eq('id', variantId)
          .single(),
      ])
      const number = await generateDeliveryNoteNumberSafe(ctx.adminClient)
      const { data: note, error: noteErr } = await ctx.adminClient
        .from('delivery_notes')
        .insert({
          store_id: (fromWh as any)?.store_id || null,
          number,
          type: 'traspaso',
          status: 'confirmado',
          from_warehouse_id: fromWarehouseId,
          to_warehouse_id: toWarehouseId,
          notes: reasonText,
          confirmed_at: new Date().toISOString(),
          created_by: ctx.userId !== 'system' ? ctx.userId : null,
        })
        .select('id')
        .single()
      if (!noteErr && note?.id) {
        await ctx.adminClient.from('delivery_note_lines').insert({
          delivery_note_id: note.id,
          product_variant_id: variantId,
          product_name: (variant as any)?.products?.name ?? null,
          sku: (variant as any)?.variant_sku ?? (variant as any)?.products?.sku ?? null,
          quantity,
          unit_price: (variant as any)?.price_override != null
            ? Number((variant as any).price_override)
            : Number((variant as any)?.products?.base_price || 0),
          notes: null,
          sort_order: 0,
        })
      }
    } catch (e) {
      console.error('[moveStockBetweenWarehouses] auto delivery note:', e)
    }

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

/** Número de traspasos con status = requested (pendientes de aprobar). Sin permiso explícito para que el badge del sidebar funcione. */
export async function getPendingTransfersCount() {
  try {
    const { createServerSupabaseClient } = await import('@/lib/supabase/server')
    const supabase = await createServerSupabaseClient()
    const { count, error } = await supabase
      .from('stock_transfers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'requested')
    if (error) return { success: false as const, data: 0 }
    return { success: true as const, data: count ?? 0 }
  } catch {
    return { success: false as const, data: 0 }
  }
}

export const listTransferCandidates = protectedAction<
  { warehouseId: string; category?: 'all' | 'sastreria' | 'boutique' | 'tejidos'; search?: string; limit?: number },
  any[]
>(
  { permission: ['products.view', 'stock.view'], auditModule: 'stock' },
  async (ctx, { warehouseId, category = 'all', search, limit = 300 }) => {
    if (!warehouseId) return failure('Almacén de origen obligatorio', 'VALIDATION')
    const max = Math.min(Math.max(Number(limit) || 300, 1), 1500)

    const { data: levels, error: levelsError } = await ctx.adminClient
      .from('stock_levels')
      .select('product_variant_id, quantity, reserved')
      .eq('warehouse_id', warehouseId)
      .gt('quantity', 0)

    if (levelsError) return failure(levelsError.message || 'Error al cargar stock de origen', 'INTERNAL')
    if (!levels?.length) return success([])

    const stockMap = new Map<string, number>()
    for (const l of levels) {
      const available = Math.max(0, Number((l as any).quantity || 0) - Number((l as any).reserved || 0))
      if (available > 0) stockMap.set(String((l as any).product_variant_id), available)
    }
    const variantIds = Array.from(stockMap.keys())
    if (!variantIds.length) return success([])

    const { data: variants, error: variantError } = await ctx.adminClient
      .from('product_variants')
      .select(`
        id, variant_sku, product_id, is_active,
        products!inner(id, sku, name, product_type, is_active)
      `)
      .in('id', variantIds)
      .eq('is_active', true)
      .eq('products.is_active', true)

    if (variantError) return failure(variantError.message || 'Error al cargar variantes', 'INTERNAL')

    const s = (search || '').trim().toLowerCase()
    const rows = (variants || [])
      .map((v: any) => ({
        product_variant_id: v.id,
        variant_sku: v.variant_sku || '',
        product_id: v.product_id,
        product_sku: v.products?.sku || '',
        product_name: v.products?.name || '',
        product_type: v.products?.product_type || '',
        available: stockMap.get(String(v.id)) || 0,
      }))
      .filter((r: any) => r.available > 0)
      .filter((r: any) => {
        if (category === 'boutique') return r.product_type === 'boutique'
        if (category === 'tejidos') return r.product_type === 'tailoring_fabric'
        if (category === 'sastreria') return !['boutique', 'tailoring_fabric'].includes(r.product_type)
        return true
      })
      .filter((r: any) => {
        if (!s) return true
        return `${r.product_name} ${r.product_sku} ${r.variant_sku}`.toLowerCase().includes(s)
      })
      .sort((a: any, b: any) => `${a.product_name} ${a.variant_sku}`.localeCompare(`${b.product_name} ${b.variant_sku}`))

    return success(rows.slice(0, max))
  }
)

export const createStockTransfer = protectedAction<
  {
    from_warehouse_id: string
    to_warehouse_id: string
    notes?: string | null
    lines: Array<{ product_variant_id: string; quantity_requested: number }>
  },
  { id: string; transfer_number: string; lines: number }
>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'create',
    auditEntity: 'stock_transfer',
    revalidate: ['/admin/stock'],
  },
  async (ctx, input) => {
    const fromWarehouseId = String(input.from_warehouse_id || '').trim()
    const toWarehouseId = String(input.to_warehouse_id || '').trim()
    if (!fromWarehouseId || !toWarehouseId) return failure('Debes seleccionar almacén origen y destino', 'VALIDATION')
    if (fromWarehouseId === toWarehouseId) return failure('Origen y destino deben ser distintos', 'VALIDATION')

    const grouped = new Map<string, number>()
    for (const line of input.lines || []) {
      const variantId = String(line.product_variant_id || '').trim()
      const qty = Number(line.quantity_requested)
      if (!variantId || !Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) continue
      grouped.set(variantId, (grouped.get(variantId) || 0) + qty)
    }
    if (!grouped.size) return failure('Debes añadir al menos una línea válida', 'VALIDATION')

    const { data: warehouses, error: whError } = await ctx.adminClient
      .from('warehouses')
      .select('id')
      .in('id', [fromWarehouseId, toWarehouseId])
      .eq('is_active', true)
    if (whError) return failure(whError.message || 'Error al validar almacenes', 'INTERNAL')
    if ((warehouses || []).length < 2) return failure('Almacén origen o destino no válido', 'VALIDATION')

    const variantIds = Array.from(grouped.keys())
    const { data: levels, error: levelsError } = await ctx.adminClient
      .from('stock_levels')
      .select('product_variant_id, quantity, reserved')
      .eq('warehouse_id', fromWarehouseId)
      .in('product_variant_id', variantIds)

    if (levelsError) return failure(levelsError.message || 'Error al validar stock de origen', 'INTERNAL')

    const availableMap = new Map<string, number>()
    for (const row of levels || []) {
      const available = Math.max(0, Number((row as any).quantity || 0) - Number((row as any).reserved || 0))
      availableMap.set(String((row as any).product_variant_id), available)
    }
    for (const [variantId, requested] of grouped.entries()) {
      const available = availableMap.get(variantId) || 0
      if (available < requested) {
        return failure(`Stock insuficiente para variante ${variantId}: disponible ${available}, solicitado ${requested}`, 'CONFLICT')
      }
    }

    const transferNumber = await getNextNumber('stock_transfers', 'transfer_number', 'TRF')
    const { data: transfer, error: transferError } = await ctx.adminClient
      .from('stock_transfers')
      .insert({
        transfer_number: transferNumber,
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        status: 'requested',
        requested_by: ctx.userId,
        notes: (input.notes || '').trim() || null,
      })
      .select('id, transfer_number')
      .single()

    if (transferError || !transfer?.id) {
      return failure(transferError?.message || 'Error al crear el traspaso', 'INTERNAL')
    }

    const linesPayload = Array.from(grouped.entries()).map(([productVariantId, quantityRequested]) => ({
      transfer_id: transfer.id,
      product_variant_id: productVariantId,
      quantity_requested: quantityRequested,
      quantity_sent: 0,
      quantity_received: 0,
    }))
    const { error: linesError } = await ctx.adminClient.from('stock_transfer_lines').insert(linesPayload)
    if (linesError) {
      await ctx.adminClient.from('stock_transfers').delete().eq('id', transfer.id)
      return failure(linesError.message || 'Error al crear líneas de traspaso', 'INTERNAL')
    }

    return success({ id: transfer.id, transfer_number: transfer.transfer_number, lines: linesPayload.length })
  }
)

/** Listado de traspasos para la pestaña Traspasos (filtro por status). */
export const listStockTransfers = protectedAction<
  { status?: string; page?: number; pageSize?: number },
  { data: any[]; total: number }
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, { status = 'requested', page = 0, pageSize = 20 }) => {
    const from = page * pageSize
    const to = from + pageSize - 1
    let query = ctx.adminClient
      .from('stock_transfers')
      .select(
        `
        id, transfer_number, from_warehouse_id, to_warehouse_id, status, requested_by, approved_by, approved_at, notes, created_at,
        from_warehouse:warehouses!from_warehouse_id ( id, name, code ),
        to_warehouse:warehouses!to_warehouse_id ( id, name, code ),
        profiles!requested_by ( full_name ),
        delivery_notes ( id )
        `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, to)
    if (status && status !== 'all') query = query.eq('status', status)
    const { data, count, error } = await query
    if (error) {
      console.error('[listStockTransfers]', error)
      return failure(error.message || 'Error al cargar traspasos', 'INTERNAL')
    }
    const rows = (data ?? []).map((t: any) => ({
      ...t,
      requested_by_name: t.profiles?.full_name,
      delivery_note_id: t.delivery_notes?.[0]?.id ?? null,
    }))
    return success({ data: rows, total: count ?? 0 })
  }
)

/** Aprobar un traspaso (status → approved). Mueve el stock y registra movimientos (transfer_out/transfer_in). */
export const approveStockTransfer = protectedAction<{ id: string }, void>(
  { permission: 'products.edit', auditModule: 'stock' },
  async (ctx, { id }) => {
    const profileId = ctx.userId
    if (!profileId) return failure('No hay sesión', 'UNAUTHORIZED')
    const { data: transfer, error: transferError } = await ctx.adminClient
      .from('stock_transfers')
      .select('id, requested_by, status, from_warehouse_id, to_warehouse_id, transfer_number, notes')
      .eq('id', id)
      .single()
    if (transferError || !transfer) return failure('Traspaso no encontrado', 'NOT_FOUND')
    if ((transfer as any).status !== 'requested') return failure('Este traspaso ya no está pendiente de aprobación', 'CONFLICT')
    if ((transfer as any).requested_by === profileId) {
      return failure('No puedes aprobar un traspaso solicitado por ti mismo', 'FORBIDDEN')
    }
    const fromWarehouseId = (transfer as any).from_warehouse_id
    const toWarehouseId = (transfer as any).to_warehouse_id
    const reasonText = ((transfer as any).notes || '').trim() || `Traspaso ${(transfer as any).transfer_number || id}`
    const requestedBy = (transfer as any).requested_by ?? null

    const { data: lines, error: linesError } = await ctx.adminClient
      .from('stock_transfer_lines')
      .select('product_variant_id, quantity_requested, quantity_sent')
      .eq('transfer_id', id)
    if (linesError || !lines?.length) return failure('No hay líneas en el traspaso', 'VALIDATION')

    const variantIds = [...new Set((lines as any[]).map((l: any) => l.product_variant_id))]
    const { data: fromLevels } = await ctx.adminClient
      .from('stock_levels')
      .select('product_variant_id, id, quantity')
      .eq('warehouse_id', fromWarehouseId)
      .in('product_variant_id', variantIds)
    const fromMap = new Map((fromLevels || []).map((r: any) => [r.product_variant_id, { id: r.id, quantity: Number(r.quantity || 0) }]))

    for (const line of lines as any[]) {
      const qty = Number(line.quantity_sent) > 0 ? Number(line.quantity_sent) : Number(line.quantity_requested || 0)
      if (qty <= 0) continue
      const fromLevel = fromMap.get(line.product_variant_id)
      if (!fromLevel) return failure(`Sin stock en origen para variante ${line.product_variant_id}`, 'CONFLICT')
      if (fromLevel.quantity < qty) return failure(`Stock insuficiente en origen para variante ${line.product_variant_id}: disponible ${fromLevel.quantity}, solicitado ${qty}`, 'CONFLICT')
    }

    for (const line of lines as any[]) {
      const variantId = (line as any).product_variant_id
      const quantity = Number((line as any).quantity_sent) > 0 ? Number((line as any).quantity_sent) : Number((line as any).quantity_requested || 0)
      if (quantity <= 0) continue

      const fromLevel = fromMap.get(variantId)!
      const { data: toLevelExisting } = await ctx.adminClient
        .from('stock_levels')
        .select('id, quantity')
        .eq('product_variant_id', variantId)
        .eq('warehouse_id', toWarehouseId)
        .single()
      let toLevel: { id: string; quantity: number }
      if (toLevelExisting) {
        toLevel = { id: (toLevelExisting as any).id, quantity: Number((toLevelExisting as any).quantity || 0) }
      } else {
        const { data: newLevel, error: insertErr } = await ctx.adminClient
          .from('stock_levels')
          .insert({ product_variant_id: variantId, warehouse_id: toWarehouseId, quantity: 0, reserved: 0 })
          .select('id, quantity')
          .single()
        if (insertErr || !newLevel) return failure('Error al crear stock en almacén destino', 'INTERNAL')
        toLevel = { id: (newLevel as any).id, quantity: 0 }
      }

      const fromBefore = fromLevel.quantity
      const fromAfter = fromBefore - quantity
      const toBefore = toLevel.quantity
      const toAfter = toBefore + quantity

      const { error: movError } = await ctx.adminClient.from('stock_movements').insert([
        { product_variant_id: variantId, warehouse_id: fromWarehouseId, movement_type: 'transfer_out', quantity: -quantity, stock_before: fromBefore, stock_after: fromAfter, reason: reasonText, created_by: requestedBy },
        { product_variant_id: variantId, warehouse_id: toWarehouseId, movement_type: 'transfer_in', quantity, stock_before: toBefore, stock_after: toAfter, reason: reasonText, created_by: profileId },
      ])
      if (movError) {
        console.error('[approveStockTransfer] stock_movements:', movError)
        return failure(movError.message || 'Error al registrar movimientos de stock', 'INTERNAL')
      }
      await ctx.adminClient.from('stock_levels').update({ quantity: fromAfter, last_movement_at: new Date().toISOString() }).eq('id', fromLevel.id)
      await ctx.adminClient.from('stock_levels').update({ quantity: toAfter, last_movement_at: new Date().toISOString() }).eq('id', toLevel.id)
      fromMap.set(variantId, { id: fromLevel.id, quantity: fromAfter })
    }

    const { error } = await ctx.adminClient
      .from('stock_transfers')
      .update({
        status: 'approved',
        approved_by: profileId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'requested')
    if (error) return failure(error.message || 'Error al aprobar traspaso', 'INTERNAL')

    // Generar albarán automático al aprobar traspaso solicitado.
    // Si falla, no revierte la aprobación.
    try {
      const { data: existing } = await ctx.adminClient
        .from('delivery_notes')
        .select('id')
        .eq('stock_transfer_id', id)
        .limit(1)
        .maybeSingle()
      if (!existing?.id) {
        const { data: transferData } = await ctx.adminClient
          .from('stock_transfers')
          .select('id, from_warehouse_id, to_warehouse_id, notes, warehouses!from_warehouse_id(store_id)')
          .eq('id', id)
          .single()
        if (transferData) {
          const number = await generateDeliveryNoteNumberSafe(ctx.adminClient)
          const { data: note, error: noteErr } = await ctx.adminClient
            .from('delivery_notes')
            .insert({
              store_id: (transferData as any)?.warehouses?.store_id || null,
              number,
              type: 'traspaso',
              status: 'confirmado',
              from_warehouse_id: (transferData as any).from_warehouse_id,
              to_warehouse_id: (transferData as any).to_warehouse_id,
              stock_transfer_id: id,
              notes: (transferData as any).notes || null,
              confirmed_at: new Date().toISOString(),
              created_by: ctx.userId !== 'system' ? ctx.userId : null,
            })
            .select('id')
            .single()

          if (!noteErr && note?.id) {
            const { data: lines } = await ctx.adminClient
              .from('stock_transfer_lines')
              .select('product_variant_id, quantity_requested, quantity_sent, product_variants(variant_sku, products(name, sku, base_price, price_with_tax), price_override)')
              .eq('transfer_id', id)
            if (lines?.length) {
              const payload = lines
                .map((l: any, idx: number) => ({
                  delivery_note_id: note.id,
                  product_variant_id: l.product_variant_id,
                  product_name: l.product_variants?.products?.name ?? null,
                  sku: l.product_variants?.variant_sku ?? l.product_variants?.products?.sku ?? null,
                  quantity: Number(l.quantity_sent) > 0 ? Number(l.quantity_sent) : Number(l.quantity_requested || 0),
                  unit_price: l.product_variants?.price_override != null
                    ? Number(l.product_variants.price_override)
                    : Number(l.product_variants?.products?.base_price || 0),
                  sort_order: idx,
                }))
                .filter((x: any) => x.quantity > 0)
              if (payload.length) await ctx.adminClient.from('delivery_note_lines').insert(payload)
            }
          }
        }
      }
    } catch (e) {
      console.error('[approveStockTransfer] auto delivery note:', e)
    }

    return success(undefined)
  }
)

/** Rechazar/cancelar un traspaso (status → cancelled). */
export const rejectStockTransfer = protectedAction<{ id: string }, void>(
  { permission: 'products.edit', auditModule: 'stock' },
  async (ctx, { id }) => {
    const { error } = await ctx.adminClient
      .from('stock_transfers')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'requested')
    if (error) return failure(error.message || 'Error al rechazar traspaso', 'INTERNAL')
    return success(undefined)
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
        products!inner(id, sku, name, base_price, price_with_tax, tax_rate, main_image_url, cost_price, is_active),
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
      .select('id, sku, name, base_price, price_with_tax, tax_rate, cost_price, main_image_url')
      .eq('barcode', trimmed)
      .eq('is_active', true)
      .single()

    if (!product) return success(null)

    const { data: variants } = await ctx.adminClient
      .from('product_variants')
      .select(`
        id, variant_sku, size, color, price_override, is_active,
        products!inner(id, sku, name, base_price, price_with_tax, tax_rate, main_image_url, cost_price),
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
      .select('id, variant_sku, size, color, barcode, price_override, product_id, products!inner(sku, name, base_price, price_with_tax)')
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
      .select('id, sku, name, barcode, base_price, price_with_tax')
      .in('id', ids)
      .eq('is_active', true)
    const list = (data || []).filter((p: any) => p.barcode)
    return success(list)
  }
)
