#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })

const today = new Date().toISOString().split('T')[0]
const monthStart = `${today.slice(0, 7)}-01`

const { data: stores } = await sb.from('stores').select('id, code, name').eq('is_active', true).order('name')
const storeIds = stores.map(s => s.id)

// Reproduce la nueva consulta de getStoresWithStats
const { data: payments, error } = await sb
  .from('tailoring_order_payments')
  .select('amount, tailoring_orders!inner(store_id, total, tax_amount)')
  .gte('payment_date', monthStart)
  .lte('payment_date', today)

if (error) { console.error(error); process.exit(1) }
console.log(`Pagos a pedidos de sastrería leídos: ${payments.length}`)

const sastreriaByStore = Object.fromEntries(stores.map(s => [s.id, 0]))
for (const p of payments) {
  const order = p.tailoring_orders
  if (!order?.store_id) continue
  const amount = Number(p.amount) || 0
  const orderTotal = Number(order.total) || 0
  const orderTax = Number(order.tax_amount) || 0
  const netFactor = orderTotal > 0 ? (orderTotal - orderTax) / orderTotal : 1
  if (!(order.store_id in sastreriaByStore)) sastreriaByStore[order.store_id] = 0
  sastreriaByStore[order.store_id] += amount * netFactor
}

console.log('\nSastrería del mes por tienda (NETO, base imponible):')
for (const s of stores) {
  console.log(`  ${s.code} ${s.name.padEnd(22)}  ${sastreriaByStore[s.id].toFixed(2)} €`)
}

const total = Object.values(sastreriaByStore).reduce((a, b) => a + b, 0)
console.log(`\nTotal Sastrería neta este mes: ${total.toFixed(2)} €`)
console.log(`Suma bruta (sólo control): ${payments.reduce((s, p) => s + (Number(p.amount) || 0), 0).toFixed(2)} €`)
