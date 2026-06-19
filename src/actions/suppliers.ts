'use server'

import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber } from '@/lib/server/query-helpers'
import { createSupplierSchema, updateSupplierSchema } from '@/lib/validations/suppliers'
import { success, failure } from '@/lib/errors'
import { createPurchaseJournalEntry } from '@/actions/accounting-triggers'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'
import { buildAuditDiff } from '@/lib/audit'
import { recalculatePendingInvoicesForSupplier } from '@/lib/server/supplier-payments'

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

type SupplierTotals = { total_debt: number; total_paid: number }

const DEBT_STATUSES = new Set(['pendiente', 'vencida', 'parcial'])

async function computeSupplierTotals(
  adminClient: AdminClient,
  suppliers: Array<{ id: string; nif_cif?: string | null }>,
): Promise<Map<string, SupplierTotals>> {
  const totals = new Map<string, SupplierTotals>()
  if (suppliers.length === 0) return totals

  const supplierIds = suppliers.map((s) => s.id)
  const cifToId = new Map<string, string>()
  for (const s of suppliers) {
    const cif = (s.nif_cif || '').trim()
    if (cif) cifToId.set(cif, s.id)
  }

  const addRow = (id: string, row: { status?: string | null; total_amount?: number | string | null }) => {
    const amt = Number(row.total_amount ?? 0)
    if (!Number.isFinite(amt)) return
    const cur = totals.get(id) ?? { total_debt: 0, total_paid: 0 }
    const status = String(row.status ?? 'pendiente')
    if (status === 'pagada') cur.total_paid += amt
    else if (DEBT_STATUSES.has(status)) cur.total_debt += amt
    totals.set(id, cur)
  }

  const { data: byId } = await adminClient
    .from('ap_supplier_invoices')
    .select('supplier_id, supplier_cif, status, total_amount')
    .eq('is_proforma', false) // las proformas no son deuda con el proveedor
    .in('supplier_id', supplierIds)
  for (const r of (byId || []) as any[]) {
    if (r.supplier_id) addRow(String(r.supplier_id), r)
  }

  const cifs = Array.from(cifToId.keys())
  if (cifs.length > 0) {
    const { data: byCif } = await adminClient
      .from('ap_supplier_invoices')
      .select('supplier_id, supplier_cif, status, total_amount')
      .eq('is_proforma', false) // las proformas no son deuda con el proveedor
      .is('supplier_id', null)
      .in('supplier_cif', cifs)
    for (const r of (byCif || []) as any[]) {
      const cif = String(r.supplier_cif ?? '').trim()
      const id = cifToId.get(cif)
      if (id) addRow(id, r)
    }
  }

  return totals
}

export const listSuppliers = protectedAction<ListParams, ListResult<any>>(
  { permission: 'suppliers.view', auditModule: 'suppliers' },
  async (ctx, params) => {
    const result = await queryList<any>('suppliers', {
      ...params,
      searchFields: ['search_text'],
    }, `
      id, supplier_code, name, legal_name, nif_cif, supplier_types,
      contact_name, contact_email, contact_phone, city,
      payment_terms, payment_method, total_debt, total_paid, is_active, created_at
    `)

    const totals = await computeSupplierTotals(
      ctx.adminClient,
      (result.data || []).map((s: any) => ({ id: String(s.id), nif_cif: s.nif_cif })),
    )
    const enriched = (result.data || []).map((s: any) => {
      const t = totals.get(String(s.id)) ?? { total_debt: 0, total_paid: 0 }
      return { ...s, total_debt: t.total_debt, total_paid: t.total_paid }
    })
    return success({ ...result, data: enriched })
  }
)

