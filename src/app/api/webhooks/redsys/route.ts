// Webhook de Redsys - pendiente de configurar con credenciales reales
// Necesario: REDSYS_MERCHANT_CODE, REDSYS_SECRET_KEY, REDSYS_TERMINAL
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOnlineOrderJournalEntry } from '@/actions/accounting-triggers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData()
    const dsSignatureVersion = body.get('Ds_SignatureVersion') as string
    const dsMerchantParameters = body.get('Ds_MerchantParameters') as string
    const dsSignature = body.get('Ds_Signature') as string

    if (!dsMerchantParameters) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // TODO: Verificar firma HMAC-SHA256 con REDSYS_SECRET_KEY
    // const isValid = verifyRedsysSignature(dsMerchantParameters, dsSignature)
    // if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

    const params = JSON.parse(Buffer.from(dsMerchantParameters, 'base64').toString('utf8'))
    const responseCode = parseInt(params.Ds_Response || '9999')
    const orderNumber = params.Ds_Order
    const amount = parseInt(params.Ds_Amount) / 100 // Redsys envía en céntimos

    // Pago aprobado: código de respuesta < 100
    if (responseCode < 100) {
      const admin = createAdminClient()
      const { data: order } = await admin
        .from('online_orders')
        .update({ status: 'paid', payment_reference: orderNumber })
        .eq('order_number', orderNumber.replace(/^0+/, ''))
        .select('id')
        .single()

      if (order) {
        await createOnlineOrderJournalEntry(order.id).catch(() => {})
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Redsys webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
