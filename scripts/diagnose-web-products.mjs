#!/usr/bin/env node
// Diagnostica por qué productos marcados como is_visible_web=true
// pueden no estar apareciendo en /api/public/catalog.
//
// Uso:
//   node scripts/diagnose-web-products.mjs
//   node scripts/diagnose-web-products.mjs --sku 01277

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

const argSku = (() => {
  const i = process.argv.indexOf('--sku')
  return i >= 0 ? process.argv[i + 1] : null
})()

const today = new Date().toISOString().slice(0, 10)

// 1) Temporadas activas
const { data: seasonsRaw, error: seasonsErr } = await sb
  .from('seasons')
  .select('slug, name, is_active, start_date, end_date')

if (seasonsErr) {
  console.error('Error leyendo seasons:', seasonsErr.message)
  process.exit(1)
}

const activeSeasonSlugs = (seasonsRaw ?? [])
  .filter(r => r.is_active)
  .filter(r => (!r.start_date || r.start_date <= today) && (!r.end_date || r.end_date >= today))
  .map(r => r.slug)

console.log('Hoy:', today)
console.log('Temporadas en BD:')
for (const s of seasonsRaw ?? []) {
  const inDates = (!s.start_date || s.start_date <= today) && (!s.end_date || s.end_date >= today)
  const visible = s.is_active && inDates
  console.log(`  - slug="${s.slug}" name="${s.name}" active=${s.is_active} fechas=[${s.start_date}..${s.end_date}] visible=${visible}`)
}
console.log('\nSlugs activos visibles:', JSON.stringify(activeSeasonSlugs))
console.log()

// 2) Buscar producto concreto si se pidió
if (argSku) {
  const { data: p, error: e } = await sb
    .from('products')
    .select('id, sku, name, is_active, is_visible_web, season, category_id, web_slug, main_image_url, images')
    .eq('sku', argSku)
    .maybeSingle()
  if (e) {
    console.error('Error:', e.message)
    process.exit(1)
  }
  if (!p) {
    console.log(`No se encontró producto con sku=${argSku}`)
  } else {
    console.log(`Producto sku=${argSku}:`)
    console.log(JSON.stringify(p, null, 2))
    const pasaActivo = p.is_active === true
    const pasaWeb = p.is_visible_web === true
    const pasaSeason = !p.season || p.season === '' || activeSeasonSlugs.includes(p.season)
    console.log(`\n  ¿pasa is_active?       ${pasaActivo}`)
    console.log(`  ¿pasa is_visible_web?  ${pasaWeb}`)
    console.log(`  ¿pasa season?          ${pasaSeason}  (season="${p.season}")`)
  }
  console.log()
}

// 3) Listado de productos marcados is_visible_web=true que NO pasarían el filtro de temporada
const { data: candidates, error: candErr } = await sb
  .from('products')
  .select('id, sku, name, is_active, is_visible_web, season')
  .eq('is_visible_web', true)
  .eq('is_active', true)

if (candErr) {
  console.error('Error leyendo products:', candErr.message)
  process.exit(1)
}

const filtered = (candidates ?? []).filter(p => {
  if (!p.season || p.season === '') return false // estos sí aparecen
  return !activeSeasonSlugs.includes(p.season)
})

console.log(`Productos con is_active=true y is_visible_web=true: ${candidates?.length ?? 0}`)
console.log(`De esos, los que NO aparecen por filtro de temporada: ${filtered.length}`)
if (filtered.length) {
  // Agrupar por season
  const bySeason = new Map()
  for (const p of filtered) {
    if (!bySeason.has(p.season)) bySeason.set(p.season, [])
    bySeason.get(p.season).push(p)
  }
  for (const [season, list] of bySeason) {
    console.log(`\n  season="${season}"  (${list.length} productos)`)
    for (const p of list.slice(0, 20)) {
      console.log(`    sku=${p.sku}  name=${p.name}`)
    }
    if (list.length > 20) console.log(`    ... y ${list.length - 20} más`)
  }
}
