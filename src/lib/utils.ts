import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normaliza un término de búsqueda: quita acentos/diacríticos, pasa a minúsculas
 * y trim. Se usa tanto en client-side (`.includes()`) como antes de enviar el
 * término al servidor cuando se busca contra columnas `search_text` (que ya
 * están normalizadas en BBDD con unaccent + lower).
 */
export function normalizeSearchTerm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '-'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-'
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

// Generate initials from name
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Slugify text
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

// Generate order number
export function generateOrderNumber(storeCode: string, sequence: number): string {
  const year = new Date().getFullYear()
  return `${storeCode}-${year}-${String(sequence).padStart(4, '0')}`
}

// Truncate text
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}

export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '-'
  return `${value}%`
}

export function getOrderStatusColor(status: string): string {
  const colors: Record<string, string> = {
    created: 'bg-gray-100 text-gray-700',
    fabric_ordered: 'bg-blue-100 text-blue-700',
    fabric_received_store: 'bg-sky-100 text-sky-700',
    fabric_received_factory: 'bg-cyan-100 text-cyan-700',
    cut: 'bg-yellow-100 text-yellow-800',
    in_production: 'bg-amber-100 text-amber-700',
    in_fitting: 'bg-purple-100 text-purple-700',
    received_in_store: 'bg-teal-100 text-teal-700',
    finished: 'bg-emerald-100 text-emerald-700',
    delivered: 'bg-green-100 text-green-700',
    incident: 'bg-red-100 text-red-700',
    cancelled: 'bg-red-200 text-red-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-700'
}

export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    created: 'Creado',
    fabric_ordered: 'Tejido pedido a fabricante',
    fabric_received_store: 'Tejido recibido en tienda',
    fabric_received_factory: 'Tejido recibido en fábrica',
    cut: 'Cortado',
    in_production: 'En confección',
    in_fitting: 'En prueba',
    received_in_store: 'Recibido en tienda',
    finished: 'Terminado',
    delivered: 'Entregado',
    incident: 'Incidencia',
    cancelled: 'Cancelado',
  }
  return labels[status] || status
}

/**
 * Variante dark-theme de `getOrderStatusColor`, pensada para el panel del
 * sastre (fondo oscuro). Mismo set de estados, paleta con opacidades bajas y
 * borde fino para destacar sobre fondo navy. Fallback gris si no se reconoce.
 */
export function getOrderStatusColorDark(status: string): string {
  const colors: Record<string, string> = {
    created:                 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    fabric_ordered:          'bg-blue-500/20 text-blue-300 border-blue-500/30',
    fabric_received_store:   'bg-sky-500/20 text-sky-300 border-sky-500/30',
    fabric_received_factory: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    cut:                     'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    in_production:           'bg-blue-500/20 text-blue-300 border-blue-500/30',
    in_fitting:              'bg-purple-500/20 text-purple-300 border-purple-500/30',
    received_in_store:       'bg-teal-500/20 text-teal-300 border-teal-500/30',
    finished:                'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    delivered:               'bg-green-500/20 text-green-300 border-green-500/30',
    incident:                'bg-red-500/20 text-red-300 border-red-500/30',
    cancelled:               'bg-red-700/30 text-red-400 border-red-700/40',
  }
  return colors[status] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'
}

/**
 * Orden fijo de almacenes para los listados de stock:
 * Hermanos Pinzón primero, Wellington segundo, el resto detrás
 * (alfabético dentro del bloque "otros"). Petición de tienda 2026-04.
 */
function warehousePriority(name: string | null | undefined): number {
  const n = (name ?? '').toLowerCase()
  if (n.includes('pinzon') || n.includes('pinzón')) return 1
  if (n.includes('wellington')) return 2
  return 99
}

export function compareWarehouses(
  a: { name?: string | null },
  b: { name?: string | null },
): number {
  const pa = warehousePriority(a.name)
  const pb = warehousePriority(b.name)
  if (pa !== pb) return pa - pb
  return (a.name ?? '').localeCompare(b.name ?? '', 'es')
}

export function sortWarehousesByPriority<T extends { name?: string | null }>(items: T[]): T[] {
  return [...items].sort(compareWarehouses)
}

/** Resume las prendas de un pedido para listados (ej. "Americana, Pantalón"). */
export function summarizeOrderGarments(
  lines: Array<{
    sort_order?: number | null
    configuration?: { prendaLabel?: string | null; prenda?: string | null } | null
    garment_types?: { name?: string | null } | null
  }> | null | undefined,
): string {
  if (!lines || lines.length === 0) return '—'
  const sorted = [...lines].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const names: string[] = []
  for (const l of sorted) {
    const cfg = l.configuration ?? {}
    const rawLabel = String(cfg.prendaLabel ?? '').trim()
    // "Americana — Traje 1" → "Americana"
    const label = rawLabel ? rawLabel.split('—')[0]!.trim() : ''
    const name = label || l.garment_types?.name || ''
    if (name && !names.includes(name)) names.push(name)
  }
  return names.join(', ') || '—'
}
