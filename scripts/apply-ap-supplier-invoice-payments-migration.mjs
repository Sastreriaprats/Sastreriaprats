#!/usr/bin/env node
// Aplica migración 113: crea tabla ap_supplier_invoice_payments + trigger recálculo.
//
// Estrategia:
//   1. Detecta si la tabla ya existe.
//   2. Si existe, nada que hacer.
//   3. Si no existe, intenta ejecutar el SQL vía rpc('exec_sql').
//   4. Si exec_sql no existe, imprime el SQL a pegar manualmente en el Supabase Dashboard.

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
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '113_ap_supplier_invoice_payments.sql')
const sqlText = readFileSync(sqlPath, 'utf8')

async function tableExists() {
  const { error } = await sb
    .from('ap_supplier_invoice_payments')
    .select('id')
    .limit(1)
  if (!error) return true
  const msg = String(error.message || '').toLowerCase()
  if (msg.includes('ap_supplier_invoice_payments') && (msg.includes('does not exist') || msg.includes('relation'))) {
    return false
  }
  // PGRST205 = relation missing en postgrest
  if (error.code === 'PGRST205' || error.code === '42P01') return false
  throw error
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

const exists = await tableExists()
if (exists) {
  console.log('✔ La tabla ap_supplier_invoice_payments ya existe. Nada que hacer.')
  process.exit(0)
}

console.log('• Tabla no encontrada. Intentando aplicar la migración vía rpc("exec_sql")...')
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
