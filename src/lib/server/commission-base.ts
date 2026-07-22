import type { AdminClient } from '@/lib/server/action-wrapper'

// ============================================================================
// Base de comisión / objetivos POR VENDEDOR: la comisión sigue al DINERO QUE
// ENTRA, no al movimiento de un vale.
//
// Regla (decisión del usuario, jul-2026): si un cliente devuelve una compra a
// cambio de un VALE y meses después lo canjea, la venta se comisiona al PRIMER
// vendedor (quien cobró el dinero), no al que atiende el canje. Generalizado:
//   base = (total − devuelto_que_SALIÓ − pagado_con_vale) × (1 − IVA/total)
//
//  · pagado_con_vale: ese dinero YA se comisionó a quien lo cobró en su día
//    (venta original o venta de la tarjeta regalo); el canje NO vuelve a
//    comisionar → se resta de la base de quien atiende el canje.
//  · devuelto que SALIÓ (reintegro en efectivo/tarjeta/bizum/transferencia):
//    dinero que abandonó el negocio → resta, como siempre. Devolución por VALE
//    o CAMBIO: el dinero se quedó dentro → NO resta, el vendedor original
//    conserva su comisión.
//
// Así cada euro se comisiona EXACTAMENTE UNA VEZ, al vendedor que lo cobró.
//
// Se aplica a las dos mediciones por vendedor que comparten esta vara:
// getEmployeeCommissions (commissions.ts) y getEmployeeGoals (store-goals.ts).
// Los agregados de TIENDA (objetivos de tienda, bonus grupal) no lo necesitan:
// a lo largo del ciclo venta→devolución-vale→canje el total de la tienda se
// cancela solo (+100 −0 +0 = +100), solo cambia a quién se atribuye.
// ============================================================================

// Tipos de devolución en los que el dinero SALIÓ del negocio. 'voucher' y
// 'exchange' NO salen (vale pendiente de canje / valor trasladado a otra
// prenda). 'cash' es el tipo legado (pre-267); 'refund' el actual.
const MONEY_LEFT_RETURN_TYPES = ['refund', 'cash']

export type SaleBaseRow = {
  id: string
  total: number | string | null
  tax_amount: number | string | null
}

/** Base imponible (sin IVA) del dinero NUEVO que la venta aportó al negocio. */
export function saleNetBase(
  row: SaleBaseRow,
  voucherPaidBySale: Map<string, number>,
  returnedLeftBySale: Map<string, number>,
): number {
  const total = Number(row.total) || 0
  if (total <= 0) return 0
  const taxFraction = (Number(row.tax_amount) || 0) / total
  const voucherPaid = voucherPaidBySale.get(row.id) || 0
  const returnedLeft = returnedLeftBySale.get(row.id) || 0
  const newMoney = Math.max(0, total - returnedLeft - voucherPaid)
  return newMoney * (1 - taxFraction)
}

/**
 * Σ importe pagado con VALE por venta, para las ventas cuyo created_at cae en
 * [gteFrom, ltTo). Los sale_payments de tipo 'voucher' llevan el created_at de
 * su venta (mig 253), así que el rango coincide con el de la venta.
 */
export async function fetchVoucherPaidBySale(
  admin: AdminClient,
  gteFrom: string,
  ltTo: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (let offset = 0; ; offset += 1000) {
    const { data } = await admin
      .from('sale_payments')
      .select('sale_id, amount')
      .eq('payment_method', 'voucher')
      .gte('created_at', gteFrom)
      .lt('created_at', ltTo)
      .order('id', { ascending: true })
      .range(offset, offset + 999)
    const batch = (data ?? []) as { sale_id: string | null; amount: number | string | null }[]
    for (const p of batch) {
      if (!p.sale_id) continue
      map.set(p.sale_id, (map.get(p.sale_id) || 0) + (Number(p.amount) || 0))
    }
    if (batch.length < 1000) break
  }
  return map
}

/**
 * Σ importe devuelto que SALIÓ del negocio (reintegro) por venta original.
 * Solo se consulta para las ventas con total_returned > 0 (subconjunto pequeño).
 * Las devoluciones por vale/cambio no aparecen aquí → no restan de la base.
 */
export async function fetchReturnedLeftBySale(
  admin: AdminClient,
  saleIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const CHUNK = 300
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const chunk = saleIds.slice(i, i + CHUNK)
    if (chunk.length === 0) continue
    const { data } = await admin
      .from('returns')
      .select('original_sale_id, total_returned')
      .in('original_sale_id', chunk)
      .in('return_type', MONEY_LEFT_RETURN_TYPES)
    for (const r of (data ?? []) as { original_sale_id: string | null; total_returned: number | string | null }[]) {
      if (!r.original_sale_id) continue
      map.set(r.original_sale_id, (map.get(r.original_sale_id) || 0) + (Number(r.total_returned) || 0))
    }
  }
  return map
}
