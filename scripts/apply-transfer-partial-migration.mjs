#!/usr/bin/env node
// Aplica migración 124: añade 'partial' al enum transfer_status.
//
// Uso:
//   node scripts/apply-transfer-partial-migration.mjs

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
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '124_transfer_partial_status.sql')
const sqlText = readFileSync(sqlPath, 'utf8')

async function valueExists() {
  // Intenta actualizar una fila inexistente con status='partial'.
  // Si el valor existe en el enum, la query no fallará por tipo (0 rows afectadas, no error).
  // Si no existe, PostgreSQL devuelve error de tipo.
  const { error } = await sb
    .from('stock_transfers')
    .update({ status: 'partial' })
    .eq('id', '00000000-0000-0000-0000-000000000000')
  if (!error) return true
  const msg = String(error.message || '').toLowerCase()
  if (msg.includes('invalid input value for enum') || msg.includes('partial')) {
    return false
  }
  return true
}

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

const exists = await valueExists()
if (exists) {
  console.log('✔ El enum transfer_status ya incluye "partial". Nada que hacer.')
  process.exit(0)
}

console.log('• Valor "partial" no encontrado en el enum. Intentando aplicar la migración vía rpc("exec_sql")...')
const res = await tryExecSql(sqlText)

if (res.ok) {
  console.log('✔ Migración aplicada correctamente.')
  process.exit(0)
}

if (res.missing) {
  console.log('\n⚠ No existe la función rpc "exec_sql" en esta instancia de Supabase.')
  console.log('Copia y pega el siguiente SQL en el Supabase Dashboard → SQL Editor y ejecútalo:')
  console.log('\n--- BEGIN SQL ---')
  console.log(sqlText)
  console.log('--- END SQL ---\n')
  process.exit(2)
}

console.error('Error inesperado ejecutando la migración:', res.error)
process.exit(1)
