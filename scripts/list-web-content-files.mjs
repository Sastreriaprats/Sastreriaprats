#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data, error } = await sb.storage.from('web-content').list('home', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
if (error) { console.error(error); process.exit(1) }
for (const f of data) {
  console.log(`${f.created_at}  ${(f.metadata?.size / 1024 / 1024).toFixed(2) || '?'} MB  ${f.metadata?.mimetype || '?'}  ${f.name}`)
}
