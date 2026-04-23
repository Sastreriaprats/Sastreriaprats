#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: page } = await sb.from('cms_pages').select('id').eq('slug', 'home').single()
const { data: hero } = await sb.from('cms_sections').select('id, settings').eq('page_id', page.id).eq('section_type', 'hero').single()
const newSettings = { ...hero.settings, video_url: '' }
await sb.from('cms_sections').update({ settings: newSettings }).eq('id', hero.id)
console.log('reset done')
