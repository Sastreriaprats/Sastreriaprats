#!/usr/bin/env node
// Aplica la migración 231: tablas del motor de comisiones de vendedores.

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
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '231_commission_plans.sql')
const sqlText = readFileSync(sqlPath, 'utf8')

async function tryExecSql(sql) {
  const { error } = await sb.rpc('exec_sql', { sql })
  if (!error) return { ok: true }
  const code = error.code || ''
  const msg = String(error.message || '').toLowerCase()
  if (code === 'PGRST202' || (msg.includes('exec_sql') && msg.includes('not') && msg.includes('find'))) {
    return { ok: false, missing: true }
  }
  return { ok: false, error }
}

const res = await tryExecSql(sqlText)

if (res.ok) {
  console.log('✔ Migración 231 aplicada (commission_plans, commission_assignments, commission_group_bonuses + hijas + RLS).')
  process.exit(0)
}

if (res.missing) {
  console.log('\n⚠ No existe la función rpc "exec_sql". Aplica el SQL manualmente en Dashboard → SQL Editor.')
  process.exit(2)
}

console.error('Error inesperado ejecutando la migración:', res.error)
process.exit(1)
