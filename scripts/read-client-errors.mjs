// Lee los últimos errores de cliente capturados por la telemetría (mig 202).
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data, error } = await sb
  .from('client_error_log')
  .select('created_at, source, error_message, user_agent, context')
  .order('created_at', { ascending: false })
  .limit(10)

if (error) { console.error('ERROR:', error.message); process.exit(1) }

console.log(`Filas: ${data?.length ?? 0}\n`)
for (const r of data ?? []) {
  console.log('────────────────────────────────────────')
  console.log('created_at   :', r.created_at)
  console.log('source       :', r.source)
  console.log('error_message:', r.error_message)
  console.log('user_agent   :', r.user_agent)
  console.log('context      :', JSON.stringify(r.context, null, 2))
}
