/**
 * FIX SKUs — Renombrar IMP-XXXXX a PRATS-XXXXX
 * npx tsx src/scripts/fix-skus.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim()
  }
}

loadEnv()

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function main(): Promise<void> {
  console.log('=== FIX SKUs: IMP- → PRATS- ===\n')

  // Contar antes
  const { count: prodCount } = await admin.from('products').select('id', { count: 'exact', head: true }).like('sku', 'IMP-%')
  const { count: varCount } = await admin.from('product_variants').select('id', { count: 'exact', head: true }).like('variant_sku', 'IMP-%')
  console.log(`  Productos con IMP-: ${prodCount}`)
  console.log(`  Variantes con IMP-: ${varCount}`)

  if (!prodCount && !varCount) {
    console.log('\n  Nada que cambiar.')
    return
  }

  // Actualizar productos en batches
  let prodUpdated = 0
  let offset = 0
  while (true) {
    const { data } = await admin.from('products').select('id, sku').like('sku', 'IMP-%').range(offset, offset + 499)
    if (!data || data.length === 0) break
    for (const p of data) {
      const newSku = p.sku.replace('IMP-', 'PRATS-')
      const { error } = await admin.from('products').update({ sku: newSku }).eq('id', p.id)
      if (error) {
        console.error(`  Error producto ${p.sku}: ${error.message}`)
      } else {
        prodUpdated++
      }
    }
    offset += data.length
    process.stdout.write(`\r  Productos: ${prodUpdated}/${prodCount}`)
    if (data.length < 500) break
  }
  console.log()

  // Actualizar variantes en batches
  let varUpdated = 0
  offset = 0
  while (true) {
    const { data } = await admin.from('product_variants').select('id, variant_sku').like('variant_sku', 'IMP-%').range(offset, offset + 499)
    if (!data || data.length === 0) break
    for (const v of data) {
      const newSku = v.variant_sku.replace('IMP-', 'PRATS-')
      const { error } = await admin.from('product_variants').update({ variant_sku: newSku }).eq('id', v.id)
      if (error) {
        console.error(`  Error variante ${v.variant_sku}: ${error.message}`)
      } else {
        varUpdated++
      }
    }
    offset += data.length
    process.stdout.write(`\r  Variantes: ${varUpdated}/${varCount}`)
    if (data.length < 500) break
  }
  console.log()

  // Verificar
  const { count: remaining } = await admin.from('products').select('id', { count: 'exact', head: true }).like('sku', 'IMP-%')
  console.log(`\n  Resultado:`)
  console.log(`    Productos actualizados: ${prodUpdated}`)
  console.log(`    Variantes actualizadas: ${varUpdated}`)
  console.log(`    Productos IMP- restantes: ${remaining}`)
}

main().catch(e => { console.error('Error:', e); process.exit(1) })
