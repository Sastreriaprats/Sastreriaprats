#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: '.env.local' })

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)
const box = (t) => console.log('\n' + '='.repeat(70) + '\n  ' + t + '\n' + '='.repeat(70))

box('Conteo de tejidos en tabla fabrics')
{
  const { count, error } = await sb.from('fabrics').select('*', { count: 'exact', head: true })
  console.log('  total fabrics:', count, error?.message ?? '')
  const { count: act } = await sb.from('fabrics').select('*', { count: 'exact', head: true }).eq('is_active', true)
  console.log('  activos      :', act)
  const { data: low } = await sb.from('fabrics').select('id, name, fabric_code, stock_meters, min_stock_meters').not('min_stock_meters', 'is', null)
  const bajo = (low ?? []).filter(f => Number(f.stock_meters) < Number(f.min_stock_meters))
  console.log('  por debajo de stock mínimo:', bajo.length)
  for (const f of bajo.slice(0, 5)) {
    console.log(`    - ${f.fabric_code ?? '—'}  ${f.name}  stock=${f.stock_meters}  min=${f.min_stock_meters}`)
  }
}

box('¿Hay también productos en products con product_type=tailoring_fabric?')
{
  const { count } = await sb.from('products').select('*', { count: 'exact', head: true }).eq('product_type', 'tailoring_fabric')
  console.log('  products.product_type=tailoring_fabric:', count)
  if (count && count > 0) {
    const { data } = await sb.from('products').select('id, sku, name').eq('product_type', 'tailoring_fabric').limit(5)
    for (const p of data ?? []) console.log(`    - ${p.sku} ${p.name}`)
  }
}

box('Estructura de stock_movements (existente, para productos)')
{
  const { data } = await sb.from('stock_movements').select('*').limit(1)
  if (data && data[0]) {
    console.log('  columnas:', Object.keys(data[0]).join(', '))
  } else {
    console.log('  (sin filas o sin acceso)')
  }
}

box('¿Existe alguna tabla *fabric*movements*?')
{
  const candidates = ['fabric_movements', 'fabrics_movements', 'fabric_stock_movements']
  for (const t of candidates) {
    const { error } = await sb.from(t).select('*', { head: true, count: 'exact' })
    console.log(`  ${t}:`, error ? `NO existe (${error.code ?? error.message?.slice(0,30)})` : 'EXISTE')
  }
}

box('Muestra de 5 fabrics con stock')
{
  const { data } = await sb.from('fabrics')
    .select('id, fabric_code, name, stock_meters, reserved_meters, min_stock_meters, is_active, supplier_id')
    .order('stock_meters', { ascending: false })
    .limit(5)
  for (const f of data ?? []) {
    console.log(`  - ${f.fabric_code ?? '—'}  ${f.name}  stock=${f.stock_meters}m  reservado=${f.reserved_meters}m  min=${f.min_stock_meters ?? '—'}  activo=${f.is_active}`)
  }
}
