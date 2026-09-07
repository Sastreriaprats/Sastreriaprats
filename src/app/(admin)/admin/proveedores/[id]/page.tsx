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

  const supplierCif = String((supplier as any).nif_cif || '').trim()
  const [notesResult, invoicesResult, allInvoicesResult, allInvoicesByCifResult] = await Promise.all([
    admin
      .from('supplier_delivery_notes')
      .select('id, supplier_id, supplier_order_id, supplier_reference, delivery_date, status, attachment_url, notes, created_at')
      .eq('supplier_id', params.id)
      .order('created_at', { ascending: false }),
    orderIds.length > 0
      ? admin
          .from('ap_supplier_invoices')
          .select('id, supplier_order_id, status, due_date, payment_date, total_amount')
          .eq('is_proforma', false) // las proformas no cuentan como factura del pedido
          .in('supplier_order_id', orderIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null }),
    admin
      .from('ap_supplier_invoices')
      .select('status, total_amount')
      .eq('is_proforma', false) // las proformas no son deuda con el proveedor
      .eq('supplier_id', params.id),
    supplierCif
      ? admin
          .from('ap_supplier_invoices')
          .select('status, total_amount')
          .eq('is_proforma', false) // las proformas no son deuda con el proveedor
          .is('supplier_id', null)
          .eq('supplier_cif', supplierCif)
      : Promise.resolve({ data: [] as any[], error: null }),
  ])

  let totalDebt = 0
  let totalPaid = 0
  const debtStatuses = new Set(['pendiente', 'vencida', 'parcial'])
  for (const inv of [...(allInvoicesResult.data || []), ...(allInvoicesByCifResult.data || [])] as any[]) {
    const amt = Number(inv.total_amount ?? 0)
    if (!Number.isFinite(amt)) continue
    if (inv.status === 'pagada') totalPaid += amt
    else if (debtStatuses.has(String(inv.status ?? ''))) totalDebt += amt
  }
  supplier.total_debt = totalDebt
  supplier.total_paid = totalPaid

  const allSupplierNotes = notesResult.data
  for (const n of allSupplierNotes || []) {
    const k = String((n as any).supplier_order_id || '')
    if (!k) continue
    if (!notesByOrder[k]) notesByOrder[k] = []
    notesByOrder[k].push(n)
  }

  if (!invoicesResult.error) {
    for (const inv of invoicesResult.data || []) {
      const k = String((inv as any).supplier_order_id || '')
      if (!k || invoiceByOrder[k]) continue
      invoiceByOrder[k] = inv
    }
  }

  // El vínculo REAL entre factura y pedido va por los albaranes: al registrar la
  // factura se marcan los albaranes que cubre (ap_supplier_invoice_delivery_notes)
  // y cada albarán conoce su pedido. `ap_supplier_invoices.supplier_order_id`
  // existe pero no lo rellena ningún flujo (0 de 650 facturas), así que mirar
  // solo esa columna dejaba TODOS los pedidos como "No pagado" aunque su factura
  // estuviera cobrada (aviso de Mónica, 7-sep-2026, con los pedidos de Gimeno).
  const invoicesByOrder: Record<string, any[]> = {}
  for (const [orderId, inv] of Object.entries(invoiceByOrder)) invoicesByOrder[orderId] = [inv]

  const noteIdsOfOrders = (allSupplierNotes || [])
    .filter((n: any) => n.supplier_order_id && orderIds.includes(String(n.supplier_order_id)))
    .map((n: any) => String(n.id))

  if (noteIdsOfOrders.length > 0) {
    const { data: links } = await admin
      .from('ap_supplier_invoice_delivery_notes')
      .select('supplier_invoice_id, supplier_delivery_note_id')
      .in('supplier_delivery_note_id', noteIdsOfOrders)

    const linkedInvoiceIds = Array.from(new Set((links || []).map((l: any) => String(l.supplier_invoice_id))))
    if (linkedInvoiceIds.length > 0) {
      const { data: linkedInvoices } = await admin
        .from('ap_supplier_invoices')
        .select('id, invoice_number, status, due_date, payment_date, total_amount')
        .eq('is_proforma', false)
        .in('id', linkedInvoiceIds)

      const invoiceById = new Map((linkedInvoices || []).map((i: any) => [String(i.id), i]))
      const orderIdByNote = new Map(
        (allSupplierNotes || [])
          .filter((n: any) => n.supplier_order_id)
          .map((n: any) => [String(n.id), String(n.supplier_order_id)]),
      )
      for (const l of links || []) {
        const orderId = orderIdByNote.get(String((l as any).supplier_delivery_note_id))
        const inv = invoiceById.get(String((l as any).supplier_invoice_id))
        if (!orderId || !inv) continue
        const list = (invoicesByOrder[orderId] ??= [])
        if (!list.some((x) => String(x.id) === String(inv.id))) list.push(inv)
      }
    }
  }

  /** Un pedido está pagado cuando TODAS sus facturas lo están; sin facturas no
   *  se afirma nada (antes salía "No pagado", que era falso). */
  const paymentStatusFor = (orderId: string): 'pagado' | 'parcial' | 'no_pagado' | 'sin_factura' => {
    const list = invoicesByOrder[orderId] || []
    if (list.length === 0) return 'sin_factura'
    const pagadas = list.filter((i) => String(i.status) === 'pagada').length
    if (pagadas === list.length) return 'pagado'
    return pagadas > 0 ? 'parcial' : 'no_pagado'
  }
  const orderNumberById = new Map((supplier.supplier_orders || []).map((o: any) => [String(o.id), o.order_number]))
  supplier.supplier_orders = (supplier.supplier_orders || []).map((o: any) => {
    const invoices = invoicesByOrder[o.id] || []
    // La fecha de pago que se enseña es la REAL de la factura (la última, si son
    // varias); `payment_due_date` del pedido queda como previsión.
    const paidDates = invoices.map((i) => i.payment_date).filter(Boolean).sort()
    return {
      ...o,
      supplier_delivery_notes: notesByOrder[o.id] || [],
      ap_supplier_invoice: invoiceByOrder[o.id] || invoices[0] || null,
      ap_supplier_invoices_linked: invoices,
      payment_status: paymentStatusFor(o.id),
      actual_payment_date: paidDates.length > 0 ? paidDates[paidDates.length - 1] : null,
    }
  })
  supplier.supplier_delivery_notes_all = (allSupplierNotes || []).map((n: any) => ({
    ...n,
    order_number: n.supplier_order_id ? (orderNumberById.get(String(n.supplier_order_id)) || null) : null,
  }))

  return <SupplierDetailContent supplier={supplier} />
}
