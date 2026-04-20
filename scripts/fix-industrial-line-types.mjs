#!/usr/bin/env node
// Arregla líneas de pedidos industriales que quedaron mal marcadas
// como 'artesanal' por el bug de createFichaOrder.
//
// Uso:
//   node scripts/fix-industrial-line-types.mjs        # dry-run (solo lista)
//   node scripts/fix-industrial-line-types.mjs --apply # aplica los UPDATEs

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const apply = process.argv.includes('--apply')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: orders, error: ordersErr } = await sb
  .from('tailoring_orders')
  .select('id, order_number, order_type')
  .eq('order_type', 'industrial')

if (ordersErr) {
  console.error('Error leyendo tailoring_orders:', ordersErr.message)
  process.exit(1)
}

if (!orders?.length) {
  console.log('No hay pedidos industriales. Nada que hacer.')
  process.exit(0)
}

const orderIds = orders.map((o) => o.id)
const orderByid = new Map(orders.map((o) => [o.id, o]))

const { data: lines, error: linesErr } = await sb
  .from('tailoring_order_lines')
  .select('id, tailoring_order_id, line_type, configuration, sort_order')
  .in('tailoring_order_id', orderIds)
  .eq('line_type', 'artesanal')

if (linesErr) {
  console.error('Error leyendo tailoring_order_lines:', linesErr.message)
  process.exit(1)
}

const toFix = (lines ?? []).filter((l) => {
  const cfgTipo = l.configuration?.tipo
  return cfgTipo !== 'camiseria'
})

if (!toFix.length) {
  console.log('No hay líneas que arreglar.')
  process.exit(0)
}

console.log(`Líneas a arreglar: ${toFix.length}`)
for (const l of toFix) {
  const o = orderByid.get(l.tailoring_order_id)
  const prenda = l.configuration?.prendaLabel ?? l.configuration?.prenda ?? '-'
  console.log(`  ${o?.order_number}  #${l.sort_order}  ${prenda}  (line ${l.id})`)
}

if (!apply) {
  console.log('\nDry-run. Para aplicar los cambios ejecuta:')
  console.log('  node scripts/fix-industrial-line-types.mjs --apply')
  process.exit(0)
}

const ids = toFix.map((l) => l.id)
const { error: updateErr, count } = await sb
  .from('tailoring_order_lines')
  .update({ line_type: 'industrial' }, { count: 'exact' })
  .in('id', ids)

if (updateErr) {
  console.error('Error en UPDATE:', updateErr.message)
  process.exit(1)
}

console.log(`\nOK. Filas actualizadas: ${count ?? ids.length}`)
