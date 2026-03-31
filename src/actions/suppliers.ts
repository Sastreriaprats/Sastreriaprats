'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber } from '@/lib/server/query-helpers'
import { createSupplierSchema, updateSupplierSchema } from '@/lib/validations/suppliers'
import { success, failure } from '@/lib/errors'
import { createPurchaseJournalEntry } from '@/actions/accounting-triggers'
import { checkUserPermission } from '@/actions/auth'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'

export const listSupplierOrders = protectedAction<void, any[]>(
  { permission: 'orders.view' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('supplier_orders')
      .select('id, order_number, status, total, order_date, estimated_delivery_date, tailoring_order_id, supplier_id, suppliers(name)')
      .order('created_at', { ascending: false })
    if (error) return failure(error.message)
    return success(data ?? [])
  }
)

/** Busca tejidos de un proveedor por nombre (ilike). */
export const searchSupplierFabrics = protectedAction<
  { supplierId: string; query?: string },
  { id: string; name: string; fabric_code: string | null; unit: string | null }[]
>(
  { permission: 'suppliers.view' },
  async (ctx, { supplierId, query }) => {
    if (!supplierId?.trim()) return success([])
    let q = ctx.adminClient
      .from('fabrics')
      .select('id, name, fabric_code, unit')
      .eq('supplier_id', supplierId.trim())
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(20)
    if (query?.trim()) {
      q = q.ilike('name', `%${query.trim()}%`)
    }
    const { data, error } = await q
    if (error) return failure(error.message)
    return success((data ?? []) as { id: string; name: string; fabric_code: string | null; unit: string | null }[])
  }
)

/** Busca productos para pedido a proveedor: primero los del proveedor, luego el resto. */
export const searchSupplierProducts = protectedAction<
  { supplierId: string; query?: string },
  { id: string; name: string; sku: string; cost_price: number | null; main_image_url: string | null; images: string[] | null; supplier_id: string | null }[]
