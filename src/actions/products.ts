'use server'

import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber } from '@/lib/server/query-helpers'
import { createProductSchema, updateProductSchema, createVariantSchema, updateVariantSchema } from '@/lib/validations/products'
import { sortBySize } from '@/lib/utils/sort-sizes'
import { success, failure } from '@/lib/errors'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'
import { generateEAN13, validateEAN13 } from '@/lib/barcode/ean13'
import { generateSkuBase } from '@/lib/utils/sku'
import { generateFabricCode } from '@/actions/fabrics'
import { buildAuditDiff } from '@/lib/audit'

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

/** Genera el siguiente SKU correlativo: XXXXX */
export const generateProductSkuAction = protectedAction<
  { productType: string; productName: string },
  { sku: string }
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, { productType: _pt, productName }) => {
    const name = String(productName || '').trim()
    if (!name) return failure('Escribe el nombre del producto primero', 'VALIDATION')

    // Buscar el mayor número entre los SKUs (soporta PRATS-NNNNN legacy y NNNNN nuevo)
    const { data } = await ctx.adminClient
      .from('products')
      .select('sku')
      .order('sku', { ascending: false })
      .limit(500)

    let maxNum = 0
    for (const row of data || []) {
      const sku = row.sku as string
      // Soportar formato legacy PRATS-NNNNN y nuevo NNNNN
      const match = sku.match(/^(?:PRATS-)?(\d+)$/)
      if (match) {
        const num = parseInt(match[1], 10)
        if (num > maxNum) maxNum = num
      }
    }

    const nextNum = maxNum + 1
    const sku = String(nextNum).padStart(5, '0')
    return success({ sku })
  }
)

/** Obtiene variantes de un producto por ID (usa adminClient para evitar problemas de RLS). */
export const getProductVariantsById = protectedAction<
  string,
  { id: string; size: string | null; color: string | null }[]
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, productId) => {
    if (!productId?.trim()) return success([])
    const { data, error } = await ctx.adminClient
      .from('product_variants')
      .select('id, size, color')
      .eq('product_id', productId.trim())
      .eq('is_active', true)
      .order('size')
    if (error) return failure(error.message)
    return success(sortBySize((data ?? []) as { id: string; size: string | null; color: string | null }[]))
  }
)

async function generateDeliveryNoteNumberSafe(adminClient: AdminClient): Promise<string> {
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

    const { data: raw, error } = await query.order('product_id', { ascending: true }).order('size', { ascending: true }).limit(5000)

    if (error) {
      console.error('[getProductsWithVariantsForBarcodes]', error)
      return success({ data: [], total: 0, page, pageSize, totalPages: 0, withoutBarcodeCount: 0 })
    }

    const rows = raw || []
    const byProduct = new Map<string, { product_id: string; product_name: string; product_sku: string; price_with_tax: number; tax_rate_pct: number; variants: any[] }>()
    let withoutBarcodeCount = 0

    for (const v of rows) {
      const rawProducts = v.products
      const p = Array.isArray(rawProducts) ? rawProducts[0] ?? {} : (rawProducts ?? {}) as { id?: string; sku?: string; name?: string; base_price?: number; price_with_tax?: number; tax_rate?: number; is_active?: boolean }
      const productId = v.product_id
      const priceOverride = v.price_override != null ? Number(v.price_override) : null
      const productPriceWithTax = Number(p.price_with_tax ?? 0)
      const priceWithTax = priceOverride ?? productPriceWithTax
      const taxRatePct = Number(p.tax_rate ?? 21)
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
          price_with_tax: productPriceWithTax,
          tax_rate_pct: taxRatePct,
          variants: [],
        })
      }
      byProduct.get(productId)!.variants.push(variant)
    }

    const products = Array.from(byProduct.values())

    // Búsqueda por nombre, SKU producto, SKU variante, barcode o referencia
    const searchLower = search?.toLowerCase()
    const searched = searchLower
      ? products.filter((prod) =>
          prod.product_name.toLowerCase().includes(searchLower) ||
          prod.product_sku.toLowerCase().includes(searchLower) ||
          prod.variants.some((v: any) =>
            (v.variant_sku && v.variant_sku.toLowerCase().includes(searchLower)) ||
            (v.barcode && v.barcode.startsWith(searchLower))
          )
        )
      : products

    const filtered = searched.filter((prod) => {
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
      product_categories!products_category_id_fkey(name),
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

/** Valores distintos de `collection` (no nulos). Para poblar el filtro del admin. */
export const listProductCollections = protectedAction<void, string[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('products')
      .select('collection')
      .not('collection', 'is', null)
      .neq('collection', '')
      .limit(2000)
    if (error) return failure(error.message)
    const unique = Array.from(new Set((data || []).map((r: any) => String(r.collection).trim()).filter(Boolean)))
    unique.sort((a, b) => a.localeCompare(b, 'es'))
    return success(unique)
  }
)

/** Valores distintos de `season` (no nulos). Para poblar el filtro del admin. */
export const listProductSeasons = protectedAction<void, string[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('products')
      .select('season')
      .not('season', 'is', null)
      .neq('season', '')
      .limit(2000)
    if (error) return failure(error.message)
    const unique = Array.from(new Set((data || []).map((r: any) => String(r.season).trim()).filter(Boolean)))
    unique.sort((a, b) => a.localeCompare(b, 'es'))
    return success(unique)
  }
)

