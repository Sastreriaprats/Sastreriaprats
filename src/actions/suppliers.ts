'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber } from '@/lib/server/query-helpers'
import { createSupplierSchema, updateSupplierSchema } from '@/lib/validations/suppliers'
import { success, failure } from '@/lib/errors'
import { createPurchaseJournalEntry } from '@/actions/accounting-triggers'
import { checkUserPermission } from '@/actions/auth'
import type { ListParams, ListResult } from '@/lib/server/query-helpers'

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
      createPurchaseJournalEntry(supplierOrderId).catch(() => {})
    }

    return success(order)
  }
)

export type CreateSupplierOrderInput = {
  supplier_id: string
  total: number
  payment_due_date: string
  estimated_delivery_date: string
  notes?: string | null
  alert_on_payment?: boolean
  alert_on_delivery?: boolean
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
  async (ctx, { supplier_id, total, payment_due_date, estimated_delivery_date, notes, alert_on_payment, alert_on_delivery }) => {
    if (!supplier_id?.trim()) return failure('Proveedor obligatorio', 'VALIDATION')
    if (total == null || Number(total) < 0) return failure('El coste debe ser mayor o igual a 0', 'VALIDATION')
    if (!payment_due_date?.trim()) return failure('Fecha de pago obligatoria', 'VALIDATION')
    if (!estimated_delivery_date?.trim()) return failure('Fecha de entrega estimada obligatoria', 'VALIDATION')
    const dueDate = new Date(payment_due_date)
    const deliveryDate = new Date(estimated_delivery_date)
    if (isNaN(dueDate.getTime())) return failure('Fecha de pago no válida', 'VALIDATION')
    if (isNaN(deliveryDate.getTime())) return failure('Fecha de entrega no válida', 'VALIDATION')

    const orderNumber = await getNextNumber('supplier_orders', 'order_number', 'PEDPROV')
    const totalNum = Number(total)
    const today = new Date().toISOString().slice(0, 10)

    const { data: order, error: orderError } = await ctx.adminClient
      .from('supplier_orders')
      .insert({
        order_number: orderNumber,
        supplier_id: supplier_id.trim(),
        status: 'draft',
        order_date: today,
        payment_due_date: payment_due_date.trim(),
        estimated_delivery_date: estimated_delivery_date.trim(),
        subtotal: totalNum,
        tax_amount: 0,
        total: totalNum,
        internal_notes: notes?.trim() || null,
        created_by: ctx.userId !== 'system' ? ctx.userId : null,
        alert_on_delivery: alert_on_delivery !== false,
      })
      .select('id, order_number')
      .single()

    if (orderError || !order) return failure(orderError?.message ?? 'Error al crear el pedido')

    let apInvoiceId: string | undefined
    const canManageInvoices = await checkUserPermission(ctx.userId, 'supplier_invoices.manage').catch(() => false)
    if (canManageInvoices && totalNum > 0) {
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
          due_date: payment_due_date.trim(),
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
