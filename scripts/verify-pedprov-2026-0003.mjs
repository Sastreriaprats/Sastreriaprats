#!/usr/bin/env node
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: order } = await sb.from('supplier_orders').select('id').eq('order_number', 'PEDPROV-2026-0003').single()
const { data: movs } = await sb
  .from('stock_movements')
  .select('id, product_variant_id, warehouse_id, movement_type, quantity, stock_before, stock_after, reason, created_at')
  .eq('reference_id', order.id)
  .order('created_at', { ascending: true })

console.log('Movimientos del pedido (por orden cronológico):')
for (const m of movs || []) {
  const v = await sb.from('product_variants').select('size, variant_sku').eq('id', m.product_variant_id).single()
  console.log(`  ${m.created_at}  ${m.movement_type.padEnd(20)} ${String(m.quantity).padStart(4)}  talla=${v.data?.size ?? '?'}  stock: ${m.stock_before} → ${m.stock_after}  motivo="${m.reason ?? ''}"`)
}

// Stock actual en Wellington para las 4 variantes XS/M/L/XL del producto
const { data: product } = await sb.from('products').select('id').eq('sku', '01190').single()
const { data: variants } = await sb.from('product_variants').select('id, size').eq('product_id', product.id).in('size', ['XS','M','L','XL'])
const { data: wellington } = await sb.from('warehouses').select('id, name').ilike('name', '%wellington%').single()
console.log(`\nStock actual en ${wellington.name}:`)
for (const v of variants) {
  const { data: sl } = await sb.from('stock_levels').select('quantity').eq('product_variant_id', v.id).eq('warehouse_id', wellington.id).maybeSingle()
  console.log(`  ${v.size}: ${sl?.quantity ?? 0}`)
}
