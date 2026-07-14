import type { createAdminClient } from '@/lib/supabase/admin'
import { toCountryCode } from '@/lib/countries'

type AdminClient = ReturnType<typeof createAdminClient>

type ZoneRow = {
  id: string
  name: string
  shipping_cost: number
  free_shipping_threshold: number | null
  is_active: boolean
}

export type ShippingQuote =
  | {
      available: true
      shipping_cost: number
      zone_name: string
      free_shipping_threshold: number | null
    }
  | { available: false }

/** CP normalizado para comparar prefijos: mayúsculas y sin espacios/guiones. */
export function normalizePostal(postal: string | null | undefined): string {
  return (postal || '').toUpperCase().replace(/[\s-]/g, '')
}

/**
 * Cálculo AUTORITATIVO del envío (server-side). El checkout NUNCA debe fiarse
 * del shipping_cost que manda el cliente: este helper es la única fuente.
 *
 * Orden de resolución:
 *   1. Recogida en tienda → 0 €.
 *   2. Cupón con envío gratis → 0 € (pero exige que exista zona para el país).
 *   3. País → subzona cuyo prefijo postal case con el CP (gana el prefijo más
 *      largo); si ninguno casa (o no hay CP), la fila del país sin prefijos;
 *      si tampoco, la zona catch-all (is_default).
 *   4. Umbral de la zona alcanzado (subtotal ANTES de descuento, igual que la UI) → 0 €.
 *   5. Si no, el coste de la zona. Sin zona → { available: false } (no se vende a ese país).
 */
export async function computeShipping(
  admin: AdminClient,
  opts: {
    countryCode: string | null | undefined
    subtotal: number
    postalCode?: string | null
    deliveryMethod?: string | null
    couponFreeShipping?: boolean
  }
): Promise<ShippingQuote> {
  if (opts.deliveryMethod === 'store') {
    return { available: true, shipping_cost: 0, zone_name: 'Recogida en tienda', free_shipping_threshold: null }
  }

  // País vacío → ES (comportamiento histórico). Texto no reconocible → sin
  // zona (el checkout obliga a elegir país válido en el selector).
  const raw = (opts.countryCode || '').trim()
  const code = raw ? toCountryCode(raw) : 'ES'
  if (!code) return { available: false }

  const { data: mappings } = await admin
    .from('shipping_zone_countries')
    .select('postal_prefixes, shipping_zones!inner(id, name, shipping_cost, free_shipping_threshold, is_active)')
    .eq('country_code', code)

  const rows = (mappings ?? [])
    .map(m => ({
      prefixes: (m.postal_prefixes as string[] | null) ?? null,
      zone: m.shipping_zones as unknown as ZoneRow | null,
    }))
    .filter(r => r.zone?.is_active)

  // Subzona por prefijo de CP (el prefijo más largo que case gana); si ninguna
  // casa, la fila del país entero (sin prefijos).
  const postal = normalizePostal(opts.postalCode)
  let zone: ZoneRow | null = null
  if (postal) {
    let bestLen = 0
    for (const r of rows) {
      for (const p of r.prefixes ?? []) {
        const prefix = normalizePostal(p)
        if (prefix && postal.startsWith(prefix) && prefix.length > bestLen) {
          bestLen = prefix.length
          zone = r.zone
        }
      }
    }
  }
  if (!zone) zone = rows.find(r => r.prefixes === null)?.zone ?? null

  if (!zone) {
    const { data: def } = await admin
      .from('shipping_zones')
      .select('id, name, shipping_cost, free_shipping_threshold, is_active')
      .eq('is_default', true)
      .eq('is_active', true)
      .maybeSingle()
    zone = (def as ZoneRow | null) ?? null
  }

  if (!zone) return { available: false }

  const threshold = zone.free_shipping_threshold != null ? Number(zone.free_shipping_threshold) : null
  const free =
    !!opts.couponFreeShipping || (threshold != null && opts.subtotal >= threshold)

  return {
    available: true,
    shipping_cost: free ? 0 : Number(zone.shipping_cost),
    zone_name: zone.name,
    free_shipping_threshold: threshold,
  }
}

/**
 * Países a los que se puede enviar hoy: los mapeados a zonas activas.
 * Si existe una zona catch-all (is_default) activa, se puede enviar a
 * CUALQUIER país → has_default: true (el selector muestra la lista completa).
 */
export async function getShippingCountries(
  admin: AdminClient
): Promise<{ countries: string[]; has_default: boolean }> {
  const [{ data: rows }, { data: def }] = await Promise.all([
    admin
      .from('shipping_zone_countries')
      .select('country_code, shipping_zones!inner(is_active)')
      .eq('shipping_zones.is_active', true),
    admin.from('shipping_zones').select('id').eq('is_default', true).eq('is_active', true).maybeSingle(),
  ])
  const countries = [...new Set((rows ?? []).map(r => String(r.country_code).toUpperCase()))]
  return { countries, has_default: !!def }
}
