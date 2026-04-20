'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { revalidatePath } from 'next/cache'
import { notifyReservationStockAvailable } from '@/lib/notifications/create-notification'

const ALBARANES_BUCKET = 'albaranes'

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function pickWarehouseForDeliveryReceipt(
  adminClient: any,
  hints: { destination_warehouse_id?: string | null; destination_store_id?: string | null; store_id?: string | null },
): Promise<string | null> {
  if (hints.destination_warehouse_id) {
    const { data } = await adminClient
      .from('warehouses')
      .select('id')
      .eq('id', hints.destination_warehouse_id)
      .eq('is_active', true)
      .maybeSingle()
    if (data?.id) return String(data.id)
  }
  const storeId = hints.destination_store_id || hints.store_id
  if (storeId) {
    const { data } = await adminClient
      .from('warehouses')
      .select('id')
      .eq('store_id', storeId)
      .eq('is_main', true)
      .eq('is_active', true)
      .maybeSingle()
    if (data?.id) return String(data.id)
  }
  const { data } = await adminClient
    .from('warehouses')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ? String(data.id) : null
}

async function pickVariantForDeliveryProduct(adminClient: any, productId: string): Promise<string | null> {
  const def = await adminClient
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle()
  if (def.data?.id) return String(def.data.id)
  const first = await adminClient
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return first.data?.id ? String(first.data.id) : null
}

type DeliveryNoteLineInput = {
  product_variant_id?: string | null
  product_name?: string | null
  sku?: string | null
  quantity: number
  unit_price?: number | null
  notes?: string | null
  sort_order?: number
}

type DeliveryNoteInput = {
  store_id?: string | null
  type: 'traspaso' | 'entrada_stock' | 'salida_stock' | 'ajuste'
  from_warehouse_id?: string | null
  to_warehouse_id?: string | null
  stock_transfer_id?: string | null
  notes?: string | null
  lines?: DeliveryNoteLineInput[]
}

type SupplierDeliveryNoteLineInput = {
  product_id?: string | null
  fabric_id?: string | null
  product_name?: string | null
  reference?: string | null
  quantity_ordered?: number | null
  quantity_received?: number | null
  unit_price?: number | null
  notes?: string | null
}

type SupplierDeliveryNoteInput = {
  store_id?: string | null
  supplier_id?: string | null
  supplier_order_id?: string | null
  supplier_reference?: string | null
  delivery_date?: string | null
  status?: 'pendiente' | 'recibido' | 'incidencia'
  notes?: string | null
  lines?: SupplierDeliveryNoteLineInput[]
}

async function getNextDeliveryNoteNumber(adminClient: any): Promise<string> {
  const { data, error } = await adminClient.rpc('generate_delivery_note_number')
  if (!error && typeof data === 'string' && data.trim()) return data
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

export const getDeliveryNotes = protectedAction<
  { type?: string; status?: string; page?: number; limit?: number; fromDate?: string; toDate?: string; search?: string },
  { data: any[]; total: number; page: number; limit: number }
>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, { type, status, page = 1, limit = 20, fromDate, toDate, search }) => {
    const from = (page - 1) * limit
    const to = from + limit - 1
    let query = ctx.adminClient
      .from('delivery_notes')
      .select(`
        id, number, type, status, from_warehouse_id, to_warehouse_id, stock_transfer_id, notes, confirmed_at, created_by, created_at,
        from_warehouse:warehouses!from_warehouse_id(id, name, code),
        to_warehouse:warehouses!to_warehouse_id(id, name, code),
        profiles!created_by(full_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (type && type !== 'all') query = query.eq('type', type)
    if (status && status !== 'all') query = query.eq('status', status)
    if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00.000Z`)
    if (toDate) query = query.lte('created_at', `${toDate}T23:59:59.999Z`)
    if (search?.trim()) query = query.ilike('number', `%${search.trim()}%`)
    const { data, count, error } = await query
    if (error) return failure(error.message || 'Error al cargar albaranes', 'INTERNAL')
    const rows = (data ?? []).map((n: any) => ({
      ...n,
      created_by_name: n.profiles?.full_name || null,
    }))
    return success({ data: rows, total: count ?? 0, page, limit })
  }
)

