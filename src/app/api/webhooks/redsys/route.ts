// Webhook de Redsys
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOnlineOrderJournalEntry } from '@/actions/accounting-triggers'
import crypto from 'crypto'

function verifyRedsysSignature(merchantParams: string, receivedSignature: string): boolean {
  const secretKey = process.env.REDSYS_SECRET_KEY
  if (!secretKey) return false

  const decoded = JSON.parse(Buffer.from(merchantParams, 'base64').toString('utf8'))
  const orderNumber = decoded.Ds_Order || ''

  // Diversificar clave con 3DES-CBC usando el número de pedido
  const keyBuffer = Buffer.from(secretKey, 'base64')
  const iv = Buffer.alloc(8, 0)
  const orderPadded = Buffer.alloc(8, 0)
  Buffer.from(orderNumber).copy(orderPadded)
  const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv)
  cipher.setAutoPadding(false)
  const diversifiedKey = Buffer.concat([cipher.update(orderPadded), cipher.final()])

  // HMAC-SHA256 de los parámetros con la clave diversificada
  const hmac = crypto.createHmac('sha256', diversifiedKey)
  hmac.update(merchantParams)
  const calculatedSignature = hmac.digest('base64')

  const normalize = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return normalize(calculatedSignature) === normalize(receivedSignature)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData()
    const dsMerchantParameters = body.get('Ds_MerchantParameters') as string
    const dsSignature = body.get('Ds_Signature') as string

    if (!dsMerchantParameters) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    if (!verifyRedsysSignature(dsMerchantParameters, dsSignature || '')) {
      console.error('Redsys webhook: invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

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
