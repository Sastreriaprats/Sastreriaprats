#!/usr/bin/env node
// Corrige el dato de PIN-2026-0302 (prenda #2, camisa duplicada):
// la ficha se editó a mano poniendo el tejido FM60564 (de fabricante, NO está
// en el catálogo `fabrics`), pero la línea conservaba el fabric_id heredado de
// la prenda original (AT00252 ROYAL BLANCA R38116), así que "Ref. tejido"
// seguía mostrando el tejido antiguo.
//
// Deja: fabric_id = NULL y configuration.tejidoStockId = '' (tejido no de stock).
// NO toca stock: los movimientos de fabric_stock_movements del pedido nunca
// descontaron metros por esta línea duplicada (verificado: neto 1,6 m, los de
// la prenda #1).
//
// Uso: node scripts/fix-pin-2026-0302-ref-tejido.mjs

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const LINE_ID = '23c91501-b7d5-4b18-bd9c-a5b2e0a4003f' // PIN-2026-0302, sort_order 1 (CAM2)

const { data: before, error: readErr } = await sb
  .from('tailoring_order_lines')
  .select('id, tailoring_order_id, fabric_id, fabric_description, fabric_meters, material_cost, configuration')
  .eq('id', LINE_ID)
  .single()
if (readErr || !before) {
  console.error('No se pudo leer la línea:', readErr)
  process.exit(1)
}

console.log('ANTES  fabric_id:', before.fabric_id)
console.log('ANTES  desc:', before.fabric_description)

// Guardarraíl: solo actuar si sigue el descuadre esperado.
if (!before.fabric_id) {
  console.log('La línea ya no tiene fabric_id: nada que hacer.')
  process.exit(0)
}
if (!String(before.fabric_description ?? '').includes('FM60564')) {
  console.error('La descripción ya no es la esperada (FM60564): abortado por seguridad.')
  process.exit(1)
}

const cfg = { ...(before.configuration ?? {}) }
cfg.tejidoStockId = ''

const { error: updErr } = await sb
  .from('tailoring_order_lines')
  .update({ fabric_id: null, configuration: cfg })
  .eq('id', LINE_ID)
if (updErr) {
  console.error('Error al actualizar:', updErr)
  process.exit(1)
}

const { data: after } = await sb
  .from('tailoring_order_lines')
  .select('id, fabric_id, fabric_description, fabric_meters, material_cost, configuration')
  .eq('id', LINE_ID)
  .single()

console.log('DESPUÉS fabric_id:', after.fabric_id)
console.log('DESPUÉS desc:', after.fabric_description, '| metros:', after.fabric_meters, '| material_cost:', after.material_cost)
console.log('DESPUÉS cfg tejido*:', JSON.stringify(
  Object.fromEntries(Object.entries(after.configuration ?? {}).filter(([k]) => /tejido/i.test(k))),
))
