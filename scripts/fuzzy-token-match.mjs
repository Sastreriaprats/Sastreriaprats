import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '')
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

let all = [], from = 0
for (;;) {
  const { data, error } = await sb.from('products').select('web_slug, is_visible_web').range(from, from + 999)
  if (error) { console.error(error); process.exit(1) }
  all.push(...data); if (data.length < 1000) break; from += 1000
}
// solo destinos visibles en web
const targets = all.filter(p => p.is_visible_web && p.web_slug)
const toks = s => new Set(s.replace(/-\d+$/, '').split('-').filter(t => t && !['de','el','la','y','con','copia'].includes(t)))
const tgt = targets.map(p => ({ slug: p.web_slug, t: toks(p.web_slug) }))

const xml = readFileSync(join(tmpdir(), 'urls_xlsx', 'unz', 'xl', 'sharedStrings.xml'), 'utf8')
const urls = [...xml.matchAll(/https?:\/\/www\.sastreriaprats\.com[^<]*/g)].map(m => m[0])
const prodHandles = [...new Set(urls.filter(u => /\/products\/[^/?]+$/.test(u)).map(u => u.split('/products/')[1]))]

const score = (a, b) => { let i=0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i) } // Jaccard

const rows = []
for (const h of prodHandles) {
  const ht = toks(h)
  let best=null, bestS=0, second=0
  for (const t of tgt) { const s = score(ht, t.t); if (s>bestS){second=bestS;bestS=s;best=t.slug} else if(s>second){second=s} }
  rows.push({ handle:h, best, score:+bestS.toFixed(2), gap:+(bestS-second).toFixed(2) })
}
const hi = rows.filter(r=>r.score>=0.8)
const mid = rows.filter(r=>r.score>=0.5 && r.score<0.8)
const lo = rows.filter(r=>r.score<0.5)
console.log(`Sugerencias por similitud (destinos = ${targets.length} visibles):`)
console.log(`  ALTA (>=0.80): ${hi.length}  | MEDIA (0.50-0.79): ${mid.length}  | BAJA (<0.50): ${lo.length}`)
console.log('\n-- MEDIA (revisar) ejemplos --')
mid.slice(0,15).forEach(r=>console.log(`  ${r.handle}  ->  ${r.best}  (${r.score})`))
console.log('\n-- BAJA (probablemente sin equivalente / descatalogado) --')
lo.forEach(r=>console.log(`  ${r.handle}  (mejor ${r.score}: ${r.best})`))

writeFileSync(new URL('./_redirect-suggestions.csv', import.meta.url),
  'shopify_handle,sugerencia_slug_nuevo,score,gap,confianza\n' +
  rows.map(r=>`${r.handle},${r.best||''},${r.score},${r.gap},${r.score>=0.8?'ALTA':r.score>=0.5?'MEDIA':'BAJA'}`).join('\n'))
console.log('\nCSV escrito: scripts/_redirect-suggestions.csv')
