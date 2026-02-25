import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/carrito', request.url))
  }

  const admin = createAdminClient()
  const { data: pending, error: fetchError } = await admin
    .from('pending_online_orders')
    .select('*')
    .eq('token', token)
    .single()

  if (fetchError || !pending) {
    return NextResponse.redirect(new URL('/checkout/confirmacion', request.url))
  }

  const orderNumber = pending.order_number as string
  const customer = pending.customer as Record<string, unknown>
  const orderLines = pending.order_lines as Array<{
    variant_id: string
    product_name: string
    variant_sku: string
    quantity: number
    unit_price: number
    total: number
  }>

  const { data: order, error: orderError } = await admin.from('online_orders').insert({
    order_number: orderNumber,
    client_id: pending.client_id,
    status: 'paid',
    subtotal: pending.subtotal,
    tax_amount: pending.tax_amount,
    shipping_cost: pending.shipping_cost,
    total: pending.total,
    payment_method: 'redsys',
    shipping_address: customer,
    locale: pending.locale || 'es',
    paid_at: new Date().toISOString(),
  }).select('id').single()

  if (orderError) {
    console.error('[redsys-success]', orderError)
    return NextResponse.redirect(new URL('/carrito', request.url))
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

  await admin.from('pending_online_orders').delete().eq('token', token)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  return NextResponse.redirect(`${baseUrl}/checkout/confirmacion?order=${encodeURIComponent(orderNumber)}`)
}
