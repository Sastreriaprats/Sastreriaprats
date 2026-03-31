/**
 * IMPORT FABRICS — Sastrería Prats
 * Importa 248 telas desde Excel a la tabla fabrics.
 *
 * npx tsx src/scripts/import-fabrics.ts
 * npx tsx src/scripts/import-fabrics.ts --dry-run
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

// ── Config ─────────────────────────────────────────────────

const FILE_PATH = 'C:/Users/USUARIO/Downloads/BBDD ARTICULOS TELAS.xls'
const SHEET_NAME = 'Sheet'
const BATCH_SIZE = 50
const DRY_RUN = process.argv.includes('--dry-run')

// ── Supabase ───────────────────────────────────────────────

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

const admin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// ── Helpers ────────────────────────────────────────────────

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  const s = String(val).trim()
  return s || null
}

async function confirm(msg: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(r => { rl.question(msg, a => { rl.close(); r(a.toLowerCase().startsWith('s') || a.toLowerCase().startsWith('y')) }) })
}

// ── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════╗')
  console.log(`║   IMPORTACIÓN DE TELAS ${DRY_RUN ? '(DRY-RUN)' : '          '}             ║`)
  console.log('╚════════════════════════════════════════════════╝\n')

  if (!fs.existsSync(FILE_PATH)) {
    console.error(`Archivo no encontrado: ${FILE_PATH}`)
    process.exit(1)
  }

  // Leer Excel
  const wb = XLSX.readFile(FILE_PATH)
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets[SHEET_NAME], { defval: null })
  console.log(`  Filas leídas: ${rows.length}`)

  // Cargar proveedores existentes
  const { data: suppliers } = await admin.from('suppliers').select('id, name')
  const supplierList = suppliers || []
  console.log(`  Proveedores en BD: ${supplierList.length}`)

  // Mapear nombre proveedor → id (case-insensitive)
  function findSupplier(name: string | null): string | null {
    if (!name || name === 'SIN PROVEEDOR') return null
    const upper = name.toUpperCase().trim()
    // Exacto
    for (const s of supplierList) {
      if (s.name.toUpperCase().trim() === upper) return s.id
    }
    // Parcial: el nombre del Excel contiene el del BD o viceversa
    for (const s of supplierList) {
      const su = s.name.toUpperCase().trim()
      if (su.includes(upper) || upper.includes(su)) return s.id
    }
    // Parcial por primeras 3 palabras
    const words = upper.split(/\s+/).slice(0, 3).join(' ')
    for (const s of supplierList) {
      if (s.name.toUpperCase().includes(words)) return s.id
    }
    return null
  }

  // Cargar fabric_codes existentes
  const { data: existingFabrics } = await admin.from('fabrics').select('fabric_code')
  const existingCodes = new Set((existingFabrics || []).map(f => f.fabric_code))
  console.log(`  Telas existentes: ${existingCodes.size}`)

  // Mapear filas
  type FabricRow = {
    fabric_code: string
    name: string
    supplier_id: string | null
    supplier_reference: string | null
    price_per_meter: number | null
    stock_meters: number
    supplierName: string | null
    is_active: boolean
  }

  const mapped: FabricRow[] = []
  const unmatchedSuppliers = new Set<string>()
  let skippedDedup = 0

  for (const row of rows) {
    const code = toStr(row['CODIGO'])
    if (!code) continue

    if (existingCodes.has(code)) {
      skippedDedup++
      continue
    }

    const provName = toStr(row['PROVEEDOR'])
    const supplierId = findSupplier(provName)
    if (provName && !supplierId && provName !== 'SIN PROVEEDOR') {
      unmatchedSuppliers.add(provName)
    }

    const cost = row[' COSTE ']
    const stock = row['M/STOCK  ']

    mapped.push({
      fabric_code: code,
      name: toStr(row['NOMBRE DEL PRODUCTO']) || `Tela ${code}`,
      supplier_id: supplierId,
      supplier_reference: toStr(row['REFERENCIA PROVEEDOR']),
      price_per_meter: typeof cost === 'number' ? cost : parseFloat(String(cost || '0')) || null,
      stock_meters: typeof stock === 'number' ? stock : parseFloat(String(stock || '0')) || 0,
      supplierName: provName,
      is_active: true,
    })
  }

  // Resumen
  const withSupplier = mapped.filter(m => m.supplier_id).length
  const withoutSupplier = mapped.filter(m => !m.supplier_id).length

  console.log(`\n╔════════════════════════════════════════════════╗`)
  console.log(`║               RESUMEN                          ║`)
  console.log(`╠════════════════════════════════════════════════╣`)
  console.log(`║  Total filas:          ${String(rows.length).padStart(6)}                  ║`)
  console.log(`║  Ya existentes (skip): ${String(skippedDedup).padStart(6)}                  ║`)
  console.log(`║  A importar:           ${String(mapped.length).padStart(6)}                  ║`)
  console.log(`║  Con proveedor:        ${String(withSupplier).padStart(6)}                  ║`)
  console.log(`║  Sin proveedor:        ${String(withoutSupplier).padStart(6)}                  ║`)
  console.log(`╚════════════════════════════════════════════════╝`)

  if (unmatchedSuppliers.size > 0) {
    console.log(`\n  Proveedores no encontrados en BD:`)
    for (const name of Array.from(unmatchedSuppliers)) {
      console.log(`    - ${name}`)
    }
  }

  // Primeras 3 mapeadas
  console.log(`\n  Primeras 3 telas mapeadas:`)
  for (let i = 0; i < Math.min(3, mapped.length); i++) {
    const m = mapped[i]
    console.log(`  [${i + 1}] ${m.fabric_code} | "${m.name}" | Prov=${m.supplierName} (${m.supplier_id ? 'OK' : 'NULL'}) | Coste=${m.price_per_meter} | Stock=${m.stock_meters}m`)
  }

  if (DRY_RUN) {
    console.log('\n  Dry-run completado. Ningún dato modificado.')
    process.exit(0)
  }

  if (mapped.length === 0) {
    console.log('\n  Nada que importar.')
    process.exit(0)
  }

  // supplier_id es NOT NULL — para las telas sin proveedor, crear un proveedor genérico
  let genericSupplierId: string | null = null
  if (withoutSupplier > 0) {
    // Buscar si ya existe "SIN PROVEEDOR" o "Genérico"
    const { data: generic } = await admin
      .from('suppliers')
      .select('id')
      .or('name.eq.SIN PROVEEDOR,name.eq.Proveedor Genérico')
      .limit(1)
      .maybeSingle()

    if (generic) {
      genericSupplierId = generic.id
      console.log(`\n  Usando proveedor genérico existente: ${genericSupplierId}`)
    } else {
      const { data: newSupplier, error } = await admin
        .from('suppliers')
        .insert({ name: 'SIN PROVEEDOR', internal_notes: 'Creado para importación de telas sin proveedor', is_active: true })
        .select('id')
        .single()
      if (error) {
        console.error(`  Error creando proveedor genérico: ${error.message}`)
        process.exit(1)
      }
      genericSupplierId = newSupplier.id
      console.log(`\n  Creado proveedor genérico: ${genericSupplierId}`)
    }
  }

  const proceed = await confirm('\n  ¿Continuar? [s/n] ')
  if (!proceed) { console.log('  Cancelado.'); process.exit(0) }

  // Importar en batches
  console.log('\n  Importando...')
  let imported = 0
  let errors = 0

  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    const batch = mapped.slice(i, i + BATCH_SIZE)
    const toInsert = batch.map(m => ({
      fabric_code: m.fabric_code,
      name: m.name,
      supplier_id: m.supplier_id || genericSupplierId,
      supplier_reference: m.supplier_reference,
      price_per_meter: m.price_per_meter,
      stock_meters: m.stock_meters,
      is_active: true,
      status: 'active',
    }))

    const { data: inserted, error } = await admin
      .from('fabrics')
      .insert(toInsert)
      .select('id')

    if (error) {
      // Fallback: uno a uno
      for (const item of toInsert) {
        const { error: sErr } = await admin.from('fabrics').insert(item).select('id').single()
        if (sErr) {
          console.error(`    Error: ${sErr.message} (${item.fabric_code})`)
          errors++
        } else {
          imported++
        }
      }
    } else {
      imported += (inserted || []).length
    }

    process.stdout.write(`\r  Progreso: ${Math.min(i + BATCH_SIZE, mapped.length)}/${mapped.length}`)
  }

  console.log(`\n\n  Importados: ${imported} | Errores: ${errors}`)

  // Estado final
  const { count } = await admin.from('fabrics').select('id', { count: 'exact', head: true })
  console.log(`  Total telas en BD: ${count}`)
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1) })
