/**
 * FIX UNICA VARIANTS — Productos UNICA deben tener solo 1 variante con size = 'U'
 * npx tsx src/scripts/fix-unica-variants.ts
 * npx tsx src/scripts/fix-unica-variants.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const DRY_RUN = process.argv.includes('--dry-run')
const FILE_PATH = 'C:/Users/USUARIO/Downloads/BBDD ARTICULOS ULTIMA VERSION (4).xlsx'

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

// Pre-cargar todos los variant_ids con dependencias
async function loadUsedVariantIds(): Promise<Set<string>> {
  const used = new Set<string>()
  const { data: sl } = await admin.from('sale_lines').select('product_variant_id').not('product_variant_id', 'is', null)
  for (const r of sl || []) used.add(r.product_variant_id as string)
  const { data: sol } = await admin.from('supplier_order_lines').select('product_variant_id').not('product_variant_id', 'is', null)
  for (const r of sol || []) used.add(r.product_variant_id as string)
  return used
}

async function main(): Promise<void> {
  console.log(`=== FIX UNICA VARIANTS ${DRY_RUN ? '(DRY-RUN)' : ''} ===\n`)

  if (!fs.existsSync(FILE_PATH)) {
    console.error('Archivo no encontrado:', FILE_PATH)
    process.exit(1)
  }

  // 1. Leer Excel y obtener códigos UNICA
  const wb = XLSX.readFile(FILE_PATH)
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets['ARTICULOS POWER SHOP'], { defval: null })

  const unicaCodigos: string[] = []
  for (const row of rows) {
    const codigo = String(row['CODIGO'] || '').trim()
    const tipo = String(row['TIPO TALLA'] || '').trim().toUpperCase()
    if (codigo && tipo === 'UNICA') {
      unicaCodigos.push(codigo)
    }
  }
  console.log(`  Productos UNICA en Excel: ${unicaCodigos.length}\n`)

  // Pre-cargar variant_ids con dependencias (in-memory check, mucho más rápido)
  console.log('  Pre-cargando variantes con dependencias...')
  const usedVariantIds = await loadUsedVariantIds()
  console.log(`  Variantes con dependencias: ${usedVariantIds.size}\n`)

  let alreadyCorrect = 0
  let corrected = 0
  let variantsDeleted = 0
  let barcodesConservados = 0
  let conflicts = 0
  let notFound = 0

  for (let i = 0; i < unicaCodigos.length; i++) {
    const codigo = unicaCodigos[i]
    const sku = `PRATS-${codigo.padStart(5, '0')}`

    // Buscar producto
    const { data: prod } = await admin.from('products').select('id, sku').eq('sku', sku).maybeSingle()
    if (!prod) { notFound++; continue }

    // Variantes actuales
    const { data: variants } = await admin.from('product_variants')
      .select('id, size, barcode, variant_sku')
      .eq('product_id', prod.id)

    const list = (variants || []) as { id: string; size: string | null; barcode: string | null; variant_sku: string }[]

    if (list.length === 0) {
      // Crear una variante U
      if (!DRY_RUN) {
        await admin.from('product_variants').insert({
          product_id: prod.id,
          size: 'U',
          variant_sku: `${sku}-U`,
          is_active: true,
        })
      }
      corrected++
      continue
    }

    // Caso 1: ya está bien (1 variante con size U)
    if (list.length === 1) {
      const v = list[0]
      if (v.size === 'U' && v.variant_sku === `${sku}-U`) {
        alreadyCorrect++
        continue
      }
      // Solo necesita actualizar size/sku
      if (!DRY_RUN) {
        await admin.from('product_variants').update({
          size: 'U',
          variant_sku: `${sku}-U`,
        }).eq('id', v.id)
      }
      corrected++
      continue
    }

    // Caso 2: múltiples variantes — elegir cuál conservar
    // Prioridad: 1) la que tiene barcode, 2) la que tiene size='U', 3) la primera
    let toKeep = list.find(v => v.barcode && v.barcode.trim() !== '')
    if (!toKeep) toKeep = list.find(v => v.size === 'U')
    if (!toKeep) toKeep = list[0]

    if (toKeep.barcode) barcodesConservados++

    // Determinar cuáles eliminar
    const toDelete = list.filter(v => v.id !== toKeep!.id)
    const safeToDelete: string[] = []
    let conflictThisProduct = 0

    for (const v of toDelete) {
      if (usedVariantIds.has(v.id)) {
        conflictThisProduct++
      } else {
        safeToDelete.push(v.id)
      }
    }

    if (conflictThisProduct > 0) {
      conflicts += conflictThisProduct
    }

    // Eliminar las que se pueden
    if (safeToDelete.length > 0 && !DRY_RUN) {
      await admin.from('product_variants').delete().in('id', safeToDelete)
    }
    variantsDeleted += safeToDelete.length

    // Actualizar la variante conservada a size='U'
    if (toKeep.size !== 'U' || toKeep.variant_sku !== `${sku}-U`) {
      if (!DRY_RUN) {
        // Asegurar que el variant_sku no entre en conflicto con uno existente que se vaya a borrar
        await admin.from('product_variants').update({
          size: 'U',
          variant_sku: `${sku}-U`,
        }).eq('id', toKeep.id)
      }
    }

    corrected++

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r  Progreso: ${i + 1}/${unicaCodigos.length}`)
    }
  }

  console.log(`\r  Progreso: ${unicaCodigos.length}/${unicaCodigos.length}`)
  console.log(`\n=== RESULTADO ===`)
  console.log(`  Productos UNICA revisados:    ${unicaCodigos.length}`)
  console.log(`  Ya correctos:                 ${alreadyCorrect}`)
  console.log(`  Corregidos:                   ${corrected}`)
  console.log(`  Variantes eliminadas:         ${variantsDeleted}`)
  console.log(`  Barcodes conservados:         ${barcodesConservados}`)
  console.log(`  Conflictos (en uso):          ${conflicts}`)
  console.log(`  Productos no encontrados:     ${notFound}`)
  if (DRY_RUN) console.log('  (dry-run, ningún dato modificado)')

  // Verificación
  if (!DRY_RUN) {
    const { count: total } = await admin.from('product_variants').select('id', { count: 'exact', head: true })
    console.log(`\n  Total variantes en BD: ${total}`)
  }
}

main().catch(e => { console.error('Error:', e); process.exit(1) })