export const getDeliveryNote = protectedAction<string, any>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, id) => {
    const { data, error } = await ctx.adminClient
      .from('delivery_notes')
      .select(`
        id, store_id, number, type, status, from_warehouse_id, to_warehouse_id, stock_transfer_id, notes, confirmed_at, created_by, created_at, updated_at,
        from_warehouse:warehouses!from_warehouse_id(id, name, code),
        to_warehouse:warehouses!to_warehouse_id(id, name, code),
        store:stores!store_id(id, name, code),
        profiles!created_by(full_name),
        lines:delivery_note_lines(
          id, product_variant_id, product_name, sku, quantity, unit_price, notes, sort_order
        )
      `)
      .eq('id', id)
      .single()
    if (error || !data) return failure('Albarán no encontrado', 'NOT_FOUND')
    return success({
      ...data,
      created_by_name: (data as any)?.profiles?.full_name || null,
    })
  }
)

export const createDeliveryNote = protectedAction<DeliveryNoteInput, { id: string; number: string }>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'create',
    auditEntity: 'delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/stock'],
  },
  async (ctx, input) => {
    if (!input.type) return failure('Tipo de albarán obligatorio', 'VALIDATION')
    const number = await getNextDeliveryNoteNumber(ctx.adminClient)
    const { data: note, error } = await ctx.adminClient
      .from('delivery_notes')
      .insert({
        store_id: input.store_id || null,
        number,
        type: input.type,
        status: 'borrador',
        from_warehouse_id: input.from_warehouse_id || null,
        to_warehouse_id: input.to_warehouse_id || null,
        stock_transfer_id: input.stock_transfer_id || null,
        notes: input.notes || null,
        created_by: ctx.userId !== 'system' ? ctx.userId : null,
      })
      .select('id, number')
      .single()
    if (error || !note) return failure(error?.message || 'Error al crear albarán', 'INTERNAL')

    if (input.lines?.length) {
      const lines = input.lines
        .filter((l) => Number(l.quantity) > 0)
        .map((l, idx) => ({
          delivery_note_id: note.id,
          product_variant_id: l.product_variant_id || null,
          product_name: l.product_name || null,
          sku: l.sku || null,
          quantity: Number(l.quantity),
          unit_price: l.unit_price != null ? Number(l.unit_price) : null,
          notes: l.notes || null,
          sort_order: l.sort_order ?? idx,
        }))
      if (lines.length) {
        const { error: linesError } = await ctx.adminClient.from('delivery_note_lines').insert(lines)
        if (linesError) return failure(linesError.message || 'Error al guardar líneas', 'INTERNAL')
      }
    }
    return success({ id: note.id, number: note.number })
  }
)

export const updateDeliveryNote = protectedAction<{ id: string; data: Partial<DeliveryNoteInput> }, { id: string }>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'update',
    auditEntity: 'delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/stock'],
  },
  async (ctx, { id, data }) => {
    const { data: current } = await ctx.adminClient.from('delivery_notes').select('id, status').eq('id', id).single()
    if (!current) return failure('Albarán no encontrado', 'NOT_FOUND')
    if (current.status !== 'borrador') return failure('Solo se puede editar un albarán en borrador', 'CONFLICT')

    const payload: Record<string, unknown> = {}
    if (data.type !== undefined) payload.type = data.type
    if (data.from_warehouse_id !== undefined) payload.from_warehouse_id = data.from_warehouse_id || null
    if (data.to_warehouse_id !== undefined) payload.to_warehouse_id = data.to_warehouse_id || null
    if (data.notes !== undefined) payload.notes = data.notes || null
    if (data.store_id !== undefined) payload.store_id = data.store_id || null

    if (Object.keys(payload).length) {
      const { error } = await ctx.adminClient.from('delivery_notes').update(payload).eq('id', id)
      if (error) return failure(error.message || 'Error al actualizar albarán', 'INTERNAL')
    }

    if (data.lines) {
      const { error: delErr } = await ctx.adminClient.from('delivery_note_lines').delete().eq('delivery_note_id', id)
      if (delErr) return failure(delErr.message || 'Error al actualizar líneas', 'INTERNAL')
      const lines = data.lines
        .filter((l) => Number(l.quantity) > 0)
        .map((l, idx) => ({
          delivery_note_id: id,
          product_variant_id: l.product_variant_id || null,
          product_name: l.product_name || null,
          sku: l.sku || null,
          quantity: Number(l.quantity),
          unit_price: l.unit_price != null ? Number(l.unit_price) : null,
          notes: l.notes || null,
          sort_order: l.sort_order ?? idx,
        }))
      if (lines.length) {
        const { error: insErr } = await ctx.adminClient.from('delivery_note_lines').insert(lines)
        if (insErr) return failure(insErr.message || 'Error al insertar líneas', 'INTERNAL')
      }
    }

    return success({ id })
  }
)