export const getSupplier = protectedAction<string, any>(
  { permission: 'suppliers.view', auditModule: 'suppliers' },
  async (ctx, supplierId) => {
    const supplier = await queryById<any>('suppliers', supplierId, `
      *,
      supplier_contacts (*),
      fabrics ( id, fabric_code, name, composition, price_per_meter, stock_meters, status ),
      supplier_orders ( id, order_number, status, total, order_date, estimated_delivery_date, created_at ),
      supplier_due_dates ( id, due_date, amount, is_paid, alert_sent )
    `)
    if (!supplier) return failure('Proveedor no encontrado', 'NOT_FOUND')

    const totals = await computeSupplierTotals(
      ctx.adminClient,
      [{ id: String((supplier as any).id), nif_cif: (supplier as any).nif_cif }],
    )
    const t = totals.get(String((supplier as any).id)) ?? { total_debt: 0, total_paid: 0 }
    return success({ ...(supplier as any), total_debt: t.total_debt, total_paid: t.total_paid })
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

export const deleteSupplierAction = protectedAction<string, { deleted: boolean }>(
  {
    permission: 'suppliers.edit',
    auditModule: 'suppliers',
    auditAction: 'delete',
    auditEntity: 'supplier',
    revalidate: ['/admin/proveedores'],
  },
  async (ctx, supplierId) => {
    if (!supplierId?.trim()) return failure('ID del proveedor obligatorio', 'VALIDATION')

    const { data: supplier, error: fetchErr } = await ctx.adminClient
      .from('suppliers')
      .select('id, name')
      .eq('id', supplierId.trim())
      .single()
    if (fetchErr || !supplier) return failure('Proveedor no encontrado', 'NOT_FOUND')

    const { count: ordersCount } = await ctx.adminClient
      .from('supplier_orders')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplierId.trim())
    if ((ordersCount ?? 0) > 0) {
      return failure('No se puede eliminar: el proveedor tiene pedidos asociados', 'CONFLICT')
    }

    const { count: invoicesCount } = await ctx.adminClient
      .from('ap_supplier_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', supplierId.trim())
      .eq('is_proforma', false) // una proforma (no fiscal) no bloquea el borrado del proveedor
    if ((invoicesCount ?? 0) > 0) {
      return failure('No se puede eliminar: el proveedor tiene facturas asociadas', 'CONFLICT')
    }

    await ctx.adminClient.from('supplier_contacts').delete().eq('supplier_id', supplierId.trim())
    await ctx.adminClient.from('supplier_due_dates').delete().eq('supplier_id', supplierId.trim())

    const { error: deleteErr } = await ctx.adminClient
      .from('suppliers')
      .delete()
      .eq('id', supplierId.trim())
    if (deleteErr) return failure(deleteErr.message || 'Error al eliminar el proveedor')

    return success({
      deleted: true,
      auditDescription: `Proveedor eliminado: ${(supplier as any).name ?? supplierId}`,
    } as any)
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

    const { data: before } = await ctx.adminClient
      .from('suppliers').select('*').eq('id', id).single()

    const { data: supplier, error } = await ctx.adminClient
      .from('suppliers').update(parsed.data).eq('id', id).select().single()

    if (error) return failure(error.message)

    const paymentChanged = paymentConfigChanged(
      before as Record<string, unknown> | null,
      supplier as Record<string, unknown> | null,
    )
    if (paymentChanged) {
      const s = supplier as any
      try {
        await recalculatePendingInvoicesForSupplier(ctx.adminClient, id, {
          payment_terms: s.payment_terms ?? null,
          payment_days: s.payment_days != null ? Number(s.payment_days) : null,
          custom_payment_plan: normalizeCustomPlan(s.custom_payment_plan),
        })
      } catch (e) {
        console.error('[updateSupplierAction] recálculo de vencimientos:', e)
      }
    }

    // Si cambia el método de pago del proveedor, propagar a sus facturas no pagadas.
    const beforeMethod = (before as any)?.payment_method ?? null
    const afterMethod = (supplier as any)?.payment_method ?? null
    if (beforeMethod !== afterMethod) {
      try {
        const { error: invErr } = await ctx.adminClient
          .from('ap_supplier_invoices')
          .update({ payment_method: afterMethod })
          .eq('supplier_id', id)
          .in('status', ['pendiente', 'parcial', 'vencida'])
        if (invErr) console.error('[updateSupplierAction] propagación payment_method:', invErr)
      } catch (e) {
        console.error('[updateSupplierAction] propagación payment_method:', e)
      }
    }

    const diff = buildAuditDiff(before as Record<string, unknown> | null, supplier as Record<string, unknown> | null)
    return success({
      ...(supplier as Record<string, unknown>),
      auditDescription: `Proveedor: ${(supplier as any)?.name ?? id}`,
      auditOldData: diff?.auditOldData,
      auditNewData: diff?.auditNewData,
    })
  }
)

function paymentConfigChanged(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): boolean {
  if (!before || !after) return false
  const a = (before as any).payment_days
  const b = (after as any).payment_days
  if ((a ?? null) !== (b ?? null)) return true
  if (((before as any).payment_terms ?? null) !== ((after as any).payment_terms ?? null)) return true
  if (JSON.stringify((before as any).custom_payment_plan ?? null) !== JSON.stringify((after as any).custom_payment_plan ?? null)) return true
  return false
}

function normalizeCustomPlan(raw: unknown): Array<{ amount: number; days: number | null }> | null {
  if (!Array.isArray(raw)) return null
  const plan = raw
    .map((p: any) => ({
      amount: Number(p?.amount ?? 0),
      days: p?.days !== undefined && p?.days !== null && p?.days !== '' ? Number(p.days) : null,
    }))
    .filter((p) => Number.isFinite(p.amount) && p.amount > 0)
  return plan.length > 0 ? plan : null
}

const SUPPLIER_ORDER_STATUSES = ['draft', 'sent', 'confirmed', 'partially_received', 'received', 'incident', 'cancelled'] as const

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

async function pickWarehouseForReceipt(adminClient: AdminClient, order: any, overrideWarehouseId?: string | null) {
  if (overrideWarehouseId) {
    const { data: override } = await adminClient
      .from('warehouses')
      .select('id')
      .eq('id', overrideWarehouseId)
      .eq('is_active', true)
      .maybeSingle()
    if (override?.id) return override.id as string
  }

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

  // Fallback: almacén principal de Hermanos Pinzón (tienda por defecto para recepciones)
  const { data: pinzonStore } = await adminClient
    .from('stores')
    .select('id')
    .eq('code', 'PIN')
    .eq('is_active', true)
    .maybeSingle()
  if (pinzonStore?.id) {
    const { data: pinzonWarehouse } = await adminClient
      .from('warehouses')
      .select('id')
      .eq('store_id', pinzonStore.id)
      .eq('is_main', true)
      .eq('is_active', true)
      .maybeSingle()
    if (pinzonWarehouse?.id) return pinzonWarehouse.id as string
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

/**
 * Aplica una variación (delta con signo) al stock de una variante de producto en
 * un almacén y registra el movimiento como ajuste (adjustment_positive/negative).
 * Se usa para CORREGIR recepciones (subir/bajar lo recibido) o revertir el stock
 * de una línea eliminada. No bloquea stock negativo: es una corrección de inventario.
 */
async function adjustProductStockDelta(
  adminClient: AdminClient,
  params: {
    variantId: string
    warehouseId: string
    delta: number
    reason: string
    orderId: string
    storeId: string | null
    userId: string | null
  }
): Promise<{ ok: boolean; error?: string }> {
  const deltaInt = Math.round(params.delta)
  if (deltaInt === 0) return { ok: true }
  const now = new Date().toISOString()
  const { data: currentLevel } = await adminClient
    .from('stock_levels')
    .select('id, quantity')
    .eq('product_variant_id', params.variantId)
    .eq('warehouse_id', params.warehouseId)
    .maybeSingle()
  const stockBefore = toNumber((currentLevel as any)?.quantity)
  const stockAfter = stockBefore + deltaInt
  if (currentLevel?.id) {
    const { error } = await adminClient
      .from('stock_levels')
      .update({ quantity: stockAfter, updated_at: now, last_movement_at: now })
      .eq('id', currentLevel.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await adminClient
      .from('stock_levels')
      .insert({
        product_variant_id: params.variantId,
        warehouse_id: params.warehouseId,
        quantity: stockAfter,
        reserved: 0,
        updated_at: now,
        last_movement_at: now,
      })
    if (error) return { ok: false, error: error.message }
  }
  const { error: movErr } = await adminClient
    .from('stock_movements')
    .insert({
      product_variant_id: params.variantId,
      warehouse_id: params.warehouseId,
      movement_type: deltaInt > 0 ? 'adjustment_positive' : 'adjustment_negative',
      quantity: deltaInt,
      stock_before: stockBefore,
      stock_after: stockAfter,
      reason: params.reason,
      reference_type: 'supplier_order',
      reference_id: params.orderId,
      created_by: params.userId,
      store_id: params.storeId,
    })
  if (movErr) return { ok: false, error: movErr.message }
  return { ok: true }
}

/** Aplica una variación (delta con signo, en metros) al stock de un tejido. */
async function adjustFabricStockDelta(
  adminClient: AdminClient,
  fabricId: string,
  delta: number
): Promise<{ ok: boolean; error?: string; warning?: boolean }> {
  if (delta === 0) return { ok: true }
  const { data: fabricRow } = await adminClient
    .from('fabrics')
    .select('id, stock_meters')
    .eq('id', fabricId)
    .single()
  if (!fabricRow?.id) return { ok: false, warning: true }
  const newStock = toNumber((fabricRow as any).stock_meters) + delta
  const { error } = await adminClient
    .from('fabrics')
    .update({ stock_meters: String(newStock.toFixed(2)) })
    .eq('id', fabricId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Lista de almacenes activos con la tienda a la que pertenecen. Se usa en
 *  el diálogo de recepción de pedidos de proveedor para permitir que el
 *  usuario elija el almacén destino. */
export const listActiveWarehouses = protectedAction<
  void,
  { id: string; name: string; code: string | null; store_id: string | null; store_name: string | null; is_main: boolean }[]
>(
  { permission: 'suppliers.view' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('warehouses')
      .select('id, name, code, is_main, store_id, stores(name)')
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (error) return failure(error.message)
    const mapped = (data ?? []).map((w: any) => ({
      id: String(w.id),
      name: String(w.name ?? ''),
      code: w.code ?? null,
      store_id: w.store_id ?? null,
      store_name: (w.stores as any)?.name ?? null,
      is_main: Boolean(w.is_main),
    }))
    return success(mapped)
  }
)

async function pickVariantForProduct(adminClient: AdminClient, productId: string): Promise<string | null> {
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

    const { data: prev } = await ctx.adminClient
      .from('supplier_orders')
      .select('status, order_number')
      .eq('id', supplierOrderId)
      .single()
    const prevStatus = (prev as any)?.status ?? null
    const orderNum = (prev as any)?.order_number ?? supplierOrderId

    const { data: order, error } = await ctx.adminClient
      .from('supplier_orders')
      .update({ status })
      .eq('id', supplierOrderId)
      .select()
      .single()

    if (error) return failure(error.message)
    if (!order) return failure('Pedido no encontrado', 'NOT_FOUND')

    const supplierStatusEs: Record<string, string> = {
      draft: 'Borrador', sent: 'Enviado', confirmed: 'Confirmado',
      partially_received: 'Recibido parcial', received: 'Recibido',
      incident: 'Incidencia', cancelled: 'Cancelado',
    }
    const auditDescription = `Pedido proveedor ${orderNum}: ${supplierStatusEs[prevStatus ?? ''] ?? prevStatus ?? '—'} → ${supplierStatusEs[status] ?? status}`
    const auditEnvelope = {
      auditDescription,
      auditOldData: { estado: prevStatus },
      auditNewData: { estado: status },
    }

    if (status === 'received') {
      const stockUpdatedAt = (order as any).stock_updated_at as string | null | undefined
      if (stockUpdatedAt) {
        console.warn('[updateSupplierOrderStatusAction] stock ya actualizado previamente', { supplierOrderId, stockUpdatedAt })
        return success({ ...order, stock_update_skipped: true, stock_warnings: 0, ...auditEnvelope })
      }

      const warehouseId = await pickWarehouseForReceipt(ctx.adminClient, order)
      if (!warehouseId) return failure('No hay almacén activo para registrar la recepción de stock', 'CONFLICT')

      const { data: lines, error: linesError } = await ctx.adminClient
        .from('supplier_order_lines')
        .select('id, supplier_order_id, product_id, product_variant_id, fabric_id, description, reference, quantity, quantity_received')
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
        const declaredVariantId = (line as any).product_variant_id ? String((line as any).product_variant_id) : null
        const isFabricLine = !productId && !!(line as any).fabric_id
        if (isFabricLine) {
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

        // Para productos normales exigimos la variante explícita guardada en la línea
        // (talla/color). Antes se hacía fallback a la primera variante creada, lo que
        // provocaba que todo el stock entrara en XS. Solo los tejidos resueltos
        // dinámicamente desde fabric_id usan pickVariantForProduct (una sola variante).
        let variantId: string | null = declaredVariantId
        if (!variantId && isFabricLine) {
          variantId = await pickVariantForProduct(ctx.adminClient, productId)
        }
        if (!variantId) {
          stockWarnings += 1
          console.warn('[supplier receipt] línea de producto sin variante asignada; no se actualiza stock', {
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
      return success({ ...order, stock_update_skipped: false, stock_warnings: stockWarnings, ...auditEnvelope })
    }

    return success({ ...order, ...auditEnvelope })
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
  { orderId: string; lines: ReceiveSupplierOrderLineInput[]; warehouseId?: string | null },
  { status: string; stock_warnings?: number }
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier_order',
    revalidate: ['/admin/proveedores'],
  },
  async (ctx, { orderId, lines: inputLines, warehouseId: warehouseOverride }) => {
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

    const warehouseId = await pickWarehouseForReceipt(ctx.adminClient, order, warehouseOverride ?? null)
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
        // La línea del pedido debe tener asignada una variante explícita (talla/color).
        // Si no la tiene, no inventamos una: devolvemos error para que el usuario
        // complete el pedido correctamente. Antes se hacía fallback a la primera
        // variante creada, lo que provocaba que el stock se metiera en XS.
        const variantId = (dbLine as any).product_variant_id as string | null
        if (!variantId) {
          return failure(
            `La línea "${(dbLine as any).description ?? ''}" no tiene talla/variante asignada. Edita el pedido y selecciona la talla antes de recepcionar.`,
            'VALIDATION'
          )
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

        // Activar reservas pending_stock de esta variante+almacén si llegó
        // suficiente stock. No bloquea la recepción si falla.
        try {
          await ctx.adminClient.rpc('fn_activate_pending_reservations', {
            p_product_variant_id: variantId,
            p_warehouse_id: warehouseId,
            p_user_id: ctx.userId !== 'system' ? ctx.userId : null,
          })
        } catch (e) {
          console.error('[receiveSupplierOrderLines] fn_activate_pending_reservations:', e)
        }
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

export type EditSupplierOrderLineInput = {
  id?: string | null
  type: 'fabric' | 'product' | 'custom'
  fabric_id?: string | null
  product_id?: string | null
  product_variant_id?: string | null
  description: string
  reference?: string | null
  quantity: number
  unit?: string | null
  unit_price: number
  quantity_received: number
}

/**
 * Edita un pedido a proveedor YA grabado: corrige cantidades pedidas, precios,
 * cantidad recibida (subiendo o bajando, con ajuste automático de stock) y permite
 * añadir o eliminar líneas. `quantity_received` es el valor TOTAL deseado de cada
 * línea (no incremental): la acción calcula el delta contra lo recibido previamente
 * y ajusta el stock del almacén destino. El estado del pedido se recalcula solo.
 */
export const updateSupplierOrderLinesAction = protectedAction<
  { orderId: string; lines: EditSupplierOrderLineInput[]; deletedLineIds?: string[] },
  { status: string; total: number; stock_warnings?: number }
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'update',
    auditEntity: 'supplier_order',
    revalidate: ['/admin/proveedores'],
  },
  async (ctx, { orderId, lines: inputLines, deletedLineIds }) => {
    if (!orderId?.trim()) return failure('Pedido obligatorio', 'VALIDATION')

    const { data: order, error: orderErr } = await ctx.adminClient
      .from('supplier_orders')
      .select('id, order_number, status, supplier_id, destination_store_id, destination_warehouse_id, actual_delivery_date')
      .eq('id', orderId)
      .single()
    if (orderErr || !order) return failure('Pedido no encontrado', 'NOT_FOUND')

    const prevStatus = (order as any).status as string
    if (prevStatus === 'cancelled') {
      return failure('No se puede editar un pedido cancelado', 'VALIDATION')
    }

    // Líneas actuales en BD: fuente de verdad de lo ya recibido y de la variante.
    const { data: dbLines, error: dbLinesErr } = await ctx.adminClient
      .from('supplier_order_lines')
      .select('id, fabric_id, product_id, product_variant_id, quantity, quantity_received')
      .eq('supplier_order_id', orderId)
    if (dbLinesErr) return failure(dbLinesErr.message || 'Error al cargar líneas', 'INTERNAL')
    const dbLineById = new Map((dbLines || []).map((l: any) => [l.id, l]))

    // Normalizar y validar la entrada antes de tocar nada.
    const cleaned = (inputLines || []).map((l) => ({
      id: l.id?.trim() || null,
      type: l.type,
      fabric_id: l.fabric_id?.trim() || null,
      product_id: l.product_id?.trim() || null,
      product_variant_id: l.product_variant_id?.trim() || null,
      description: String(l.description || '').trim(),
      reference: l.reference?.trim() || null,
      quantity: Number(l.quantity),
      unit: (l.unit || (l.type === 'fabric' ? 'metros' : 'unidades')).trim(),
      unit_price: Number(l.unit_price) >= 0 ? Number(l.unit_price) : 0,
      quantity_received: Number(l.quantity_received),
    }))

    for (const l of cleaned) {
      if (!l.description) return failure('Todas las líneas deben tener descripción', 'VALIDATION')
      if (!Number.isFinite(l.quantity) || l.quantity <= 0) {
        return failure(`Cantidad pedida no válida en "${l.description}"`, 'VALIDATION')
      }
      if (!Number.isFinite(l.quantity_received) || l.quantity_received < 0) {
        return failure(`Cantidad recibida no válida en "${l.description}"`, 'VALIDATION')
      }
      if (l.id && !dbLineById.has(l.id)) {
        return failure('Una de las líneas no pertenece al pedido', 'VALIDATION')
      }
    }

    const deletedIds = (deletedLineIds || []).filter((id) => id?.trim() && dbLineById.has(id))

    // ¿Hace falta tocar stock de algún producto? Si sí, necesitamos almacén destino.
    const needsWarehouse =
      cleaned.some((l) => {
        if (l.type !== 'product' || !l.product_variant_id) return false
        const prev = l.id ? toNumber((dbLineById.get(l.id) as any).quantity_received) : 0
        return Math.round(l.quantity_received - prev) !== 0
      }) ||
      deletedIds.some((id) => {
        const db = dbLineById.get(id) as any
        return db.product_id && db.product_variant_id && toNumber(db.quantity_received) > 0
      })

    let warehouseId: string | null = null
    if (needsWarehouse) {
      warehouseId = await pickWarehouseForReceipt(ctx.adminClient, order, null)
      if (!warehouseId) return failure('No hay almacén activo para ajustar el stock', 'CONFLICT')
    }

    // Validación previa: subir lo recibido de un producto exige variante asignada.
    for (const l of cleaned) {
      if (l.type !== 'product') continue
      const prev = l.id ? toNumber((dbLineById.get(l.id) as any).quantity_received) : 0
      const delta = Math.round(l.quantity_received - prev)
      if (delta > 0 && !l.product_variant_id) {
        return failure(
          `La línea "${l.description}" no tiene talla/variante asignada. Selecciona la talla antes de aumentar lo recibido.`,
          'VALIDATION'
        )
      }
    }

    const storeId = (order as any).destination_store_id || null
    const userId = ctx.userId !== 'system' ? ctx.userId : null
    const orderNumber = (order as any).order_number
    const now = new Date().toISOString()
    let stockWarnings = 0

    // 1) Líneas existentes: ajuste de stock por delta + actualización de campos.
    for (const l of cleaned) {
      if (!l.id) continue
      const db = dbLineById.get(l.id) as any
      const prevReceived = toNumber(db.quantity_received)
      const delta = l.quantity_received - prevReceived

      if (delta !== 0) {
        if (l.type === 'fabric' && l.fabric_id) {
          const r = await adjustFabricStockDelta(ctx.adminClient, l.fabric_id, delta)
          if (r.warning) stockWarnings += 1
          else if (!r.ok) return failure(r.error || 'Error al ajustar stock de tejido', 'INTERNAL')
        } else if (l.type === 'product' && l.product_variant_id && warehouseId) {
          const r = await adjustProductStockDelta(ctx.adminClient, {
            variantId: l.product_variant_id,
            warehouseId,
            delta,
            reason: `Corrección recepción ${orderNumber}`,
            orderId,
            storeId,
            userId,
          })
          if (!r.ok) return failure(r.error || 'Error al ajustar stock', 'INTERNAL')
          if (delta > 0) {
            try {
              await ctx.adminClient.rpc('fn_activate_pending_reservations', {
                p_product_variant_id: l.product_variant_id,
                p_warehouse_id: warehouseId,
                p_user_id: userId,
              })
            } catch (e) {
              console.error('[updateSupplierOrderLinesAction] fn_activate_pending_reservations:', e)
            }
          }
        } else if (delta > 0) {
          // Producto/línea sin referencia de stock: no podemos sumar.
          stockWarnings += 1
        }
      }

      const { error: updErr } = await ctx.adminClient
        .from('supplier_order_lines')
        .update({
          fabric_id: l.fabric_id,
          product_id: l.product_id,
          product_variant_id: l.product_variant_id,
          description: l.description,
          reference: l.reference,
          quantity: l.quantity,
          unit: l.unit,
          unit_price: l.unit_price,
          // total_price es columna generada (GENERATED ALWAYS) en la BD: no se escribe.
          quantity_received: String(l.quantity_received.toFixed(2)),
          is_fully_received: l.quantity_received >= l.quantity,
          ...(delta !== 0 ? { received_at: now, received_by: userId } : {}),
        })
        .eq('id', l.id)
      if (updErr) return failure(updErr.message || 'Error al actualizar línea', 'INTERNAL')
    }

    // 2) Líneas nuevas: insertar y, si traen recibido > 0, sumar stock.
    const newLines = cleaned.filter((l) => !l.id)
    if (newLines.length > 0) {
      const { data: maxRow } = await ctx.adminClient
        .from('supplier_order_lines')
        .select('sort_order')
        .eq('supplier_order_id', orderId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      let nextSort = toNumber((maxRow as any)?.sort_order) + 1

      for (const l of newLines) {
        const { error: insErr } = await ctx.adminClient
          .from('supplier_order_lines')
          .insert({
            supplier_order_id: orderId,
            fabric_id: l.fabric_id,
            product_id: l.product_id,
            product_variant_id: l.product_variant_id,
            description: l.description,
            reference: l.reference,
            quantity: l.quantity,
            unit: l.unit,
            unit_price: l.unit_price,
            // total_price es columna generada (GENERATED ALWAYS) en la BD: no se escribe.
            quantity_received: String(l.quantity_received.toFixed(2)),
            is_fully_received: l.quantity_received >= l.quantity,
            sort_order: nextSort,
            ...(l.quantity_received > 0 ? { received_at: now, received_by: userId } : {}),
          })
        if (insErr) return failure(insErr.message || 'Error al añadir línea', 'INTERNAL')
        nextSort += 1

        if (l.quantity_received > 0) {
          if (l.type === 'fabric' && l.fabric_id) {
            const r = await adjustFabricStockDelta(ctx.adminClient, l.fabric_id, l.quantity_received)
            if (r.warning) stockWarnings += 1
            else if (!r.ok) return failure(r.error || 'Error al ajustar stock de tejido', 'INTERNAL')
          } else if (l.type === 'product' && l.product_variant_id && warehouseId) {
            const r = await adjustProductStockDelta(ctx.adminClient, {
              variantId: l.product_variant_id,
              warehouseId,
              delta: l.quantity_received,
              reason: `Corrección recepción ${orderNumber}`,
              orderId,
              storeId,
              userId,
            })
            if (!r.ok) return failure(r.error || 'Error al ajustar stock', 'INTERNAL')
          } else {
            stockWarnings += 1
          }
        }
      }
    }

    // 3) Líneas eliminadas: revertir su stock recibido antes de borrar.
    for (const id of deletedIds) {
      const db = dbLineById.get(id) as any
      const prevReceived = toNumber(db.quantity_received)
      if (prevReceived > 0) {
        if (db.fabric_id) {
          const r = await adjustFabricStockDelta(ctx.adminClient, db.fabric_id, -prevReceived)
          if (r.warning) stockWarnings += 1
          else if (!r.ok) return failure(r.error || 'Error al revertir stock de tejido', 'INTERNAL')
        } else if (db.product_id && db.product_variant_id && warehouseId) {
          const r = await adjustProductStockDelta(ctx.adminClient, {
            variantId: db.product_variant_id,
            warehouseId,
            delta: -prevReceived,
            reason: `Reversión línea eliminada ${orderNumber}`,
            orderId,
            storeId,
            userId,
          })
          if (!r.ok) return failure(r.error || 'Error al revertir stock', 'INTERNAL')
        }
      }
      const { error: delErr } = await ctx.adminClient
        .from('supplier_order_lines')
        .delete()
        .eq('id', id)
      if (delErr) return failure(delErr.message || 'Error al eliminar línea', 'INTERNAL')
    }

    // 4) Recalcular total del pedido y estado a partir de las líneas resultantes.
    const { data: linesAfter } = await ctx.adminClient
      .from('supplier_order_lines')
      .select('quantity, quantity_received')
      .eq('supplier_order_id', orderId)
    const rows = linesAfter || []
    const total = cleaned.reduce((s, l) => s + l.quantity * l.unit_price, 0)
    const anyReceived = rows.some((l: any) => toNumber(l.quantity_received) > 0)
    const allFully = rows.length > 0 && rows.every((l: any) => toNumber(l.quantity_received) >= toNumber(l.quantity))

    let newStatus = prevStatus
    if (anyReceived && allFully) newStatus = 'received'
    else if (anyReceived) newStatus = 'partially_received'
    else if (prevStatus === 'received' || prevStatus === 'partially_received') newStatus = 'confirmed'

    const becameReceived = newStatus === 'received' && prevStatus !== 'received'

    const { error: orderUpdErr } = await ctx.adminClient
      .from('supplier_orders')
      .update({
        subtotal: total,
        tax_amount: 0,
        total,
        status: newStatus,
        ...(becameReceived
          ? { stock_updated_at: now, actual_delivery_date: (order as any).actual_delivery_date || now.slice(0, 10) }
          : {}),
      })
      .eq('id', orderId)
    if (orderUpdErr) return failure(orderUpdErr.message || 'Error al actualizar el pedido', 'INTERNAL')

    // Asiento de compra: solo en la transición a "recibido" (la función NO es
    // idempotente; re-llamarla duplicaría el asiento). Si el pedido ya estaba
    // recibido, no se toca contabilidad: revisar la factura del proveedor a mano.
    if (becameReceived) createPurchaseJournalEntry(orderId).catch(() => {})

    return success({ status: newStatus, total, stock_warnings: stockWarnings })
  }
)

export const updateSupplierOrderFinanceAction = protectedAction<
  { supplierOrderId: string; total: number; payment_due_date?: string | null; notes?: string | null; alert_on_payment?: boolean },
  { id: string }
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

    // No se crea/actualiza automáticamente la factura en ap_supplier_invoices.
    // La gestión de facturas es manual desde /admin/contabilidad/facturas-proveedores.
    void alert_on_payment

    return success({ id: order.id })
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

    // Todo el borrado es atómico en rpc_delete_supplier_order (mig 223): deshace el
    // stock recibido (solo purchase_receipt), limpia TODOS los stock_movements
    // (cero huérfanos), borra dependencias en orden FK correcto y aborta si el
    // pedido tiene factura de proveedor ligada o si revertir dejaría stock negativo.
    // Los RAISE de la RPC dan mensajes legibles → se pasan tal cual al usuario.
    const { data: result, error: rpcError } = await ctx.adminClient.rpc('rpc_delete_supplier_order', {
      p_supplier_order_id: orderId.trim(),
      p_user_id: ctx.userId,
    })
    if (rpcError) return failure(rpcError.message || 'Error al eliminar el pedido')

    const r = result as { order_number?: string; movements_deleted?: number; reverted?: unknown[] }
    return success({
      deleted: true,
      auditEntityId: orderId.trim(),
      auditDescription: `Borrado pedido a proveedor ${r?.order_number ?? ''} (recepción deshecha: ${r?.reverted?.length ?? 0} variante(s), ${r?.movements_deleted ?? 0} movimiento(s) de stock eliminados)`,
      auditOldData: { order_number: r?.order_number, reverted: r?.reverted, movements_deleted: r?.movements_deleted },
    } as { deleted: boolean })
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
  /** Tienda destino donde se recepcionará la mercancía. Si se omite o es
   *  null, la recepción cae en el fallback (almacén principal de Pinzón). */
  destination_store_id?: string | null
  /** Almacén destino concreto. Si se omite, se usa el principal de la
   *  tienda destino. */
  destination_warehouse_id?: string | null
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
  /** Plazos de pago (hasta 3). Si se omite, se usa payment_due_date con el total entero. */
  payment_schedule?: Array<{ due_date: string; amount: number }>
}

export const createSupplierOrderAction = protectedAction<
  CreateSupplierOrderInput,
  { id: string; order_number: string }
>(
  {
    permission: 'suppliers.create_order',
    auditModule: 'suppliers',
    auditAction: 'create',
    auditEntity: 'supplier_order',
    revalidate: ['/admin/proveedores', '/admin/contabilidad/facturas-proveedores'],
  },
  async (ctx, { supplier_id, total, payment_due_date, estimated_delivery_date, notes, alert_on_payment, alert_on_delivery, tailoring_order_id, destination_store_id, destination_warehouse_id, lines, payment_schedule }) => {
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

    // Tienda/almacén destino: si solo viene la tienda, resolvemos el almacén
    // principal de esa tienda. Así la recepción nunca cae en el fallback.
    const destStoreId = destination_store_id?.trim() || null
    let destWarehouseId = destination_warehouse_id?.trim() || null
    if (destStoreId && !destWarehouseId) {
      const { data: mainWh } = await ctx.adminClient
        .from('warehouses')
        .select('id')
        .eq('store_id', destStoreId)
        .eq('is_main', true)
        .eq('is_active', true)
        .maybeSingle()
      if (mainWh?.id) destWarehouseId = String(mainWh.id)
    }

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
      destination_store_id: destStoreId,
      destination_warehouse_id: destWarehouseId,
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

    // La factura de proveedor NO se crea automáticamente: debe crearla
    // manualmente el admin desde /admin/contabilidad/facturas-proveedores
    // y, si corresponde, vincular el albarán de este pedido.
    void alert_on_payment

    // Plazos de pago (tabla supplier_order_payment_schedule). Si no se pasa
    // payment_schedule, creamos 1 plazo con total entero cuando haya payment_due_date.
    const scheduleRows = (payment_schedule && payment_schedule.length > 0
      ? payment_schedule
      : (paymentDue ? [{ due_date: paymentDue, amount: totalNum }] : [])
    )
      .map((p, idx) => ({
        supplier_order_id: order.id,
        due_date: p.due_date,
        amount: Number.isFinite(p.amount) && p.amount > 0 ? p.amount : 0,
        sort_order: idx,
      }))
      .filter((r) => !!r.due_date)

    if (scheduleRows.length > 0) {
      const { error: schedErr } = await ctx.adminClient
        .from('supplier_order_payment_schedule')
        .insert(scheduleRows)
      // Si la tabla aún no existe (migración pendiente) ignoramos el error para no romper la creación.
      if (schedErr && !/supplier_order_payment_schedule/.test(schedErr.message || '')) {
        // Otros errores sí los reportamos para no perder visibilidad.
        return failure(schedErr.message || 'Pedido creado, pero hubo un error guardando los plazos de pago')
      }
    }

    return success({
      id: String(order.id),
      order_number: order.order_number,
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

    const [linesRes, notesRes, invoiceRes, scheduleRes] = await Promise.all([
      ctx.adminClient
        .from('supplier_order_lines')
        .select('id, description, reference, quantity, quantity_received, unit, unit_price, total_price, fabric_id, product_id, product_variant_id, is_fully_received, sort_order, product_variants(id, size, color, variant_sku)')
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
      ctx.adminClient
        .from('supplier_order_payment_schedule')
        .select('id, due_date, amount, sort_order, is_paid, paid_at, payment_method')
        .eq('supplier_order_id', orderId)
        .order('sort_order', { ascending: true }),
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
      payment_schedule: scheduleRes.data ?? [],
      tailoring_order: tailoringOrder,
    })
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
