#!/usr/bin/env node
// Aplica la migración 196: RPC fuzzy_search_ids (búsqueda difusa trigram).
// Intenta rpc(exec_sql); si no existe, imprime el SQL para pegar manualmente
// en Supabase Dashboard → SQL Editor.

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
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '196_rpc_fuzzy_search.sql')
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
  console.log('✔ Migración 196 aplicada. RPC fuzzy_search_ids disponible.')
  process.exit(0)
}

if (res.missing) {
  console.log('\n⚠ No existe rpc "exec_sql". Aplica este SQL en Supabase Dashboard → SQL Editor:\n')
  console.log('─'.repeat(70))
  console.log(sqlText)
  console.log('─'.repeat(70))
  process.exit(2)
}

console.error('✗ Error al aplicar:', res.error)
process.exit(1)
