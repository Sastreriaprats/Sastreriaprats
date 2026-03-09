'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { revalidatePath } from 'next/cache'

const ALBARANES_BUCKET = 'albaranes'

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

    let query = ctx.adminClient
      .from('product_variants')
      .select(`
        id, variant_sku, product_id, price_override,
        products!inner(id, name, sku, base_price, is_active)
      `)
      .eq('is_active', true)
      .eq('products.is_active', true)
      .limit(30)

    if (search?.trim()) {
      const s = search.trim()
      query = query.or(`variant_sku.ilike.%${s}%,products.name.ilike.%${s}%,products.sku.ilike.%${s}%`)
    }

    const { data, error } = await query
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

export const markSupplierDeliveryNoteReceived = protectedAction<string, { id: string }>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'state_change',
    auditEntity: 'supplier_delivery_note',
    revalidate: ['/admin/almacen/albaranes', '/admin/proveedores'],
  },
  async (ctx, id) => {
    const { error } = await ctx.adminClient
      .from('supplier_delivery_notes')
      .update({ status: 'recibido' })
      .eq('id', id)
    if (error) return failure(error.message || 'Error al marcar recibido', 'INTERNAL')
    return success({ id })
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
    console.log('[uploadSupplierDeliveryNoteAttachment] formData id:', id)
    console.log('[uploadSupplierDeliveryNoteAttachment] file:', file?.name, file?.size)
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
      console.log('[storage create bucket result]', { data: bucketData, error: bucketError })
      if (!bucketError || bucketError.message?.toLowerCase().includes('already exists')) {
        const retry = await doUpload()
        uploadData = retry.data
        uploadError = retry.error
      }
    }
    console.log('[storage upload result]', { data: uploadData, error: uploadError })
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
    console.log('[update attachment_url result]', { data: updateData, error: updateError })
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
