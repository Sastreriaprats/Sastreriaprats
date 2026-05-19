#!/usr/bin/env node
// Diagnostica el estado de las imágenes de productos visibles en la web.
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

const arg = process.argv[2]

if (arg && arg.startsWith('--name=')) {
  const name = arg.slice('--name='.length)
  const { data, error } = await sb
    .from('products')
    .select('id, sku, name, web_slug, is_active, is_visible_web, main_image_url, images')
    .ilike('name', `%${name}%`)
    .limit(10)
  if (error) { console.error(error); process.exit(1) }
  console.log(`Encontrados: ${data?.length ?? 0}`)
  for (const p of data ?? []) {
    console.log('---')
    console.log('sku:', p.sku)
    console.log('name:', p.name)
    console.log('slug:', p.web_slug)
    console.log('is_active:', p.is_active, 'is_visible_web:', p.is_visible_web)
    console.log('main_image_url:', p.main_image_url)
    console.log('images:', JSON.stringify(p.images))
  }
  process.exit(0)
}

// Resumen: cuántos productos visibles en web tienen / no tienen imágenes
const { data, error } = await sb
  .from('products')
  .select('id, sku, name, web_slug, main_image_url, images')
  .eq('is_active', true)
  .eq('is_visible_web', true)

if (error) { console.error(error); process.exit(1) }

const total = data?.length ?? 0
let sinMain = 0
let sinImages = 0
let sinNada = 0
const ejemplosSinNada = []
for (const p of data ?? []) {
  const tieneMain = !!p.main_image_url
  const imgs = Array.isArray(p.images) ? p.images : []
  const tieneImgs = imgs.length > 0
  if (!tieneMain) sinMain++
  if (!tieneImgs) sinImages++
  if (!tieneMain && !tieneImgs) {
    sinNada++
    if (ejemplosSinNada.length < 10) ejemplosSinNada.push(p)
  }
}
console.log(`Total productos activos+visibles web: ${total}`)
console.log(`Sin main_image_url:                   ${sinMain}`)
console.log(`Sin images[]:                         ${sinImages}`)
console.log(`Sin NINGUNA imagen:                   ${sinNada}`)
console.log('')
if (ejemplosSinNada.length) {
  console.log('Ejemplos sin ninguna imagen:')
  for (const p of ejemplosSinNada) {
    console.log(`  sku=${p.sku}  slug=${p.web_slug}  name=${p.name}`)
  }
}

// Muestra de los que sí tienen imagen (¿son URLs válidas?)
const conImagen = (data ?? []).filter(p => p.main_image_url).slice(0, 5)
if (conImagen.length) {
  console.log('\nMuestra con main_image_url:')
  for (const p of conImagen) {
    console.log(`  sku=${p.sku}  url=${p.main_image_url}`)
  }
}
