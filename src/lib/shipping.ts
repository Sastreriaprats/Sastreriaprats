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

/**
 * Cálculo AUTORITATIVO del envío (server-side). El checkout NUNCA debe fiarse
 * del shipping_cost que manda el cliente: este helper es la única fuente.
 *
 * Orden de resolución:
 *   1. Recogida en tienda → 0 €.
 *   2. Cupón con envío gratis → 0 € (pero exige que exista zona para el país).
 *   3. País → zona activa mapeada; si no hay, zona catch-all (is_default).
 *   4. Umbral de la zona alcanzado (subtotal ANTES de descuento, igual que la UI) → 0 €.
 *   5. Si no, el coste de la zona. Sin zona → { available: false } (no se vende a ese país).
 */
export async function computeShipping(
  admin: AdminClient,
  opts: {
    countryCode: string | null | undefined
    subtotal: number
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

  const { data: mapping } = await admin
    .from('shipping_zone_countries')
    .select('shipping_zones!inner(id, name, shipping_cost, free_shipping_threshold, is_active)')
    .eq('country_code', code)
    .maybeSingle()

  let zone = (mapping?.shipping_zones as unknown as ZoneRow | null) ?? null
  if (!zone?.is_active) {
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
