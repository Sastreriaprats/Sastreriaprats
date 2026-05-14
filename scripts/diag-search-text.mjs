import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function check(table) {
  // Pedir un select con search_text. Si la columna no existe, PostgREST devuelve error.
  const { data, error } = await sb.from(table).select('id, search_text').limit(1)
  if (error) {
    console.log(`[${table}] ERROR:`, error.message)
    return { exists: false, sample: null }
  }
  return { exists: true, sample: data?.[0] ?? null }
}

async function countAll(table) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true })
  return error ? `ERROR ${error.message}` : count
}

console.log('=== ¿Existe search_text?  ===\n')
for (const t of ['clients', 'products', 'suppliers', 'vouchers', 'fabrics', 'ap_supplier_invoices']) {
  const res = await check(t)
  const total = await countAll(t)
  console.log(`[${t}]  existe=${res.exists}  total_filas=${total}  sample.search_text="${res.sample?.search_text ?? '(null)'}"`)
}

// Prueba de búsqueda real con "is" sobre clients
console.log('\n=== Prueba: clients.ilike("search_text", "%is%") ===')
const { data: d1, error: e1 } = await sb.from('clients').select('id, full_name, search_text').ilike('search_text', '%is%').limit(3)
console.log('error:', e1?.message ?? 'none')
console.log('rows:', d1?.length ?? 0)
if (d1?.length) for (const r of d1) console.log(`  ${r.full_name}  →  search_text="${r.search_text}"`)

// Misma prueba pero con full_name directo (como referencia)
console.log('\n=== Prueba: clients.ilike("full_name", "%is%") ===')
const { data: d2, error: e2 } = await sb.from('clients').select('id, full_name').ilike('full_name', '%is%').limit(3)
console.log('error:', e2?.message ?? 'none')
console.log('rows:', d2?.length ?? 0)
if (d2?.length) for (const r of d2) console.log(`  ${r.full_name}`)