/** Devuelve sólo los IDs de productos que cumplen los filtros dados. Usado por
 *  "Seleccionar todos los filtrados" en la tabla del admin. */
export const listProductIdsByFilters = protectedAction<
  {
    search?: string | null
    product_type?: string | null
    is_visible_web?: boolean | null
    collection?: string | null
    season?: string | null
  },
  string[]
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, input) => {
    let q = ctx.adminClient.from('products').select('id')

    if (input.product_type) q = q.eq('product_type', input.product_type)
    else q = q.neq('product_type', 'tailoring_fabric')
    if (input.is_visible_web !== null && input.is_visible_web !== undefined) q = q.eq('is_visible_web', input.is_visible_web)
    if (input.collection) q = q.eq('collection', input.collection)
    if (input.season) q = q.eq('season', input.season)
    if (input.search && input.search.trim()) {
      const s = input.search.trim().replace(/[%_\\]/g, '\\$&')
      const like = `%${s}%`
      q = q.or(`sku.ilike.${like},name.ilike.${like},brand.ilike.${like},barcode.ilike.${like}`)
    }

    const { data, error } = await q.limit(10000)
    if (error) return failure(error.message)
    return success((data || []).map((r: any) => r.id as string))
  }
)

/** Actualiza en lote campos simples de varios productos.
 *  Por ahora solo soporta `is_visible_web` — ampliable en el futuro. */
export const updateProductsBulkAction = protectedAction<
  { ids: string[]; patch: { is_visible_web?: boolean } },
  { updated: number }
>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'product',
    revalidate: ['/admin/stock', '/boutique'],
  },
  async (ctx, { ids, patch }) => {
    if (!Array.isArray(ids) || ids.length === 0) return failure('No hay productos seleccionados', 'VALIDATION')
    if (patch.is_visible_web === undefined) return failure('Nada que actualizar', 'VALIDATION')

    const { error, count } = await ctx.adminClient
      .from('products')
      .update({ is_visible_web: patch.is_visible_web }, { count: 'exact' })
      .in('id', ids)

    if (error) return failure(error.message)

    const action = patch.is_visible_web ? 'publicados en web' : 'ocultos de la web'
    return success({
      updated: count ?? ids.length,
      auditDescription: `Actualización masiva: ${count ?? ids.length} productos ${action}`,
      auditNewData: { ids, patch },
    } as any)
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

    const { data: before } = await ctx.adminClient
      .from('products').select('*').eq('id', id).single()

    const { data: product, error } = await ctx.adminClient
      .from('products').update(updateFields).eq('id', id).select().single()

    if (error) return failure(error.message)
    const diff = buildAuditDiff(before as Record<string, unknown> | null, product as Record<string, unknown> | null)
    return success({
      ...(product as Record<string, unknown>),
      auditDescription: `Producto: ${(product as any)?.name ?? (product as any)?.sku ?? id}`,
      auditOldData: diff?.auditOldData,
      auditNewData: diff?.auditNewData,
    })
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

export const updateVariantAction = protectedAction<any, any>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'product_variant',
    revalidate: ['/admin/stock'],
  },
  async (ctx, input) => {
    const parsed = updateVariantSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

    const { id, ...fields } = parsed.data
    const updateFields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updateFields[k] = v
    }
    if (Object.keys(updateFields).length === 0) {
      return failure('Sin cambios', 'VALIDATION')
    }
    updateFields.updated_at = new Date().toISOString()

    const { data: variant, error } = await ctx.adminClient
      .from('product_variants')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single()

    if (error) return failure(error.message)
    return success({
      ...(variant as Record<string, unknown>),
      auditDescription: `Variante: ${(variant as any)?.variant_sku ?? id}`,
    })
  }
)

