#!/usr/bin/env node
// Crea la temporada CONTINUIDAD (sin fechas, siempre activa) y reasigna a ella
// los productos con is_visible_web=true cuya season actual queda fuera de
// fechas (filtro del catálogo web).
//
// Uso:
//   node scripts/fix-trapped-web-products.mjs           # dry-run
//   node scripts/fix-trapped-web-products.mjs --apply   # aplica cambios

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

const today = new Date().toISOString().slice(0, 10)
console.log('Hoy:', today, apply ? '· APPLY' : '· dry-run')

// 1) Asegurar que existe una temporada CONTINUIDAD en `seasons`
let { data: cont, error: e1 } = await sb
  .from('seasons')
  .select('id, name, slug, is_active, start_date, end_date')
  .eq('slug', 'continuidad')
  .maybeSingle()
if (e1) { console.error('Error consultando seasons:', e1.message); process.exit(1) }

if (!cont) {
  console.log('La temporada con slug="continuidad" NO existe.')
  if (!apply) {
    console.log('  → en --apply se creará: name="CONTINUIDAD", slug="continuidad", is_active=true, sin fechas')
  } else {
    // sort_order alto para que aparezca al final
    const { data: maxRow } = await sb.from('seasons').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const nextOrder = (maxRow?.sort_order ?? 0) + 1
    const { data: created, error: createErr } = await sb
      .from('seasons')
      .insert({
        name: 'CONTINUIDAD',
        slug: 'continuidad',
        is_active: true,
        start_date: null,
        end_date: null,
        sort_order: nextOrder,
        description: 'Productos disponibles todo el año (sin rotación de temporada)',
      })
      .select('id, name, slug')
      .single()
    if (createErr) { console.error('Error creando CONTINUIDAD:', createErr.message); process.exit(1) }
    cont = created
    console.log(`✔ Temporada CONTINUIDAD creada (id=${cont.id})`)
  }
} else {
  console.log(`✔ Ya existe temporada slug="continuidad" → name="${cont.name}", is_active=${cont.is_active}`)
  if (!cont.is_active && apply) {
    const { error: actErr } = await sb.from('seasons').update({ is_active: true, start_date: null, end_date: null }).eq('id', cont.id)
    if (actErr) console.error('  No se pudo activar:', actErr.message)
    else console.log('  → activada y sin fechas')
  }
}

// 2) Calcular slugs activos hoy según la lógica del catálogo público
const { data: allSeasons } = await sb
  .from('seasons')
  .select('slug, is_active, start_date, end_date')

const activeSlugs = (allSeasons ?? [])
  .filter(s => s.is_active)
  .filter(s => (!s.start_date || s.start_date <= today) && (!s.end_date || s.end_date >= today))
  .map(s => s.slug)

console.log('\nSlugs visibles hoy:', JSON.stringify(activeSlugs))

// 3) Encontrar productos atrapados (is_active && is_visible_web && season fuera de slugs activos)
const { data: prods, error: e2 } = await sb
  .from('products')
  .select('id, sku, name, season')
  .eq('is_active', true)
  .eq('is_visible_web', true)

if (e2) { console.error('Error consultando products:', e2.message); process.exit(1) }

const trapped = (prods ?? []).filter(p => {
  if (!p.season) return false // los NULL/'' siempre aparecen
  return !activeSlugs.includes(p.season)
})

console.log(`\nProductos visibles para web atrapados por temporada: ${trapped.length}`)
const bySeason = new Map()
for (const p of trapped) {
  if (!bySeason.has(p.season)) bySeason.set(p.season, [])
  bySeason.get(p.season).push(p)
}
for (const [season, list] of bySeason) {
  console.log(`  season="${season}":`)
  for (const p of list) console.log(`    - ${p.sku}  ${p.name}`)
}

if (trapped.length === 0) {
  console.log('\nNada que reasignar. ✔')
  process.exit(0)
}

// 4) Reasignarlos a 'continuidad'
if (!apply) {
  console.log('\nDry-run. Para aplicar:')
  console.log('  node scripts/fix-trapped-web-products.mjs --apply')
  process.exit(0)
}

const ids = trapped.map(p => p.id)
const { error: updErr, count } = await sb
  .from('products')
  .update({ season: 'continuidad' }, { count: 'exact' })
  .in('id', ids)

if (updErr) { console.error('Error reasignando productos:', updErr.message); process.exit(1) }

console.log(`\n✔ Reasignados ${count ?? ids.length} productos a season="continuidad"`)

// 5) Verificación final
const { data: prods2 } = await sb
  .from('products')
  .select('id, sku, name, season')
  .eq('is_active', true)
  .eq('is_visible_web', true)

const stillTrapped = (prods2 ?? []).filter(p => {
  if (!p.season) return false
  return !activeSlugs.includes(p.season) && p.season !== 'continuidad'
})

console.log(`\nVerificación: productos atrapados restantes = ${stillTrapped.length}`)
for (const p of stillTrapped) console.log(`  - ${p.sku} season="${p.season}"  ${p.name}`)
