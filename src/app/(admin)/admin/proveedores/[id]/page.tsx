import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SupplierDetailContent } from './supplier-detail-content'

export const metadata: Metadata = { title: 'Ficha de proveedor' }

export default async function SupplierDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('suppliers.view')
  const params = await props.params
  const admin = createAdminClient()

  const { data: supplierBase } = await admin
    .from('suppliers')
    .select(`
      *,
      supplier_contacts (*),
      fabrics ( id, fabric_code, name, composition, color_name, price_per_meter, stock_meters, status ),
      supplier_orders ( id, order_number, status, total, order_date, payment_due_date, created_at, estimated_delivery_date, internal_notes ),
      supplier_due_dates ( id, due_date, amount, is_paid, alert_sent, paid_at )
    `)
    .eq('id', params.id)
    .single()

  if (!supplierBase) notFound()

  const supplier = { ...supplierBase } as any
  const orderIds = (supplier.supplier_orders || []).map((o: any) => o.id)
  const notesByOrder: Record<string, any[]> = {}
  const invoiceByOrder: Record<string, any> = {}
  const { data: allSupplierNotes } = await admin
    .from('supplier_delivery_notes')
    .select('id, supplier_id, supplier_order_id, supplier_reference, delivery_date, status, attachment_url, notes, created_at')
    .eq('supplier_id', params.id)
    .order('created_at', { ascending: false })
  for (const n of allSupplierNotes || []) {
    const k = String((n as any).supplier_order_id || '')
    if (!k) continue
    if (!notesByOrder[k]) notesByOrder[k] = []
    notesByOrder[k].push(n)
  }

  if (orderIds.length > 0) {
    const { data: invoices, error: invErr } = await admin
      .from('ap_supplier_invoices')
      .select('id, supplier_order_id, status, due_date, payment_date, total_amount')
      .in('supplier_order_id', orderIds)
      .order('created_at', { ascending: false })
    if (!invErr) {
      for (const inv of invoices || []) {
        const k = String((inv as any).supplier_order_id || '')
        if (!k || invoiceByOrder[k]) continue
        invoiceByOrder[k] = inv
      }
    }
  }
  const orderNumberById = new Map((supplier.supplier_orders || []).map((o: any) => [String(o.id), o.order_number]))
  supplier.supplier_orders = (supplier.supplier_orders || []).map((o: any) => ({
    ...o,
    supplier_delivery_notes: notesByOrder[o.id] || [],
    ap_supplier_invoice: invoiceByOrder[o.id] || null,
    payment_status: (invoiceByOrder[o.id]?.status === 'pagada') ? 'pagado' : 'no_pagado',
  }))
  supplier.supplier_delivery_notes_all = (allSupplierNotes || []).map((n: any) => ({
    ...n,
    order_number: n.supplier_order_id ? (orderNumberById.get(String(n.supplier_order_id)) || null) : null,
  }))

  return <SupplierDetailContent supplier={supplier} />
}
