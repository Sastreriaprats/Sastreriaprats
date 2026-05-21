#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })

const today = new Date().toISOString().split('T')[0]
const monthStart = `${today.slice(0, 7)}-01`
console.log(`\n=== Tailoring orders y pagos del mes (${monthStart}) ===\n`)

// Pedidos de sastrería creados o actualizados este mes
const { data: tailorings, error: e1 } = await sb
  .from('tailoring_orders')
  .select('id, order_number, store_id, status, total_amount, paid_amount, created_at, updated_at')
  .or(`created_at.gte.${monthStart}T00:00:00,updated_at.gte.${monthStart}T00:00:00`)
  .order('updated_at', { ascending: false })
  .limit(20)

if (e1) console.error('Error tailoring_orders:', e1)
console.log(`Pedidos de sastrería con actividad este mes: ${tailorings?.length ?? 0}`)
if (tailorings && tailorings.length) {
  console.log('  Muestra (primeros 10):')
  for (const t of tailorings.slice(0, 10)) {
    console.log(`    ${t.order_number}  status=${t.status}  total=${t.total_amount}  pagado=${t.paid_amount}  store=${t.store_id}  created=${t.created_at?.slice(0, 10)}`)
  }
}

// Buscar tablas de pagos / abonos asociados a tailoring orders
console.log('\n=== Buscando esquema de pagos ===')
const tables = ['order_payments', 'tailoring_order_payments', 'payments', 'sale_payments']
for (const t of tables) {
  const { data, error } = await sb.from(t).select('*').limit(1)
  if (error) console.log(`  ${t}: NO EXISTE / sin acceso (${error.code || error.message})`)
  else console.log(`  ${t}: OK  columnas=${data && data[0] ? Object.keys(data[0]).join(',') : '(vacía)'}`)
}

// Si existe order_payments, ver pagos del mes
const { data: payments, error: ePay } = await sb
  .from('order_payments')
  .select('*')
  .gte('created_at', `${monthStart}T00:00:00`)
  .order('created_at', { ascending: false })
  .limit(10)

if (!ePay) {
  console.log(`\nPagos en order_payments este mes: ${payments?.length ?? 0}`)
  if (payments && payments.length) {
    console.log('  Muestra:')
    for (const p of payments) console.log('   ', p)
  }
}
