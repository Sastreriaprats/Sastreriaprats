import type { createAdminClient } from '@/lib/supabase/admin'
import type { TicketReturnPayload } from '@/components/pos/ticket-pdf'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Devoluciones de una venta para anotarlas en su ticket reimpreso: cada una con
 * su fecha, destino (vale / reintegro / cambio), importe y artículos.
 *
 * Los artículos se enlazan por `sale_lines.returned_at` = `returns.created_at`:
 * rpc_create_return escribe el mismo instante en ambos (también en los cambios,
 * que la reutilizan). Una línea sin enlace exacto se asigna a la última devolución.
 */
export async function loadSaleTicketReturns(admin: Admin, saleId: string): Promise<TicketReturnPayload[]> {
  const [{ data: rets }, { data: lines }] = await Promise.all([
    admin.from('returns')
      .select('created_at, return_type, refund_method, total_returned, reason, exchange_sale_id, vouchers(code)')
      .eq('original_sale_id', saleId)
      .order('created_at', { ascending: true }),
    admin.from('sale_lines')
      .select('description, quantity_returned, returned_at')
      .eq('sale_id', saleId)
      .gt('quantity_returned', 0)
      .order('sort_order', { ascending: true }),
  ])
  if (!rets || rets.length === 0) return []

  // Ticket de la venta nueva de cada cambio: su nº CLP (el oficial) o, si no
  // tiene, el TICK antiguo.
  const exchangeIds = rets.map((r) => r.exchange_sale_id as string | null).filter((id): id is string => !!id)
  const exchangeRef: Record<string, string> = {}
  if (exchangeIds.length > 0) {
    const [{ data: exSales }, { data: exClp }] = await Promise.all([
      admin.from('sales').select('id, ticket_number').in('id', exchangeIds),
      admin.from('cash_internal_tickets').select('sale_id, ref').eq('source', 'sale').in('sale_id', exchangeIds),
    ])
    for (const s of exSales ?? []) if (s.ticket_number) exchangeRef[s.id] = s.ticket_number
    for (const t of exClp ?? []) if (t.sale_id && t.ref) exchangeRef[t.sale_id] = t.ref
  }

  const ms = (v: unknown) => (v ? new Date(String(v)).getTime() : NaN)
  const items: TicketReturnPayload['items'][] = rets.map(() => [])
  for (const l of lines ?? []) {
    let idx = rets.findIndex((r) => ms(r.created_at) === ms(l.returned_at))
    if (idx < 0) idx = rets.length - 1
    items[idx].push({ description: String(l.description ?? ''), quantity: Number(l.quantity_returned) || 0 })
  }

  return rets.map((r, i) => {
    const voucher = r.vouchers as { code?: string | null } | { code?: string | null }[] | null
    return {
      created_at: String(r.created_at),
      return_type: String(r.return_type),
      refund_method: (r.refund_method as string | null) ?? null,
      total_returned: Number(r.total_returned) || 0,
      reason: (r.reason as string | null) ?? null,
      voucher_code: (Array.isArray(voucher) ? voucher[0] : voucher)?.code ?? null,
      exchange_ref: r.exchange_sale_id ? exchangeRef[r.exchange_sale_id as string] ?? null : null,
      items: items[i],
    }
  })
}
