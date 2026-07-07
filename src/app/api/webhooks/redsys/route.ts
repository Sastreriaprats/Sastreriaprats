// Webhook de Redsys (MERCHANTURL): aquí se confirma el pago oficialmente.
// Es el ÚNICO punto que tiene autoridad para marcar online_orders.status='paid'.
// Verifica la firma con HMAC_SHA256_V1 antes de tocar nada.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOnlineOrderJournalEntry } from '@/actions/accounting-triggers'
import { sendOrderConfirmation } from '@/lib/email/transactional'
import { notifyNewOnlineOrder } from '@/lib/notifications/create-notification'
import {
  decodeMerchantParameters,
  verifyRedsysSignature,
} from '@/lib/payments/redsys'

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData()
    const dsMerchantParameters = body.get('Ds_MerchantParameters') as string
    const dsSignature = body.get('Ds_Signature') as string

    if (!dsMerchantParameters) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const secretKey = process.env.REDSYS_SECRET_KEY
    if (!secretKey) {
      console.error('[redsys webhook] REDSYS_SECRET_KEY no configurada')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const params = decodeMerchantParameters(dsMerchantParameters)
    const dsOrder = String(params.Ds_Order || '')

    if (!verifyRedsysSignature(dsSignature || '', dsMerchantParameters, dsOrder, secretKey)) {
      console.error('[redsys webhook] firma inválida para Ds_Order', dsOrder)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const responseCode = parseInt(String(params.Ds_Response || '9999'))
    const amount = parseInt(String(params.Ds_Amount || '0')) / 100  // Redsys envía céntimos

    // Pago aprobado: código de respuesta < 100
    if (responseCode >= 100) {
      return NextResponse.json({ ok: true, ignored: 'response_code_ko', responseCode })
    }

    const admin = createAdminClient()

    // Buscar el pending por token = ds_order (los generamos iguales en checkout).
    const { data: pending } = await admin
      .from('pending_online_orders')
      .select('*')
      .eq('token', dsOrder)
      .single()

    if (!pending) {
      // Idempotencia: si el pedido ya se creó en una llamada previa (RedSys
      // reintenta el webhook), no fallamos.
      const { data: existing } = await admin
        .from('online_orders')
        .select('id')
        .eq('redsys_order_code', dsOrder)
        .maybeSingle()
      if (existing) return NextResponse.json({ ok: true, duplicate: true })
      console.error('[redsys webhook] pending_online_orders no encontrado para', dsOrder)
      return NextResponse.json({ error: 'Pending order not found' }, { status: 404 })
    }

    const customer = pending.customer as Record<string, unknown>
    const orderLines = pending.order_lines as Array<{
      variant_id: string
      product_name: string
      variant_sku: string
      quantity: number
      unit_price: number
      total: number
    }>

    const { data: order, error: orderError } = await admin
      .from('online_orders')
      .insert({
        order_number: pending.order_number,
        client_id: pending.client_id,
        status: 'paid',
        subtotal: pending.subtotal,
        tax_amount: pending.tax_amount,
        shipping_cost: pending.shipping_cost,
        total: pending.total,
        payment_method: 'redsys',
        redsys_order_code: dsOrder,
        shipping_address: customer,
        locale: pending.locale || 'es',
        paid_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (orderError || !order) {
      console.error('[redsys webhook] insert online_orders', orderError)
      return NextResponse.json({ error: orderError?.message || 'insert error' }, { status: 500 })
    }

    for (const line of orderLines) {
      await admin.from('online_order_lines').insert({
        order_id: order.id,
        variant_id: line.variant_id,
        product_name: line.product_name,
        variant_sku: line.variant_sku,
        quantity: line.quantity,
        unit_price: line.unit_price,
        total: line.total,
      })
    }

    await createOnlineOrderJournalEntry(order.id).catch(() => {})

    try {
      await notifyNewOnlineOrder(pending.order_number, Number(pending.total) || 0)
    } catch (e) {
      console.error('[redsys webhook] notifyNewOnlineOrder', e)
    }

    // Decremento de stock (mismo patrón que el webhook Stripe).
    for (const line of orderLines) {
      if (!line.variant_id) continue
      const { data: sl } = await admin
        .from('stock_levels')
        .select('id, quantity, warehouse_id, warehouses ( store_id )')
        .eq('product_variant_id', line.variant_id)
        .limit(1)
        .single()
      if (!sl) continue
      const newQty = Math.max(0, sl.quantity - line.quantity)
      await admin.from('stock_levels').update({ quantity: newQty }).eq('id', sl.id)
      await admin.from('stock_movements').insert({
        product_variant_id: line.variant_id,
        warehouse_id: sl.warehouse_id,
        movement_type: 'sale',
        quantity: -line.quantity,
        stock_before: sl.quantity,
        stock_after: newQty,
        // Enlace al pedido online: la lista de movimientos resuelve el cliente por
        // reference_type/reference_id (mismo patrón que el TPV con 'sale').
        reference_type: 'online_order',
        reference_id: order.id,
        store_id: (sl.warehouses as { store_id?: string } | null)?.store_id ?? null,
        reason: `Pedido online ${pending.order_number}`,
      })
    }

    // Email de confirmación al cliente.
    const customerEmail = (customer.email as string | undefined) || ''
    const customerName = (customer.first_name as string | undefined) || customerEmail.split('@')[0] || 'Cliente'
    if (customerEmail) {
      try {
        await sendOrderConfirmation({
          order_number: pending.order_number,
          client_name: customerName,
          client_email: customerEmail,
          total: Number(pending.total),
          items: orderLines.map(l => l.product_name),
        })
      } catch (e) {
        console.error('[redsys webhook] sendOrderConfirmation', e)
      }
    }

    // Limpiar pending (idempotencia: si el webhook se repite, ya no existirá
    // y el lookup por redsys_order_code de arriba lo detecta como duplicado).
    await admin.from('pending_online_orders').delete().eq('token', dsOrder)

    void amount  // disponible si se quiere registrar la cantidad concreta
    return NextResponse.json({ ok: true, orderId: order.id })
  } catch (error) {
    console.error('[redsys webhook] unhandled', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