export const deleteVariantAction = protectedAction<string, void>(
  {
    permission: 'products.delete',
    auditModule: 'stock',
    auditAction: 'delete',
    auditEntity: 'product_variant',
    revalidate: ['/admin/stock'],
  },
  async (ctx, variantId) => {
    // Verificar que la variante existe
    const { data: variant, error: fetchErr } = await ctx.adminClient
      .from('product_variants')
      .select('id, variant_sku')
      .eq('id', variantId)
      .single()
    if (fetchErr || !variant) return failure('Variante no encontrada', 'NOT_FOUND')

    // Eliminar movimientos de stock asociados para evitar restrict
    await ctx.adminClient.from('stock_movements').delete().eq('product_variant_id', variantId)

    // stock_levels se eliminan en cascada
    const { error } = await ctx.adminClient.from('product_variants').delete().eq('id', variantId)
    if (error) return failure(error.message)

    return success(undefined)
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
      .select('id, product_id, variant_sku, size, color')
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
    const { data: warehouse } = await ctx.adminClient
      .from('warehouses')
      .select('name, code')
      .eq('id', warehouseId)
      .single()
    const warehouseName = (warehouse as any)?.name ?? 'Almacén'
    const variantDesc = [(variant as any)?.size, (variant as any)?.color].filter(Boolean).join(' · ')
    const auditDescription = `Stock: ${productName}${variantDesc ? ` (${variantDesc})` : ''} · ${delta >= 0 ? '+' : ''}${delta} uds · ${warehouseName}`
    return success({
      ...movement,
      auditDescription,
      auditOldData: { cantidad: stockBefore, almacén: warehouseName },
      auditNewData: { cantidad: stockAfter, almacén: warehouseName },
      auditMetadata: {
        tipo_movimiento: movementType,
        delta,
        motivo: reason,
        sku_variante: (variant as any)?.variant_sku,
      },
    })
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

    // Resolver nombres para auditoría
    const [{ data: fromWh2 }, { data: toWh2 }, { data: variantInfo }] = await Promise.all([
      ctx.adminClient.from('warehouses').select('name').eq('id', fromWarehouseId).single(),
      ctx.adminClient.from('warehouses').select('name').eq('id', toWarehouseId).single(),
      ctx.adminClient
        .from('product_variants')
        .select('variant_sku, size, color, product_id, products(name)')
        .eq('id', variantId)
        .single(),
    ])
    const fromName = (fromWh2 as any)?.name ?? 'Origen'
    const toName = (toWh2 as any)?.name ?? 'Destino'
    const productName = (variantInfo as any)?.products?.name ?? 'Producto'
    const variantDesc = [(variantInfo as any)?.size, (variantInfo as any)?.color].filter(Boolean).join(' · ')
    const auditDescription = `Traspaso: ${productName}${variantDesc ? ` (${variantDesc})` : ''} · ${quantity} uds · ${fromName} → ${toName}`

    return success({
      fromAfter,
      toAfter,
      auditDescription,
      auditOldData: { [fromName]: fromBefore, [toName]: toBefore },
      auditNewData: { [fromName]: fromAfter, [toName]: toAfter },
      auditMetadata: { cantidad: quantity, motivo: reasonText, sku_variante: (variantInfo as any)?.variant_sku },
    })
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

    const BATCH_SIZE = 150
    const allVariants: any[] = []
    for (let i = 0; i < variantIds.length; i += BATCH_SIZE) {
      const batch = variantIds.slice(i, i + BATCH_SIZE)
      const { data: variants, error: variantError } = await ctx.adminClient
        .from('product_variants')
        .select(`
          id, variant_sku, product_id, is_active,
          products!inner(id, sku, name, product_type, is_active)
        `)
        .in('id', batch)
        .eq('is_active', true)
        .eq('products.is_active', true)

      if (variantError) return failure(variantError.message || 'Error al cargar variantes', 'INTERNAL')
      if (variants?.length) allVariants.push(...variants)
    }

    const s = (search || '').trim().toLowerCase()
    const rows = allVariants
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

export const searchTransferProducts = protectedAction<
  { search: string; fromWarehouseId: string; limit?: number },
  any[]
>(
  { permission: ['products.view', 'stock.view'], auditModule: 'stock' },
  async (ctx, { search, fromWarehouseId, limit = 30 }) => {
    const s = String(search || '').trim()
    if (s.length < 3) return success([])
    if (!fromWarehouseId) return failure('Almacén de origen obligatorio', 'VALIDATION')
    const max = Math.min(Math.max(Number(limit) || 30, 1), 100)
    const safe = s.replace(/[,()%*]/g, ' ').trim()
    if (!safe) return success([])
    const like = `%${safe}%`

    const { data: byVariant, error: vErr } = await ctx.adminClient
      .from('product_variants')
      .select(`
        id, variant_sku, barcode, size, color, product_id, is_active,
        products!inner(id, sku, name, product_type, is_active)
      `)
      .or(`variant_sku.ilike.${like},barcode.ilike.${like}`)
      .eq('is_active', true)
      .eq('products.is_active', true)
      .limit(max)
    if (vErr) return failure(vErr.message || 'Error buscando variantes', 'INTERNAL')

    const { data: byProduct, error: pErr } = await ctx.adminClient
      .from('products')
      .select('id')
      .or(`sku.ilike.${like},name.ilike.${like},barcode.ilike.${like}`)
      .eq('is_active', true)
      .limit(max)
    if (pErr) return failure(pErr.message || 'Error buscando productos', 'INTERNAL')

    const productIds = (byProduct || []).map((p: any) => p.id)
    let byProductVariants: any[] = []
    if (productIds.length) {
      const { data: variantsByProduct, error: vpErr } = await ctx.adminClient
        .from('product_variants')
        .select(`
          id, variant_sku, barcode, size, color, product_id, is_active,
          products!inner(id, sku, name, product_type, is_active)
        `)
        .in('product_id', productIds)
        .eq('is_active', true)
        .eq('products.is_active', true)
        .limit(max * 4)
      if (vpErr) return failure(vpErr.message || 'Error buscando variantes por producto', 'INTERNAL')
      byProductVariants = variantsByProduct || []
    }

    const variantMap = new Map<string, any>()
    for (const v of [...(byVariant || []), ...byProductVariants]) {
      variantMap.set(String((v as any).id), v)
    }
    const variantIds = Array.from(variantMap.keys())
    if (!variantIds.length) return success([])

    const BATCH = 150
    const stockRows: any[] = []
    for (let i = 0; i < variantIds.length; i += BATCH) {
      const batch = variantIds.slice(i, i + BATCH)
      const { data: levels, error: lErr } = await ctx.adminClient
        .from('stock_levels')
        .select('product_variant_id, warehouse_id, quantity, reserved')
        .in('product_variant_id', batch)
      if (lErr) return failure(lErr.message || 'Error al cargar stock', 'INTERNAL')
      if (levels?.length) stockRows.push(...levels)
    }

    const { data: warehouses, error: wErr } = await ctx.adminClient
      .from('warehouses')
      .select('id, name, code')
      .eq('is_active', true)
    if (wErr) return failure(wErr.message || 'Error al cargar almacenes', 'INTERNAL')
    const warehouseMap = new Map<string, { id: string; name: string; code: string }>()
    for (const w of warehouses || []) warehouseMap.set(String((w as any).id), w as any)

    const stockByVariant = new Map<string, Array<{ warehouse_id: string; warehouse_name: string; warehouse_code: string; available: number }>>()
    for (const row of stockRows) {
      const vid = String((row as any).product_variant_id)
      const wid = String((row as any).warehouse_id)
      const w = warehouseMap.get(wid)
      if (!w) continue
      const available = Math.max(0, Number((row as any).quantity || 0) - Number((row as any).reserved || 0))
      const list = stockByVariant.get(vid) || []
      list.push({ warehouse_id: wid, warehouse_name: w.name, warehouse_code: w.code, available })
      stockByVariant.set(vid, list)
    }

    const rows = variantIds
      .map((vid) => {
        const v = variantMap.get(vid)
        const stocks = (stockByVariant.get(vid) || []).sort((a, b) => a.warehouse_name.localeCompare(b.warehouse_name))
        const originStock = stocks.find((x) => x.warehouse_id === fromWarehouseId)
        return {
          product_variant_id: v.id,
          variant_sku: v.variant_sku || '',
          barcode: v.barcode || '',
          size: v.size || '',
          color: v.color || '',
          product_id: v.product_id,
          product_sku: v.products?.sku || '',
          product_name: v.products?.name || '',
          product_type: v.products?.product_type || '',
          available: originStock?.available || 0,
          stocks,
        }
      })
      .filter((r) => r.available > 0)
      .sort((a, b) => `${a.product_name} ${a.variant_sku}`.localeCompare(`${b.product_name} ${b.variant_sku}`))
      .slice(0, max)

    return success(rows)
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
    permission: 'stock.transfer',
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
        id, transfer_number, from_warehouse_id, to_warehouse_id, status, requested_by, approved_by, approved_at,
        admin_approved_by, admin_approved_at, destination_approved_by, destination_approved_at,
        notes, created_at,
        from_warehouse:warehouses!from_warehouse_id ( id, name, code, store_id ),
        to_warehouse:warehouses!to_warehouse_id ( id, name, code, store_id ),
        profiles!requested_by ( full_name ),
        admin_approver:profiles!admin_approved_by ( full_name ),
        destination_approver:profiles!destination_approved_by ( full_name ),
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
      admin_approved_by_name: t.admin_approver?.full_name ?? null,
      destination_approved_by_name: t.destination_approver?.full_name ?? null,
      delivery_note_id: t.delivery_notes?.[0]?.id ?? null,
    }))
    return success({ data: rows, total: count ?? 0 })
  }
)

