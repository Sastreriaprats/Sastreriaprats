// Cobros de pedido de sastrería que viajan DENTRO de un ticket de caja.
//
// Cuando en el TPV se cobra la señal o el resto de un pedido de sastrería, la
// venta (ticket) incluye una línea al 0% de IVA con una de estas descripciones:
//   - "Pedido sastrería - PIN-2026-0001"  (añadir trabajo pendiente)
//   - "Cobro pendiente - PIN-2026-0001"   (añadir deuda pendiente del pedido)
// …y ADEMÁS se registra el mismo cobro en `tailoring_order_payments`.
//
// En contabilidad ese dinero se declara por el lado del PEDIDO (su base + su
// 21%). Si el ticket lo contara también, el TOTAL saldría duplicado (el IVA no:
// esas líneas van al 0%, solo inflan la base). Por eso, tanto el resumen de
// Contabilidad (accounting.ts) como el escenario C (ops.ts) restan esta base al
// ticket y dejan que el pedido sea el único que la cuenta.
//
// Se EXCLUYE a propósito "Cobro pendiente - TICK-…": esa es deuda de una VENTA
// anterior (entity_type 'sale'), no de un pedido, y no tiene pago espejo en
// `tailoring_order_payments`.

type AdminClient = { from: (table: string) => any }

const SALE_STATUSES = ['completed', 'partially_returned']

export function isPedidoCobroDescription(desc: string): boolean {
  const d = (desc || '').trim()
  // "Pedido sastrería - …" siempre referencia un pedido (nunca una venta).
  // "Cobro pendiente - …" solo cuenta si referencia un pedido (PIN/WEL), no un ticket.
  return /^Pedido sastrería - /.test(d) || /^Cobro pendiente - (PIN|WEL)-/i.test(d)
}

/**
 * Suma, por venta, la base de las líneas que son cobro de un pedido de sastrería
 * en el rango [start, end] (sobre `sales.created_at`). Devuelve Map<sale_id, base>.
 * Las líneas van al 0% de IVA, así que su `line_total` es base pura.
 */
export async function loadPedidoCobroBaseBySale(
  admin: AdminClient,
  start: string,
  end: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from('sale_lines')
      .select('sale_id, line_total, description, sales!inner(created_at, status)')
      .or('description.ilike.Pedido sastrería - %,description.ilike.Cobro pendiente - PIN%,description.ilike.Cobro pendiente - WEL%')
      .gte('sales.created_at', start)
      .lte('sales.created_at', end)
      .in('sales.status', SALE_STATUSES)
      .order('sale_id', { ascending: true })
      .range(from, from + 999)
    const rows = (data ?? []) as Array<{ sale_id: string; line_total: number; description: string }>
    for (const r of rows) {
      if (!isPedidoCobroDescription(r.description)) continue
      const sid = String(r.sale_id)
      map.set(sid, (map.get(sid) || 0) + (Number(r.line_total) || 0))
    }
    if (rows.length < 1000) break
  }
  return map
}
