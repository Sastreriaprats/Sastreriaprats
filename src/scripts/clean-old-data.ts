/**
 * ============================================================
 * CLEAN OLD DATA — Sastrería Prats
 * ============================================================
 *
 * Borra datos de prueba/test, preservando:
 *   - Clientes con source = 'import_excel'
 *   - Productos con SKU que empieza por 'IMP-'
 *   - Proveedores referenciados por productos importados
 *   - Tablas de configuración (stores, roles, categories, cms, etc.)
 *
 * Ejecución:
 *   npx tsx src/scripts/clean-old-data.ts
 * ============================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

// ── Supabase ───────────────────────────────────────────────

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan variables: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Helpers ────────────────────────────────────────────────

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(message, answer => {
      rl.close()
      resolve(answer.toLowerCase().startsWith('s') || answer.toLowerCase().startsWith('y'))
    })
  })
}

async function countTable(table: string, filter?: { column: string; op: string; value: unknown }): Promise<number> {
  let query = admin.from(table).select('id', { count: 'exact', head: true })
  if (filter) {
    if (filter.op === 'eq') query = query.eq(filter.column, filter.value)
    else if (filter.op === 'neq') query = query.neq(filter.column, filter.value)
    else if (filter.op === 'is') query = query.is(filter.column, filter.value as null)
    else if (filter.op === 'like') query = query.like(filter.column, filter.value as string)
    else if (filter.op === 'not.like') query = query.not(filter.column, 'like', filter.value as string)
    else if (filter.op === 'in') query = query.in(filter.column, filter.value as string[])
  }
  const { count, error } = await query
  if (error) {
    // Table might not exist — return 0
    return 0
  }
  return count || 0
}

async function deleteAll(table: string, label: string): Promise<number> {
  // Supabase needs a filter for delete — use id.not.is.null to delete all
  const { count, error } = await admin
    .from(table)
    .delete({ count: 'exact' })
    .not('id', 'is', null)

  if (error) {
    console.error(`    Error borrando ${label}: ${error.message}`)
    return 0
  }
  return count || 0
}

// deleteWhere removed — unused

// ── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════╗')
  console.log('║  LIMPIEZA DE DATOS ANTIGUOS — Sastrería Prats ║')
  console.log('╚════════════════════════════════════════════════╝')
  console.log()

  // Verificar conexión
  const { error: pingError } = await admin.from('stores').select('id').limit(1)
  if (pingError) {
    console.error(`No se puede conectar a Supabase: ${pingError.message}`)
    process.exit(1)
  }
  console.log('  Conexion a Supabase OK\n')

  // ── CONTEO ───────────────────────────────────────────

  console.log('Contando registros...\n')

  // Clientes
  const clientsImported = await countTable('clients', { column: 'source', op: 'eq', value: 'import_excel' })
  const clientsTotal = await countTable('clients')
  const clientsOld = clientsTotal - clientsImported

  // Productos
  const productsImported = await countTable('products', { column: 'sku', op: 'like', value: 'IMP-%' })
  const productsTotal = await countTable('products')
  const productsOld = productsTotal - productsImported

  // Proveedores: buscar los referenciados por productos importados
  const { data: referencedSuppliers } = await admin
    .from('products')
    .select('supplier_id')
    .like('sku', 'IMP-%')
    .not('supplier_id', 'is', null)
  const referencedSupplierIds = new Set((referencedSuppliers || []).map(p => p.supplier_id))

  // Proveedores con internal_notes de importación
  const { data: importedSuppliers } = await admin
    .from('suppliers')
    .select('id')
    .eq('internal_notes', 'Importado desde Excel')
  const importedSupplierIds = new Set((importedSuppliers || []).map(s => s.id))

  // Combinar: proteger proveedores importados Y referenciados
  const protectedSupplierIds = new Set(Array.from(referencedSupplierIds).concat(Array.from(importedSupplierIds)))

  const suppliersTotal = await countTable('suppliers')
  const suppliersProtected = protectedSupplierIds.size
  const suppliersOld = suppliersTotal - suppliersProtected

  // Tablas transaccionales (todas se borran)
  const counts: Record<string, number> = {}
  const tables = [
    'manual_transactions', 'cash_sessions',
    'sale_payments', 'sale_lines', 'returns', 'sales',
    'tailoring_order_payments', 'tailoring_order_state_history',
    'tailoring_fittings', 'tailoring_order_lines', 'tailoring_orders',
    'boutique_alterations', 'vouchers',
    'stock_movements', 'stock_levels',
    'supplier_order_lines', 'supplier_delivery_note_lines',
    'supplier_delivery_notes', 'supplier_orders',
    'email_logs', 'email_campaigns',
    'appointments', 'contact_requests',
    'client_measurements', 'fabrics',
  ]

  for (const t of tables) {
    counts[t] = await countTable(t)
  }

  // Variantes de productos antiguos
  const { data: oldProductIds } = await admin
    .from('products')
    .select('id')
    .not('sku', 'like', 'IMP-%')
  const oldProdIds = (oldProductIds || []).map(p => p.id)

  let variantsOld = 0
  if (oldProdIds.length > 0) {
    // Contar en batches de 100
    for (let i = 0; i < oldProdIds.length; i += 100) {
      const batch = oldProdIds.slice(i, i + 100)
      const { count } = await admin
        .from('product_variants')
        .select('id', { count: 'exact', head: true })
        .in('product_id', batch)
      variantsOld += count || 0
    }
  }

  // ── RESUMEN ──────────────────────────────────────────

  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║                RESUMEN DE LIMPIEZA                    ║')
  console.log('╠════════════════════════════════════════════════════════╣')
  console.log('║  TABLAS TRANSACCIONALES (borrar TODO):                ║')

  let totalToDelete = 0
  for (const t of tables) {
    if (counts[t] > 0) {
      const padded = t.padEnd(35)
      const num = String(counts[t]).padStart(6)
      console.log(`║    ${padded} ${num}   ║`)
      totalToDelete += counts[t]
    }
  }

  console.log('║                                                        ║')
  console.log('║  DATOS SELECTIVOS:                                     ║')
  console.log(`║    Clientes antiguos                      ${String(clientsOld).padStart(6)}   ║`)
  console.log(`║    (preservar ${clientsImported} importados)                         ║`)
  console.log(`║    Productos antiguos                     ${String(productsOld).padStart(6)}   ║`)
  console.log(`║    (preservar ${productsImported} importados)                        ║`)
  console.log(`║    Variantes de prod. antiguos            ${String(variantsOld).padStart(6)}   ║`)
  console.log(`║    Proveedores antiguos                   ${String(suppliersOld).padStart(6)}   ║`)
  console.log(`║    (preservar ${suppliersProtected} importados)                        ║`)

  totalToDelete += clientsOld + productsOld + variantsOld + suppliersOld

  console.log('║                                                        ║')
  console.log(`║  TOTAL A BORRAR:                          ${String(totalToDelete).padStart(6)}   ║`)
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log()

  if (totalToDelete === 0) {
    console.log('No hay datos que borrar.')
    process.exit(0)
  }

  console.log('  ESTO ES IRREVERSIBLE. Los datos borrados no se pueden recuperar.')
  console.log()
  const proceed = await confirm('  Escriba "s" para confirmar la limpieza: ')
  if (!proceed) {
    console.log('Cancelado.')
    process.exit(0)
  }

  console.log('\n  Ejecutando limpieza...\n')

  const deleted: Record<string, number> = {}

  // ── FASE 1: Tablas transaccionales (sin dependencias de datos importados) ──

  console.log('  [1/6] Tablas transaccionales...')

  for (const t of tables) {
    if (counts[t] > 0) {
      const d = await deleteAll(t, t)
      deleted[t] = d
      console.log(`    ${t}: ${d} borrados`)
    }
  }

  // ── FASE 2: Dependencias de clientes antiguos ──

  console.log('\n  [2/6] Limpiando dependencias de clientes antiguos...')

  // Obtener IDs de clientes antiguos en batches
  let oldClientIds: string[] = []
  let offset = 0
  const pageSize = 1000
  while (true) {
    const { data } = await admin
      .from('clients')
      .select('id')
      .or('source.neq.import_excel,source.is.null')
      .range(offset, offset + pageSize - 1)

    if (!data || data.length === 0) break
    oldClientIds = oldClientIds.concat(data.map(c => c.id))
    if (data.length < pageSize) break
    offset += pageSize
  }

  console.log(`    Clientes antiguos encontrados: ${oldClientIds.length}`)

  // Las dependencias ya se borraron en fase 1 (sales, tailoring_orders, etc.)
  // Pero por si quedaron registros orphan de client_companies:
  if (oldClientIds.length > 0) {
    let clientCompaniesDeleted = 0
    for (let i = 0; i < oldClientIds.length; i += 100) {
      const batch = oldClientIds.slice(i, i + 100)
      const { count } = await admin
        .from('client_companies')
        .delete({ count: 'exact' })
        .in('client_id', batch)
      clientCompaniesDeleted += count || 0
    }
    if (clientCompaniesDeleted > 0) {
      console.log(`    client_companies: ${clientCompaniesDeleted} borrados`)
    }
  }

  // ── FASE 3: Borrar clientes antiguos ──

  console.log('\n  [3/6] Borrando clientes antiguos...')

  let clientsDeleted = 0
  for (let i = 0; i < oldClientIds.length; i += 100) {
    const batch = oldClientIds.slice(i, i + 100)
    const { count, error } = await admin
      .from('clients')
      .delete({ count: 'exact' })
      .in('id', batch)

    if (error) {
      console.error(`    Error en batch ${i}: ${error.message}`)
    } else {
      clientsDeleted += count || 0
    }
  }
  deleted['clients'] = clientsDeleted
  console.log(`    clients: ${clientsDeleted} borrados (de ${clientsOld} esperados)`)

  // ── FASE 4: Variantes de productos antiguos ──

  console.log('\n  [4/6] Borrando variantes de productos antiguos...')

  let variantsDeleted = 0
  for (let i = 0; i < oldProdIds.length; i += 100) {
    const batch = oldProdIds.slice(i, i + 100)
    const { count } = await admin
      .from('product_variants')
      .delete({ count: 'exact' })
      .in('product_id', batch)
    variantsDeleted += count || 0
  }
  deleted['product_variants_old'] = variantsDeleted
  console.log(`    product_variants: ${variantsDeleted} borrados`)

  // ── FASE 5: Productos antiguos ──

  console.log('\n  [5/6] Borrando productos antiguos...')

  let productsDeleted = 0
  for (let i = 0; i < oldProdIds.length; i += 100) {
    const batch = oldProdIds.slice(i, i + 100)
    const { count, error } = await admin
      .from('products')
      .delete({ count: 'exact' })
      .in('id', batch)

    if (error) {
      console.error(`    Error en batch ${i}: ${error.message}`)
    } else {
      productsDeleted += count || 0
    }
  }
  deleted['products'] = productsDeleted
  console.log(`    products: ${productsDeleted} borrados (de ${productsOld} esperados)`)

  // ── FASE 6: Proveedores antiguos ──

  console.log('\n  [6/6] Borrando proveedores antiguos...')

  // Obtener todos los proveedores y filtrar los no protegidos
  const { data: allSuppliers } = await admin.from('suppliers').select('id')
  const supplierIdsToDelete = (allSuppliers || [])
    .filter(s => !protectedSupplierIds.has(s.id))
    .map(s => s.id)

  let suppliersDeleted = 0
  for (let i = 0; i < supplierIdsToDelete.length; i += 100) {
    const batch = supplierIdsToDelete.slice(i, i + 100)
    // Primero limpiar supplier_invoices que puedan referenciarlos
    await admin.from('ap_supplier_invoices').delete().in('supplier_id', batch)
    await admin.from('supplier_orders').delete().in('supplier_id', batch)

    const { count, error } = await admin
      .from('suppliers')
      .delete({ count: 'exact' })
      .in('id', batch)

    if (error) {
      console.error(`    Error en batch ${i}: ${error.message}`)
    } else {
      suppliersDeleted += count || 0
    }
  }
  deleted['suppliers'] = suppliersDeleted
  console.log(`    suppliers: ${suppliersDeleted} borrados (de ${suppliersOld} esperados)`)

  // ── RESULTADO ────────────────────────────────────────

  console.log('\n')
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║              LIMPIEZA COMPLETADA                      ║')
  console.log('╠════════════════════════════════════════════════════════╣')

  let totalDeleted = 0
  for (const [table, count] of Object.entries(deleted)) {
    if (count > 0) {
      console.log(`║    ${table.padEnd(35)} ${String(count).padStart(6)}   ║`)
      totalDeleted += count
    }
  }

  console.log('║                                                        ║')
  console.log(`║    TOTAL BORRADO:                         ${String(totalDeleted).padStart(6)}   ║`)
  console.log('╚════════════════════════════════════════════════════════╝')

  // Verificar estado final
  console.log('\n  Estado final:')
  const finalClients = await countTable('clients')
  const finalProducts = await countTable('products')
  const finalVariants = await countTable('product_variants')
  const finalSuppliers = await countTable('suppliers')
  console.log(`    Clientes:    ${finalClients} (todos importados)`)
  console.log(`    Productos:   ${finalProducts} (todos importados)`)
  console.log(`    Variantes:   ${finalVariants}`)
  console.log(`    Proveedores: ${finalSuppliers} (importados)`)
}

main().catch(e => {
  console.error('Error fatal:', e)
  process.exit(1)
})
