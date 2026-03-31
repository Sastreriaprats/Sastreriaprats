/**
 * FIX PRICES — Actualiza price_with_tax directamente desde el PVP1 del Excel.
 * Requiere que la migración 082 ya se haya ejecutado (price_with_tax no-GENERATED).
 *
 * npx tsx src/scripts/fix-prices.ts
 * npx tsx src/scripts/fix-prices.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const DRY_RUN = process.argv.includes('--dry-run')
const FILE_PATH = 'C:/Users/USUARIO/Downloads/BBDD ARTICULOS ULTIMA VERSION.xlsx'
const SHEET_NAME = 'ARTICULOS POWER SHOP'

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
  console.log(`=== FIX PRICES ${DRY_RUN ? '(DRY-RUN)' : ''} ===\n`)

  if (!fs.existsSync(FILE_PATH)) {
    console.error(`Archivo no encontrado: ${FILE_PATH}`)
    process.exit(1)
  }

  const wb = XLSX.readFile(FILE_PATH)
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[SHEET_NAME], { defval: null })

  // Agrupar por CODIGO — tomar PVP1 de la primera fila de cada grupo
  const pvpMap = new Map<string, number>()
  for (const row of rows) {
    const codigo = row['CODIGO']
    if (!codigo) continue
    const key = String(codigo)
    if (pvpMap.has(key)) continue
    const pvp = row['PVP1']
    if (typeof pvp === 'number' && pvp > 0) {
      pvpMap.set(key, pvp)
    }
  }

  console.log(`  Productos únicos con PVP en Excel: ${pvpMap.size}`)

  // Cargar productos importados de la BD (paginar para obtener todos)
  let products: { id: string; sku: string; base_price: number; price_with_tax: number | null }[] = []
  let offset = 0
  while (true) {
    const { data } = await admin
      .from('products')
      .select('id, sku, base_price, price_with_tax')
      .like('sku', 'IMP-%')
      .range(offset, offset + 999)
    if (!data || data.length === 0) break
    products = products.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }

  if (!products || products.length === 0) {
    console.log('  No se encontraron productos importados.')
    process.exit(0)
  }

  console.log(`  Productos importados en BD: ${products.length}`)

  let updated = 0
  let skipped = 0
  let alreadyCorrect = 0
  const mismatches: { sku: string; current: number; expected: number }[] = []

  for (const prod of products) {
    // Extraer CODIGO del SKU: IMP-00001 → 1
    const codigoStr = prod.sku.replace('IMP-', '').replace(/^0+/, '')
    const pvp = pvpMap.get(codigoStr)

    if (!pvp) {
      skipped++
      continue
    }

    // Comparar
    if (prod.price_with_tax !== null && Math.abs(prod.price_with_tax - pvp) < 0.01) {
      alreadyCorrect++
      continue
    }

    mismatches.push({
      sku: prod.sku,
      current: prod.price_with_tax ?? 0,
      expected: pvp,
    })

    if (!DRY_RUN) {
      await admin
        .from('products')
        .update({ price_with_tax: pvp })
        .eq('id', prod.id)
      updated++
    }
  }

  console.log(`\n  Resultados:`)
  console.log(`    Ya correctos: ${alreadyCorrect}`)
  console.log(`    A corregir: ${mismatches.length}`)
  console.log(`    Sin PVP en Excel: ${skipped}`)
  if (!DRY_RUN) console.log(`    Actualizados: ${updated}`)

  if (mismatches.length > 0) {
    console.log(`\n  Primeros 10 desajustes:`)
    for (const m of mismatches.slice(0, 10)) {
      console.log(`    ${m.sku}: BD=${m.current} → Excel=${m.expected} (diff=${(m.expected - m.current).toFixed(2)})`)
    }
    if (mismatches.length > 10) {
      console.log(`    ... y ${mismatches.length - 10} más`)
    }
  }

  if (DRY_RUN) {
    console.log('\n  Dry-run completado. Ningún dato modificado.')
  } else {
    console.log('\n  Corrección completada.')
  }
}

main().catch(e => { console.error('Error:', e); process.exit(1) })