export const confirmDeliveryNote = protectedAction<string, { id: string }>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'state_change',
    auditEntity: 'delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/stock'],
  },
  async (ctx, id) => {
    const { data: note } = await ctx.adminClient.from('delivery_notes').select('id, status').eq('id', id).single()
    if (!note) return failure('Albarán no encontrado', 'NOT_FOUND')
    if (note.status !== 'borrador') return failure('Solo se puede confirmar un albarán en borrador', 'CONFLICT')
    const { error } = await ctx.adminClient
      .from('delivery_notes')
      .update({
        status: 'confirmado',
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return failure(error.message || 'Error al confirmar albarán', 'INTERNAL')
    return success({ id })
  }
)

export const cancelDeliveryNote = protectedAction<string, { id: string }>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'state_change',
    auditEntity: 'delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/stock'],
  },
  async (ctx, id) => {
    const { data: note } = await ctx.adminClient.from('delivery_notes').select('id, status').eq('id', id).single()
    if (!note) return failure('Albarán no encontrado', 'NOT_FOUND')
    if (note.status === 'anulado') return success({ id })
    const { error } = await ctx.adminClient
      .from('delivery_notes')
      .update({ status: 'anulado' })
      .eq('id', id)
    if (error) return failure(error.message || 'Error al anular albarán', 'INTERNAL')
    return success({ id })
  }
)

export const deleteDeliveryNote = protectedAction<string, { id: string }>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'delete',
    auditEntity: 'delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/stock'],
  },
  async (ctx, id) => {
    const { data: note } = await ctx.adminClient.from('delivery_notes').select('id, status').eq('id', id).single()
    if (!note) return failure('Albarán no encontrado', 'NOT_FOUND')
    if (note.status !== 'borrador') return failure('Solo se puede eliminar un albarán en borrador', 'CONFLICT')
    const { error } = await ctx.adminClient.from('delivery_notes').delete().eq('id', id)
    if (error) return failure(error.message || 'Error al eliminar albarán', 'INTERNAL')
    return success({ id })
  }
)

export const searchProductVariantsForDeliveryNote = protectedAction<{ search?: string; warehouseId?: string }, any[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx, { search, warehouseId }) => {
    if (warehouseId) {
      let query = ctx.adminClient
        .from('stock_levels')
        .select(`
          id, quantity, reserved, available, warehouse_id, product_variant_id,
          product_variants!inner(
            id, variant_sku, product_id, price_override, is_active,
            products!inner(id, name, sku, base_price, is_active)
          )
        `)
        .eq('warehouse_id', warehouseId)
        .eq('product_variants.is_active', true)
        .eq('product_variants.products.is_active', true)
        .gt('quantity', 0)
        .limit(60)

      const { data, error } = await query
      if (error) return failure(error.message || 'Error buscando variantes', 'INTERNAL')

      let rows = (data || []).map((sl: any) => {
        const v = sl.product_variants
        const p = v?.products
        const available = sl.available != null ? Number(sl.available) : Number(sl.quantity || 0) - Number(sl.reserved || 0)
        return {
          id: v?.id,
          variant_sku: v?.variant_sku || '',
          product_id: v?.product_id,
          product_name: p?.name || '',
          product_sku: p?.sku || '',
          unit_price: v?.price_override != null ? Number(v.price_override) : Number(p?.base_price || 0),
          available,
        }
      }).filter((r: any) => r.id && r.available > 0)

      if (search?.trim()) {
        const s = search.trim().toLowerCase()
        rows = rows.filter((r: any) => (`${r.variant_sku} ${r.product_name} ${r.product_sku}`).toLowerCase().includes(s))
      }

      return success(rows.slice(0, 30))
    }

    // Sin warehouseId: buscar en TODOS los productos activos (incluye recién creados sin stock)
    const s = search?.trim() || ''

    if (s) {
      // Búsqueda en dos pasos para evitar problemas con .or() sobre joins embebidos
      // 1. Buscar productos por nombre/sku
      const { data: prodMatches } = await ctx.adminClient
        .from('products')
        .select('id')
        .or(`name.ilike.%${s}%,sku.ilike.%${s}%,brand.ilike.%${s}%`)
        .eq('is_active', true)
        .limit(50)

      const productIds = (prodMatches || []).map((p: any) => p.id)

      // 2. Buscar variantes por variant_sku O cuyo product_id matchee
      let varQuery = ctx.adminClient
        .from('product_variants')
        .select(`
          id, variant_sku, product_id, price_override,
          products!inner(id, name, sku, base_price, is_active)
        `)
        .eq('is_active', true)
        .eq('products.is_active', true)
        .order('created_at', { ascending: false })
        .limit(50)

      if (productIds.length > 0) {
        varQuery = varQuery.or(`variant_sku.ilike.%${s}%,product_id.in.(${productIds.join(',')})`)
      } else {
        varQuery = varQuery.ilike('variant_sku', `%${s}%`)
      }

      const { data, error } = await varQuery
      if (error) return failure(error.message || 'Error buscando variantes', 'INTERNAL')

      return success((data || []).map((v: any) => ({
        id: v.id,
        variant_sku: v.variant_sku,
        product_id: v.product_id,
        product_name: v.products?.name || '',
        product_sku: v.products?.sku || '',
        unit_price: v.price_override != null ? Number(v.price_override) : Number(v.products?.base_price || 0),
        available: null,
      })))
    }

    // Sin búsqueda: traer las variantes más recientes
    const { data, error } = await ctx.adminClient
      .from('product_variants')
      .select(`
        id, variant_sku, product_id, price_override, created_at,
        products!inner(id, name, sku, base_price, is_active)
      `)
      .eq('is_active', true)
      .eq('products.is_active', true)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) return failure(error.message || 'Error buscando variantes', 'INTERNAL')

    return success((data || []).map((v: any) => ({
      id: v.id,
      variant_sku: v.variant_sku,
      product_id: v.product_id,
      product_name: v.products?.name || '',
      product_sku: v.products?.sku || '',
      unit_price: v.price_override != null ? Number(v.price_override) : Number(v.products?.base_price || 0),
      available: null,
    })))
  }
)

