/* eslint-disable @typescript-eslint/no-explicit-any -- el cliente admin de Supabase es any por diseño; las filas leídas se castean puntualmente */
// Señales / cobros de RESERVAS de producto (`product_reservation_payments`).
//
// Cuando un cliente paga una reserva por adelantado, el dinero entra ese día
// (caja + movimiento "Pago reserva - RSV-…") y al RECOGER el TPV genera un
// ticket solo por lo PENDIENTE: reservation-pickup-dialog.tsx descuenta de cada
// línea la parte ya pagada (RSV-2026-0072: señal 5.191 € + ticket 1.244 € =
// 6.435 €; una reserva pagada entera genera un ticket de 0 €).
//
// Por tanto la señal NO está en `sales` y, si los motores de ingresos solo leen
// tickets, ese dinero no se declara nunca. Fecha contable: `payment_date` (el
// cobro real), igual que los cobros de sastrería. No hay doble conteo con el
// ticket de recogida (que ya va neto de la señal) ni con las facturas ligadas a
// reserva (todos los motores las excluyen por `reservation_id`).
//
// Cancelar una reserva no entregada BORRA sus pagos (_revert_reservation_money),
// así que leer los pagos vivos ya descuenta las señales devueltas.
//
// El importe es PVP con IVA: se separa base/IVA con el tipo de IVA de los
// productos de la reserva, ponderado por el importe de cada línea.

type AdminClient = { from: (table: string) => any }

export type ReservationPaymentIncome = {
  id: string
  reservationId: string
  reservationNumber: string
  /** YYYY-MM-DD */
  paymentDate: string
  method: string
  /** Importe cobrado, con IVA. */
  amount: number
  base: number
  vat: number
  storeId: string | null
  storeName: string | null
  /** Quien hizo la reserva (misma atribución que el ticket de recogida, mig 245). */
  employeeId: string | null
  clientName: string | null
}

const DEFAULT_TAX_RATE = 21
const PAGE = 1000

/**
 * Pagos de reserva con `payment_date` en [fromDate, toDate] (YYYY-MM-DD,
 * ambos incluidos; si llega un timestamp se usa su parte de fecha).
 */
export async function loadReservationPayments(
  admin: AdminClient,
  fromDate: string,
  toDate: string,
  opts: { storeId?: string | null } = {},
): Promise<ReservationPaymentIncome[]> {
  return loadPayments(admin, (q) => {
    let out = q.gte('payment_date', fromDate.slice(0, 10)).lte('payment_date', toDate.slice(0, 10))
    if (opts.storeId) out = out.eq('product_reservations.store_id', opts.storeId)
    return out
  })
}

/**
 * Pagos de esas reservas, sin filtro de fecha. Lo usa el criterio "manda la
 * factura" (invoice-sales.ts): una factura puede cubrir señales de cualquier
 * fecha, incluso de otro trimestre.
 */
export async function loadReservationPaymentsFor(
  admin: AdminClient,
  reservationIds: string[],
): Promise<ReservationPaymentIncome[]> {
  const out: ReservationPaymentIncome[] = []
  for (let i = 0; i < reservationIds.length; i += 100) {
    const chunk = reservationIds.slice(i, i + 100)
    out.push(...await loadPayments(admin, (q) => q.in('product_reservation_id', chunk)))
  }
  return out
}

async function loadPayments(
  admin: AdminClient,
  narrow: (q: any) => any,
): Promise<ReservationPaymentIncome[]> {
  const rows: any[] = []
  for (let offset = 0; ; offset += PAGE) {
    const q = narrow(admin
      .from('product_reservation_payments')
      .select('id, product_reservation_id, payment_date, payment_method, amount, product_reservations!inner(reservation_number, store_id, employee_id, stores(name), clients(full_name))'))
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    const { data, error } = await q
    if (error) throw new Error(error.message || 'Error al consultar pagos de reserva')
    const batch = (data ?? []) as any[]
    rows.push(...batch)
    if (batch.length < PAGE) break
  }
  if (rows.length === 0) return []

  // Fracción de IVA por reserva, desde el tipo de IVA de sus productos.
  const vatFraction = new Map<string, number>()
  const reservationIds = [...new Set(rows.map((r) => String(r.product_reservation_id)))]
  for (let i = 0; i < reservationIds.length; i += 100) {
    const chunk = reservationIds.slice(i, i + 100)
    const { data, error } = await admin
      .from('product_reservation_lines')
      .select('reservation_id, line_total, product_variants(products(tax_rate))')
      .in('reservation_id', chunk)
    if (error) throw new Error(error.message || 'Error al consultar líneas de reserva')
    const acc = new Map<string, { gross: number; vat: number }>()
    for (const l of (data ?? []) as any[]) {
      const gross = Number(l.line_total) || 0
      const pv = Array.isArray(l.product_variants) ? l.product_variants[0] : l.product_variants
      const product = Array.isArray(pv?.products) ? pv.products[0] : pv?.products
      const rawRate = product?.tax_rate
      const rate = rawRate == null || !Number.isFinite(Number(rawRate)) ? DEFAULT_TAX_RATE : Number(rawRate)
      const a = acc.get(String(l.reservation_id)) ?? { gross: 0, vat: 0 }
      a.gross += gross
      a.vat += gross * rate / (100 + rate)
      acc.set(String(l.reservation_id), a)
    }
    for (const [id, a] of acc) if (a.gross > 0) vatFraction.set(id, a.vat / a.gross)
  }
  const defaultFraction = DEFAULT_TAX_RATE / (100 + DEFAULT_TAX_RATE)

  return rows.map((r) => {
    const res = Array.isArray(r.product_reservations) ? r.product_reservations[0] : r.product_reservations
    const store = Array.isArray(res?.stores) ? res.stores[0] : res?.stores
    const client = Array.isArray(res?.clients) ? res.clients[0] : res?.clients
    const amount = Number(r.amount) || 0
    const vat = amount * (vatFraction.get(String(r.product_reservation_id)) ?? defaultFraction)
    return {
      id: String(r.id),
      reservationId: String(r.product_reservation_id),
      reservationNumber: String(res?.reservation_number ?? ''),
      paymentDate: String(r.payment_date ?? '').slice(0, 10),
      method: String(r.payment_method ?? ''),
      amount,
      base: amount - vat,
      vat,
      storeId: res?.store_id ?? null,
      storeName: store?.name ?? null,
      employeeId: res?.employee_id ?? null,
      clientName: client?.full_name ?? null,
    }
  })
}

/** Último día (YYYY-MM-DD) del mes indicado (month 1-12). */
export function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
