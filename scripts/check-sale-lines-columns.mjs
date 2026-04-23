#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan credenciales')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

// Intento 1: leer un row cualquiera para ver columnas
const { data, error } = await sb.from('sale_lines').select('*').limit(1)
if (error) {
  console.error('Error select sale_lines:', error)
} else if (data && data.length) {
  console.log('Columnas sale_lines:', Object.keys(data[0]).sort())
} else {
  console.log('sale_lines vacía — intento otra consulta')
  const probe = await sb.from('sale_lines').select('reservation_id,reservation_line_id').limit(1)
  console.log('probe reservation_id/line_id error?:', probe.error?.message || 'OK')
}

// Compruebo product_reservation_lines
const prl = await sb.from('product_reservation_lines').select('id').limit(1)
console.log('product_reservation_lines existe?:', prl.error?.message || 'OK (count=' + (prl.data?.length ?? 0) + ')')

// Qué devuelve el rpc
const probe2 = await sb.from('sale_lines').select('id,reservation_id').limit(1)
console.log('probe reservation_id solo:', probe2.error?.message || 'OK')

const probe3 = await sb.from('sale_lines').select('id,reservation_line_id').limit(1)
console.log('probe reservation_line_id solo:', probe3.error?.message || 'OK')
