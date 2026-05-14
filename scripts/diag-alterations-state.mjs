import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function count(table) {
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true })
  return error ? { error: error.message, code: error.code } : { count: count ?? 0 }
}
async function sample(table) {
  const { data, error } = await sb.from(table).select('*').limit(1)
  return error ? { error: error.message, code: error.code } : (data?.[0] ?? null)
}

console.log('=== boutique_alterations ===')
console.log('count:', await count('boutique_alterations'))
console.log('sample row:', JSON.stringify(await sample('boutique_alterations'), null, 2))

console.log('\n=== alterations (nueva) ===')
console.log('count:', await count('alterations'))
console.log('sample row:', JSON.stringify(await sample('alterations'), null, 2))

console.log('\n=== alteration_officials ===')
console.log('count:', await count('alteration_officials'))
console.log('sample row:', JSON.stringify(await sample('alteration_officials'), null, 2))

// Inspect column list of each by selecting one row, returning columns regardless
async function cols(table) {
  const { data, error } = await sb.from(table).select('*').limit(0)
  if (error) return { error: error.message }
  return { ok: true }
}
console.log('\n=== existencia ===')
console.log('alterations:', await cols('alterations'))
console.log('alteration_officials:', await cols('alteration_officials'))
