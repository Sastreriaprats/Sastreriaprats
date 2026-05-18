import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data, error } = await sb
  .from('cash_sessions')
  .select('*')
  .eq('id', 'bf3139eb-a95b-492f-8558-2f3caee55720')
  .maybeSingle()
console.log('Error:', error)
console.log('Session:', JSON.stringify(data, null, 2))

if (data?.store_id) {
  const { data: store } = await sb.from('stores').select('name').eq('id', data.store_id).maybeSingle()
  console.log('\nStore:', store?.name)
}
const seller = data?.cashier_id ?? data?.opened_by ?? data?.user_id
if (seller) {
  const { data: prof } = await sb.from('profiles').select('full_name').eq('id', seller).maybeSingle()
  console.log('Vendedor:', prof?.full_name)
}
