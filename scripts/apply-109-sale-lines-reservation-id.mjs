#!/usr/bin/env node
// Aplica la migración 109: añade sale_lines.reservation_id.
// Intenta exec_sql; si no existe, imprime el SQL para pegar en Dashboard.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '109_sale_lines_reservation_id.sql')
const sqlText = readFileSync(sqlPath, 'utf8')

const { error } = await sb.rpc('exec_sql', { sql: sqlText })
if (!error) {
  const probe = await sb.from('sale_lines').select('id,reservation_id').limit(1)
  if (probe.error) {
    console.error('exec_sql OK pero la columna sigue sin existir:', probe.error.message)
    process.exit(1)
  }
  console.log('✔ Migración 109 aplicada. sale_lines.reservation_id ya existe.')
  process.exit(0)
}

const code = error.code || ''
const msg = String(error.message || '').toLowerCase()
if (code === 'PGRST202' || (msg.includes('exec_sql') && msg.includes('not') && msg.includes('find'))) {
  console.log('\n⚠ No existe exec_sql en esta instancia. Pega este SQL en Supabase Dashboard → SQL Editor:\n')
  console.log('--- BEGIN SQL ---')
  console.log(sqlText)
  console.log('--- END SQL ---')
  process.exit(2)
}

console.error('Error inesperado:', error)
process.exit(1)
