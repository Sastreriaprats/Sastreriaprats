#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const VIDEO_URL = 'https://example.com/test-video.mp4'

const { data: page } = await sb.from('cms_pages').select('id').eq('slug', 'home').single()
const { data: hero } = await sb.from('cms_sections').select('id, settings').eq('page_id', page.id).eq('section_type', 'hero').single()

console.log('BEFORE settings:', hero.settings)

const newSettings = { ...hero.settings, video_url: VIDEO_URL }
console.log('WRITING:', newSettings)

const { error } = await sb.from('cms_sections').update({ settings: newSettings }).eq('id', hero.id)
if (error) { console.error('update error:', error); process.exit(1) }

const { data: after } = await sb.from('cms_sections').select('settings').eq('id', hero.id).single()
console.log('AFTER settings:', after.settings)
