/**
 * Generación automática de SKU para productos.
 * Formato: PRATS-[PREFIJO_TIPO]-[PREFIJO_NOMBRE]
 */

const PREFIX_MAP: Record<string, string> = {
  boutique: 'BTQ',
  tailoring_fabric: 'TEL',
  accessory: 'ACC',
  service: 'SRV',
  alteration: 'ALT',
}

/**
 * Genera la base del SKU (sin el número correlativo).
 * Ejemplo: generateSkuBase('boutique', 'Traje Azul Navy') → 'PRATS-BTQ-TRAZULNAV'
 */
export function generateSkuBase(productType: string, name: string): string {
  const typePrefix = PREFIX_MAP[productType] || 'PRD'

  const normalized = name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'N')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toUpperCase()

  const words = normalized.split(/\s+/).filter(Boolean).slice(0, 3)
  const namePrefix = words.map((w) => w.slice(0, 3)).join('').slice(0, 9)

  return `PRATS-${typePrefix}-${namePrefix || 'XXX'}`
}