>(
  { permission: 'suppliers.view' },
  async (ctx, { supplierId, query }) => {
    if (!supplierId?.trim()) return success([])
    const searchTerm = query?.trim() || ''

    // Buscar en TODOS los productos activos (no filtrar por supplier_id)
    let q = ctx.adminClient
      .from('products')
      .select('id, name, sku, cost_price, main_image_url, images, supplier_id')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(30)

    if (searchTerm) {
      q = q.or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%`)
    }

    const { data, error } = await q
    if (error) return failure(error.message)
    const rows = (data ?? []) as { id: string; name: string; sku: string; cost_price: number | null; main_image_url: string | null; images: string[] | null; supplier_id: string | null }[]

    // Ordenar: primero los del proveedor actual, luego el resto
    const sid = supplierId.trim()
    rows.sort((a, b) => {
      const aMatch = a.supplier_id === sid ? 0 : 1
      const bMatch = b.supplier_id === sid ? 0 : 1
      return aMatch - bMatch
    })

    return success(rows)
  }
)

export const listSuppliers = protectedAction<ListParams, ListResult<any>>(
  { permission: 'suppliers.view', auditModule: 'suppliers' },
  async (ctx, params) => {
    const result = await queryList('suppliers', {
      ...params,
      searchFields: ['name', 'legal_name', 'contact_email', 'contact_name', 'nif_cif'],
    }, `
      id, supplier_code, name, legal_name, nif_cif, supplier_types,
      contact_name, contact_email, contact_phone, city,
      payment_terms, total_debt, total_paid, is_active, created_at
    `)
    return success(result)
  }
)

export const getSupplier = protectedAction<string, any>(
  { permission: 'suppliers.view', auditModule: 'suppliers' },
  async (ctx, supplierId) => {
    const supplier = await queryById('suppliers', supplierId, `
      *,
      supplier_contacts (*),
      fabrics ( id, fabric_code, name, composition, price_per_meter, stock_meters, status ),
      supplier_orders ( id, order_number, status, total, order_date, estimated_delivery_date, created_at ),
      supplier_due_dates ( id, due_date, amount, is_paid, alert_sent )
    `)
    if (!supplier) return failure('Proveedor no encontrado', 'NOT_FOUND')
    return success(supplier)
  }
)

export const createSupplierAction = protectedAction<any, any>(
  {
    permission: 'suppliers.create',
    auditModule: 'suppliers',
    auditAction: 'create',
    auditEntity: 'supplier',
    revalidate: ['/admin/proveedores'],
  },
  async (ctx, input) => {
    const parsed = createSupplierSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

    const supplierCode = await getNextNumber('suppliers', 'supplier_code', 'PROV')

    const { data: supplier, error } = await ctx.adminClient
      .from('suppliers')
      .insert({ ...parsed.data, supplier_code: supplierCode })
      .select()
      .single()

    if (error) return failure(error.message)
    return success(supplier)
  }
)

export const updateSupplierAction = protectedAction<{ id: string; data: any }, any>(
  {
    permission: 'suppliers.edit',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier',
    revalidate: ['/admin/proveedores'],
  },
  async (ctx, { id, data: input }) => {
    const parsed = updateSupplierSchema.safeParse(input)
    if (!parsed.success) return failure(parsed.error.issues[0].message, 'VALIDATION')

    const { data: supplier, error } = await ctx.adminClient
      .from('suppliers').update(parsed.data).eq('id', id).select().single()

    if (error) return failure(error.message)
    return success(supplier)
  }
)

const SUPPLIER_ORDER_STATUSES = ['draft', 'sent', 'confirmed', 'partially_received', 'received', 'incident', 'cancelled'] as const

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function pickWarehouseForReceipt(adminClient: any, order: any) {
  if (order?.destination_warehouse_id) {
    const { data: destinationWarehouse } = await adminClient
      .from('warehouses')
      .select('id')
      .eq('id', order.destination_warehouse_id)
      .eq('is_active', true)
      .maybeSingle()
    if (destinationWarehouse?.id) return destinationWarehouse.id as string
  }

  if (order?.destination_store_id) {
    const { data: storeMainWarehouse } = await adminClient
      .from('warehouses')
      .select('id')
      .eq('store_id', order.destination_store_id)
      .eq('is_main', true)
      .eq('is_active', true)
      .maybeSingle()
    if (storeMainWarehouse?.id) return storeMainWarehouse.id as string
  }

  const { data: fallbackWarehouse } = await adminClient
    .from('warehouses')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (fallbackWarehouse?.id as string | undefined) ?? null
}

async function pickVariantForProduct(adminClient: any, productId: string): Promise<string | null> {
  const withDefault = await adminClient
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle()

  if (!withDefault.error && withDefault.data?.id) return String(withDefault.data.id)

  const firstActive = await adminClient
    .from('product_variants')
    .select('id')
    .eq('product_id', productId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (firstActive.error || !firstActive.data?.id) return null
  return String(firstActive.data.id)
}

export const updateSupplierOrderStatusAction = protectedAction<
  { supplierOrderId: string; status: typeof SUPPLIER_ORDER_STATUSES[number] },
  any
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier_order',
    revalidate: ['/admin/proveedores'],
  },
  async (ctx, { supplierOrderId, status }) => {
    if (!SUPPLIER_ORDER_STATUSES.includes(status)) return failure('Estado no válido', 'VALIDATION')

    const { data: order, error } = await ctx.adminClient
      .from('supplier_orders')
      .update({ status })
      .eq('id', supplierOrderId)
      .select()
      .single()

    if (error) return failure(error.message)
    if (!order) return failure('Pedido no encontrado', 'NOT_FOUND')

    if (status === 'received') {
      const stockUpdatedAt = (order as any).stock_updated_at as string | null | undefined
      if (stockUpdatedAt) {
        console.warn('[updateSupplierOrderStatusAction] stock ya actualizado previamente', { supplierOrderId, stockUpdatedAt })
        return success({ ...order, stock_update_skipped: true, stock_warnings: 0 })
      }

      const warehouseId = await pickWarehouseForReceipt(ctx.adminClient, order)
      if (!warehouseId) return failure('No hay almacén activo para registrar la recepción de stock', 'CONFLICT')

      const { data: lines, error: linesError } = await ctx.adminClient
        .from('supplier_order_lines')
        .select('id, supplier_order_id, product_id, fabric_id, description, reference, quantity, quantity_received')
        .eq('supplier_order_id', supplierOrderId)
      if (linesError) return failure(linesError.message || 'Error al cargar líneas del pedido', 'INTERNAL')

      const fabricCandidates = new Map<string, string>()
      if ((lines || []).some((line: any) => line.fabric_id && !line.product_id)) {
        const { data: supplierFabricProducts } = await ctx.adminClient
          .from('products')
          .select('id, name, sku, supplier_reference')
          .eq('supplier_id', (order as any).supplier_id)
          .eq('product_type', 'tailoring_fabric')
          .eq('is_active', true)
        for (const p of supplierFabricProducts || []) {
          const nameKey = String((p as any).name || '').trim().toLowerCase()
          const refKey = String((p as any).supplier_reference || '').trim().toLowerCase()
          const skuKey = String((p as any).sku || '').trim().toLowerCase()
          if (nameKey) fabricCandidates.set(`name:${nameKey}`, String((p as any).id))
          if (refKey) fabricCandidates.set(`ref:${refKey}`, String((p as any).id))
          if (skuKey) fabricCandidates.set(`sku:${skuKey}`, String((p as any).id))
        }
      }

      let stockWarnings = 0
      for (const line of lines || []) {
        const qtyReceived = toNumber((line as any).quantity_received)
        const qtyOrdered = toNumber((line as any).quantity)
        const qtyToAddRaw = qtyReceived > 0 ? qtyReceived : qtyOrdered
        if (!Number.isInteger(qtyToAddRaw)) {
          stockWarnings += 1
          console.warn('[supplier receipt] cantidad no entera, se omite línea de stock', {
            supplierOrderId,
            lineId: (line as any).id,
            quantity: qtyToAddRaw,
          })
          continue
        }
        const qtyToAdd = qtyToAddRaw
        if (qtyToAdd <= 0) continue

        let productId = ((line as any).product_id ? String((line as any).product_id) : null) as string | null
        if (!productId && (line as any).fabric_id) {
          const byName = fabricCandidates.get(`name:${String((line as any).description || '').trim().toLowerCase()}`)
          const byRef = fabricCandidates.get(`ref:${String((line as any).reference || '').trim().toLowerCase()}`)
          const bySku = fabricCandidates.get(`sku:${String((line as any).reference || '').trim().toLowerCase()}`)
          productId = byRef || bySku || byName || null
          if (!productId) {
            stockWarnings += 1
            console.warn('[supplier receipt] línea de tejido sin producto/variante asociada', {
              supplierOrderId,
              lineId: (line as any).id,
              description: (line as any).description,
              reference: (line as any).reference,
            })
            continue
          }
        }

        if (!productId) continue
        const variantId = await pickVariantForProduct(ctx.adminClient, productId)
        if (!variantId) {
          stockWarnings += 1
          console.warn('[supplier receipt] producto sin variante activa para recepción', {
            supplierOrderId,
            lineId: (line as any).id,
            productId,
          })
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
          const { error: updateLevelError } = await ctx.adminClient
            .from('stock_levels')
            .update({
              quantity: stockAfter,
              updated_at: new Date().toISOString(),
              last_movement_at: new Date().toISOString(),
            })
            .eq('id', currentLevel.id)
          if (updateLevelError) return failure(updateLevelError.message || 'Error al actualizar stock de recepción', 'INTERNAL')
        } else {
          const { error: insertLevelError } = await ctx.adminClient
            .from('stock_levels')
            .insert({
              product_variant_id: variantId,
              warehouse_id: warehouseId,
              quantity: qtyToAdd,
              reserved: 0,
              updated_at: new Date().toISOString(),
              last_movement_at: new Date().toISOString(),
            })
          if (insertLevelError) return failure(insertLevelError.message || 'Error al crear stock de recepción', 'INTERNAL')
        }

        const { error: movementError } = await ctx.adminClient
          .from('stock_movements')
          .insert({
            product_variant_id: variantId,
            warehouse_id: warehouseId,
            movement_type: 'purchase_receipt',
            quantity: qtyToAdd,
            stock_before: stockBefore,
            stock_after: stockAfter,
            reason: `Recepción pedido ${(order as any).order_number}`,
            reference_type: 'supplier_order',
            reference_id: supplierOrderId,
            created_by: ctx.userId !== 'system' ? ctx.userId : null,
            store_id: (order as any).destination_store_id || null,
          })
        if (movementError) return failure(movementError.message || 'Error al registrar movimiento de recepción', 'INTERNAL')
      }

      for (const line of lines || []) {
        const lineQtyReceived = toNumber((line as any).quantity_received)
        if (lineQtyReceived > 0) continue
        const { error: updateLineErr } = await ctx.adminClient
          .from('supplier_order_lines')
          .update({
            quantity_received: (line as any).quantity,
            is_fully_received: true,
            received_at: new Date().toISOString(),
          })
          .eq('id', (line as any).id)
        if (updateLineErr) return failure(updateLineErr.message || 'Error al actualizar líneas recibidas', 'INTERNAL')
      }

      const { error: stockUpdatedAtErr } = await ctx.adminClient
        .from('supplier_orders')
        .update({ stock_updated_at: new Date().toISOString() })
        .eq('id', supplierOrderId)
      if (stockUpdatedAtErr) return failure(stockUpdatedAtErr.message || 'Error al marcar actualización de stock', 'INTERNAL')

      createPurchaseJournalEntry(supplierOrderId).catch(() => {})
      return success({ ...order, stock_update_skipped: false, stock_warnings: stockWarnings })
    }

    return success(order)
  }
)

/** Líneas de un pedido a proveedor para el diálogo de recepción. */
export type SupplierOrderLineForReceipt = {
  id: string
  supplier_order_id: string
  fabric_id: string | null
  product_id: string | null
  description: string
  reference: string | null
  quantity: number
  quantity_received: number
  unit: string | null
}

export const getSupplierOrderLines = protectedAction<
  string,
  SupplierOrderLineForReceipt[]
>(
  { permission: 'suppliers.view' },
  async (ctx, supplierOrderId) => {
    if (!supplierOrderId?.trim()) return success([])
    const { data, error } = await ctx.adminClient
      .from('supplier_order_lines')
      .select('id, supplier_order_id, fabric_id, product_id, product_variant_id, description, reference, quantity, quantity_received, unit')
      .eq('supplier_order_id', supplierOrderId)
      .order('sort_order', { ascending: true })
    if (error) return failure(error.message)
    const lines = (data ?? []).map((row: any) => ({
      id: row.id,
      supplier_order_id: row.supplier_order_id,
      fabric_id: row.fabric_id ?? null,
      product_id: row.product_id ?? null,
      description: row.description ?? '',
      reference: row.reference ?? null,
      quantity: toNumber(row.quantity),
      quantity_received: toNumber(row.quantity_received),
      unit: row.unit ?? null,
    }))
    return success(lines)
  }
)

export type ReceiveSupplierOrderLineInput = {
  lineId: string
  quantityReceived: number
  type: 'fabric' | 'product'
  referenceId: string
}

export const receiveSupplierOrderLines = protectedAction<
  { orderId: string; lines: ReceiveSupplierOrderLineInput[] },
  { status: string; stock_warnings?: number }
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier_order',
    revalidate: ['/admin/proveedores'],
  },
  async (ctx, { orderId, lines: inputLines }) => {
    if (!orderId?.trim()) return failure('Pedido obligatorio', 'VALIDATION')
    const linesToProcess = (inputLines || []).filter(
      (l) => l.lineId?.trim() && l.referenceId?.trim() && Number(l.quantityReceived) > 0
    )
    if (linesToProcess.length === 0) return failure('Indica al menos una línea con cantidad recibida', 'VALIDATION')

    const { data: order, error: orderErr } = await ctx.adminClient
      .from('supplier_orders')
      .select('id, order_number, status, supplier_id, destination_store_id, destination_warehouse_id')
      .eq('id', orderId)
      .single()
    if (orderErr || !order) return failure('Pedido no encontrado', 'NOT_FOUND')

    const status = (order as any).status
    if (status !== 'sent' && status !== 'confirmed' && status !== 'partially_received') {
      return failure('Solo se puede registrar recepción en pedidos enviados o confirmados', 'VALIDATION')
    }

    const warehouseId = await pickWarehouseForReceipt(ctx.adminClient, order)
    if (!warehouseId) return failure('No hay almacén activo para registrar la recepción de stock', 'CONFLICT')

    const { data: dbLines, error: linesErr } = await ctx.adminClient
      .from('supplier_order_lines')
      .select('id, product_id, product_variant_id, fabric_id, quantity, quantity_received')
      .eq('supplier_order_id', orderId)
    if (linesErr) return failure(linesErr.message || 'Error al cargar líneas', 'INTERNAL')

    const lineById = new Map((dbLines || []).map((l: any) => [l.id, l]))
    const now = new Date().toISOString()
    let stockWarnings = 0

    for (const input of linesToProcess) {
      const dbLine = lineById.get(input.lineId) as any
      if (!dbLine) return failure(`Línea ${input.lineId} no pertenece al pedido`, 'VALIDATION')

      const qtyReceived = Number(input.quantityReceived)
      if (!Number.isFinite(qtyReceived) || qtyReceived <= 0) continue

      const prevReceived = toNumber(dbLine.quantity_received)
      const newTotalReceived = prevReceived + qtyReceived
      const qtyOrdered = toNumber(dbLine.quantity)

      if (input.type === 'fabric' && input.referenceId) {
        const { data: fabricRow } = await ctx.adminClient
          .from('fabrics')
          .select('id, stock_meters')
          .eq('id', input.referenceId)
          .single()
        if (fabricRow?.id) {
          const current = toNumber((fabricRow as any).stock_meters)
          const newStock = current + qtyReceived
          const { error: updErr } = await ctx.adminClient
            .from('fabrics')
            .update({
              stock_meters: String(newStock.toFixed(2)),
            })
            .eq('id', input.referenceId)
          if (updErr) return failure(updErr.message || 'Error al actualizar stock de tejido', 'INTERNAL')
        } else {
          stockWarnings += 1
        }
      } else if (input.type === 'product' && input.referenceId) {
        // Usar product_variant_id de la línea si existe, sino fallback a pickVariantForProduct
        const dbLineVariantId = (dbLine as any).product_variant_id as string | null
        const variantId = dbLineVariantId || await pickVariantForProduct(ctx.adminClient, input.referenceId)
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
        const qtyInt = Math.round(qtyReceived)
        if (qtyInt <= 0) continue
        const stockAfter = stockBefore + qtyInt
        if (currentLevel?.id) {
          const { error: updateLevelError } = await ctx.adminClient
            .from('stock_levels')
            .update({
              quantity: stockAfter,
              updated_at: now,
              last_movement_at: now,
            })
            .eq('id', currentLevel.id)
          if (updateLevelError) return failure(updateLevelError.message || 'Error al actualizar stock', 'INTERNAL')
        } else {
          const { error: insertLevelError } = await ctx.adminClient
            .from('stock_levels')
            .insert({
              product_variant_id: variantId,
              warehouse_id: warehouseId,
              quantity: qtyInt,
              reserved: 0,
              updated_at: now,
              last_movement_at: now,
            })
          if (insertLevelError) return failure(insertLevelError.message || 'Error al crear stock', 'INTERNAL')
        }
        const { error: movementError } = await ctx.adminClient
          .from('stock_movements')
          .insert({
            product_variant_id: variantId,
            warehouse_id: warehouseId,
            movement_type: 'purchase_receipt',
            quantity: qtyInt,
            stock_before: stockBefore,
            stock_after: stockAfter,
            reason: `Recepción pedido ${(order as any).order_number}`,
            reference_type: 'supplier_order',
            reference_id: orderId,
            created_by: ctx.userId !== 'system' ? ctx.userId : null,
            store_id: (order as any).destination_store_id || null,
          })
        if (movementError) return failure(movementError.message || 'Error al registrar movimiento', 'INTERNAL')
      } else {
        stockWarnings += 1
        continue
      }

      const isFullyReceived = newTotalReceived >= qtyOrdered
      const { error: updateLineErr } = await ctx.adminClient
        .from('supplier_order_lines')
        .update({
          quantity_received: String(newTotalReceived.toFixed(2)),
          is_fully_received: isFullyReceived,
          received_at: now,
          received_by: ctx.userId !== 'system' ? ctx.userId : null,
        })
        .eq('id', input.lineId)
      if (updateLineErr) return failure(updateLineErr.message || 'Error al actualizar línea', 'INTERNAL')
    }

    const { data: allLinesAfter } = await ctx.adminClient
      .from('supplier_order_lines')
      .select('id, quantity, quantity_received, is_fully_received')
      .eq('supplier_order_id', orderId)
    const allFullyReceived = (allLinesAfter || []).length > 0 && (allLinesAfter || []).every(
      (l: any) => toNumber(l.quantity_received) >= toNumber(l.quantity)
    )
    const newStatus = allFullyReceived ? 'received' : 'partially_received'

    const { error: statusErr } = await ctx.adminClient
      .from('supplier_orders')
      .update({
        status: newStatus,
        ...(allFullyReceived ? { stock_updated_at: now, actual_delivery_date: now.slice(0, 10) } : {}),
      })
      .eq('id', orderId)
    if (statusErr) return failure(statusErr.message || 'Error al actualizar estado del pedido', 'INTERNAL')

    if (allFullyReceived) createPurchaseJournalEntry(orderId).catch(() => {})

    return success({ status: newStatus, stock_warnings: stockWarnings })
  }
)

export const updateSupplierOrderFinanceAction = protectedAction<
  { supplierOrderId: string; total: number; payment_due_date?: string | null; notes?: string | null; alert_on_payment?: boolean },
  { id: string; ap_invoice_id?: string }
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier_order',
    revalidate: ['/admin/proveedores', '/admin/contabilidad/facturas-proveedores'],
  },
  async (ctx, { supplierOrderId, total, payment_due_date, notes, alert_on_payment }) => {
    if (!supplierOrderId?.trim()) return failure('Pedido obligatorio', 'VALIDATION')
    if (!Number.isFinite(Number(total)) || Number(total) < 0) return failure('El coste debe ser mayor o igual a 0', 'VALIDATION')
    const paymentDue = payment_due_date?.trim() || null
    if (paymentDue) {
      const d = new Date(paymentDue)
      if (isNaN(d.getTime())) return failure('Fecha de pago no válida', 'VALIDATION')
    }

    const totalNum = Number(total)
    const { data: order, error: orderError } = await ctx.adminClient
      .from('supplier_orders')
      .update({
        subtotal: totalNum,
        tax_amount: 0,
        total: totalNum,
        payment_due_date: paymentDue,
        internal_notes: notes?.trim() || null,
      })
      .eq('id', supplierOrderId)
      .select('id, order_number, supplier_id')
      .single()
    if (orderError || !order) return failure(orderError?.message || 'Pedido no encontrado', 'NOT_FOUND')

    let apInvoiceId: string | undefined
    const canManageInvoices = await checkUserPermission(ctx.userId, 'supplier_invoices.manage').catch(() => false)
    if (canManageInvoices && totalNum > 0 && paymentDue) {
      const { data: existingInv } = await ctx.adminClient
        .from('ap_supplier_invoices')
        .select('id, status')
        .eq('supplier_order_id', supplierOrderId)
        .maybeSingle()

      if (existingInv?.id) {
        const payload: Record<string, unknown> = {
          amount: totalNum,
          tax_amount: 0,
          total_amount: totalNum,
          due_date: paymentDue,
          notes: notes?.trim() || null,
        }
        if (existingInv.status !== 'pagada') payload.status = 'pendiente'
        const { error: invUpErr } = await ctx.adminClient.from('ap_supplier_invoices').update(payload).eq('id', existingInv.id)
        if (invUpErr) return failure(invUpErr.message || 'No se pudo actualizar factura de proveedor')
        apInvoiceId = existingInv.id
      } else {
        const { data: supplier } = await ctx.adminClient
          .from('suppliers')
          .select('name, legal_name, nif_cif')
          .eq('id', order.supplier_id)
          .single()

        const today = new Date().toISOString().slice(0, 10)
        const supplierName = (supplier?.legal_name || supplier?.name || 'Proveedor').trim()
        const supplierCif = supplier?.nif_cif?.trim() || null

        const { data: inv, error: invErr } = await ctx.adminClient
          .from('ap_supplier_invoices')
          .insert({
            supplier_order_id: supplierOrderId,
            supplier_name: supplierName,
            supplier_cif: supplierCif,
            invoice_number: order.order_number,
            invoice_date: today,
            due_date: paymentDue,
            amount: totalNum,
            tax_amount: 0,
            total_amount: totalNum,
            status: 'pendiente',
            notes: notes?.trim() || null,
            created_by: ctx.userId !== 'system' ? ctx.userId : null,
            alert_on_payment: alert_on_payment !== false,
          })
          .select('id')
          .single()
        if (invErr) return failure(invErr.message || 'No se pudo crear factura de proveedor')
        apInvoiceId = inv?.id
      }
    }

    return success({ id: order.id, ap_invoice_id: apInvoiceId })
  }
)

export const deleteSupplierOrderAction = protectedAction<
  string,
  { deleted: boolean }
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'delete',
    auditEntity: 'supplier_order',
    revalidate: ['/admin/proveedores'],
  },
  async (ctx, orderId) => {
    if (!orderId?.trim()) return failure('ID del pedido obligatorio', 'VALIDATION')

    const { data: order, error: orderErr } = await ctx.adminClient
      .from('supplier_orders')
      .select('id, order_number, status')
      .eq('id', orderId.trim())
      .single()
    if (orderErr || !order) return failure('Pedido no encontrado', 'NOT_FOUND')

    const status = (order as any).status
    if (status === 'cancelled') {
      return failure('Este pedido ya está cancelado', 'VALIDATION')
    }

    // Delete in FK dependency order
    // 1. delivery note lines
    const { data: notes } = await ctx.adminClient
      .from('supplier_delivery_notes')
      .select('id')
      .eq('supplier_order_id', orderId)
    const noteIds = (notes || []).map((n: any) => n.id)
    if (noteIds.length > 0) {
      await ctx.adminClient.from('supplier_delivery_note_lines').delete().in('delivery_note_id', noteIds)
    }
    // 2. delivery notes
    await ctx.adminClient.from('supplier_delivery_notes').delete().eq('supplier_order_id', orderId)
    // 3. supplier invoices
    await ctx.adminClient.from('ap_supplier_invoices').delete().eq('supplier_order_id', orderId)
    // 4. order lines
    await ctx.adminClient.from('supplier_order_lines').delete().eq('supplier_order_id', orderId)
    // 5. the order itself
    const { error: deleteErr } = await ctx.adminClient
      .from('supplier_orders')
      .delete()
      .eq('id', orderId)
    if (deleteErr) return failure(deleteErr.message || 'Error al eliminar el pedido')

    return success({ deleted: true })
  }
)

export type CreateSupplierOrderInput = {
  supplier_id: string
  total?: number
  payment_due_date?: string | null
  estimated_delivery_date: string
  notes?: string | null
  alert_on_payment?: boolean
  alert_on_delivery?: boolean
  tailoring_order_id?: string
  lines?: Array<{
    fabric_id?: string | null
    product_id?: string | null
    product_variant_id?: string | null
    description: string
    reference?: string | null
    quantity: number
    unit?: string | null
    unit_price?: number
  }>
}

export const createSupplierOrderAction = protectedAction<
  CreateSupplierOrderInput,
  { id: string; order_number: string; ap_invoice_id?: string }
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'create',
    auditEntity: 'supplier_order',
    revalidate: ['/admin/proveedores', '/admin/contabilidad/facturas-proveedores'],
  },
  async (ctx, { supplier_id, total, payment_due_date, estimated_delivery_date, notes, alert_on_payment, alert_on_delivery, tailoring_order_id, lines }) => {
    if (!supplier_id?.trim()) return failure('Proveedor obligatorio', 'VALIDATION')
    if (!estimated_delivery_date?.trim()) return failure('Fecha de entrega estimada obligatoria', 'VALIDATION')

    const cleanedLines = (lines || [])
      .map((l) => ({
        fabric_id: l.fabric_id || null,
        product_id: l.product_id || null,
        product_variant_id: l.product_variant_id || null,
        description: String(l.description || '').trim(),
        reference: l.reference || null,
        quantity: Number(l.quantity),
        unit: (l.unit || 'unidades').trim(),
        unit_price: Number(l.unit_price) >= 0 ? Number(l.unit_price) : 0,
      }))
      .filter((l) => l.description && Number.isFinite(l.quantity) && l.quantity > 0)

    if (cleanedLines.length === 0) {
      return failure('Añade al menos una línea al pedido', 'VALIDATION')
    }

    const paymentDue = payment_due_date?.trim() || null
    const dueDate = paymentDue ? new Date(paymentDue) : null
    const deliveryDate = new Date(estimated_delivery_date)
    if (dueDate && isNaN(dueDate.getTime())) return failure('Fecha de pago no válida', 'VALIDATION')
    if (isNaN(deliveryDate.getTime())) return failure('Fecha de entrega no válida', 'VALIDATION')

    const orderNumber = await getNextNumber('supplier_orders', 'order_number', 'PEDPROV')
    const totalFromLines = cleanedLines.reduce((sum, l) => sum + l.quantity * (l.unit_price ?? 0), 0)
    const totalNum = totalFromLines >= 0 ? totalFromLines : 0
    const today = new Date().toISOString().slice(0, 10)

    const baseOrderPayload: Record<string, unknown> = {
      order_number: orderNumber,
      supplier_id: supplier_id.trim(),
      status: 'draft',
      order_date: today,
      payment_due_date: paymentDue,
      estimated_delivery_date: estimated_delivery_date.trim(),
      subtotal: totalNum,
      tax_amount: 0,
      total: totalNum,
      internal_notes: notes?.trim() || null,
      created_by: ctx.userId !== 'system' ? ctx.userId : null,
      alert_on_delivery: alert_on_delivery !== false,
      tailoring_order_id: tailoring_order_id?.trim() || null,
    }

    let order: { id: string; order_number: string } | null = null
    let orderError: any = null

    const firstInsert = await ctx.adminClient
      .from('supplier_orders')
      .insert(baseOrderPayload)
      .select('id, order_number')
      .single()

    order = firstInsert.data as any
    orderError = firstInsert.error

    // Compatibilidad con instalaciones donde aún no existe la columna alert_on_delivery.
    if (orderError?.message?.includes('alert_on_delivery')) {
      const fallbackPayload = { ...baseOrderPayload }
      delete (fallbackPayload as any).alert_on_delivery
      const fallbackInsert = await ctx.adminClient
        .from('supplier_orders')
        .insert(fallbackPayload)
        .select('id, order_number')
        .single()
      order = fallbackInsert.data as any
      orderError = fallbackInsert.error
    }

    if (orderError || !order) return failure(orderError?.message ?? 'Error al crear el pedido')

    if (cleanedLines.length > 0) {
      const { error: linesError } = await ctx.adminClient
        .from('supplier_order_lines')
        .insert(
          cleanedLines.map((line, idx) => ({
            supplier_order_id: order.id,
            fabric_id: line.fabric_id,
            product_id: line.product_id,
            product_variant_id: line.product_variant_id,
            description: line.description,
            reference: line.reference,
            quantity: line.quantity,
            unit: line.unit || 'unidades',
            unit_price: line.unit_price ?? 0,
            sort_order: idx,
          }))
        )
      if (linesError) return failure(linesError.message || 'Pedido creado, pero hubo un error guardando las líneas')

      // Asignar proveedor a productos que no lo tengan
      const productIdsToAssign = cleanedLines
        .filter(l => l.product_id)
        .map(l => l.product_id as string)
      if (productIdsToAssign.length > 0) {
        await ctx.adminClient
          .from('products')
          .update({ supplier_id: supplier_id.trim() })
          .in('id', productIdsToAssign)
          .is('supplier_id', null)
      }
    }

    let apInvoiceId: string | undefined
    const canManageInvoices = await checkUserPermission(ctx.userId, 'supplier_invoices.manage').catch(() => false)
    if (canManageInvoices && totalNum > 0 && paymentDue) {
      const { data: supplier } = await ctx.adminClient
        .from('suppliers')
        .select('name, legal_name, nif_cif')
        .eq('id', supplier_id)
        .single()

      const supplierName = (supplier?.legal_name || supplier?.name || 'Proveedor').trim()
      const supplierCif = supplier?.nif_cif?.trim() || null

      const { data: inv, error: invError } = await ctx.adminClient
        .from('ap_supplier_invoices')
        .insert({
          supplier_order_id: order.id,
          supplier_name: supplierName,
          supplier_cif: supplierCif,
          invoice_number: orderNumber,
          invoice_date: today,
          due_date: paymentDue,
          amount: totalNum,
          tax_amount: 0,
          total_amount: totalNum,
          status: 'pendiente',
          notes: notes?.trim() || null,
          created_by: ctx.userId !== 'system' ? ctx.userId : null,
          alert_on_payment: alert_on_payment !== false,
        })
        .select('id')
        .single()

      if (!invError && inv?.id) apInvoiceId = String(inv.id)
    }

    return success({
      id: String(order.id),
      order_number: order.order_number,
      ap_invoice_id: apInvoiceId,
    })
  }
)

/** Detalle completo de un pedido a proveedor (cabecera + líneas + albaranes + factura). */
export const getSupplierOrderDetail = protectedAction<
  { orderId: string },
  any
>(
  { permission: 'suppliers.view', auditModule: 'suppliers' },
  async (ctx, { orderId }) => {
    if (!orderId?.trim()) return failure('ID de pedido obligatorio', 'VALIDATION')
    const { data: order, error } = await ctx.adminClient
      .from('supplier_orders')
      .select(`
        id, order_number, status, total, subtotal, tax_amount, shipping_cost,
        order_date, estimated_delivery_date, actual_delivery_date, payment_due_date,
        internal_notes, supplier_notes, tailoring_order_id,
        destination_store_id, destination_warehouse_id, stock_updated_at, created_at,
        supplier_id,
        suppliers(id, name)
      `)
      .eq('id', orderId)
      .single()
    if (error || !order) return failure('Pedido no encontrado', 'NOT_FOUND')

    const [linesRes, notesRes, invoiceRes] = await Promise.all([
      ctx.adminClient
        .from('supplier_order_lines')
        .select('id, description, reference, quantity, quantity_received, unit, unit_price, total_price, fabric_id, product_id, is_fully_received, sort_order')
        .eq('supplier_order_id', orderId)
        .order('sort_order', { ascending: true }),
      ctx.adminClient
        .from('supplier_delivery_notes')
        .select('id, supplier_reference, delivery_date, status, attachment_url, notes, created_at')
        .eq('supplier_order_id', orderId)
        .order('created_at', { ascending: false }),
      ctx.adminClient
        .from('ap_supplier_invoices')
        .select('id, status, due_date, payment_date, total_amount')
        .eq('supplier_order_id', orderId)
        .maybeSingle(),
    ])

    let tailoringOrder = null
    if ((order as any).tailoring_order_id) {
      const { data: tOrder } = await ctx.adminClient
        .from('orders')
        .select('id, order_number')
        .eq('id', (order as any).tailoring_order_id)
        .maybeSingle()
      tailoringOrder = tOrder || null
    }

    return success({
      ...order,
      lines: linesRes.data ?? [],
      delivery_notes: notesRes.data ?? [],
      ap_invoice: invoiceRes.data ?? null,
      tailoring_order: tailoringOrder,
    })
  }
)

/** Actualización simple del estado de un pedido a proveedor (sin lógica de stock). */
export const updateSupplierOrderStatus = protectedAction<
  { orderId: string; status: typeof SUPPLIER_ORDER_STATUSES[number] },
  any
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier_order',
    revalidate: ['/admin/proveedores'],
  },
  async (ctx, { orderId, status }) => {
    if (!SUPPLIER_ORDER_STATUSES.includes(status)) return failure('Estado no válido', 'VALIDATION')
    const { data: order, error } = await ctx.adminClient
      .from('supplier_orders')
      .update({ status })
      .eq('id', orderId)
      .select()
      .single()
    if (error) return failure(error.message)
    if (!order) return failure('Pedido no encontrado', 'NOT_FOUND')
    return success(order)
  }
)

/** Marca la factura de un pedido como pagada. */
export const markSupplierInvoicePaid = protectedAction<
  { orderId: string },
  { ok: boolean }
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier_order',
    revalidate: ['/admin/proveedores', '/admin/contabilidad/facturas-proveedores'],
  },
  async (ctx, { orderId }) => {
    if (!orderId?.trim()) return failure('ID de pedido obligatorio', 'VALIDATION')
    const { data: inv } = await ctx.adminClient
      .from('ap_supplier_invoices')
      .select('id')
      .eq('supplier_order_id', orderId)
      .maybeSingle()
    if (!inv?.id) return failure('No hay factura asociada a este pedido', 'NOT_FOUND')
    const { error } = await ctx.adminClient
      .from('ap_supplier_invoices')
      .update({ status: 'pagada', payment_date: new Date().toISOString().slice(0, 10) })
      .eq('id', inv.id)
    if (error) return failure(error.message)
    return success({ ok: true })
  }
)