export const createDeliveryNoteFromTransfer = protectedAction<string, { id: string; number: string }>(
  {
    permission: 'products.edit',
    auditModule: 'stock',
    auditAction: 'create',
    auditEntity: 'delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/stock'],
  },
  async (ctx, transferId) => {
    const { data: existing } = await ctx.adminClient
      .from('delivery_notes')
      .select('id, number')
      .eq('stock_transfer_id', transferId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing?.id) return success({ id: existing.id, number: existing.number })

    const { data: transfer, error: transferError } = await ctx.adminClient
      .from('stock_transfers')
      .select('id, transfer_number, from_warehouse_id, to_warehouse_id, status, notes, requested_by, warehouses!from_warehouse_id(store_id)')
      .eq('id', transferId)
      .single()
    if (transferError || !transfer) return failure('Traspaso no encontrado', 'NOT_FOUND')

    const number = await getNextDeliveryNoteNumber(ctx.adminClient)
    const storeId = (transfer.warehouses as any)?.store_id || null
    const { data: note, error } = await ctx.adminClient
      .from('delivery_notes')
      .insert({
        store_id: storeId,
        number,
        type: 'traspaso',
          status: ['approved', 'in_transit', 'received'].includes(transfer.status) ? 'confirmado' : 'borrador',
        from_warehouse_id: transfer.from_warehouse_id,
        to_warehouse_id: transfer.to_warehouse_id,
        stock_transfer_id: transfer.id,
        notes: transfer.notes || `Generado desde traspaso ${transfer.transfer_number}`,
          confirmed_at: ['approved', 'in_transit', 'received'].includes(transfer.status) ? new Date().toISOString() : null,
        created_by: ctx.userId !== 'system' ? ctx.userId : null,
      })
      .select('id, number')
      .single()
    if (error || !note) return failure(error?.message || 'Error al crear albarán', 'INTERNAL')

    const { data: transferLines } = await ctx.adminClient
      .from('stock_transfer_lines')
      .select(`
        product_variant_id, quantity_requested, quantity_sent,
        product_variants(variant_sku, products(name))
      `)
      .eq('transfer_id', transferId)

    if (transferLines?.length) {
      const lines = transferLines.map((l: any, idx: number) => ({
        delivery_note_id: note.id,
        product_variant_id: l.product_variant_id,
        product_name: l.product_variants?.products?.name ?? null,
        sku: l.product_variants?.variant_sku ?? null,
        quantity: Number(l.quantity_sent) > 0 ? Number(l.quantity_sent) : Number(l.quantity_requested || 0),
        unit_price: null,
        sort_order: idx,
      })).filter((l: any) => l.quantity > 0)
      if (lines.length) {
        const { error: linesError } = await ctx.adminClient.from('delivery_note_lines').insert(lines)
        if (linesError) return failure(linesError.message || 'Error al copiar líneas de traspaso', 'INTERNAL')
      }
    }

    return success({ id: note.id, number: note.number })
  }
)

