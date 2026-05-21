// GET /api/public/checkout/redsys-redirect?token=<dsOrder>
//
// Sirve un HTML con form POST autosubmit a la pasarela RedSys. Es la pieza
// que falta entre el checkout (que crea pending_online_orders + dsOrder) y
// la pasarela del banco — el frontend hace window.location.href a este
// endpoint, y este endpoint redirige al usuario al banco vía form POST.
//
// El form contiene los 3 campos exigidos por RedSys SIS:
//   - Ds_SignatureVersion = HMAC_SHA256_V1
//   - Ds_MerchantParameters = base64(JSON.stringify(merchantParams))
//   - Ds_Signature = HMAC-SHA256(claveDerivada, encodedParams)
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeRedsysSignature, encodeMerchantParameters } from '@/lib/payments/redsys'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/carrito', request.url))
  }

  const merchantCode = process.env.REDSYS_MERCHANT_CODE
  const secretKey = process.env.REDSYS_SECRET_KEY
  if (!merchantCode || !secretKey) {
    return NextResponse.json({ error: 'Redsys no configurado' }, { status: 503 })
  }

  const admin = createAdminClient()
  const { data: pending } = await admin
    .from('pending_online_orders')
    .select('total, order_number, token')
    .eq('token', token)
    .single()
  if (!pending) {
    return NextResponse.redirect(new URL('/carrito', request.url))
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const dsOrder = pending.token as string

  const merchantParams: Record<string, string> = {
    Ds_Merchant_Amount: Math.round(Number(pending.total) * 100).toString(),
    Ds_Merchant_Order: dsOrder,
    Ds_Merchant_MerchantCode: merchantCode,
    Ds_Merchant_Currency: '978',          // EUR ISO-4217
    Ds_Merchant_TransactionType: '0',     // autorización
    Ds_Merchant_Terminal: process.env.REDSYS_TERMINAL || '1',
    Ds_Merchant_MerchantURL: `${baseUrl}/api/webhooks/redsys`,
    Ds_Merchant_UrlOK: `${baseUrl}/api/public/checkout/redsys-success?token=${encodeURIComponent(dsOrder)}`,
    Ds_Merchant_UrlKO: `${baseUrl}/carrito`,
  }

  const encodedParams = encodeMerchantParameters(merchantParams)
  const dsSignature = computeRedsysSignature(encodedParams, dsOrder, secretKey)
  const redsysUrl = process.env.REDSYS_URL || 'https://sis-t.redsys.es:25443/sis/realizarPago'

  // Escape mínimo para atributos HTML — los 3 valores son base64 / alfanumérico,
  // así que en la práctica solo `+`, `/` y `=` aparecen. Aun así, escapamos
  // por defensa contra cualquier inyección de payload manipulado.
  const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

  const html = `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="utf-8">
<title>Redirigiendo a pago</title>
<meta name="robots" content="noindex">
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;color:#1a2942;background:#fff;}p{font-size:14px;}</style>
</head>
<body>
<p>Redirigiendo a la pasarela de pago segura…</p>
<form id="redsys-form" action="${escapeAttr(redsysUrl)}" method="POST">
  <input type="hidden" name="Ds_SignatureVersion" value="HMAC_SHA256_V1">
  <input type="hidden" name="Ds_MerchantParameters" value="${escapeAttr(encodedParams)}">
  <input type="hidden" name="Ds_Signature" value="${escapeAttr(dsSignature)}">
  <noscript><button type="submit">Continuar al pago</button></noscript>
</form>
<script>document.getElementById('redsys-form').submit();</script>
</body></html>`

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
