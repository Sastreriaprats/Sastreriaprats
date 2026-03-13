import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function testRpcCreateSale() {
  console.log('\n🧪 TEST 1: rpc_create_sale')

  // Get a real store, cash session, and user for testing
  const { data: store } = await admin.from('stores').select('id').limit(1).single()
  const { data: session } = await admin.from('cash_sessions').select('id, store_id, total_sales, total_cash_sales').eq('status', 'open').limit(1).single()
  const { data: profile } = await admin.from('profiles').select('id').limit(1).single()

  if (!store || !session || !profile) {
    console.log('  ⚠️  SKIP — necesita al menos 1 tienda, 1 caja abierta y 1 perfil')
    return
  }

  const saleBefore = session.total_sales ?? 0

  const { data: result, error } = await admin.rpc('rpc_create_sale', {
    p_sale: {
      cash_session_id: session.id,
      store_id: session.store_id,
      sale_type: 'boutique',
    },
    p_lines: [
      {
        description: 'TEST ITEM — BORRAR',
        quantity: 1,
        unit_price: 100,
        discount_percentage: 0,
        tax_rate: 21,
      },
    ],
    p_payments: [
      {
        payment_method: 'cash',
        amount: 121,
      },
    ],
    p_user_id: profile.id,
  })

  if (error) {
    console.log('  ❌ FAIL:', error.message)
    return
  }

  console.log('  ✅ Sale created:', result.id)
  console.log('     Ticket:', result.ticket_number)
  console.log('     Total:', result.total, '€')
  console.log('     Status:', result.payment_status)

  // Validate data integrity
  const checks: string[] = []

  if (result.payment_status !== 'paid') checks.push('payment_status debería ser paid')
  if (Number(result.total) !== 121) checks.push(`total debería ser 121, es ${result.total}`)
  if (!result.ticket_number?.startsWith('TICK-')) checks.push('ticket_number no tiene formato TICK-YYYY-NNNN')

  // Check sale_lines created
  const { data: lines } = await admin.from('sale_lines').select('id').eq('sale_id', result.id)
  if (!lines || lines.length !== 1) checks.push(`sale_lines: esperaba 1, hay ${lines?.length ?? 0}`)

  // Check sale_payments created
  const { data: payments } = await admin.from('sale_payments').select('id').eq('sale_id', result.id)
  if (!payments || payments.length !== 1) checks.push(`sale_payments: esperaba 1, hay ${payments?.length ?? 0}`)

  // Check cash session updated
  const { data: updatedSession } = await admin.from('cash_sessions').select('total_sales, total_cash_sales').eq('id', session.id).single()
  if (updatedSession) {
    const expectedTotal = saleBefore + 121
    if (Math.abs(Number(updatedSession.total_sales) - expectedTotal) > 0.01) {
      checks.push(`cash_session total_sales: esperaba ~${expectedTotal}, es ${updatedSession.total_sales}`)
    }
  }

  // Check manual_transaction created
  const { data: mt } = await admin.from('manual_transactions').select('id').eq('notes', `Pedido ${result.ticket_number} - cash`)
  if (!mt || mt.length === 0) checks.push('manual_transaction no creada')

  if (checks.length === 0) {
    console.log('  ✅ Todas las validaciones OK')
  } else {
    checks.forEach(c => console.log('  ⚠️ ', c))
  }

  // CLEANUP
  await admin.from('manual_transactions').delete().eq('notes', `Pedido ${result.ticket_number} - cash`)
  await admin.from('sale_payments').delete().eq('sale_id', result.id)
  await admin.from('sale_lines').delete().eq('sale_id', result.id)
  await admin.from('sales').delete().eq('id', result.id)
  // Restore cash session totals
  await admin.from('cash_sessions').update({
    total_sales: saleBefore,
    total_cash_sales: session.total_cash_sales ?? 0,
  }).eq('id', session.id)
  console.log('  🧹 Cleanup completado')

  return result.id
}

