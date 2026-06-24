#!/usr/bin/env node
// Aplica la migración 243: columna `client_name` en `appointments` (nombre libre
// de un contacto que aún no es cliente). Intenta rpc(exec_sql); si no existe,
// imprime el SQL para pegar en Supabase Dashboard → SQL Editor.

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
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '243_appointment_guest_name.sql')
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
  // Verificación: forzar refresco de cache y comprobar la columna
  const { error: selErr } = await sb.from('appointments').select('client_name').limit(1)
  if (selErr) {
    console.log('✔ SQL ejecutado, pero la cache aún no refleja la columna. Espera unos segundos.')
  } else {
    console.log('✔ Migración 243 aplicada. Columna appointments.client_name disponible.')
  }
  process.exit(0)
}

if (res.missing) {
  console.log('\n⚠ No existe la función rpc "exec_sql" en esta instancia de Supabase.')
  console.log('Copia y pega el SIGUIENTE SQL en Supabase Dashboard → SQL Editor → RUN:\n')
  console.log('--- BEGIN SQL ---')
  console.log(sqlText)
  console.log('--- END SQL ---\n')
  process.exit(2)
}

console.error('Error inesperado ejecutando la migración:', res.error)
process.exit(1)