/**
 * Aprobar un traspaso. Requiere DOBLE aprobación:
 *   - admin: un usuario con rol administrador / admin / super_admin
 *   - destination: un usuario asignado a la tienda del almacén destino
 * Cada llamada marca UNA de las dos aprobaciones (según el rol del usuario,
 * o el parámetro `as`). El stock solo se mueve y el status pasa a 'approved'
 * cuando ambas aprobaciones están registradas. El creador nunca puede aprobar.
 */
export const approveStockTransfer = protectedAction<
  { id: string; as?: 'admin' | 'destination' },
  { status: 'admin_approved' | 'destination_approved' | 'approved' }
>(
  { permission: 'stock.approve_transfer', auditModule: 'stock' },
  async (ctx, { id, as }) => {
    const profileId = ctx.userId
    if (!profileId) return failure('No hay sesión', 'UNAUTHORIZED')
    const { data: transfer, error: transferError } = await ctx.adminClient
      .from('stock_transfers')
      .select('id, requested_by, status, from_warehouse_id, to_warehouse_id, transfer_number, notes, admin_approved_by, admin_approved_at, destination_approved_by, destination_approved_at')
      .eq('id', id)
      .single()
    if (transferError || !transfer) return failure('Traspaso no encontrado', 'NOT_FOUND')
    if ((transfer as any).status !== 'requested') return failure('Este traspaso ya no está pendiente de aprobación', 'CONFLICT')
    if ((transfer as any).requested_by === profileId) {
      return failure('No puedes aprobar un traspaso solicitado por ti mismo', 'FORBIDDEN')
    }

    const adminApprovedAt = (transfer as any).admin_approved_at
    const adminApprovedBy = (transfer as any).admin_approved_by
    const destApprovedAt = (transfer as any).destination_approved_at
    const toWarehouseId = (transfer as any).to_warehouse_id
    const fromWarehouseId = (transfer as any).from_warehouse_id

    // ¿Es admin? (mismo criterio que auth-provider)
    const { data: roleRows } = await ctx.adminClient
      .from('user_roles')
      .select('role:roles ( name, system_role )')
      .eq('user_id', profileId)
    const roleNames = (roleRows || []).flatMap((r: any) => [r.role?.name, r.role?.system_role]).filter(Boolean) as string[]
    const isAdminUser = roleNames.some((n) => ['administrador', 'admin', 'super_admin'].includes(n))

    // ¿Está asignado a la tienda destino?
    const { data: destStore } = await ctx.adminClient
      .from('warehouses')
      .select('store_id')
      .eq('id', toWarehouseId)
      .single()
    const destStoreId = (destStore as any)?.store_id || null
    let isDestinationUser = false
    if (destStoreId) {
      const { data: storeAssignment } = await ctx.adminClient
        .from('user_stores')
        .select('id')
        .eq('user_id', profileId)
        .eq('store_id', destStoreId)
        .maybeSingle()
      isDestinationUser = !!storeAssignment
    }

    // Resolver qué aprobación aplica
    let role: 'admin' | 'destination'
    if (as === 'admin' || as === 'destination') {
      role = as
    } else if (isAdminUser && isDestinationUser) {
      role = !adminApprovedAt ? 'admin' : 'destination'
    } else if (isAdminUser) {
      role = 'admin'
    } else if (isDestinationUser) {
      role = 'destination'
    } else {
      return failure('No tienes permiso para aprobar este traspaso (se requiere rol admin o pertenecer a la tienda destino)', 'FORBIDDEN')
    }

    if (role === 'admin' && !isAdminUser) return failure('No tienes rol admin para aprobar como admin', 'FORBIDDEN')
    if (role === 'destination' && !isDestinationUser) return failure('No estás asignado a la tienda destino', 'FORBIDDEN')

    if (role === 'admin' && adminApprovedAt) return failure('Este traspaso ya tiene la aprobación del admin', 'CONFLICT')
    if (role === 'destination' && destApprovedAt) return failure('Este traspaso ya tiene la aprobación de la tienda destino', 'CONFLICT')

    // Evitar que una misma persona haga las dos aprobaciones
    if (role === 'admin' && destApprovedAt && (transfer as any).destination_approved_by === profileId) {
      return failure('Un mismo usuario no puede firmar ambas aprobaciones; que otro admin apruebe', 'FORBIDDEN')
    }
    if (role === 'destination' && adminApprovedAt && adminApprovedBy === profileId) {
      return failure('Un mismo usuario no puede firmar ambas aprobaciones; que otro usuario de la tienda apruebe', 'FORBIDDEN')
    }

    const nowIso = new Date().toISOString()
    const update: Record<string, any> = { updated_at: nowIso }
    if (role === 'admin') {
      update.admin_approved_by = profileId
      update.admin_approved_at = nowIso
    } else {
      update.destination_approved_by = profileId
      update.destination_approved_at = nowIso
    }

    // Si con esta aprobación se completan las dos, se mueve el stock.
    const willBeFullyApproved = role === 'admin' ? !!destApprovedAt : !!adminApprovedAt

    if (!willBeFullyApproved) {
      const { error: partialErr } = await ctx.adminClient
        .from('stock_transfers')
        .update(update)
        .eq('id', id)
        .eq('status', 'requested')
      if (partialErr) return failure(partialErr.message || 'Error al registrar aprobación', 'INTERNAL')
      return success({ status: role === 'admin' ? 'admin_approved' as const : 'destination_approved' as const })
    }

    // Llegados aquí, esta aprobación completa el par → mover stock
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
        ...update,
        status: 'approved',
        approved_by: profileId,
        approved_at: nowIso,
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

    return success({ status: 'approved' as const })
  }
)

/** Rechazar/cancelar un traspaso (status → cancelled). */
export const rejectStockTransfer = protectedAction<{ id: string }, void>(
  { permission: 'stock.approve_transfer', auditModule: 'stock' },
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
