import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOnlineOrderJournalEntry } from '@/actions/accounting-triggers'
import Stripe from 'stripe'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'No signature' }, { status: 400 })
    }

    let event: Stripe.Event
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const stripe = getStripe()
      event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
    } else {
      event = JSON.parse(body) as Stripe.Event
    }

    const admin = createAdminClient()

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const meta = session.metadata || {}
        const orderNumber = meta.order_number
        const orderId = meta.order_id

        if (meta.order_lines && orderNumber) {
          const clientId = meta.client_id || null
          const customer = meta.customer ? (JSON.parse(meta.customer) as Record<string, unknown>) : {}
          const orderLines = JSON.parse(meta.order_lines) as Array<{
            variant_id: string
            product_name: string
            variant_sku: string
            quantity: number
            unit_price: number
            total: number
          }>
          const shippingCost = parseFloat(meta.shipping_cost || '0')
          const taxAmount = parseFloat(meta.tax_amount || '0')
          const total = parseFloat(meta.total || '0')
          const subtotal = total - shippingCost

          const { data: order, error: orderError } = await admin.from('online_orders').insert({
            order_number: orderNumber,
            client_id: clientId || null,
            status: 'paid',
            subtotal,
            tax_amount: taxAmount,
            shipping_cost: shippingCost,
            total,
            payment_method: 'stripe',
            shipping_address: customer,
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id,
            stripe_payment_intent: (session.payment_intent as string) || null,
          }).select('id').single()

          if (orderError) {
            console.error('[Stripe webhook] create order', orderError)
            return NextResponse.json({ error: orderError.message }, { status: 500 })
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

          const { data: lines } = await admin
            .from('online_order_lines')
            .select('variant_id, quantity')
            .eq('order_id', order.id)

          for (const line of lines || []) {
            if (!line.variant_id) continue
            const { data: sl } = await admin
              .from('stock_levels')
              .select('id, quantity, warehouse_id')
              .eq('product_variant_id', line.variant_id)
              .limit(1)
              .single()

            if (sl) {
              const newQty = Math.max(0, sl.quantity - line.quantity)
              await admin.from('stock_levels').update({
                quantity: newQty,
              }).eq('id', sl.id)

              await admin.from('stock_movements').insert({
                product_variant_id: line.variant_id,
                warehouse_id: sl.warehouse_id,
                movement_type: 'sale',
                quantity: -line.quantity,
                stock_before: sl.quantity,
                stock_after: newQty,
                reason: `Pedido online ${orderNumber}`,
              })
            }
          }

          if (process.env.RESEND_API_KEY && session.customer_email) {
            try {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: process.env.RESEND_FROM_EMAIL || 'noreply@sastreriaprats.com',
                  to: session.customer_email,
                  subject: `Pedido confirmado — ${orderNumber}`,
                  html: `<h2>¡Gracias por tu compra!</h2>
                    <p>Tu pedido <strong>${orderNumber}</strong> ha sido confirmado.</p>
                    <p>Te enviaremos un email cuando se prepare el envío.</p>
                    <p>Un saludo,<br>Sastrería Prats</p>`,
                }),
              })
            } catch {
              // silent
            }
          }
        } else if (orderId && orderNumber) {
          await admin.from('online_orders').update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_session_id: session.id,
            stripe_payment_intent: session.payment_intent as string,
          }).eq('id', orderId)

          await createOnlineOrderJournalEntry(orderId).catch(() => {})

          const { data: lines } = await admin
            .from('online_order_lines')
            .select('variant_id, quantity')
            .eq('order_id', orderId)

          for (const line of lines || []) {
            if (!line.variant_id) continue
            const { data: sl } = await admin
              .from('stock_levels')
              .select('id, quantity, warehouse_id')
              .eq('product_variant_id', line.variant_id)
              .limit(1)
              .single()

            if (sl) {
              const newQty = Math.max(0, sl.quantity - line.quantity)
              await admin.from('stock_levels').update({ quantity: newQty }).eq('id', sl.id)
              await admin.from('stock_movements').insert({
                product_variant_id: line.variant_id,
                warehouse_id: sl.warehouse_id,
                movement_type: 'sale',
                quantity: -line.quantity,
                stock_before: sl.quantity,
                stock_after: newQty,
                reason: `Pedido online ${orderNumber}`,
              })
            }
          }

          if (process.env.RESEND_API_KEY && session.customer_email) {
            try {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: process.env.RESEND_FROM_EMAIL || 'noreply@sastreriaprats.com',
                  to: session.customer_email,
                  subject: `Pedido confirmado — ${orderNumber}`,
                  html: `<h2>¡Gracias por tu compra!</h2><p>Tu pedido <strong>${orderNumber}</strong> ha sido confirmado.</p><p>Un saludo,<br>Sastrería Prats</p>`,
                }),
              })
            } catch {
              // silent
            }
          }
        } else if (session.metadata?.order_id) {
          await admin.from('tailoring_orders').update({
            total_paid: (session.amount_total || 0) / 100,
          }).eq('id', session.metadata.order_id)
        }
        break
      }

      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent
        await admin.rpc('log_audit', {
          p_user_id: null,
          p_action: 'payment',
          p_module: 'pos',
          p_description: `Pago Stripe recibido: ${intent.amount / 100}€`,
          p_entity_type: 'payment',
          p_entity_id: intent.id,
        })
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        await admin.rpc('log_audit', {
          p_user_id: null,
          p_action: 'refund',
          p_module: 'pos',
          p_description: `Reembolso Stripe: ${charge.amount_refunded / 100}€`,
        })
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Stripe Webhook Error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
