#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })

const today = new Date().toISOString().split('T')[0]
const monthStart = `${today.slice(0, 7)}-01`
console.log(`\n=== Pedidos de sastrería y pagos del mes (${monthStart}) ===\n`)

// Schema correcto de tailoring_orders
const { data: oneTO } = await sb.from('tailoring_orders').select('*').limit(1)
console.log('Columnas tailoring_orders:', oneTO?.[0] ? Object.keys(oneTO[0]).join(', ') : '(vacía)')

const { data: tailorings } = await sb
  .from('tailoring_orders')
  .select('id, order_number, store_id, status, total, paid_amount, created_at, updated_at')
  .gte('created_at', `${monthStart}T00:00:00`)
  .order('created_at', { ascending: false })

console.log(`\nPedidos de sastrería CREADOS este mes: ${tailorings?.length ?? 0}`)
if (tailorings && tailorings.length) {
  let sumTotal = 0, sumPaid = 0
  for (const t of tailorings) { sumTotal += Number(t.total) || 0; sumPaid += Number(t.paid_amount) || 0 }
  console.log(`  Suma total: ${sumTotal.toFixed(2)} €   pagado: ${sumPaid.toFixed(2)} €`)
  console.log('  Por store_id:')
  const byStore = {}
  for (const t of tailorings) {
    if (!byStore[t.store_id]) byStore[t.store_id] = { count: 0, total: 0, paid: 0 }
    byStore[t.store_id].count += 1
    byStore[t.store_id].total += Number(t.total) || 0
    byStore[t.store_id].paid += Number(t.paid_amount) || 0
  }
  for (const k of Object.keys(byStore)) console.log(`    ${k}: ${byStore[k].count} pedidos, total ${byStore[k].total.toFixed(2)} €, pagado ${byStore[k].paid.toFixed(2)} €`)
  console.log('\n  Últimos 5:')
  for (const t of tailorings.slice(0, 5)) {
    console.log(`    ${t.created_at.slice(0,10)}  ${t.order_number}  status=${t.status}  total=${t.total}  paid=${t.paid_amount}  store=${t.store_id}`)
  }
}

// Pagos a pedidos de sastrería de este mes
const { data: tpayments } = await sb
  .from('tailoring_order_payments')
  .select('id, tailoring_order_id, payment_date, amount, payment_method, created_at')
  .gte('payment_date', monthStart)
  .order('payment_date', { ascending: false })

console.log(`\nPagos a pedidos de sastrería este mes (tailoring_order_payments.payment_date >= ${monthStart}): ${tpayments?.length ?? 0}`)
if (tpayments && tpayments.length) {
  const sum = tpayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  console.log(`  Suma: ${sum.toFixed(2)} €`)
  console.log('  Últimos 5:')
  for (const p of tpayments.slice(0, 5)) {
    console.log(`    ${p.payment_date}  ${p.payment_method}  ${p.amount} €  order=${p.tailoring_order_id}`)
  }
}

// ¿Esos pagos generan filas en sales?
console.log('\n=== ¿Los pagos de sastrería crean filas en `sales`? ===')
if (tpayments && tpayments.length) {
  const orderIds = [...new Set(tpayments.map(p => p.tailoring_order_id))].filter(Boolean)
  const { data: relatedSales } = await sb
    .from('sales')
    .select('id, ticket_number, sale_type, total, status, tailoring_order_id, created_at')
    .in('tailoring_order_id', orderIds)
    .gte('created_at', `${monthStart}T00:00:00`)
  console.log(`  Sales vinculadas (tailoring_order_id IN ...) este mes: ${relatedSales?.length ?? 0}`)
  if (relatedSales && relatedSales.length) {
    const types = {}
    for (const s of relatedSales) types[s.sale_type ?? '(null)'] = (types[s.sale_type ?? '(null)'] || 0) + 1
    console.log('  sale_type distribución:', types)
  }
}
