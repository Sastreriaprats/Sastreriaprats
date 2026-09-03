/**
 * Plazos de producción por defecto (petición de Prats, ago-2026).
 *
 *   Sastrería artesanal ....... 1 mes
 *   Camisería artesanal ....... 1 mes
 *   Sastrería industrial ...... 60 días
 *   Camisería industrial ...... 30 días
 *
 * Son SOLO el valor que la app propone al crear el pedido: el campo de entrega
 * estimada sigue siendo editable en todas las altas y en "Editar pedido", que
 * es como se adelantan los urgentes.
 *
 * Importa afinarlos porque `estimated_delivery_date` es lo que dispara las
 * alarmas de retraso (cron /api/cron/alerts, filtro "overdue" del listado y
 * KPI del dashboard). Hasta ahora la ficha del sastre proponía como entrega la
 * fecha de la PRÓXIMA VISITA (15 días laborables ≈ 3 semanas), así que casi
 * todo el taller aparecía en retraso y la alarma dejó de significar nada.
 */

import { toLocalISODate } from '@/lib/dates'

export type ProductionOrderType =
  | 'artesanal'              // Sastrería artesanal
  | 'camiseria'              // Camisería artesanal
  | 'industrial'             // Sastrería industrial
  | 'camiseria_industrial'   // Camisería industrial

type LeadTime = {
  label: string
  /** Meses de calendario (1 mes = mismo día del mes siguiente). */
  months?: number
  /** Días naturales. */
  days?: number
}

export const PRODUCTION_LEAD_TIMES: Record<ProductionOrderType, LeadTime> = {
  artesanal: { label: 'Sastrería artesanal', months: 1 },
  camiseria: { label: 'Camisería artesanal', months: 1 },
  industrial: { label: 'Sastrería industrial', days: 60 },
  camiseria_industrial: { label: 'Camisería industrial', days: 30 },
}

export function isProductionOrderType(t: string | null | undefined): t is ProductionOrderType {
  return t != null && Object.prototype.hasOwnProperty.call(PRODUCTION_LEAD_TIMES, t)
}

/** Reexportado desde el modulo canonico de fechas para los importadores actuales. */
export { toLocalISODate }

/** Suma meses de calendario recortando al último día del mes destino (31-ene + 1 mes = 28-feb). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), 1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(from.getDate(), lastDay))
  return d
}

/** Etiqueta legible del plazo ("1 mes", "60 días") para mostrar junto al campo. */
export function getLeadTimeLabel(orderType: string | null | undefined): string | null {
  if (!isProductionOrderType(orderType)) return null
  const lead = PRODUCTION_LEAD_TIMES[orderType]
  if (lead.months) return lead.months === 1 ? '1 mes' : `${lead.months} meses`
  return `${lead.days} días`
}

/**
 * Fecha de entrega estimada por defecto (YYYY-MM-DD) para un tipo de pedido.
 * Devuelve null si el tipo no es de producción (proveedor, oficial, …).
 */
export function getDefaultDeliveryDate(
  orderType: string | null | undefined,
  from: Date = new Date(),
): string | null {
  if (!isProductionOrderType(orderType)) return null
  const lead = PRODUCTION_LEAD_TIMES[orderType]
  if (lead.months) return toLocalISODate(addMonths(from, lead.months))
  const d = new Date(from)
  d.setDate(d.getDate() + (lead.days ?? 0))
  return toLocalISODate(d)
}
