import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

console.log('=== TOTAL CLIENTES ===')
const { count: totalClients } = await sb.from('clients').select('*', { count: 'exact', head: true })
console.log(`Total: ${totalClients}`)

console.log('\n=== DESGLOSE NEWSLETTER / MARKETING ===')
const cases = [
  ['newsletter_subscribed=true', { newsletter_subscribed: true }],
  ['accepts_marketing=true', { accepts_marketing: true }],
  ['newsletter=true AND marketing=true', { newsletter_subscribed: true, accepts_marketing: true }],
  ['email_bounced=true', { email_bounced: true }],
  ['is_active=true', { is_active: true }],
]
for (const [label, filt] of cases) {
  let q = sb.from('clients').select('*', { count: 'exact', head: true })
  for (const [k, v] of Object.entries(filt)) q = q.eq(k, v)
  const { count } = await q
  console.log(`  ${label}: ${count}`)
}

console.log('\n=== SUSCRIPTORES POR source ===')
const { data: bySource } = await sb.rpc('exec_sql_raw', { sql: '' }).then(() => ({ data: null })).catch(() => ({ data: null }))
// fallback: agrupar manualmente
const { data: rows } = await sb.from('clients').select('source').eq('newsletter_subscribed', true)
const grouped = {}
for (const r of rows || []) grouped[r.source ?? '(null)'] = (grouped[r.source ?? '(null)'] || 0) + 1
console.log(grouped)

console.log('\n=== TABLA email_campaigns - TOTAL & ÚLTIMAS 5 ===')
const { count: totalCamp } = await sb.from('email_campaigns').select('*', { count: 'exact', head: true })
console.log(`Total campañas: ${totalCamp}`)
const { data: campRows } = await sb.from('email_campaigns')
  .select('id, name, subject, status, segment, total_recipients, sent_count, delivered_count, opened_count, clicked_count, scheduled_at, sent_at, created_at')
  .order('created_at', { ascending: false })
  .limit(5)
console.log(JSON.stringify(campRows, null, 2))

console.log('\n=== TABLA email_campaigns - DESGLOSE POR STATUS ===')
const { data: statusRows } = await sb.from('email_campaigns').select('status')
const statusCount = {}
for (const r of statusRows || []) statusCount[r.status] = (statusCount[r.status] || 0) + 1
console.log(statusCount)

console.log('\n=== TABLA email_logs - TOTAL & TIPOS ===')
const { count: totalLogs } = await sb.from('email_logs').select('*', { count: 'exact', head: true })
console.log(`Total logs: ${totalLogs}`)
const { data: logRows } = await sb.from('email_logs').select('email_type, status')
const tEmail = {}
const tStatus = {}
for (const r of logRows || []) {
  tEmail[r.email_type] = (tEmail[r.email_type] || 0) + 1
  tStatus[r.status] = (tStatus[r.status] || 0) + 1
}
console.log('Por email_type:', tEmail)
console.log('Por status:', tStatus)

console.log('\n=== ÚLTIMA campaña enviada (sent_at más reciente) ===')
const { data: lastCamp } = await sb.from('email_campaigns')
  .select('id, name, subject, status, sent_at, sent_count, total_recipients, opened_count, delivered_count')
  .not('sent_at', 'is', null)
  .order('sent_at', { ascending: false })
  .limit(1)
console.log(JSON.stringify(lastCamp, null, 2))

console.log('\n=== TABLA email_templates - TOTAL ===')
const { data: tmpls, count: tmplCount } = await sb.from('email_templates')
  .select('code, name, category, is_active, updated_at', { count: 'exact' })
  .order('category')
  .order('name')
console.log(`Total plantillas: ${tmplCount}`)
console.log(JSON.stringify(tmpls, null, 2))

console.log('\n=== MIGRACIONES con "email" o "newsletter" o "marketing" ===')
const { data: mig } = await sb.from('migrations').select('id, name, applied_at').or('name.ilike.%email%,name.ilike.%newsletter%,name.ilike.%marketing%').order('applied_at', { ascending: false })
console.log(JSON.stringify(mig, null, 2))
