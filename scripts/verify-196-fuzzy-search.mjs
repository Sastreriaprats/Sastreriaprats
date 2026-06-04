#!/usr/bin/env node
// Verifica el RPC fuzzy_search_ids (mig. 196) vía la API REST (cliente JS con
// service role). Ejecutar DESPUÉS de aplicar el SQL en Supabase Dashboard.
//   node scripts/verify-196-fuzzy-search.mjs

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✔ ${name} ${extra}`) }
  else { fail++; console.log(`  ✗ ${name} ${extra}`) }
}

async function rpc(p_table, p_term, p_limit = 10) {
  return sb.rpc('fuzzy_search_ids', { p_table, p_term, p_limit })
}

console.log('Verificando fuzzy_search_ids (mig. 196)…\n')

// 0) ¿Existe el RPC?
{
  const { error } = await rpc('clients', 'aa', 1)
  if (error && (error.code === 'PGRST202' || /could not find/i.test(error.message))) {
    console.log('✗ El RPC no existe todavía. Aplica supabase/migrations/196_rpc_fuzzy_search.sql')
    console.log('  en Supabase Dashboard → SQL Editor y vuelve a ejecutar este script.')
    process.exit(2)
  }
}

// 1) Término <2 chars → 0 filas (ruido).
{
  const { data, error } = await rpc('clients', 'a', 50)
  ok('término de 1 char devuelve 0 filas', !error && (data?.length ?? 0) === 0)
}

// 2) Tabla no permitida → excepción.
{
  const { error } = await rpc('users', 'jose', 5)
  ok('tabla no permitida lanza error', !!error, error ? `(${error.message.slice(0, 40)})` : '(sin error!)')
}

// 3) Inyección: término con comillas/paréntesis no rompe (bindeado).
{
  const { error } = await rpc('clients', "a')-- drop", 5)
  ok('término con comillas no rompe', !error, error ? `(${error.message.slice(0, 40)})` : '')
}

// 4) Scores descendentes y >0.
{
  const { data, error } = await rpc('clients', 'jose', 20)
  const scores = (data ?? []).map((r) => r.score)
  const desc = scores.every((s, i) => i === 0 || scores[i - 1] >= s)
  ok('"jose" devuelve resultados', !error && (data?.length ?? 0) > 0, `(${data?.length ?? 0} ids)`)
  ok('scores ordenados desc y > 0', desc && scores.every((s) => s > 0))
}

// 5) Tolerancia a erratas: comparar un nombre real con una versión con errata.
//    Cogemos un cliente real, le quitamos una letra y comprobamos que aún aparece.
{
  const { data: someClient } = await sb.from('clients').select('id, first_name').not('first_name', 'is', null).limit(1)
  const name = someClient?.[0]?.first_name
  if (name && name.length >= 5) {
    const typo = name.slice(0, 2) + name.slice(3) // quita la 3ª letra
    const { data, error } = await rpc('clients', typo, 50)
    const found = (data ?? []).some((r) => r.id === someClient[0].id)
    ok(`errata "${typo}" encuentra a "${name}"`, !error && found, found ? '' : '(no encontrado — revisar umbral)')
  } else {
    console.log('  · (sin cliente de prueba con nombre ≥5 chars; salto test de errata)')
  }
}

console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} ok, ${fail} fallos`)
process.exit(fail === 0 ? 0 : 1)
