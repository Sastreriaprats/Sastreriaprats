'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { queryList, queryById, getNextNumber } from '@/lib/server/query-helpers'
import { createSupplierSchema, updateSupplierSchema } from '@/lib/validations/suppliers'
import { success, failure } from '@/lib/errors'
import { createPurchaseJournalEntry } from '@/actions/accounting-triggers'
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
      supplier_orders ( id, order_number, status, total, created_at ),
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