export const getSupplierDeliveryNotes = protectedAction<
  { supplierId?: string; status?: string; page?: number; limit?: number; fromDate?: string; toDate?: string; search?: string },
  { data: any[]; total: number; page: number; limit: number }
>(
  { permission: 'suppliers.view', auditModule: 'suppliers' },
  async (ctx, { supplierId, status, page = 1, limit = 20, fromDate, toDate, search }) => {
    const from = (page - 1) * limit
    const to = from + limit - 1
    let query = ctx.adminClient
      .from('supplier_delivery_notes')
      .select(`
        id, supplier_id, supplier_order_id, supplier_reference, delivery_date, status, attachment_url, notes, created_by, created_at,
        suppliers(id, name),
        supplier_orders(id, order_number),
        profiles!created_by(full_name)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (supplierId && supplierId !== 'all') query = query.eq('supplier_id', supplierId)
    if (status && status !== 'all') query = query.eq('status', status)
    if (fromDate) query = query.gte('delivery_date', fromDate)
    if (toDate) query = query.lte('delivery_date', toDate)
    if (search?.trim()) query = query.ilike('supplier_reference', `%${search.trim()}%`)
    const { data, count, error } = await query
    if (error) return failure(error.message || 'Error al cargar albaranes de proveedor', 'INTERNAL')
    const rows = (data ?? []).map((n: any) => ({
      ...n,
      created_by_name: n.profiles?.full_name || null,
    }))
    return success({ data: rows, total: count ?? 0, page, limit })
  }
)

export const getSupplierDeliveryNote = protectedAction<string, any>(
  { permission: 'suppliers.view', auditModule: 'suppliers' },
  async (ctx, id) => {
    const { data, error } = await ctx.adminClient
      .from('supplier_delivery_notes')
      .select(`
        id, store_id, supplier_id, supplier_order_id, supplier_reference, delivery_date, status, attachment_url, notes, created_by, created_at, updated_at,
        suppliers(id, name),
        supplier_orders(id, order_number),
        profiles!created_by(full_name),
        lines:supplier_delivery_note_lines(
          id, product_id, fabric_id, product_name, reference, quantity_ordered, quantity_received, unit_price, notes
        )
      `)
      .eq('id', id)
      .single()
    if (error || !data) return failure('Albarán de proveedor no encontrado', 'NOT_FOUND')
    return success({
      ...data,
      created_by_name: (data as any)?.profiles?.full_name || null,
    })
  }
)

export const createSupplierDeliveryNote = protectedAction<SupplierDeliveryNoteInput, { id: string }>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'create',
    auditEntity: 'supplier_delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/proveedores'],
  },
  async (ctx, input) => {
    const { data: note, error } = await ctx.adminClient
      .from('supplier_delivery_notes')
      .insert({
        store_id: input.store_id || null,
        supplier_id: input.supplier_id || null,
        supplier_order_id: input.supplier_order_id || null,
        supplier_reference: input.supplier_reference || null,
        delivery_date: input.delivery_date || null,
        status: input.status || 'pendiente',
        notes: input.notes || null,
        created_by: ctx.userId !== 'system' ? ctx.userId : null,
      })
      .select('id')
      .single()
    if (error || !note) return failure(error?.message || 'Error al crear albarán de proveedor', 'INTERNAL')

    if (input.lines?.length) {
      const rows = input.lines.map((l) => ({
        supplier_delivery_note_id: note.id,
        product_id: l.product_id || null,
        fabric_id: l.fabric_id || null,
        product_name: l.product_name || null,
        reference: l.reference || null,
        quantity_ordered: l.quantity_ordered ?? null,
        quantity_received: l.quantity_received ?? null,
        unit_price: l.unit_price != null ? Number(l.unit_price) : null,
        notes: l.notes || null,
      }))
      const { error: rowsError } = await ctx.adminClient.from('supplier_delivery_note_lines').insert(rows)
      if (rowsError) return failure(rowsError.message || 'Error al guardar líneas de proveedor', 'INTERNAL')
    }

    return success({ id: note.id })
  }
)

export const upsertSupplierDeliveryNoteForOrder = protectedAction<
  { supplier_id: string; supplier_order_id: string; delivery_date?: string | null },
  { id: string; created: boolean }
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier_delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/proveedores'],
  },
  async (ctx, input) => {
    const supplierId = String(input.supplier_id || '').trim()
    const supplierOrderId = String(input.supplier_order_id || '').trim()
    if (!supplierId) return failure('supplier_id obligatorio', 'VALIDATION')
    if (!supplierOrderId) return failure('supplier_order_id obligatorio', 'VALIDATION')

    const { data: existing, error: existingError } = await ctx.adminClient
      .from('supplier_delivery_notes')
      .select('id, supplier_id')
      .eq('supplier_order_id', supplierOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingError) return failure(existingError.message || 'Error al buscar albarán de proveedor', 'INTERNAL')
    if (existing?.id) {
      if (existing.supplier_id !== supplierId) {
        await ctx.adminClient
          .from('supplier_delivery_notes')
          .update({ supplier_id: supplierId })
          .eq('id', existing.id)
      }
      revalidatePath(`/admin/proveedores/${supplierId}`)
      return success({ id: existing.id, created: false })
    }

    const today = new Date().toISOString().slice(0, 10)
    const { data: created, error: createError } = await ctx.adminClient
      .from('supplier_delivery_notes')
      .insert({
        supplier_id: supplierId,
        supplier_order_id: supplierOrderId,
        delivery_date: input.delivery_date || today,
        status: 'pendiente',
        created_by: ctx.userId !== 'system' ? ctx.userId : null,
      })
      .select('id')
      .single()

    if (createError || !created?.id) return failure(createError?.message || 'Error al crear albarán de proveedor', 'INTERNAL')
    revalidatePath(`/admin/proveedores/${supplierId}`)
    return success({ id: created.id, created: true })
  }
)

export const updateSupplierDeliveryNote = protectedAction<{ id: string; data: Partial<SupplierDeliveryNoteInput> }, { id: string }>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier_delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/proveedores'],
  },
  async (ctx, { id, data }) => {
    const payload: Record<string, unknown> = {}
    if (data.store_id !== undefined) payload.store_id = data.store_id || null
    if (data.supplier_id !== undefined) payload.supplier_id = data.supplier_id || null
    if (data.supplier_order_id !== undefined) payload.supplier_order_id = data.supplier_order_id || null
    if (data.supplier_reference !== undefined) payload.supplier_reference = data.supplier_reference || null
    if (data.delivery_date !== undefined) payload.delivery_date = data.delivery_date || null
    if (data.status !== undefined) payload.status = data.status
    if (data.notes !== undefined) payload.notes = data.notes || null
    const { error } = await ctx.adminClient.from('supplier_delivery_notes').update(payload).eq('id', id)
    if (error) return failure(error.message || 'Error al actualizar albarán de proveedor', 'INTERNAL')

    if (data.lines) {
      const { error: delErr } = await ctx.adminClient.from('supplier_delivery_note_lines').delete().eq('supplier_delivery_note_id', id)
      if (delErr) return failure(delErr.message || 'Error al actualizar líneas', 'INTERNAL')
      if (data.lines.length) {
        const rows = data.lines.map((l) => ({
          supplier_delivery_note_id: id,
          product_id: l.product_id || null,
          fabric_id: l.fabric_id || null,
          product_name: l.product_name || null,
          reference: l.reference || null,
          quantity_ordered: l.quantity_ordered ?? null,
          quantity_received: l.quantity_received ?? null,
          unit_price: l.unit_price != null ? Number(l.unit_price) : null,
          notes: l.notes || null,
        }))
        const { error: rowsError } = await ctx.adminClient.from('supplier_delivery_note_lines').insert(rows)
        if (rowsError) return failure(rowsError.message || 'Error al guardar líneas', 'INTERNAL')
      }
    }

    return success({ id })
  }
)

export const markSupplierDeliveryNoteReceived = protectedAction<
  string,
  { id: string; stock_warnings: number; stock_update_skipped: boolean }
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'state_change',
    auditEntity: 'supplier_delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/proveedores', '/admin/contabilidad/facturas-proveedores'],
  },
  async (ctx, id) => {
    const { data: note, error: noteErr } = await ctx.adminClient
      .from('supplier_delivery_notes')
      .select('id, store_id, supplier_id, supplier_order_id, stock_updated_at, supplier_reference')
      .eq('id', id)
      .single()
    if (noteErr || !note) return failure('Albarán de proveedor no encontrado', 'NOT_FOUND')

    if ((note as any).stock_updated_at) {
      const { error: statusErr } = await ctx.adminClient
        .from('supplier_delivery_notes')
        .update({ status: 'recibido' })
        .eq('id', id)
      if (statusErr) return failure(statusErr.message || 'Error al marcar recibido', 'INTERNAL')
      return success({ id, stock_warnings: 0, stock_update_skipped: true })
    }

    let destinationStoreId: string | null = (note as any).store_id || null
    let destinationWarehouseId: string | null = null
    if ((note as any).supplier_order_id) {
      const { data: order } = await ctx.adminClient
        .from('supplier_orders')
        .select('destination_store_id, destination_warehouse_id')
        .eq('id', (note as any).supplier_order_id)
        .maybeSingle()
      if (order) {
        destinationStoreId = destinationStoreId || (order as any).destination_store_id || null
        destinationWarehouseId = (order as any).destination_warehouse_id || null
      }
    }

    const warehouseId = await pickWarehouseForDeliveryReceipt(ctx.adminClient, {
      destination_warehouse_id: destinationWarehouseId,
      destination_store_id: destinationStoreId,
      store_id: (note as any).store_id || null,
    })

    const { data: lines, error: linesErr } = await ctx.adminClient
      .from('supplier_delivery_note_lines')
      .select('id, product_id, fabric_id, product_name, reference, quantity_ordered, quantity_received, unit_price')
      .eq('supplier_delivery_note_id', id)
    if (linesErr) return failure(linesErr.message || 'Error al cargar líneas del albarán', 'INTERNAL')

    let stockWarnings = 0
    const now = new Date().toISOString()
    const reasonLabel = `Recepción albarán ${(note as any).supplier_reference || id}`

    if (warehouseId) {
      for (const line of lines || []) {
        const qtyReceived = toNumber((line as any).quantity_received)
        const qtyOrdered = toNumber((line as any).quantity_ordered)
        const qtyToAdd = qtyReceived > 0 ? qtyReceived : qtyOrdered
        if (qtyToAdd <= 0) continue
        if (!Number.isInteger(qtyToAdd)) {
          stockWarnings += 1
          continue
        }

        const productId = (line as any).product_id ? String((line as any).product_id) : null
        if (!productId) {
          stockWarnings += 1
          continue
        }
        const variantId = await pickVariantForDeliveryProduct(ctx.adminClient, productId)
        if (!variantId) {
          stockWarnings += 1
          continue
        }

        const { data: currentLevel } = await ctx.adminClient
          .from('stock_levels')
          .select('id, quantity')
          .eq('product_variant_id', variantId)
          .eq('warehouse_id', warehouseId)
          .maybeSingle()

        const stockBefore = toNumber((currentLevel as any)?.quantity)
        const stockAfter = stockBefore + qtyToAdd
        if (currentLevel?.id) {
          const { error: updErr } = await ctx.adminClient
            .from('stock_levels')
            .update({ quantity: stockAfter, updated_at: now, last_movement_at: now })
            .eq('id', currentLevel.id)
          if (updErr) return failure(updErr.message || 'Error al actualizar stock', 'INTERNAL')
        } else {
          const { error: insErr } = await ctx.adminClient
            .from('stock_levels')
            .insert({
              product_variant_id: variantId,
              warehouse_id: warehouseId,
              quantity: qtyToAdd,
              reserved: 0,
              updated_at: now,
              last_movement_at: now,
            })
          if (insErr) return failure(insErr.message || 'Error al crear stock', 'INTERNAL')
        }

        const { error: movErr } = await ctx.adminClient
          .from('stock_movements')
          .insert({
            product_variant_id: variantId,
            warehouse_id: warehouseId,
            movement_type: 'purchase_receipt',
            quantity: qtyToAdd,
            stock_before: stockBefore,
            stock_after: stockAfter,
            reason: reasonLabel,
            reference_type: 'supplier_delivery_note',
            reference_id: id,
            created_by: ctx.userId !== 'system' ? ctx.userId : null,
            store_id: destinationStoreId,
          })
        if (movErr) return failure(movErr.message || 'Error al registrar movimiento de stock', 'INTERNAL')

        // Activar reservas pendientes de esta variante (si el stock recibido
        // cubre ahora la cantidad reservada) y notificar a los admins.
        try {
          const { data: activatedRows, error: activateErr } = await ctx.adminClient
            .rpc('fn_activate_pending_reservations', {
              p_product_variant_id: variantId,
              p_warehouse_id: warehouseId,
              p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
            })
          if (activateErr) {
            console.error('[markSupplierDeliveryNoteReceived] fn_activate_pending_reservations:', activateErr.message)
          } else if (Array.isArray(activatedRows) && activatedRows.length > 0) {
            const productName = String((line as any).product_name || (line as any).reference || 'producto')
            for (const row of activatedRows) {
              let clientName = 'un cliente'
              if (row?.client_id) {
                const { data: c } = await ctx.adminClient
                  .from('clients')
                  .select('full_name, first_name, last_name')
                  .eq('id', row.client_id)
                  .maybeSingle()
                if (c) {
                  clientName = (c as any).full_name
                    || [c.first_name, c.last_name].filter(Boolean).join(' ')
                    || 'un cliente'
                }
              }
              await notifyReservationStockAvailable({
                reservation_id: String(row.reservation_id),
                reservation_number: String(row.reservation_number),
                product_name: productName,
                client_name: clientName,
                activated: Boolean(row.activated),
              })
            }
          }
        } catch (notifyErr) {
          console.error('[markSupplierDeliveryNoteReceived] reservations notify:', notifyErr)
        }
      }
    } else {
      stockWarnings += (lines || []).length
    }

    const { error: updateErr } = await ctx.adminClient
      .from('supplier_delivery_notes')
      .update({
        status: 'recibido',
        stock_updated_at: warehouseId ? now : null,
      })
      .eq('id', id)
    if (updateErr) return failure(updateErr.message || 'Error al marcar recibido', 'INTERNAL')

    return success({ id, stock_warnings: stockWarnings, stock_update_skipped: !warehouseId })
  }
)

export const uploadSupplierDeliveryNoteAttachment = protectedAction<FormData, { id: string; url: string }>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier_delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/proveedores'],
  },
  async (ctx, formData) => {
    const id = String(formData.get('id') || '')
    const file = formData.get('file') as File | null
    if (!id) return failure('ID de albarán obligatorio', 'VALIDATION')
    if (!file?.size) return failure('Archivo PDF obligatorio', 'VALIDATION')

    const { data: noteExists, error: noteErr } = await ctx.adminClient
      .from('supplier_delivery_notes')
      .select('id, supplier_id')
      .eq('id', id)
      .maybeSingle()
    if (noteErr || !noteExists?.id) {
      console.error('[uploadSupplierDeliveryNoteAttachment] albaran no encontrado', { id, error: noteErr?.message })
      return failure('Albarán de proveedor no encontrado', 'NOT_FOUND')
    }

    const ext = file.name.split('.').pop() || 'pdf'
    const filePath = `supplier-delivery-notes/${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const doUpload = () =>
      ctx.adminClient.storage
        .from(ALBARANES_BUCKET)
        .upload(filePath, buffer, {
          contentType: file.type || 'application/pdf',
          upsert: true,
        })

    let { data: uploadData, error: uploadError } = await doUpload()
    if (uploadError?.message?.toLowerCase().includes('bucket') && uploadError?.message?.toLowerCase().includes('not found')) {
      const { data: bucketData, error: bucketError } = await ctx.adminClient.storage.createBucket(ALBARANES_BUCKET, { public: false })
      if (!bucketError || bucketError.message?.toLowerCase().includes('already exists')) {
        const retry = await doUpload()
        uploadData = retry.data
        uploadError = retry.error
      }
    }
    if (uploadError) {
      console.error('[uploadSupplierDeliveryNoteAttachment] upload error', { id, filePath, message: uploadError.message })
      return failure(uploadError.message || 'Error al subir archivo', 'INTERNAL')
    }
    const { data } = ctx.adminClient.storage.from(ALBARANES_BUCKET).getPublicUrl(filePath)
    const url = data.publicUrl
    const { data: updateData, error: updateError } = await ctx.adminClient
      .from('supplier_delivery_notes')
      .update({ attachment_url: url })
      .eq('id', id)
      .select('id, attachment_url')
      .single()
    if (updateError || !updateData?.id) {
      console.error('[uploadSupplierDeliveryNoteAttachment] update error', { id, message: updateError?.message })
      return failure(updateError?.message || 'Error al asociar archivo', 'INTERNAL')
    }
    if (noteExists?.supplier_id) {
      revalidatePath(`/admin/proveedores/${noteExists.supplier_id}`)
    }
    return success({ id, url })
  }
)
