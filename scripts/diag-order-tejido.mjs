import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const ORDER_ID = '4ff5d270-c986-4183-946f-dddd88696034'

const { data: lines, error } = await sb
  .from('tailoring_order_lines')
  .select('id, line_type, garment_type_id, garment_types(name, code), fabric_id, fabric_meters, fabric_description, configuration')
  .eq('tailoring_order_id', ORDER_ID)
  .order('sort_order')

if (error) { console.error(error); process.exit(1) }

for (const l of lines) {
  console.log(`\n=== ${l.garment_types?.name} (${l.garment_types?.code}) line_type=${l.line_type} ===`)
  console.log(`  fabric_id: ${l.fabric_id ?? 'NULL'}`)
  console.log(`  fabric_meters: ${l.fabric_meters ?? 'NULL'}`)
  console.log(`  fabric_description: ${l.fabric_description ?? 'NULL'}`)
  const cfg = l.configuration ?? {}
  const tejidoKeys = Object.keys(cfg).filter(k =>
    /tejido|fabric|metros|tela/i.test(k)
  )
  console.log(`  configuration keys con 'tejido|fabric|metros|tela':`)
  if (tejidoKeys.length === 0) console.log('    (ninguna)')
  for (const k of tejidoKeys) console.log(`    ${k} = ${JSON.stringify(cfg[k])}`)
  // También sacamos algunas otras claves de configuration para entender el contexto
  const otras = Object.keys(cfg).filter(k => !tejidoKeys.includes(k)).slice(0, 8)
  console.log(`  otras claves (top 8): ${otras.join(', ')}`)
}
