#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: page } = await sb.from('cms_pages').select('id').eq('slug', 'home').single()
console.log('home page id:', page?.id)
const { data: hero, error } = await sb
  .from('cms_sections')
  .select('id, section_type, title_es, subtitle_es, settings, updated_at')
  .eq('page_id', page.id)
  .eq('section_type', 'hero')
  .single()
console.log('error:', error)
console.log('hero section:')
console.log(JSON.stringify(hero, null, 2))
