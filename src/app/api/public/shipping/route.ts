import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isRateLimited } from '@/lib/rate-limit'
import { computeShipping, getShippingCountries } from '@/lib/shipping'

/**
 * GET /api/public/shipping — info de envío para el checkout (solo UX: el
 * cálculo que vale es el del servidor en /api/public/checkout).
 *
 *   - Sin parámetros                → { countries: string[], has_default: boolean }
 *     (países con zona activa; has_default = existe catch-all → se envía a todo el mundo)
 *   - ?country=FR&subtotal=123.45&postal=07001
 *                                   → { available, shipping_cost, zone_name, free_shipping_threshold }
 *     (postal es opcional: activa las subzonas por prefijo de CP, ej. Baleares)
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (isRateLimited(ip, 'shipping', 60, 60)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const { searchParams } = new URL(request.url)
    const country = (searchParams.get('country') || '').trim().toUpperCase()
    const admin = createAdminClient()

    if (!country) {
      const info = await getShippingCountries(admin)
      return NextResponse.json(info)
    }

    const subtotal = parseFloat(searchParams.get('subtotal') || '0') || 0
    const postalCode = (searchParams.get('postal') || '').trim().slice(0, 16)
    const quote = await computeShipping(admin, { countryCode: country, subtotal, postalCode })
    return NextResponse.json(quote)
  } catch (err) {
    console.error('[shipping-quote]', err)
    return NextResponse.json({ error: 'Error calculando el envío' }, { status: 500 })
  }
}
