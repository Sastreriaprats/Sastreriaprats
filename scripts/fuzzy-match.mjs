import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '')
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

// Traer TODOS los productos (paginando, por si hay >1000)
let all = [], from = 0
for (;;) {
  const { data, error } = await sb.from('products')
    .select('web_slug, name, migration_original_id, migration_batch, is_visible_web')
    .range(from, from + 999)
  if (error) { console.error(error); process.exit(1) }
  all.push(...data)
  if (data.length < 1000) break
  from += 1000
}
console.log('TOTAL productos en BBDD:', all.length)
console.log('con migration_original_id no nulo:', all.filter(p=>p.migration_original_id).length)
console.log('visibles web:', all.filter(p=>p.is_visible_web).length)

const stripNum = s => s.replace(/-\d+$/, '')
const baseMap = new Map() // base -> [slugs]
for (const p of all) {
  if (!p.web_slug) continue
  const b = stripNum(p.web_slug)
  if (!baseMap.has(b)) baseMap.set(b, [])
  baseMap.get(b).push({ slug: p.web_slug, web: p.is_visible_web })
}

const xml = readFileSync(join(tmpdir(), 'urls_xlsx', 'unz', 'xl', 'sharedStrings.xml'), 'utf8')
const urls = [...xml.matchAll(/https?:\/\/www\.sastreriaprats\.com[^<]*/g)].map(m => m[0])
const prodHandles = [...new Set(urls.filter(u => /\/products\/[^/?]+$/.test(u)).map(u => u.split('/products/')[1]))]

let uniq=0, multi=0, none=0
const noneList=[], multiList=[]
for (const h of prodHandles) {
  const cands = baseMap.get(h) || []
  if (cands.length === 1) uniq++
  else if (cands.length > 1) { multi++; multiList.push(h) }
  else { none++; noneList.push(h) }
}
console.log(`\nMATCH por base (handle == slug sin -NNN):`)
console.log(`  unico: ${uniq} | multiple(ambiguo): ${multi} | sin match: ${none} | total: ${prodHandles.length}`)
console.log('\n-- sin match (necesitan mapeo manual/fuzzy) --')
noneList.forEach(h=>console.log('  ',h))
console.log('\n-- ambiguos (varios productos misma base) --')
multiList.forEach(h=>console.log('  ',h, '->', baseMap.get(h).map(c=>c.slug).join(' , ')))
