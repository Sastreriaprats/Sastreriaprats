/**
 * Lista canónica de orígenes de cliente (`clients.source`).
 *
 * UNA sola fuente de verdad consumida por:
 *  - Formulario admin de creación de cliente (create-client-dialog.tsx)
 *  - Informe "Origen de nuevos clientes" (reporting/charts/clients-chart.tsx)
 *  - Detalle del cliente (client-detail-content.tsx)
 *  - Cualquier futura UI que muestre o filtre por source.
 *
 * Antes había 3 listas divergentes: el formulario tenía 7 opciones, el
 * informe tenía 13 labels (incluyendo `web_registration` muerto), y el
 * wizard sastre persistía `'sastre'` que el informe etiquetaba sólo por
 * fallback de capitalización. Esto unifica todo.
 *
 * `manual: true` → opción asignable a mano desde el formulario admin.
 * `manual: false` → la genera el código automáticamente (web, citas,
 * checkout, migración, scripts de import). No aparece en formulario.
 */
export const CLIENT_SOURCES = [
  // Manual (visibles en formulario de creación admin):
  { value: 'walk_in',      label: 'Visita en tienda',  color: '#3B82F6', manual: true },
  { value: 'referral',     label: 'Recomendación',     color: '#10B981', manual: true },
  { value: 'sastre',       label: 'Sastre',            color: '#7C3AED', manual: true },
  { value: 'web',          label: 'Web',               color: '#8B5CF6', manual: true },
  { value: 'social_media', label: 'Redes sociales',    color: '#F59E0B', manual: true },
  { value: 'event',        label: 'Evento',            color: '#EC4899', manual: true },
  { value: 'press',        label: 'Prensa',            color: '#14B8A6', manual: true },
  { value: 'other',        label: 'Otro',              color: '#6B7280', manual: true },
  // Automatizados (NO visibles en formulario, generados por código):
  { value: 'web_shop',     label: 'Tienda online',     color: '#6366F1', manual: false },
  { value: 'online',       label: 'Cita online',       color: '#06B6D4', manual: false },
  { value: 'migration',    label: 'Migración',         color: '#9CA3AF', manual: false },
  { value: 'import_excel', label: 'Importación Excel', color: '#D1D5DB', manual: false },
  { value: 'unknown',      label: 'Sin datos',         color: '#9CA3AF', manual: false },
] as const

export type ClientSourceValue = (typeof CLIENT_SOURCES)[number]['value']

export const CLIENT_SOURCE_BY_VALUE: Record<string, { label: string; color: string }> =
  Object.fromEntries(CLIENT_SOURCES.map(s => [s.value, { label: s.label, color: s.color }]))

/** Label legible. Valores legacy desconocidos caen al fallback de
 *  capitalización (preserva retro-compatibilidad). */
export function clientSourceLabel(value: string | null | undefined): string {
  if (!value) return 'Sin datos'
  const known = CLIENT_SOURCE_BY_VALUE[value]
  if (known) return known.label
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
}

export function clientSourceColor(value: string | null | undefined): string {
  if (!value) return '#E5E7EB'
  return CLIENT_SOURCE_BY_VALUE[value]?.color ?? '#9CA3AF'
}
