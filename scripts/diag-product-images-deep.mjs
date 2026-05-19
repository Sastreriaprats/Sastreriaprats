#!/usr/bin/env node
// Para cada producto visible en web:
//   - lista si está sin URL
//   - si tiene URL, hace HEAD y reporta cuáles fallan (404, etc.)
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data } = await sb
  .from('products')
  .select('id, sku, name, web_slug, main_image_url, images')
  .eq('is_active', true)
  .eq('is_visible_web', true)

const sinUrl = []
const conUrlRota = []
const okCount = { total: 0 }

async function head(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' })
    return r.status
  } catch (e) {
    return `ERR:${e.message}`
  }
}

let i = 0
for (const p of data ?? []) {
  i++
  const imgs = Array.isArray(p.images) ? p.images : []
  const url = p.main_image_url || imgs[0]
  if (!url) {
    sinUrl.push(p)
    continue
  }
  const status = await head(url)
  if (status !== 200) {
    conUrlRota.push({ ...p, _status: status, _url: url })
  } else {
    okCount.total++
  }
  if (i % 25 === 0) console.error(`  procesados ${i}/${data.length}...`)
}

console.log(`\n=== RESUMEN ===`)
console.log(`Total visibles en web:        ${data.length}`)
console.log(`OK (imagen carga):            ${okCount.total}`)
console.log(`Sin URL en BD:                ${sinUrl.length}`)
console.log(`Con URL pero archivo roto:    ${conUrlRota.length}`)

if (sinUrl.length) {
  console.log(`\n--- SIN URL EN BD ---`)
  for (const p of sinUrl) {
    console.log(`  sku=${p.sku}  slug=${p.web_slug}  ${p.name}`)
  }
}
if (conUrlRota.length) {
  console.log(`\n--- CON URL PERO ARCHIVO ROTO ---`)
  for (const p of conUrlRota) {
    console.log(`  sku=${p.sku}  status=${p._status}`)
    console.log(`    slug: ${p.web_slug}`)
    console.log(`    url:  ${p._url}`)
  }
}
