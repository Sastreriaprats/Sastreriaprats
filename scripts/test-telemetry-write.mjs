// Test 1: escritura/lectura básica en client_error_log vía service-role (= lo que
// hace logClientError en la capa de BD). Inserta payload de prueba, lo lee, valida
// campos + context jsonb, y BORRA la fila. Ejecutar tras aplicar la migración 202.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

let failed = 0
const check = (n, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) failed++ }

// 1) ¿Existe la tabla? (si no, la 202 no está aplicada)
const probe = await sb.from('client_error_log').select('id').limit(1)
if (probe.error) {
  console.error('La tabla client_error_log no responde:', probe.error.message)
  console.error('-> ¿Has aplicado la migración 202 en el Dashboard?')
  process.exit(2)
}

// 2) Insertar payload de prueba (mismo shape que logClientError)
const ins = await sb.from('client_error_log').insert({
  user_id: null,
  source: 'test_telemetry',
  error_message: 'prueba',
  user_agent: 'tsx-headless-test',
  context: { foo: 1 },
}).select('*').single()

check('insert OK', !ins.error && !!ins.data?.id)
if (ins.error) { console.error(ins.error.message); process.exit(1) }
const id = ins.data.id

// 3) Leer y validar
const read = await sb.from('client_error_log').select('*').eq('source', 'test_telemetry')
check('select devuelve 1 fila', read.data?.length === 1)
const row = read.data?.[0]
check('source = test_telemetry', row?.source === 'test_telemetry')
check('error_message = prueba', row?.error_message === 'prueba')
check('user_agent persistido', row?.user_agent === 'tsx-headless-test')
check('context jsonb roundtrip {foo:1}', row?.context?.foo === 1)
check('created_at presente', !!row?.created_at)
check('user_id null aceptado', row?.user_id === null)

// 4) Borrar la fila de prueba y confirmar
const del = await sb.from('client_error_log').delete().eq('id', id)
check('delete OK', !del.error)
const after = await sb.from('client_error_log').select('id').eq('source', 'test_telemetry')
check('fila de prueba borrada (0 restantes)', after.data?.length === 0)

console.log(failed === 0 ? '\nTEST 1: PASS' : `\nTEST 1: FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
