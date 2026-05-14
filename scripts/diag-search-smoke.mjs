import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Replica el OR exacto que queryList genera con searchFields=['full_name','email','phone','document_number','client_code']
async function clientsLikeQueryList(term) {
  const conds = ['full_name', 'email', 'phone', 'document_number', 'client_code']
    .map(f => `${f}.ilike.%${term}%`).join(',')
  const { data, error, count } = await sb.from('clients').select('id, full_name', { count: 'exact' }).or(conds).limit(3)
  return { count, sample: data, error: error?.message }
}

console.log('--- clientes "is" ---')
console.log(await clientsLikeQueryList('is'))

console.log('\n--- clientes "ismael" ---')
console.log(await clientsLikeQueryList('ismael'))

console.log('\n--- products "va" (sku/name/barcode) ---')
const term = 'va'
const conds = ['sku', 'name', 'barcode'].map(f => `${f}.ilike.%${term}%`).join(',')
const { data, error, count } = await sb.from('products').select('id, sku, name', { count: 'exact' }).or(conds).limit(3)
console.log({ count, sample: data, error: error?.message })
