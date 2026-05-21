// GET /api/public/checkout/redsys-success?token=<dsOrder>
//
// URL OK de RedSys: el cliente aterriza aquí tras pagar correctamente. En el
// protocolo SIS, ESTE endpoint NO valida nada — solo es UX. El pedido se crea
// en el webhook /api/webhooks/redsys (MERCHANTURL), que sí verifica la firma
// con HMAC_SHA256_V1.
//
// Por eso aquí simplemente redirigimos al cliente a la pantalla de
// confirmación, con el order_number recuperado del pending_online_orders o,
// si el webhook ya pasó, de online_orders.
//
// NOTA: si el webhook tarda en llegar (RedSys lo envía en paralelo a la
// redirección del usuario), el pedido puede no existir todavía cuando el
// cliente llegue aquí. La pantalla /checkout/confirmacion debería tolerarlo
// (mostrar "estamos procesando tu pago" y polling). TODO si en producción
// se ve el caso con frecuencia.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

  if (!token) {
    return NextResponse.redirect(`${baseUrl}/checkout/confirmacion`)
  }

  const admin = createAdminClient()

  // Caso ideal: el webhook ya creó online_orders → tenemos order_number final.
  const { data: existing } = await admin
    .from('online_orders')
    .select('order_number')
    .eq('redsys_order_code', token)
    .maybeSingle()
  if (existing?.order_number) {
    return NextResponse.redirect(
      `${baseUrl}/checkout/confirmacion?order=${encodeURIComponent(existing.order_number)}`
    )
  }

  // Caso transitorio: webhook aún no procesado. Usamos el order_number guardado
  // en el pending para que la pantalla de confirmación pueda hacer polling /
  // mostrar estado intermedio.
  const { data: pending } = await admin
    .from('pending_online_orders')
    .select('order_number')
    .eq('token', token)
    .maybeSingle()
  if (pending?.order_number) {
    return NextResponse.redirect(
      `${baseUrl}/checkout/confirmacion?order=${encodeURIComponent(pending.order_number)}&pending=1`
    )
  }

  return NextResponse.redirect(`${baseUrl}/checkout/confirmacion`)
}
