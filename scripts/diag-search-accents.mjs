import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

function normalize(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

async function search(term) {
  const norm = normalize(term)
  const { data, count, error } = await sb
    .from('clients')
    .select('id, full_name', { count: 'exact' })
    .ilike('search_text', `%${norm}%`)
    .limit(5)
  return { term, norm, count, error: error?.message, sample: data?.map(r => r.full_name) }
}

// Acid tests
console.log(await search('ismael'))      // should match ISMAEL MIRÓ
console.log(await search('ismaél'))      // with accent → should match too
console.log(await search('jose'))        // should match José/Joseph etc.
console.log(await search('JOSÉ'))        // with case+accent → should match
console.log(await search('JOAQUIN'))     // ALL CAPS
