#!/usr/bin/env node
// Activa free_shipping=true en el cupón '4444' (creado antes del cambio).

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

const { data, error } = await sb
  .from('discount_codes')
  .update({ free_shipping: true, updated_at: new Date().toISOString() })
  .eq('code', '4444')
  .select('id, code, free_shipping')

if (error) {
  console.error('Error:', error)
  process.exit(1)
}

if (!data || data.length === 0) {
  console.error('No se encontró cupón con code=4444')
  process.exit(1)
}

console.log('✔ Cupón actualizado:', data[0])
