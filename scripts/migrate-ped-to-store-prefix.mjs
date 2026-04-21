#!/usr/bin/env node
// Renumera los pedidos de confección que empiezan por 'PED-YYYY-NNNN' para
// que usen el order_prefix de su tienda (PIN / WEL / WEB / …).
//
// Estrategia:
//   1. Cargar todos los tailoring_orders con order_number LIKE 'PED-%'.
//   2. Agrupar por (store_id, año). Ordenar por created_at ascendente para
//      preservar el orden cronológico al asignar nuevos números.
//   3. Para cada grupo, consultar el mayor NNNN existente con ese prefijo+año
//      y asignar a cada pedido el siguiente número secuencial.
//   4. En dry-run imprime el plan; con --apply hace el UPDATE.
//
// Uso:
//   node scripts/migrate-ped-to-store-prefix.mjs           # dry-run
//   node scripts/migrate-ped-to-store-prefix.mjs --apply   # aplica

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

function parseYear(orderNumber) {
  const parts = orderNumber.split('-')
  if (parts.length !== 3) return null
  const y = parseInt(parts[1], 10)
  return Number.isFinite(y) ? y : null
}

async function getMaxSeq(prefix, year) {
  const pattern = `${prefix}-${year}-%`
  const { data, error } = await sb
    .from('tailoring_orders')
    .select('order_number')
    .like('order_number', pattern)
    .order('order_number', { ascending: false })
    .limit(1)
  if (error) throw error
  if (!data || data.length === 0) return 0
  const parts = data[0].order_number.split('-')
  return parseInt(parts[parts.length - 1], 10) || 0
}

async function main() {
  console.log(`→ Modo: ${apply ? 'APLICAR' : 'DRY-RUN'}\n`)

  // 1. Cargar pedidos PED-…
  const { data: orders, error } = await sb
    .from('tailoring_orders')
    .select('id, order_number, store_id, created_at')
    .like('order_number', 'PED-%')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Error leyendo pedidos:', error.message)
    process.exit(1)
  }
  console.log(`→ Pedidos con prefijo PED: ${orders?.length ?? 0}`)
  if (!orders || orders.length === 0) return

  // 2. Cargar order_prefix de las tiendas implicadas
  const storeIds = [...new Set(orders.map((o) => o.store_id).filter(Boolean))]
  const { data: stores, error: sErr } = await sb
    .from('stores')
    .select('id, code, order_prefix')
    .in('id', storeIds)
  if (sErr) {
    console.error('Error leyendo tiendas:', sErr.message)
    process.exit(1)
  }
  const prefixByStore = new Map()
  for (const s of stores || []) {
    prefixByStore.set(s.id, s.order_prefix || s.code || 'ORD')
  }

  // 3. Agrupar por (prefijo, año) y asignar números nuevos
  const groups = new Map() // key: `${prefix}|${year}` → [orders]
  const skipped = []
  for (const o of orders) {
    const year = parseYear(o.order_number)
    const prefix = o.store_id ? prefixByStore.get(o.store_id) : null
    if (!year || !prefix) {
      skipped.push({ order: o, reason: !year ? 'año no parseable' : 'sin tienda/prefijo' })
      continue
    }
    const k = `${prefix}|${year}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(o)
  }

  // 4. Plan de renumeración
  const plan = [] // { id, oldNumber, newNumber }
  for (const [k, list] of groups.entries()) {
    const [prefix, yearStr] = k.split('|')
    const year = parseInt(yearStr, 10)
    let nextSeq = (await getMaxSeq(prefix, year)) + 1
    for (const o of list) {
      const newNumber = `${prefix}-${year}-${String(nextSeq).padStart(4, '0')}`
      plan.push({ id: o.id, oldNumber: o.order_number, newNumber })
      nextSeq++
    }
  }

  console.log(`\n→ Plan (${plan.length} renombrados):`)
  for (const p of plan) {
    console.log(`   ${p.oldNumber}  →  ${p.newNumber}`)
  }
  if (skipped.length > 0) {
    console.log(`\n⚠ Omitidos (${skipped.length}):`)
    for (const s of skipped) {
      console.log(`   ${s.order.order_number}  [${s.reason}]`)
    }
  }

  if (!apply) {
    console.log(`\nDry-run: no se ha modificado nada. Para aplicar:`)
    console.log(`  node scripts/migrate-ped-to-store-prefix.mjs --apply`)
    return
  }

  // 5. Aplicar UPDATEs en dos pasadas para evitar chocar con el UNIQUE si los
  //    nuevos números colisionan con otros PED aún sin migrar. Paso 1: a un
  //    nombre temporal; paso 2: al definitivo.
  console.log(`\n→ Aplicando en dos pasadas (evita colisiones con UNIQUE)…`)
  let tmpIdx = 0
  for (const p of plan) {
    const tmp = `__T${String(tmpIdx++).padStart(6, '0')}`
    p._tmp = tmp
    const { error } = await sb
      .from('tailoring_orders')
      .update({ order_number: tmp })
      .eq('id', p.id)
    if (error) {
      console.error(`Error (tmp) en ${p.oldNumber}:`, error.message)
      process.exit(1)
    }
  }
  for (const p of plan) {
    const { error } = await sb
      .from('tailoring_orders')
      .update({ order_number: p.newNumber })
      .eq('id', p.id)
    if (error) {
      console.error(`Error (final) en ${p.oldNumber} → ${p.newNumber}:`, error.message)
      process.exit(1)
    }
  }

  console.log(`\n✓ ${plan.length} pedidos renumerados.`)
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