async function testRpcCreateReturn() {
  console.log('\n🧪 TEST 2: rpc_create_return')

  // Find a completed sale with lines to test return
  const { data: sale } = await admin
    .from('sales')
    .select('id, store_id, sale_lines(id, quantity_returned)')
    .eq('status', 'completed')
    .limit(1)
    .single()

  if (!sale || !sale.sale_lines || sale.sale_lines.length === 0) {
    console.log('  ⚠️  SKIP — necesita al menos 1 venta completada con líneas')
    return
  }

  const { data: profile } = await admin.from('profiles').select('id').limit(1).single()
  if (!profile) { console.log('  ⚠️  SKIP — sin perfiles'); return }

  // Pick first non-returned line
  const line = sale.sale_lines.find((l: any) => (l.quantity_returned ?? 0) === 0)
  if (!line) {
    console.log('  ⚠️  SKIP — todas las líneas ya están devueltas')
    return
  }

  const { data: result, error } = await admin.rpc('rpc_create_return', {
    p_original_sale_id: sale.id,
    p_return_type: 'voucher',
    p_line_ids: [line.id],
    p_reason: 'TEST — BORRAR',
    p_store_id: sale.store_id,
    p_user_id: profile.id,
  })

  if (error) {
    console.log('  ❌ FAIL:', error.message)
    return
  }

  console.log('  ✅ Return created:', result.id)
  console.log('     Voucher code:', result.voucher_code)
  console.log('     Total returned:', result.total_returned, '€')

  const checks: string[] = []

  if (!result.voucher_code?.startsWith('DEV-')) checks.push('voucher_code no tiene formato DEV-...')
  if (Number(result.total_returned) <= 0) checks.push('total_returned debería ser > 0')

  // Check voucher created
  if (result.voucher_id) {
    const { data: voucher } = await admin.from('vouchers').select('status, remaining_amount').eq('id', result.voucher_id).single()
    if (!voucher) checks.push('voucher no encontrado')
    else if (voucher.status !== 'active') checks.push('voucher status debería ser active')
  }

  // Check sale_line marked as returned
  const { data: updatedLine } = await admin.from('sale_lines').select('quantity_returned, return_reason').eq('id', line.id).single()
  if (updatedLine?.quantity_returned === 0) checks.push('sale_line no marcada como devuelta')

  if (checks.length === 0) {
    console.log('  ✅ Todas las validaciones OK')
  } else {
    checks.forEach(c => console.log('  ⚠️ ', c))
  }

  // CLEANUP — revert return
  await admin.from('sale_lines').update({ quantity_returned: 0, returned_at: null, return_reason: null }).eq('id', line.id)
  await admin.from('sales').update({ status: 'completed' }).eq('id', sale.id)
  if (result.voucher_id) await admin.from('vouchers').delete().eq('id', result.voucher_id)
  await admin.from('returns').delete().eq('id', result.id)
  console.log('  🧹 Cleanup completado')
}

async function testRpcAddOrderPayment() {
  console.log('\n🧪 TEST 3: rpc_add_order_payment')

  const { data: order } = await admin
    .from('tailoring_orders')
    .select('id, order_number, total, total_paid')
    .gt('total', 0)
    .not('status', 'eq', 'cancelled')
    .limit(1)
    .single()

  if (!order) {
    console.log('  ⚠️  SKIP — necesita al menos 1 pedido de sastrería activo')
    return
  }

  const { data: profile } = await admin.from('profiles').select('id').limit(1).single()
  if (!profile) { console.log('  ⚠️  SKIP — sin perfiles'); return }

  const originalTotalPaid = Number(order.total_paid ?? 0)
  const testAmount = 0.01 // Mínimo para no afectar datos reales

  const { data: result, error } = await admin.rpc('rpc_add_order_payment', {
    p_tailoring_order_id: order.id,
    p_payment_date: new Date().toISOString().split('T')[0],
    p_payment_method: 'cash',
    p_amount: testAmount,
    p_reference: 'TEST-REF',
    p_notes: 'TEST — BORRAR',
    p_user_id: profile.id,
  })

  if (error) {
    console.log('  ❌ FAIL:', error.message)
    return
  }

  console.log('  ✅ Payment created:', result.id)
  console.log('     Order:', result.order_number)
  console.log('     Amount:', result.amount, '€')
  console.log('     Nuevo total_paid:', result.nuevo_total_paid)

  const checks: string[] = []

  const expectedTotalPaid = originalTotalPaid + testAmount
  if (Math.abs(Number(result.nuevo_total_paid) - expectedTotalPaid) > 0.01) {
    checks.push(`nuevo_total_paid: esperaba ~${expectedTotalPaid}, es ${result.nuevo_total_paid}`)
  }

  // Check manual_transaction created
  const { data: mt } = await admin.from('manual_transactions').select('id').eq('notes', `Pedido ${order.order_number} - cash`).order('created_at', { ascending: false }).limit(1)
  if (!mt || mt.length === 0) checks.push('manual_transaction no creada')

  if (checks.length === 0) {
    console.log('  ✅ Todas las validaciones OK')
  } else {
    checks.forEach(c => console.log('  ⚠️ ', c))
  }

  // CLEANUP
  await admin.from('tailoring_order_payments').delete().eq('id', result.id)
  // Recalculate total_paid
  const { data: remainingPayments } = await admin
    .from('tailoring_order_payments')
    .select('amount')
    .eq('tailoring_order_id', order.id)
  const recalculated = (remainingPayments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
  await admin.from('tailoring_orders').update({ total_paid: recalculated }).eq('id', order.id)
  if (mt && mt.length > 0) await admin.from('manual_transactions').delete().eq('id', mt[0].id)
  console.log('  🧹 Cleanup completado')
}

async function main() {
  console.log('===========================================')
  console.log('  Validación RPCs — Sastrería Prats')
  console.log('===========================================')

  await testRpcCreateSale()
  await testRpcCreateReturn()
  await testRpcAddOrderPayment()

  console.log('\n===========================================')
  console.log('  Tests completados')
  console.log('===========================================')
}

main().catch(console.error)
