import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

// Cargar .env.local manualmente
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '')
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const out = {}

// Productos: todos los web_slug (visibles o no, para diagnóstico)
const { data: prods, error: pe } = await sb
  .from('products')
  .select('web_slug, is_active, is_visible_web')
if (pe) { console.error('products error', pe); process.exit(1) }
out.products = prods.map(p => ({ slug: p.web_slug, active: p.is_active, web: p.is_visible_web }))

// Categorías
const { data: cats, error: ce } = await sb
  .from('product_categories')
  .select('slug, name, is_visible_web')
if (ce) { console.error('cats error', ce) } else {
  out.categories = cats.map(c => ({ slug: c.slug, name: c.name, web: c.is_visible_web }))
}

writeFileSync(new URL('../scripts/_web-slugs.json', import.meta.url), JSON.stringify(out, null, 2))
console.log('PRODUCTS:', out.products.length, '| CATEGORIES:', (out.categories||[]).length)
console.log('sample product slugs:', out.products.slice(0,5).map(p=>p.slug))
console.log('sample category slugs:', (out.categories||[]).slice(0,10).map(c=>c.slug))
