#!/usr/bin/env node
// Corrige el stock del pedido PEDPROV-2026-0003 (u otro indicado con --order)
// cuyos movimientos se registraron por error todos en la variante XS cuando el
// pedido era de tallas M, L y XL.
//
// Pasos:
//  1. Busca el pedido por order_number.
//  2. Carga sus supplier_order_lines (con talla parseada de la descripción "… — M").
//  3. Para cada línea, localiza la variante correcta (product_id + size) y
//     rellena line.product_variant_id si está vacía.
//  4. Localiza los stock_movements creados con reference_type='supplier_order'
//     y reference_id del pedido. Identifica cuáles tienen variant "equivocada"
//     (variant.size no coincide con la talla de ninguna línea y sí coincide
//     con la talla erroneamente asignada).
//  5. Propone ajustes: resta en la variante errónea y suma en la correcta.
//  6. En modo --apply crea stock_movements de tipo 'adjustment' (motivo:
//     "Corrección PEDPROV-2026-0003: talla mal asignada") para revertir y
//     aplica los delta en stock_levels. Así queda trazabilidad en el historial.
//
// Uso:
//   node scripts/fix-pedprov-2026-0003-stock.mjs            # dry-run (por defecto)
//   node scripts/fix-pedprov-2026-0003-stock.mjs --apply    # aplica los cambios
//   node scripts/fix-pedprov-2026-0003-stock.mjs --order PEDPROV-2026-0003

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const apply = process.argv.includes('--apply')
const orderArgIdx = process.argv.indexOf('--order')
const ORDER_NUMBER = orderArgIdx >= 0 ? process.argv[orderArgIdx + 1] : 'PEDPROV-2026-0003'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

function parseSizeFromDescription(description) {
  if (!description) return null
  const m = description.match(/\s*(?:—|–|-)\s*(?:Talla\s+)?([A-Za-z0-9]+)\s*$/)
  return m ? m[1].trim().toUpperCase() : null
}

