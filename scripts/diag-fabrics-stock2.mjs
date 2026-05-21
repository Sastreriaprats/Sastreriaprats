import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
for (const t of ['fabric_movements','fabrics_movements','fabric_stock_movements']) {
  const { data, error } = await sb.from(t).select('*').limit(1)
  console.log(t, '->', error ? `ERR ${error.message}` : (data?.[0] ? Object.keys(data[0]).join(',') : 'tabla existe, 0 filas'))
}
