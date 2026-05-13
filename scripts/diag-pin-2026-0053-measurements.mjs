import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: order } = await sb.from('tailoring_orders').select('id, client_id, clients(full_name)').eq('order_number', 'PIN-2026-0053').single()
console.log('Order:', order)
if (!order) process.exit(0)

const { data: ms } = await sb.from('client_measurements')
  .select('id, garment_type_id, garment_types(code), is_current, version, values')
  .eq('client_id', order.client_id)
  .order('garment_type_id')
  .order('version', { ascending: false })

console.log('\nClient measurements rows:', ms?.length)
for (const m of ms ?? []) {
  console.log(`\n--- garment=${m.garment_types?.code} is_current=${m.is_current} v=${m.version} id=${m.id}`)
  const v = m.values || {}
  const pantalonKeys = Object.keys(v).filter(k => k.startsWith('pantalon') || ['cintura','rodilla','largo','tiro','cadera','bajo','muslo'].includes(k))
  console.log('Pantalon-related keys:', pantalonKeys)
  for (const k of pantalonKeys) console.log(`   ${k}:`, v[k])
}
