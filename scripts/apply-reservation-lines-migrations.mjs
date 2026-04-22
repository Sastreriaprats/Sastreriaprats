#!/usr/bin/env node
// Aplica las migraciones 111 y 112 (reservas multi-línea).
// Si existe rpc('exec_sql'), las ejecuta directamente; si no, imprime el SQL
// para pegar en el Supabase Dashboard.

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
const files = [
  '111_reservation_lines.sql',
  '112_rpcs_reservation_lines.sql',
]

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

// Detecta si product_reservation_lines ya existe (migración 111 aplicada)
async function linesTableExists() {
  const { error } = await sb
    .from('product_reservation_lines')
    .select('id')
    .limit(1)
  if (!error) return true
  const msg = String(error.message || '').toLowerCase()
  if (msg.includes('relation') && msg.includes('does not exist')) return false
  if (msg.includes('product_reservation_lines')) return false
  throw error
}

async function main() {
  const already = await linesTableExists().catch(() => false)
  if (already) {
    console.log('ℹ product_reservation_lines ya existe. Aplicaré solo la 112 (RPCs).')
  }

  for (const file of files) {
    if (file.startsWith('111_') && already) continue
    const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', file)
    const sql = readFileSync(sqlPath, 'utf8')
    console.log(`\n→ Aplicando ${file}...`)
    const res = await tryExecSql(sql)
    if (res.ok) {
      console.log(`✔ ${file} aplicado`)
      continue
    }
    if (res.missing) {
      console.log(`\n⚠ La función exec_sql no está disponible. Pega estos SQL en Supabase Dashboard → SQL Editor:`)
      for (const f of files) {
        const p = resolve(__dirname, '..', 'supabase', 'migrations', f)
        console.log(`\n===== ${f} =====\n`)
        console.log(readFileSync(p, 'utf8'))
      }
      process.exit(2)
    }
    console.error(`Error aplicando ${file}:`, res.error)
    process.exit(1)
  }

  console.log('\n✔ Migraciones aplicadas correctamente.')
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
