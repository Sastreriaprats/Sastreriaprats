import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
    .replace(/[\u0300-\u036f]/g, '')
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
    fabric_received: 'bg-blue-200 text-blue-800',
    factory_ordered: 'bg-indigo-100 text-indigo-700',
    in_production: 'bg-amber-100 text-amber-700',
    fitting: 'bg-purple-100 text-purple-700',
    adjustments: 'bg-orange-100 text-orange-700',
    finished: 'bg-emerald-100 text-emerald-700',
    delivered: 'bg-green-100 text-green-700',
    incident: 'bg-red-100 text-red-700',
    cancelled: 'bg-red-200 text-red-800',
    requested: 'bg-violet-100 text-violet-700',
    supplier_delivered: 'bg-teal-100 text-teal-700',
  }
  return colors[status] || 'bg-gray-100 text-gray-700'
}

export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    created: 'Creado',
    fabric_ordered: 'Tejido pedido a fabricante',
    fabric_received: 'Tejido recibido en fábrica',
    factory_ordered: 'En fábrica',
    in_production: 'En confección',
    fitting: 'En prueba',
    adjustments: 'Ajustes',
    finished: 'Terminado',
    delivered: 'Entregado',
    incident: 'Incidencia',
    cancelled: 'Cancelado',
    requested: 'Solicitado',
    supplier_delivered: 'Entregado por proveedor/oficial',
  }
  return labels[status] || status
}
