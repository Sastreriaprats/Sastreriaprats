import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Stripe from 'stripe'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { items, customer, payment_method, shipping_cost, locale } = body

    if (!items?.length || !customer?.email) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const admin = createAdminClient()

  let subtotal = 0
  const orderLines: {
    variant_id: string
    product_name: string
    variant_sku: string
    quantity: number
    unit_price: number
    total: number
  }[] = []

  for (const item of items) {
    const { data: variant } = await admin
      .from('product_variants')
      .select('id, variant_sku, price_override, product_id, products(base_price, name)')
      .eq('id', item.variant_id)
      .single()

    if (!variant) {
      return NextResponse.json({ error: `Variante ${item.variant_id} no encontrada` }, { status: 400 })
    }

    const prod = variant.products as unknown as Record<string, unknown> | null
    const unitPrice = (variant.price_override as number) || (prod?.base_price as number) || 0
    const lineTotal = unitPrice * item.quantity
    subtotal += lineTotal

    orderLines.push({
      variant_id: item.variant_id,
      product_name: (prod?.name as string) || item.product_name,
      variant_sku: variant.variant_sku,
      quantity: item.quantity,
      unit_price: unitPrice,
      total: lineTotal,
    })
  }

  const taxAmount = Math.round(subtotal * 0.21 * 100) / 100
  const total = subtotal + (shipping_cost || 0)

  let clientId: string | null = null
  const { data: existingClient } = await admin
    .from('clients')
    .select('id')
    .eq('email', customer.email)
    .single()

  if (existingClient) {
    clientId = existingClient.id
  } else {
    const { data: newClient } = await admin.from('clients').insert({
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone || null,
      source: 'web_shop',
    }).select('id').single()
    clientId = newClient?.id || null
  }

  const orderNumber = `WEB-${Date.now().toString(36).toUpperCase()}`

  if (payment_method === 'stripe') {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Pago con tarjeta no configurado. Configure STRIPE_SECRET_KEY o use TPV Virtual (Redsys).' },
        { status: 503 }
      )
    }
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customer.email,
      line_items: orderLines.map((line) => ({
        price_data: {
          currency: 'eur',
          product_data: {
            name: line.product_name || 'Producto',
            metadata: { variant_id: line.variant_id },
          },
          unit_amount: Math.round(line.unit_price * 100),
        },
        quantity: line.quantity,
      })),
      ...(shipping_cost > 0 ? {
        shipping_options: [{
          shipping_rate_data: {
            type: 'fixed_amount' as const,
            fixed_amount: { amount: Math.round(shipping_cost * 100), currency: 'eur' },
            display_name: 'Envío estándar',
          },
        }],
      } : {}),
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/confirmacion?order=${orderNumber}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/carrito`,
      metadata: {
        order_number: orderNumber,
        client_id: clientId || '',
        customer: JSON.stringify(customer),
        shipping_cost: String(shipping_cost || 0),
        tax_amount: String(taxAmount),
        total: String(total),
        order_lines: JSON.stringify(orderLines),
      },
    })
    return NextResponse.json({ checkout_url: session.url })
  }

  if (payment_method === 'redsys') {
    if (!process.env.REDSYS_MERCHANT_CODE) {
      return NextResponse.json(
        { error: 'TPV Redsys no configurado. Configure REDSYS_MERCHANT_CODE y REDSYS_SECRET_KEY en .env o use tarjeta.' },
        { status: 503 }
      )
    }
    const token = Buffer.from(`${orderNumber}-${Date.now()}`).toString('base64url').slice(0, 48)
    await admin.from('pending_online_orders').insert({
      token,
      order_number: orderNumber,
      client_id: clientId,
      customer,
      order_lines: orderLines,
      subtotal,
      tax_amount: taxAmount,
      shipping_cost: shipping_cost || 0,
      total,
      locale: locale || 'es',
    })
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const urlOk = `${baseUrl}/api/public/checkout/redsys-success?token=${encodeURIComponent(token)}`
    const merchantParams = {
      DS_MERCHANT_AMOUNT: Math.round(total * 100).toString(),
      DS_MERCHANT_ORDER: orderNumber.replace(/[^A-Za-z0-9]/g, '').slice(0, 12),
      DS_MERCHANT_MERCHANTCODE: process.env.REDSYS_MERCHANT_CODE,
      DS_MERCHANT_CURRENCY: '978',
      DS_MERCHANT_TRANSACTIONTYPE: '0',
      DS_MERCHANT_TERMINAL: process.env.REDSYS_TERMINAL || '1',
      DS_MERCHANT_MERCHANTURL: `${baseUrl}/api/webhooks/redsys`,
      DS_MERCHANT_URLOK: urlOk,
      DS_MERCHANT_URLKO: `${baseUrl}/carrito`,
    }
    const redsysUrl = process.env.REDSYS_URL || 'https://sis-t.redsys.es:25443/sis/realizarPago'
    const encodedParams = Buffer.from(JSON.stringify(merchantParams)).toString('base64')
    return NextResponse.json({
      checkout_url: `${redsysUrl}?Ds_MerchantParameters=${encodedParams}`,
      redsys_params: merchantParams,
    })
  }

  if (payment_method === 'demo') {
    const { data: order, error: orderError } = await admin.from('online_orders').insert({
      order_number: orderNumber,
      client_id: clientId,
      status: 'paid',
      subtotal,
      tax_amount: taxAmount,
      shipping_cost: shipping_cost || 0,
      total,
      payment_method: 'demo',
      shipping_address: customer,
      locale: locale || 'es',
      paid_at: new Date().toISOString(),
    }).select('id').single()
    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })
    for (const line of orderLines) {
      await admin.from('online_order_lines').insert({ order_id: order.id, ...line })
    }
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.json({
      checkout_url: `${baseUrl}/checkout/confirmacion?order=${encodeURIComponent(orderNumber)}&demo=1`,
    })
  }

  return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 })
  } catch (err) {
    console.error('[checkout]', err)
    const message = err instanceof Error ? err.message : 'Error en el checkout'
    return NextResponse.json(
      { error: message || 'Error procesando el pago. Compruebe la configuración (Stripe/Redsys) en .env.' },
      { status: 500 }
    )
  }
}
