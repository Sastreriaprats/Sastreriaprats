#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: buckets, error } = await sb.storage.listBuckets()
if (error) {
  console.error(error)
  process.exit(1)
}
const web = buckets.find((b) => b.name === 'web-content')
console.log('web-content bucket config:')
console.log(JSON.stringify(web, null, 2))
