#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan credenciales'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const today = new Date().toISOString().split('T')[0]
const monthStart = `${today.slice(0, 7)}-01`
console.log(`\n=== Análisis de ventas del mes (${monthStart} → hoy ${today}) ===\n`)

// 1) Tiendas
const { data: stores } = await sb.from('stores').select('id, code, name, is_active').order('name')
console.log('Tiendas:')
for (const s of stores) console.log(`  ${s.code.padEnd(6)} ${s.name.padEnd(22)} ${s.id} ${s.is_active ? '' : '(INACTIVA)'}`)

// 2) Resumen de sale_type del mes
const { data: sales, error } = await sb
  .from('sales')
  .select('id, store_id, total, tax_amount, sale_type, status, created_at, ticket_number')
  .gte('created_at', `${monthStart}T00:00:00`)
  .order('created_at', { ascending: false })

if (error) { console.error('Error fetch sales:', error); process.exit(1) }

console.log(`\nTotal ventas del mes (cualquier status): ${sales.length}`)

// Agrupar por sale_type + status
const groups = {}
for (const s of sales) {
  const k = `${s.sale_type ?? '(null)'} | ${s.status}`
  if (!groups[k]) groups[k] = { count: 0, total: 0, net: 0 }
  groups[k].count += 1
  groups[k].total += Number(s.total) || 0
  groups[k].net += (Number(s.total) || 0) - (Number(s.tax_amount) || 0)
}
console.log('\nDesglose por sale_type / status:')
console.log('  sale_type             status     count   total€       net€')
console.log('  ────────────────────  ─────────  ─────  ───────────  ───────────')
for (const k of Object.keys(groups).sort()) {
  const [stype, status] = k.split(' | ')
  const g = groups[k]
  console.log(`  ${stype.padEnd(20)}  ${status.padEnd(9)}  ${String(g.count).padStart(5)}  ${g.total.toFixed(2).padStart(11)}  ${g.net.toFixed(2).padStart(11)}`)
}

// 3) Replicar lo que hace el dashboard
const BOUTIQUE_SALE_TYPES = ['boutique']
const SASTRERIA_SALE_TYPES = ['tailoring_deposit', 'tailoring_final', 'alteration']

const boutiqueByStore = {}
const sastreriaByStore = {}
const otherByStore = {}
for (const s of stores) { boutiqueByStore[s.id] = 0; sastreriaByStore[s.id] = 0; otherByStore[s.id] = { count: 0, net: 0, types: {} } }

const completed = sales.filter(s => s.status === 'completed')
for (const r of completed) {
  if (!r.store_id) continue
  const net = (Number(r.total) || 0) - (Number(r.tax_amount) || 0)
  const st = r.sale_type ?? ''
  if (BOUTIQUE_SALE_TYPES.includes(st)) boutiqueByStore[r.store_id] += net
  else if (SASTRERIA_SALE_TYPES.includes(st)) sastreriaByStore[r.store_id] += net
  else {
    otherByStore[r.store_id].count += 1
    otherByStore[r.store_id].net += net
    otherByStore[r.store_id].types[st || '(null)'] = (otherByStore[r.store_id].types[st || '(null)'] || 0) + 1
  }
}

console.log(`\n=== Resultado replicado del dashboard (sólo status='completed', net = total - tax_amount) ===\n`)
for (const s of stores) {
  const other = otherByStore[s.id]
  console.log(`${s.code} ${s.name}`)
  console.log(`   Boutique:  ${boutiqueByStore[s.id].toFixed(2)} €`)
  console.log(`   Sastrería: ${sastreriaByStore[s.id].toFixed(2)} €`)
  if (other.count > 0) {
    console.log(`   OTROS (no contados): ${other.count} ventas · ${other.net.toFixed(2)} € · tipos: ${JSON.stringify(other.types)}`)
  }
}

// 4) Muestra 10 ventas de sastrería más recientes para inspección manual
console.log('\n=== Últimas 10 ventas con sale_type relacionado a sastrería (cualquier nombre que lo parezca) ===')
const sastSamples = sales
  .filter(s => {
    const st = (s.sale_type ?? '').toLowerCase()
    return st.includes('tail') || st.includes('alter') || st.includes('sastr') || st.includes('arreglo')
  })
  .slice(0, 10)
if (sastSamples.length === 0) console.log('  (Ninguna)')
for (const s of sastSamples) {
  console.log(`  ${s.created_at}  ticket=${s.ticket_number}  sale_type=${s.sale_type}  status=${s.status}  total=${s.total}  store=${s.store_id}`)
}

// 5) Ventas con tailoring_order_id NOT NULL este mes (otro indicador de sastrería)
const { data: salesWithOrder } = await sb
  .from('sales')
  .select('id, store_id, total, tax_amount, sale_type, status, tailoring_order_id, ticket_number, created_at')
  .gte('created_at', `${monthStart}T00:00:00`)
  .not('tailoring_order_id', 'is', null)
  .order('created_at', { ascending: false })

console.log(`\n=== Ventas del mes con tailoring_order_id NOT NULL (deberían contar como sastrería): ${salesWithOrder?.length ?? 0} ===`)
if (salesWithOrder && salesWithOrder.length > 0) {
  const typeCount = {}
  for (const s of salesWithOrder) typeCount[s.sale_type ?? '(null)'] = (typeCount[s.sale_type ?? '(null)'] || 0) + 1
  console.log('  sale_type distribución:', typeCount)
  console.log('  Muestra (primeras 5):')
  for (const s of salesWithOrder.slice(0, 5)) {
    console.log(`    ${s.created_at}  ticket=${s.ticket_number}  sale_type=${s.sale_type}  status=${s.status}  total=${s.total}`)
  }
}