async function main() {
  console.log(`→ Pedido: ${ORDER_NUMBER}   Modo: ${apply ? 'APLICAR' : 'DRY-RUN'}\n`)

  const { data: order, error: orderErr } = await sb
    .from('supplier_orders')
    .select('id, order_number, status, destination_store_id, destination_warehouse_id')
    .eq('order_number', ORDER_NUMBER)
    .single()
  if (orderErr || !order) {
    console.error('No se encuentra el pedido:', orderErr?.message)
    process.exit(1)
  }
  console.log(`✓ Pedido ${order.order_number} (id ${order.id}) estado=${order.status}`)

  const { data: lines, error: linesErr } = await sb
    .from('supplier_order_lines')
    .select('id, description, quantity, quantity_received, product_id, product_variant_id')
    .eq('supplier_order_id', order.id)
    .order('sort_order', { ascending: true })
  if (linesErr || !lines) {
    console.error('Error leyendo líneas:', linesErr?.message)
    process.exit(1)
  }

  console.log(`\n→ Líneas del pedido:`)
  for (const l of lines) {
    console.log(`   ${l.id}  ${l.description}  cant=${l.quantity}  recibido=${l.quantity_received}  variant=${l.product_variant_id || '∅'}`)
  }

  // Cargar variantes por producto
  const productIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))]
  const { data: variants, error: varErr } = await sb
    .from('product_variants')
    .select('id, product_id, size, color, variant_sku')
    .in('product_id', productIds)
  if (varErr) {
    console.error('Error leyendo variantes:', varErr.message)
    process.exit(1)
  }
  const variantsByProduct = new Map()
  for (const v of variants || []) {
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, [])
    variantsByProduct.get(v.product_id).push(v)
  }

  // Resolver variant correcta por línea
  const lineFixes = [] // { line, targetVariantId, sizeLabel }
  for (const l of lines) {
    const desiredSize = parseSizeFromDescription(l.description)
    if (!l.product_id || !desiredSize) {
      console.log(`   · Sin talla parseable en "${l.description}", se omite`)
      continue
    }
    const available = variantsByProduct.get(l.product_id) || []
    const match = available.find((v) => (v.size || '').trim().toUpperCase() === desiredSize)
    if (!match) {
      console.log(`   · No hay variante con talla ${desiredSize} para product ${l.product_id}`)
      continue
    }
    lineFixes.push({ line: l, targetVariantId: match.id, sizeLabel: desiredSize })
  }

  // Cargar movimientos creados por la recepción previa
  const { data: movs, error: movErr } = await sb
    .from('stock_movements')
    .select('id, product_variant_id, warehouse_id, movement_type, quantity, created_at, reference_id, reference_type')
    .eq('reference_type', 'supplier_order')
    .eq('reference_id', order.id)
    .order('created_at', { ascending: true })
  if (movErr) {
    console.error('Error leyendo movimientos:', movErr.message)
    process.exit(1)
  }

  console.log(`\n→ Movimientos existentes del pedido: ${movs?.length ?? 0}`)
  for (const m of movs || []) {
    console.log(`   ${m.id}  variant=${m.product_variant_id}  qty=${m.quantity}  tipo=${m.movement_type}  wh=${m.warehouse_id}`)
  }

  // Determinar variantes correctas (por talla) y conjunto de tallas "correctas"
  const correctVariantIds = new Set(lineFixes.map((f) => f.targetVariantId))

  // Los movimientos "equivocados" son los que NO están en correctVariantIds
  const wrongMovs = (movs || []).filter((m) => !correctVariantIds.has(m.product_variant_id))

  // Suma de cantidades mal metidas por (variant_id, warehouse_id)
  const wrongByVarWh = new Map()
  for (const m of wrongMovs) {
    const k = `${m.product_variant_id}|${m.warehouse_id}`
    wrongByVarWh.set(k, (wrongByVarWh.get(k) || 0) + Number(m.quantity || 0))
  }

  // Suma de cantidades correctas necesarias por (targetVariantId, warehouse) — mismo warehouse que wrongMovs
  // Asumimos que todos los movimientos incorrectos están en el mismo warehouse (destino).
  const warehouseIds = [...new Set(wrongMovs.map((m) => m.warehouse_id))]
  if (warehouseIds.length !== 1) {
    console.warn(`   ⚠ Los movimientos incorrectos están en ${warehouseIds.length} almacenes distintos. Revisa manualmente.`)
  }
  const warehouseId = warehouseIds[0]

  const correctByVarWh = new Map()
  for (const f of lineFixes) {
    const qty = Number(f.line.quantity_received || 0)
    if (qty <= 0) continue
    const k = `${f.targetVariantId}|${warehouseId}`
    correctByVarWh.set(k, (correctByVarWh.get(k) || 0) + qty)
  }

  console.log(`\n→ Ajustes propuestos (almacén ${warehouseId}):`)
  for (const [k, qty] of wrongByVarWh.entries()) {
    const [vid] = k.split('|')
    console.log(`   RESTAR ${qty} en variant ${vid}`)
  }
  for (const [k, qty] of correctByVarWh.entries()) {
    const [vid] = k.split('|')
    console.log(`   SUMAR ${qty} en variant ${vid}`)
  }

  console.log(`\n→ Asignar product_variant_id a las líneas:`)
  for (const f of lineFixes) {
    const from = f.line.product_variant_id || '∅'
    console.log(`   line ${f.line.id}  (${f.sizeLabel})  ${from}  →  ${f.targetVariantId}`)
  }

  if (!apply) {
    console.log(`\nDry-run: no se ha modificado nada. Para aplicar:`)
    console.log(`  node scripts/fix-pedprov-2026-0003-stock.mjs --apply`)
    return
  }

  const now = new Date().toISOString()

  // 1. Actualizar líneas con la variante correcta
  for (const f of lineFixes) {
    if (f.line.product_variant_id === f.targetVariantId) continue
    const { error } = await sb
      .from('supplier_order_lines')
      .update({ product_variant_id: f.targetVariantId })
      .eq('id', f.line.id)
    if (error) {
      console.error(`Error actualizando línea ${f.line.id}:`, error.message)
      process.exit(1)
    }
  }
  console.log('✓ Líneas actualizadas con su variante correcta')

  // 2. Crear movimientos compensatorios
  const reason = `Corrección ${ORDER_NUMBER}: recepción asignó talla XS por error, se reasigna a talla correcta`

  // 2a. Ajustes negativos en variante incorrecta
  for (const [k, qty] of wrongByVarWh.entries()) {
    const [vid, wid] = k.split('|')
    // Leer stock actual
    const { data: level } = await sb
      .from('stock_levels')
      .select('id, quantity')
      .eq('product_variant_id', vid)
      .eq('warehouse_id', wid)
      .maybeSingle()
    const before = Number(level?.quantity || 0)
    const after = before - qty
    const { error: movIns } = await sb.from('stock_movements').insert({
      product_variant_id: vid,
      warehouse_id: wid,
      movement_type: 'adjustment_negative',
      quantity: -qty,
      stock_before: before,
      stock_after: after,
      reason,
      reference_type: 'supplier_order_correction',
      reference_id: order.id,
      store_id: order.destination_store_id || null,
    })
    if (movIns) {
      console.error('Error creando movimiento compensatorio:', movIns.message)
      process.exit(1)
    }
    if (level?.id) {
      await sb.from('stock_levels').update({
        quantity: after,
        updated_at: now,
        last_movement_at: now,
      }).eq('id', level.id)
    }
  }

  // 2b. Ajustes positivos en variante correcta
  for (const [k, qty] of correctByVarWh.entries()) {
    const [vid, wid] = k.split('|')
    const { data: level } = await sb
      .from('stock_levels')
      .select('id, quantity')
      .eq('product_variant_id', vid)
      .eq('warehouse_id', wid)
      .maybeSingle()
    const before = Number(level?.quantity || 0)
    const after = before + qty
    const { error: movIns } = await sb.from('stock_movements').insert({
      product_variant_id: vid,
      warehouse_id: wid,
      movement_type: 'purchase_receipt',
      quantity: qty,
      stock_before: before,
      stock_after: after,
      reason: `Recepción pedido ${ORDER_NUMBER} (corregido)`,
      reference_type: 'supplier_order',
      reference_id: order.id,
      store_id: order.destination_store_id || null,
    })
    if (movIns) {
      console.error('Error creando movimiento correcto:', movIns.message)
      process.exit(1)
    }
    if (level?.id) {
      await sb.from('stock_levels').update({
        quantity: after,
        updated_at: now,
        last_movement_at: now,
      }).eq('id', level.id)
    } else {
      await sb.from('stock_levels').insert({
        product_variant_id: vid,
        warehouse_id: wid,
        quantity: after,
        reserved: 0,
        updated_at: now,
        last_movement_at: now,
      })
    }
  }

  console.log('\n✓ Corrección aplicada. Revisa el stock y los movimientos desde la UI.')
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
