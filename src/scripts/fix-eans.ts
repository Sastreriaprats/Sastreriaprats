/**
 * FIX EANS — Reasignar EANs originales del Excel a las variantes nuevas
 * npx tsx src/scripts/fix-eans.ts
 * npx tsx src/scripts/fix-eans.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import { sortBySize } from '../lib/utils/sort-sizes'

// Plantillas oficiales (mismas que fix-variants)
const TEMPLATES: Record<string, string[]> = {
  'ZA-UK':     ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'],
  'ZA-UE':     ['38', '38.5', '39', '39.5', '40', '40.5', '41', '41.5', '42', '43', '43.5', '44', '44.5', '45', '45.5', '46'],
  'AMERICANA': ['44', '46', '48', '50', '52', '54', '56', '58', '60'],
  'PANTALON':  ['38', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60'],
  'PA-US':     ['28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42'],
  'GENERICA':  ['XS', 'S', 'M', 'M/L', 'L', 'XL', 'XXL', 'XXXL'],
  'CAMISA':    ['37', '38', '39', '40', '41', '42', '43', '44'],
  'UNICA':     ['U'],
  'CINTURON':  ['80', '85', '90', '95', '100', '105', '110'],
}

const DRY_RUN = process.argv.includes('--dry-run')
const ORIGINAL_FILE = 'C:/Users/USUARIO/Downloads/BBDD ARTICULOS ULTIMA VERSION.xlsx'
const TIPO_TALLA_FILE = 'C:/Users/USUARIO/Downloads/BBDD ARTICULOS ULTIMA VERSION (4).xlsx'

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

function cleanEan(val: unknown): string | null {
  if (val === null || val === undefined || val === '' || val === 0) return null
  const s = String(val).replace(/\.0+$/, '').trim()
  if (!s || s === '0' || s.length < 8) return null
  return s
}

async function main(): Promise<void> {
  console.log(`=== FIX EANS ${DRY_RUN ? '(DRY-RUN)' : ''} ===\n`)

  if (!fs.existsSync(ORIGINAL_FILE)) {
    console.error('Excel original no encontrado:', ORIGINAL_FILE)
    process.exit(1)
  }
  if (!fs.existsSync(TIPO_TALLA_FILE)) {
    console.error('Excel TIPO TALLA no encontrado:', TIPO_TALLA_FILE)
    process.exit(1)
  }

  // 1. Leer Excel original — agrupar EANs por CODIGO (en orden)
  console.log('Leyendo Excel original...')
  const wbOrig = XLSX.readFile(ORIGINAL_FILE)
  const rowsOrig: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wbOrig.Sheets['ARTICULOS POWER SHOP'], { defval: null })

  type ProductEans = { eans: string[]; hasSize: boolean }
  const codigoToEans = new Map<string, ProductEans>()

  for (const row of rowsOrig) {
    const codigo = String(row['CODIGO'] || '').trim()
    if (!codigo) continue
    const ean = cleanEan(row['EAN13'])
    const talla = row['TALLA']
    const hasSize = talla !== null && talla !== '' && talla !== undefined

    if (!codigoToEans.has(codigo)) {
      codigoToEans.set(codigo, { eans: [], hasSize: false })
    }
    const entry = codigoToEans.get(codigo)!
    if (hasSize) entry.hasSize = true
    if (ean) entry.eans.push(ean)
  }

  // Filtrar: solo productos SIN talla original (los que perdieron sus EANs)
  const productosSinTalla = Array.from(codigoToEans.entries())
    .filter(([, info]) => !info.hasSize && info.eans.length > 0)

  console.log(`  Productos sin talla en original con EANs: ${productosSinTalla.length}`)

  // 2. Leer Excel TIPO TALLA
  console.log('\nLeyendo Excel TIPO TALLA...')
  const wbTipo = XLSX.readFile(TIPO_TALLA_FILE)
  const rowsTipo: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wbTipo.Sheets['ARTICULOS POWER SHOP'], { defval: null })

  const codigoToTipo = new Map<string, string>()
  for (const row of rowsTipo) {
    const codigo = String(row['CODIGO'] || '').trim()
    const tipo = String(row['TIPO TALLA'] || '').trim().toUpperCase()
    if (codigo && tipo && !codigoToTipo.has(codigo)) {
      codigoToTipo.set(codigo, tipo)
    }
  }
  console.log(`  Productos con TIPO TALLA: ${codigoToTipo.size}`)

  // 3. Cargar barcodes existentes para evitar duplicados
  console.log('\nCargando barcodes existentes...')
  const { data: existingBcs } = await admin.from('product_variants').select('barcode').not('barcode', 'is', null)
  const existingBarcodes = new Set((existingBcs || []).map((v: any) => v.barcode))
  console.log(`  Barcodes ya en uso: ${existingBarcodes.size}`)

  // 4. Procesar cada producto
  let productsUpdated = 0
  let eansAssigned = 0
  let conflictsBarcode = 0
  let mismatchCount = 0
  let noVariantsCount = 0
  let skippedAlreadyHasBc = 0
  const mismatchExamples: { codigo: string; eans: number; variants: number; tipo: string }[] = []

  for (const [codigo, info] of productosSinTalla) {
    const sku = `PRATS-${codigo.padStart(5, '0')}`

    // Buscar producto en BD
    const { data: prod } = await admin.from('products').select('id').eq('sku', sku).maybeSingle()
    if (!prod) continue

    // Buscar variantes activas
    const { data: variants } = await admin.from('product_variants')
      .select('id, size, barcode')
      .eq('product_id', prod.id)
      .eq('is_active', true)

    if (!variants || variants.length === 0) {
      noVariantsCount++
      continue
    }

    // Filtrar variantes que pertenecen a la plantilla del producto (ignorar restos de otras plantillas)
    const tipoTalla = codigoToTipo.get(codigo)
    const templateSizes = tipoTalla ? TEMPLATES[tipoTalla] : null
    let templateVariants = variants as any[]
    if (templateSizes) {
      const allowedSizes = new Set(templateSizes.map(s => s.toUpperCase()))
      templateVariants = (variants as any[]).filter(v => allowedSizes.has(String(v.size || '').toUpperCase()))
    }

    // Ordenar variantes por talla
    const sorted = sortBySize(templateVariants) as any[]

    // Verificar coincidencia de cantidad
    if (info.eans.length !== sorted.length) {
      mismatchCount++
      if (mismatchExamples.length < 10) {
        mismatchExamples.push({
          codigo,
          eans: info.eans.length,
          variants: sorted.length,
          tipo: codigoToTipo.get(codigo) || '?',
        })
      }
      // Si solo hay 1 EAN y 1 variante, asignar igual
      if (!(info.eans.length === 1 && sorted.length === 1)) continue
    }

    // Asignar EANs en orden
    let assignedThis = 0
    for (let i = 0; i < Math.min(info.eans.length, sorted.length); i++) {
      const ean = info.eans[i]
      const variant = sorted[i]

      // Si la variante ya tiene barcode, saltar
      if (variant.barcode) {
        skippedAlreadyHasBc++
        continue
      }

      // Si el EAN ya está asignado a otra variante, saltar
      if (existingBarcodes.has(ean)) {
        conflictsBarcode++
        continue
      }

      if (!DRY_RUN) {
        const { error } = await admin.from('product_variants').update({ barcode: ean }).eq('id', variant.id)
        if (error) {
          conflictsBarcode++
          continue
        }
      }

      existingBarcodes.add(ean)
      assignedThis++
      eansAssigned++
    }

    if (assignedThis > 0) productsUpdated++
  }

  console.log(`\n=== RESULTADO ===`)
  console.log(`  Productos sin talla en Excel:    ${productosSinTalla.length}`)
  console.log(`  Productos actualizados:          ${productsUpdated}`)
  console.log(`  EANs reasignados:                ${eansAssigned}`)
  console.log(`  Saltados (variante ya con bc):   ${skippedAlreadyHasBc}`)
  console.log(`  Conflictos (EAN ya en uso):      ${conflictsBarcode}`)
  console.log(`  Sin variantes en BD:             ${noVariantsCount}`)
  console.log(`  Mismatch cantidad eans/var:      ${mismatchCount}`)

  if (mismatchExamples.length > 0) {
    console.log('\n  Ejemplos mismatch:')
    for (const m of mismatchExamples) {
      console.log(`    CODIGO ${m.codigo} (${m.tipo}): ${m.eans} EANs vs ${m.variants} variantes`)
    }
  }

  if (DRY_RUN) console.log('\n  (dry-run, ningún dato modificado)')

  // Verificación final
  if (!DRY_RUN) {
    const { count } = await admin.from('product_variants').select('id', { count: 'exact', head: true }).not('barcode', 'is', null)
    console.log(`\n  Total variantes con barcode tras fix: ${count}`)
  }
}

main().catch(e => { console.error('Error:', e); process.exit(1) })
