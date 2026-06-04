import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] || '').trim().replace(/^["']|["']$/g, '')
const sb = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'))

const { data, error } = await sb.from('products').select('*').limit(1).single()
if (error) { console.error(error); process.exit(1) }
console.log('COLUMNAS products:')
console.log(Object.keys(data).join('\n'))
console.log('\n--- ejemplo de fila (valores) ---')
for (const [k,v] of Object.entries(data)) {
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  console.log(`${k}: ${s?.slice(0,80)}`)
}
