/**
 * FIX VARIANTS v2 — Usa TIPO TALLA del nuevo Excel para crear variantes correctas
 * npx tsx src/scripts/fix-variants.ts
 * npx tsx src/scripts/fix-variants.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const DRY_RUN = process.argv.includes('--dry-run')
const FILE_PATH = 'C:/Users/USUARIO/Downloads/BBDD ARTICULOS ULTIMA VERSION (4).xlsx'
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

// ── Plantillas ─────────────────────────────────────────────

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

function cleanVariantSku(baseSku: string, size: string): string {
  return `${baseSku}-${size.replace(/\//g, '-').replace(/\./g, '').replace(/\s+/g, '')}`
}

// ── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`=== FIX VARIANTS v2 ${DRY_RUN ? '(DRY-RUN)' : ''} ===\n`)

  if (!fs.existsSync(FILE_PATH)) {
    console.error('Archivo no encontrado:', FILE_PATH)
    process.exit(1)
  }

  // Leer Excel
  const wb = XLSX.readFile(FILE_PATH)
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[SHEET_NAME], { defval: null })
  console.log(`  Filas Excel: ${rows.length}`)

  // Crear mapa CODIGO → TIPO TALLA
  const codigoToTemplate = new Map<string, string>()
  for (const row of rows) {
    const codigo = String(row['CODIGO'] || '').trim()
    const tipo = String(row['TIPO TALLA'] || '').trim().toUpperCase()
    if (codigo && tipo && TEMPLATES[tipo]) {
      codigoToTemplate.set(codigo, tipo)
    }
  }
  console.log(`  Productos con TIPO TALLA válido: ${codigoToTemplate.size}`)

  // Distribución
  const dist: Record<string, number> = {}
  for (const [, t] of Array.from(codigoToTemplate.entries())) { dist[t] = (dist[t] || 0) + 1 }
  console.log(`  Distribución: ${JSON.stringify(dist)}`)

  // Cargar productos importados
  let products: { id: string; sku: string }[] = []
  let offset = 0
  while (true) {
    const { data } = await admin.from('products').select('id, sku')
      .like('sku', 'PRATS-%').eq('is_active', true).range(offset, offset + 999)
    if (!data || !data.length) break
    products = products.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }
  console.log(`  Productos en BD: ${products.length}\n`)

  let alreadyCorrect = 0
  let corrected = 0
  let skippedNoTemplate = 0
  let variantsCreated = 0
  let variantsDeleted = 0

  for (let i = 0; i < products.length; i++) {
    const prod = products[i]
    // Extraer CODIGO del SKU: PRATS-00001 → 1
    const codigo = prod.sku.replace('PRATS-', '').replace(/^0+/, '') || '0'
    const tipoTalla = codigoToTemplate.get(codigo)

    if (!tipoTalla) {
      skippedNoTemplate++
      continue
    }

    const templateSizes = TEMPLATES[tipoTalla]

    // Cargar variantes actuales con stock
    const { data: variants } = await admin.from('product_variants')
      .select('id, size, variant_sku, stock_levels(quantity)')
      .eq('product_id', prod.id)

    const currentVariants = variants || []
    const withSize = currentVariants.filter((v: any) => v.size && v.size.trim() !== '')
    const withoutSize = currentVariants.filter((v: any) => !v.size || v.size.trim() === '')

    // No borrar variantes sin talla que tienen stock > 0
    const withoutSizeSafe = withoutSize.filter((v: any) => {
      const totalStock = ((v.stock_levels || []) as any[]).reduce((s: number, sl: any) => s + (sl.quantity || 0), 0)
      return totalStock <= 0
    })
    const withoutSizeWithStock = withoutSize.length - withoutSizeSafe.length

    // Si todas las variantes ya tienen tallas y no hay sin-talla → ya correcto
    if (currentVariants.length > 0 && withoutSizeSafe.length === 0) {
      // Verificar si faltan tallas de la plantilla
      const existingSizes = new Set(withSize.map((v: any) => String(v.size || '').toUpperCase()))
      const missing = templateSizes.filter(s => !existingSizes.has(s.toUpperCase()))
      if (missing.length === 0) {
        alreadyCorrect++
        continue
      }
      // Solo añadir las que faltan
      const toCreate = missing.map(size => ({
        product_id: prod.id,
        size,
        variant_sku: cleanVariantSku(prod.sku, size),
        is_active: true,
      }))
      if (!DRY_RUN) {
        for (const v of toCreate) {
          await admin.from('product_variants').insert(v).select('id').single()
        }
      }
      variantsCreated += toCreate.length
      corrected++
      continue
    }

    // Eliminar variantes sin talla (sin stock)
    if (withoutSizeSafe.length > 0) {
      const idsToDelete = withoutSizeSafe.map((v: any) => v.id)
      if (!DRY_RUN) {
        await admin.from('product_variants').delete().in('id', idsToDelete)
      }
      variantsDeleted += idsToDelete.length
    }

    if (withoutSizeWithStock > 0 && (i < 3 || DRY_RUN)) {
      console.log(`  ⚠ ${prod.sku}: ${withoutSizeWithStock} variante(s) sin talla CON stock — no borrada(s)`)
    }

    // Crear variantes que falten
    const existingSizes = new Set(withSize.map((v: any) => String(v.size || '').toUpperCase()))
    // También evitar duplicados con variant_sku existentes
    const existingSkus = new Set(currentVariants.map((v: any) => v.variant_sku))

    const toCreate = templateSizes
      .filter(s => !existingSizes.has(s.toUpperCase()))
      .map(size => ({
        product_id: prod.id,
        size,
        variant_sku: cleanVariantSku(prod.sku, size),
        is_active: true,
      }))
      .filter(v => !existingSkus.has(v.variant_sku))

    if (toCreate.length > 0) {
      if (!DRY_RUN) {
        const { error } = await admin.from('product_variants').insert(toCreate)
        if (error) {
          // Fallback: uno a uno
          for (const v of toCreate) {
            const { error: sErr } = await admin.from('product_variants').insert(v)
            if (!sErr) variantsCreated++
          }
        } else {
          variantsCreated += toCreate.length
        }
      } else {
        variantsCreated += toCreate.length
      }
      corrected++
    } else if (withoutSizeSafe.length > 0) {
      corrected++
    } else {
      alreadyCorrect++
    }

    if ((i + 1) % 200 === 0) {
      process.stdout.write(`\r  Progreso: ${i + 1}/${products.length}`)
    }
  }

  console.log(`\r  Progreso: ${products.length}/${products.length}`)
  console.log(`\n=== RESULTADO ===`)
  console.log(`  Productos revisados:      ${products.length}`)
  console.log(`  Ya correctos:             ${alreadyCorrect}`)
  console.log(`  Corregidos:               ${corrected}`)
  console.log(`  Sin plantilla (saltar):   ${skippedNoTemplate}`)
  console.log(`  Variantes creadas:        ${variantsCreated}`)
  console.log(`  Variantes eliminadas:     ${variantsDeleted}`)
  if (DRY_RUN) console.log('  (dry-run, ningún dato modificado)')

  // Verificación final
  if (!DRY_RUN) {
    const { count: totalVariants } = await admin.from('product_variants').select('id', { count: 'exact', head: true })
    const { count: withSizeCount } = await admin.from('product_variants').select('id', { count: 'exact', head: true }).not('size', 'is', null).neq('size', '')
    console.log(`\n  Total variantes en BD: ${totalVariants}`)
    console.log(`  Con talla: ${withSizeCount}`)
    console.log(`  Sin talla: ${(totalVariants || 0) - (withSizeCount || 0)}`)
  }
}

main().catch(e => { console.error('Error:', e); process.exit(1) })
