import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Truco: hacemos un INSERT que falla a propósito con valores inválidos para que el error nos revele columnas.
// Mejor: usamos PostgREST's resource representation hint enviando un select específico, capturando el mensaje.

async function describeColumns(table) {
  // PostgREST devuelve un error con la lista de columnas si pides una que no existe.
  const { error } = await sb.from(table).select('__nonexistent_column__').limit(1)
  return error?.message ?? '(no error — column existed)'
}

console.log('--- alterations columns hint ---')
console.log(await describeColumns('alterations'))

console.log('\n--- alteration_officials columns hint ---')
console.log(await describeColumns('alteration_officials'))

console.log('\n--- boutique_alterations columns hint ---')
console.log(await describeColumns('boutique_alterations'))

// Otra técnica: insertar fila vacía → muestra columnas requeridas
async function tryInsert(table) {
  const { error } = await sb.from(table).insert({}).select()
  return error
}
console.log('\n--- alterations required (insert {} error) ---')
console.log(await tryInsert('alterations'))

console.log('\n--- alteration_officials required (insert {} error) ---')
console.log(await tryInsert('alteration_officials'))
