/**
 * Situación de una reserva = cruce de sus DOS dimensiones reales:
 *   - pago     (`payment_status`): si nos deben dinero
 *   - entrega  (`delivery_status`, migración 289): si el género sigue en tienda
 *
 * Petición de Mónica (22-sep-2026): «poder ver quién tiene una reserva con el
 * producto en su casa y sin pagar, o quién la tiene con el producto en tienda y
 * sin pagar», y que cobrar una reserva deje de dejarla simplemente como "Activa".
 *
 * Se mantiene una sola fuente para la tabla, el Excel y los filtros.
 */

export type ReservationSituationKey =
  | 'cancelled'
  | 'expired'
  | 'pending_stock'
  | 'cumplida'
  | 'en_casa_sin_pagar'
  | 'pagada_sin_recoger'
  | 'en_tienda_sin_pagar'

export type ReservationSituation = {
  key: ReservationSituationKey
  /** Texto del badge principal. */
  label: string
  /** Aclaración corta bajo el badge (vacía cuando no aporta nada). */
  hint: string
  className: string
}

const SITUATIONS: Record<ReservationSituationKey, Omit<ReservationSituation, 'key'>> = {
  cancelled:           { label: 'Cancelada',  hint: '',                            className: 'bg-slate-100 text-slate-700 border-slate-200' },
  expired:             { label: 'Expirada',   hint: '',                            className: 'bg-rose-100 text-rose-800 border-rose-200' },
  pending_stock:       { label: 'Pendiente de stock', hint: 'sin género disponible', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  cumplida:            { label: 'Cumplida',   hint: 'pagada y entregada',          className: 'bg-sky-100 text-sky-800 border-sky-200' },
  en_casa_sin_pagar:   { label: 'Entregada sin pagar', hint: 'producto en casa del cliente', className: 'bg-red-100 text-red-800 border-red-200' },
  pagada_sin_recoger:  { label: 'Pagada',     hint: 'pendiente de recoger',        className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  en_tienda_sin_pagar: { label: 'Activa',     hint: 'producto en tienda, sin pagar', className: 'bg-teal-100 text-teal-800 border-teal-200' },
}

export function getReservationSituation(r: {
  status?: string | null
  payment_status?: string | null
  delivery_status?: string | null
}): ReservationSituation {
  const status = r.status ?? 'active'
  if (status === 'cancelled') return { key: 'cancelled', ...SITUATIONS.cancelled }
  if (status === 'expired') return { key: 'expired', ...SITUATIONS.expired }

  const paid = r.payment_status === 'paid'
  // `delivery_status` es NOT NULL desde la 289, pero una fila leída de una caché
  // vieja puede no traerlo: se deduce del estado agregado como respaldo.
  const delivery = r.delivery_status ?? (status === 'fulfilled' ? 'delivered' : 'pending')
  const delivered = delivery === 'delivered' || delivery === 'partial'

  if (status === 'pending_stock' && !delivered) return { key: 'pending_stock', ...SITUATIONS.pending_stock }
  if (delivered && paid) return { key: 'cumplida', ...SITUATIONS.cumplida }
  if (delivered && !paid) return { key: 'en_casa_sin_pagar', ...SITUATIONS.en_casa_sin_pagar }
  if (paid) return { key: 'pagada_sin_recoger', ...SITUATIONS.pagada_sin_recoger }
  return { key: 'en_tienda_sin_pagar', ...SITUATIONS.en_tienda_sin_pagar }
}

/** Dónde está el género, en texto corto (columna "Producto" del listado/Excel). */
export function getReservationDeliveryLabel(deliveryStatus?: string | null): string {
  switch (deliveryStatus) {
    case 'delivered': return 'En casa del cliente'
    case 'partial':   return 'Entregada en parte'
    default:          return 'En tienda'
  }
}

export const RESERVATION_DEPARTMENT_LABELS: Record<string, string> = {
  boutique: 'Boutique',
  sastreria: 'Sastrería',
}
