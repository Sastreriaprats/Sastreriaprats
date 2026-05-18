import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

console.log('=== Pool elegible para autocomplete de newsletter ===')
const { count: pool } = await sb.from('products')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', true)
  .eq('is_visible_web', true)
  .not('web_slug', 'is', null)
  .not('main_image_url', 'is', null)
console.log(`Total: ${pool}`)

console.log('\n=== Inconsistencias ===')
const { count: visibleNoImg } = await sb.from('products')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', true)
  .eq('is_visible_web', true)
  .is('main_image_url', null)
console.log(`is_visible_web=true SIN main_image_url: ${visibleNoImg}`)

const { count: visibleNoSlug } = await sb.from('products')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', true)
  .eq('is_visible_web', true)
  .is('web_slug', null)
console.log(`is_visible_web=true SIN web_slug: ${visibleNoSlug}`)

const { count: slugNoVisible } = await sb.from('products')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', true)
  .eq('is_visible_web', false)
  .not('web_slug', 'is', null)
console.log(`Con web_slug pero is_visible_web=false: ${slugNoVisible}`)

const { count: visibleInactive } = await sb.from('products')
  .select('id', { count: 'exact', head: true })
  .eq('is_active', false)
  .eq('is_visible_web', true)
console.log(`is_visible_web=true pero is_active=false: ${visibleInactive}`)

console.log('\n=== Muestra de 5 elegibles (orden alfabetico) ===')
const { data: sample } = await sb.from('products')
  .select('id, name, web_title, main_image_url, web_slug, price_with_tax')
  .eq('is_active', true)
  .eq('is_visible_web', true)
  .not('web_slug', 'is', null)
  .not('main_image_url', 'is', null)
  .order('name')
  .limit(5)
for (const p of sample ?? []) {
  console.log(`- ${p.name}  (web_title: ${p.web_title ?? '—'})  slug=${p.web_slug}  price=${p.price_with_tax}`)
}
