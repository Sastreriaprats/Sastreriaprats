/**
 * ============================================================
 * IMPORT SCRIPT — Sastrería Prats
 * ============================================================
 *
 * Importa 3 archivos Excel a Supabase:
 *   1. Proveedores (183 registros)
 *   2. Clientes (1,865 registros)
 *   3. Artículos (1,546 productos + 7,885 variantes)
 *
 * Ejecución:
 *   npx tsx src/scripts/import-prats-data.ts
 *
 * Requiere:
 *   - .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 *   - Archivos Excel en IMPORT_DIR (ver constante abajo)
 * ============================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

// ── Config ─────────────────────────────────────────────────

// Cambiar esta ruta si los archivos están en otro sitio
const IMPORT_DIR = 'C:/Users/USUARIO/Downloads'

const FILES = {
  proveedores: path.join(IMPORT_DIR, 'BBDD PROVEEDORES.xls'),
  clientes: path.join(IMPORT_DIR, 'BBDD CLIENTES BOUTIQUE Y SASTRERIA.xlsx'),
  articulos: path.join(IMPORT_DIR, 'BBDD ARTICULOS ULTIMA VERSION.xlsx'),
}

const SHEETS = {
  proveedores: 'Sheet',
  clientes: 'Hoja1',
  articulos: 'ARTICULOS POWER SHOP',
}

const BATCH_SIZE = 50

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
  console.error('❌ Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Types ──────────────────────────────────────────────────

type ImportLog = {
  timestamp: string
  proveedores: { imported: number; skipped: number; errors: ErrorEntry[] }
  clientes: { imported: number; skipped: number; errors: ErrorEntry[] }
  productos: { imported: number; skipped: number; errors: ErrorEntry[] }
  variantes: { imported: number; skipped: number; errors: ErrorEntry[] }
  created_ids: {
    suppliers: string[]
    clients: string[]
    products: string[]
    variants: string[]
  }
}

type ErrorEntry = { row: number; error: string; data?: string }

// ── Helpers ────────────────────────────────────────────────

function readExcel(filePath: string, sheetName: string): Record<string, unknown>[] {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Archivo no encontrado: ${filePath}`)
    process.exit(1)
  }
  const workbook = XLSX.readFile(filePath)
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    const available = workbook.SheetNames.join(', ')
    console.error(`❌ Hoja "${sheetName}" no encontrada en ${filePath}. Disponibles: ${available}`)
    process.exit(1)
  }
  return XLSX.utils.sheet_to_json(sheet, { defval: null })
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  const s = String(val).trim()
  // Quitar .0 de números convertidos a string (ej: 916521618.0 → 916521618)
  if (/^\d+\.0$/.test(s)) return s.replace('.0', '')
  return s || null
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\b(De|Del|La|Las|Los|El|Y|E|En)\b/g, m => m.toLowerCase())
    .replace(/^./, c => c.toUpperCase())
}

function cleanPhone(val: unknown): string | null {
  const s = toStr(val)
  if (!s) return null
  // Quitar todo excepto dígitos y +
  const cleaned = s.replace(/[^0-9+]/g, '')
  if (cleaned.length < 6) return null
  return cleaned
}

function cleanEmail(val: unknown): string | null {
  const s = toStr(val)
  if (!s) return null
  const email = s.toLowerCase().trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

function parseDate(val: unknown): string | null {
  if (val === null || val === undefined) return null

  // Si xlsx lo convirtió a número serial (Excel date)
  if (typeof val === 'number') {
    try {
      const date = XLSX.SSF.parse_date_code(val)
      if (date && date.y > 1900 && date.y < 2100 && date.m >= 1 && date.m <= 12 && date.d >= 1 && date.d <= 31) {
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
      }
    } catch { /* fall through */ }
    return null
  }

  const s = String(val).trim()
  if (!s || s === '00/00/00' || s === '0/0/0' || s === '00/00/0000') return null

  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (dmy) {
    let year = parseInt(dmy[3])
    if (year < 100) year += year > 50 ? 1900 : 2000
    const month = parseInt(dmy[2])
    const day = parseInt(dmy[1])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // ISO YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]

  return null
}

function cleanEan(val: unknown): string | null {
  if (val === null || val === undefined || val === '' || val === 0) return null
  // Convertir número a string sin decimales
  const s = String(val).replace(/\.0+$/, '').trim()
  if (!s || s === '0' || s.length < 8) return null
  return s
}

function normalizeCountry(val: unknown): string {
  const s = toStr(val)
  if (!s) return 'España'
  const upper = s.toUpperCase().trim()
  if (upper === 'ESPAÑA' || upper === 'ESPANA' || upper === 'ES' || upper === 'ESP') return 'España'
  if (upper === 'PORTUGAL' || upper === 'PT') return 'Portugal'
  if (upper === 'FRANCIA' || upper === 'FRANCE' || upper === 'FR') return 'Francia'
  if (upper === 'ITALIA' || upper === 'ITALY' || upper === 'IT') return 'Italia'
  if (upper === 'REINO UNIDO' || upper === 'UK' || upper === 'GB') return 'Reino Unido'
  return toTitleCase(s)
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(message, answer => {
      rl.close()
      resolve(answer.toLowerCase().startsWith('s') || answer.toLowerCase().startsWith('y'))
    })
  })
}

// ── IMPORT: Proveedores ────────────────────────────────────

function mapSupplierTypes(val: unknown): string[] {
  const s = toStr(val)?.toUpperCase() || ''
  if (s.includes('COMPRA')) return ['fabric']
  if (s.includes('GENERAL')) return ['services']
  if (s.includes('ALQUILER')) return ['services']
  return ['other']
}

function mapPaymentTerms(val: unknown): string {
  const s = toStr(val)?.toUpperCase() || ''
  if (s.includes('10D')) return 'net_15'
  if (s.includes('15D')) return 'net_15'
  if (s.includes('30D')) return 'net_30'
  if (s.includes('60D')) return 'net_60'
  if (s.includes('90D')) return 'net_90'
  if (s.includes('TARJETA')) return 'immediate'
  if (s.includes('TRANSFERENCIA')) return 'net_30'
  if (s.includes('RECIBO')) return 'net_15'
  return 'net_30'
}

async function importProveedores(
  rows: Record<string, unknown>[],
  log: ImportLog
): Promise<void> {
  console.log('\n══════════════════════════════════════')
  console.log('  📦 Importando PROVEEDORES')
  console.log('══════════════════════════════════════')

  // Pre-cargar NIFs existentes
  const { data: existing } = await admin.from('suppliers').select('nif_cif').not('nif_cif', 'is', null)
  const existingNifs = new Set((existing || []).map(s => s.nif_cif?.toUpperCase()))

  let imported = 0
  let skipped = 0
  const errors: ErrorEntry[] = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const toInsert: Record<string, unknown>[] = []

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j]
      const rowNum = i + j + 2 // +2 por header y 0-index

      try {
        const nombre = toStr(row['Nombre'])
        const tratamiento = toStr(row['Tratamiento'])
        const name = [nombre, tratamiento].filter(Boolean).join(' ').trim()

        if (!name) {
          errors.push({ row: rowNum, error: 'Nombre vacío' })
          skipped++
          continue
        }

        const nif = toStr(row['NIF'])

        // Dedup por NIF
        if (nif && existingNifs.has(nif.toUpperCase())) {
          skipped++
          continue
        }

        const supplierData: Record<string, unknown> = {
          name,
          nif_cif: nif,
          contact_phone: cleanPhone(row['Teléfono fijo (facturación)']) || cleanPhone(row['Telefono fijo (facturacion)']),
          contact_email: cleanEmail(row['E-mail (facturación)']) || cleanEmail(row['E-mail (facturacion)']),
          address: toStr(row['Dirección 1 (facturación)']) || toStr(row['Direccion 1 (facturacion)']),
          postal_code: toStr(row['Código postal (facturación)']) || toStr(row['Codigo postal (facturacion)']),
          city: toStr(row['Ciudad (facturación)']) || toStr(row['Ciudad (facturacion)']),
          country: normalizeCountry(row['Código País (facturación)'] || row['Codigo Pais (facturacion)']),
          supplier_types: mapSupplierTypes(row['TIPO DE PROVEEDOR']),
          payment_terms: mapPaymentTerms(row['Código forma de pago'] || row['Codigo forma de pago']),
          bank_iban: toStr(row['IBAN']),
          internal_notes: 'Importado desde Excel',
          is_active: true,
        }

        toInsert.push(supplierData)
        if (nif) existingNifs.add(nif.toUpperCase())
      } catch (e) {
        errors.push({ row: rowNum, error: (e as Error).message })
        skipped++
      }
    }

    if (toInsert.length > 0) {
      const { data: inserted, error } = await admin
        .from('suppliers')
        .insert(toInsert)
        .select('id')

      if (error) {
        // Fallback: insertar uno a uno
        for (const item of toInsert) {
          const { data: single, error: singleErr } = await admin
            .from('suppliers')
            .insert(item)
            .select('id')
            .single()

          if (singleErr) {
            errors.push({ row: 0, error: singleErr.message, data: String(item.name) })
            skipped++
          } else {
            log.created_ids.suppliers.push(single.id)
            imported++
          }
        }
      } else {
        imported += (inserted || []).length
        for (const s of inserted || []) log.created_ids.suppliers.push(s.id)
      }
    }

    process.stdout.write(`\r  Progreso: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`)
  }

  log.proveedores = { imported, skipped, errors }
  console.log(`\n  ✅ Importados: ${imported} | Saltados: ${skipped} | Errores: ${errors.length}`)
}

// ── IMPORT: Clientes ───────────────────────────────────────

function splitClientName(raw: string | null, empresa: string | null): { first_name: string; last_name: string; nameNote: string | null } {
  if (!raw && empresa) {
    return { first_name: toTitleCase(empresa), last_name: '', nameNote: null }
  }
  if (!raw) {
    return { first_name: 'Sin nombre', last_name: '', nameNote: null }
  }

  // Extraer contenido entre paréntesis antes de limpiarlo
  let nameNote: string | null = null
  const parenMatch = raw.match(/\(([^)]+)\)/)
  if (parenMatch) {
    const content = parenMatch[1].trim()
    if (content.length > 1) nameNote = content
  }

  // Eliminar paréntesis y su contenido
  const cleaned = raw.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()

  const parts = cleaned.split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return { first_name: empresa ? toTitleCase(empresa) : 'Sin nombre', last_name: '', nameNote }
  }

  if (parts.length === 1) {
    return { first_name: toTitleCase(parts[0]), last_name: '', nameNote }
  }

  // Última palabra = apellido, resto = nombre
  const lastName = parts.pop()!
  const firstName = parts.join(' ')
  return {
    first_name: toTitleCase(firstName),
    last_name: toTitleCase(lastName),
    nameNote,
  }
}

async function importClientes(
  rows: Record<string, unknown>[],
  log: ImportLog
): Promise<void> {
  console.log('\n══════════════════════════════════════')
  console.log('  👤 Importando CLIENTES')
  console.log('══════════════════════════════════════')

  // Pre-cargar emails y teléfonos existentes
  const { data: existingEmails } = await admin.from('clients').select('email').not('email', 'is', null)
  const emailSet = new Set((existingEmails || []).map(c => c.email?.toLowerCase()))

  const { data: existingPhones } = await admin.from('clients').select('phone').not('phone', 'is', null)
  const phoneSet = new Set((existingPhones || []).map(c => c.phone))

  let imported = 0
  let skipped = 0
  const errors: ErrorEntry[] = []

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const toInsert: Record<string, unknown>[] = []

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j]
      const rowNum = i + j + 2

      try {
        const clienteRaw = toStr(row['Cliente'])
        const empresaRaw = toStr(row['EMPRESA'])
        const email = cleanEmail(row['email'])
        const phone = cleanPhone(row['Telefono'])

        // Dedup
        if (email && emailSet.has(email)) { skipped++; continue }
        if (!email && phone && phoneSet.has(phone)) { skipped++; continue }

        const { first_name, last_name, nameNote } = splitClientName(clienteRaw, empresaRaw)

        if (!first_name || first_name === 'Sin nombre') {
          if (!empresaRaw) {
            errors.push({ row: rowNum, error: 'Sin nombre ni empresa' })
            skipped++
            continue
          }
        }

        // Notas: combinar observaciones, medidas, última compra y nota del nombre
        const notesParts: string[] = []
        if (nameNote) notesParts.push(`Nota nombre: ${nameNote}`)
        const obs = toStr(row['OBSERVACIONES'])
        if (obs) notesParts.push(obs)
        const medidas = toStr(row['MEDIDAS'])
        if (medidas) notesParts.push(`Medidas: ${medidas}`)
        const ultimaCompra = toStr(row['UltimaCompraF'])
        if (ultimaCompra) notesParts.push(`Última compra: ${ultimaCompra}`)

        // Documento
        const cif = toStr(row['CIF'])
        const dni = toStr(row['DNI'])
        let documentNumber: string | null = null
        let documentType = 'DNI'
        let companyNif: string | null = null

        if (empresaRaw && cif) {
          companyNif = cif
        } else if (cif) {
          documentNumber = cif
          documentType = 'CIF'
        }
        if (dni) {
          documentNumber = dni
          documentType = 'DNI'
        }

        const clientData: Record<string, unknown> = {
          first_name,
          last_name,
          email,
          phone,
          phone_secondary: cleanPhone(row['Telefono2']),
          address: toStr(row['Direccion']),
          postal_code: toStr(row['Postal']),
          city: toStr(row['Poblacion']),
          province: toStr(row['Provincia']),
          country: 'España',
          date_of_birth: parseDate(row['FechaNacimient']),
          document_number: documentNumber,
          document_type: documentType,
          company_name: empresaRaw ? toTitleCase(empresaRaw) : null,
          company_nif: companyNif,
          client_type: empresaRaw ? 'company' : 'individual',
          internal_notes: notesParts.length > 0 ? notesParts.join('\n') : null,
          source: 'import_excel',
          is_active: true,
          accepts_marketing: false,
          newsletter_subscribed: false,
        }

        toInsert.push(clientData)
        if (email) emailSet.add(email)
        if (phone) phoneSet.add(phone)
      } catch (e) {
        errors.push({ row: rowNum, error: (e as Error).message })
        skipped++
      }
    }

    if (toInsert.length > 0) {
      const { data: inserted, error } = await admin
        .from('clients')
        .insert(toInsert)
        .select('id')

      if (error) {
        // Fallback: insertar uno a uno
        for (const item of toInsert) {
          const { data: single, error: singleErr } = await admin
            .from('clients')
            .insert(item)
            .select('id')
            .single()

          if (singleErr) {
            errors.push({ row: 0, error: singleErr.message, data: `${item.first_name} ${item.last_name}` })
            skipped++
          } else {
            log.created_ids.clients.push(single.id)
            imported++
          }
        }
      } else {
        imported += (inserted || []).length
        for (const c of inserted || []) log.created_ids.clients.push(c.id)
      }
    }

    process.stdout.write(`\r  Progreso: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`)
  }

  log.clientes = { imported, skipped, errors }
  console.log(`\n  ✅ Importados: ${imported} | Saltados: ${skipped} | Errores: ${errors.length}`)
}

// ── IMPORT: Artículos ──────────────────────────────────────

function mapSeason(val: unknown): string {
  const s = toStr(val)?.toUpperCase() || ''
  if (s === 'CONTINUIDAD') return 'all'
  if (s === 'INVIERNO' || s === 'CON.I') return 'aw'
  if (s === 'VERANO' || s === 'CON.V') return 'ss'
  // Nombres de marca (CROCK, GALLO, etc.) → continuidad
  return 'all'
}

const CATEGORY_MAP: Record<string, string> = {
  'ZAPATO': 'accesorios',
  'ZAPATOS': 'accesorios',
  'AMERICANA': 'americanas',
  'AMERICANAS': 'americanas',
  'PANTALON': 'pantalones',
  'PANTALONES': 'pantalones',
  'TRAJE': 'trajes',
  'TRAJES': 'trajes',
  'CAMISA': 'camisas-poleras',
  'CAMISAS': 'camisas-poleras',
  'COMPLEMENTO': 'accesorios',
  'COMPLEMENTOS': 'accesorios',
  'PRENDA EXTERIOR': 'prenda-exterior',
  'PRENDAS EXTERIOR': 'prenda-exterior',
  'PRENDAS DE EXTERIOR': 'prenda-exterior',
  'PUNTO': 'jerseys',
  'JERSEY': 'jerseys',
  'JERSEYS': 'jerseys',
  'PRENDA INTERIOR Y HOGAR': 'homewear',
  'PRENDAS INTERIOR Y HOGAR': 'homewear',
  'ROPA INTERIOR Y HOGAR': 'homewear',
  'TRAJE DE BAÑO': 'homewear',
  'REGALOS': 'regalos',
  'REGALO': 'regalos',
}

type ProductGroup = {
  codigo: string
  name: string
  brand: string | null
  season: string
  description: string | null
  category: string | null
  supplierName: string | null
  supplierRef: string | null
  costPrice: number | null
  pvp: number
  isVisibleWeb: boolean
  variants: {
    size: string | null
    barcode: string | null
    rowNum: number
  }[]
}

function groupArticulos(rows: Record<string, unknown>[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const codigo = toStr(row['CODIGO'])
    if (!codigo) continue

    const key = codigo.toString()

    if (!groups.has(key)) {
      const pvpRaw = row['PVP1']
      const pvp = typeof pvpRaw === 'number' ? pvpRaw : parseFloat(String(pvpRaw || '0')) || 0
      const costRaw = row['COSTE']
      const cost = typeof costRaw === 'number' ? costRaw : parseFloat(String(costRaw || '0'))

      const catRaw = toStr(row['CATEGORIA'])?.toUpperCase().trim() || ''
      const catSlug = CATEGORY_MAP[catRaw] || null

      const webRaw = toStr(row['WEB'])?.toUpperCase()

      groups.set(key, {
        codigo: key,
        name: toStr(row['NOMBRE DEL PRODUCTO']) || `Producto ${key}`,
        brand: toStr(row['MARCA']),
        season: mapSeason(row['TEMPORADA']),
        description: toStr(row['DESCRIPCION2']),
        category: catSlug,
        supplierName: toStr(row['PROVEEDOR']),
        supplierRef: toStr(row['REFERENCIA PROVEEDOR']),
        costPrice: cost && !isNaN(cost) ? cost : null,
        pvp,
        isVisibleWeb: webRaw === 'SI',
        variants: [],
      })
    }

    const group = groups.get(key)!
    const talla = toStr(row['TALLA'])
    const ean = cleanEan(row['EAN13'])

    group.variants.push({
      size: talla,
      barcode: ean,
      rowNum: i + 2,
    })
  }

  return Array.from(groups.values())
}

async function importArticulos(
  rows: Record<string, unknown>[],
  log: ImportLog
): Promise<void> {
  console.log('\n══════════════════════════════════════')
  console.log('  🏷️  Importando ARTÍCULOS')
  console.log('══════════════════════════════════════')

  // 1. Cargar categorías existentes
  const { data: categories } = await admin
    .from('product_categories')
    .select('id, slug')
    .eq('is_active', true)

  const categoryMap = new Map<string, string>()
  for (const cat of categories || []) {
    categoryMap.set(cat.slug, cat.id)
  }
  console.log(`  📂 Categorías disponibles: ${categoryMap.size}`)

  // 2. Cargar proveedores para matchear por nombre
  const { data: suppliers } = await admin
    .from('suppliers')
    .select('id, name')

  const supplierMap = new Map<string, string>()
  for (const s of suppliers || []) {
    supplierMap.set(s.name.toUpperCase(), s.id)
  }

  // 3. Cargar SKUs y barcodes existentes
  const { data: existingProducts } = await admin.from('products').select('sku')
  const existingSkus = new Set((existingProducts || []).map(p => p.sku))

  const { data: existingVariants } = await admin.from('product_variants').select('variant_sku, barcode')
  const existingVariantSkus = new Set((existingVariants || []).map(v => v.variant_sku))
  const existingBarcodes = new Set((existingVariants || []).filter(v => v.barcode).map(v => v.barcode))

  // 4. Agrupar filas por CODIGO
  const groups = groupArticulos(rows)
  console.log(`  📊 Productos únicos: ${groups.length} | Variantes totales: ${groups.reduce((s, g) => s + g.variants.length, 0)}`)

  let prodImported = 0
  let prodSkipped = 0
  const prodErrors: ErrorEntry[] = []
  let varImported = 0
  let varSkipped = 0
  const varErrors: ErrorEntry[] = []

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]

    try {
      const sku = `IMP-${group.codigo.padStart(5, '0')}`

      // Dedup producto
      if (existingSkus.has(sku)) {
        prodSkipped++
        // Aún así intentar variantes por si faltan
        const { data: existingProd } = await admin
          .from('products')
          .select('id')
          .eq('sku', sku)
          .single()

        if (existingProd) {
          await insertVariants(existingProd.id, sku, group.variants, existingVariantSkus, existingBarcodes, log, varErrors)
          varImported += group.variants.filter(v => {
            const vSku = `${sku}-${(v.size || 'UNICA').replace(/\s+/g, '')}`
            return !existingVariantSkus.has(vSku)
          }).length
        }
        continue
      }

      // Buscar proveedor
      let supplierId: string | null = null
      if (group.supplierName) {
        const upperName = group.supplierName.toUpperCase()
        // Buscar match exacto
        supplierId = supplierMap.get(upperName) || null
        // Si no, buscar parcial
        if (!supplierId) {
          for (const entry of Array.from(supplierMap.entries())) {
            if (entry[0].includes(upperName) || upperName.includes(entry[0])) {
              supplierId = entry[1]
              break
            }
          }
        }
      }

      // Buscar categoría
      let categoryId: string | null = null
      if (group.category) {
        categoryId = categoryMap.get(group.category) || null
        // Si no matchea exacto, buscar parcial
        if (!categoryId) {
          for (const entry of Array.from(categoryMap.entries())) {
            if (entry[0].includes(group.category) || group.category.includes(entry[0])) {
              categoryId = entry[1]
              break
            }
          }
        }
      }

      // Calcular base_price (sin IVA) desde PVP (con IVA)
      const basePrice = group.pvp > 0 ? Math.round((group.pvp / 1.21) * 100) / 100 : 0

      const slug = group.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      const productData: Record<string, unknown> = {
        sku,
        name: group.name,
        web_slug: `${slug}-${group.codigo}`,
        description: group.description,
        product_type: 'boutique',
        category_id: categoryId,
        brand: group.brand,
        season: group.season,
        cost_price: group.costPrice,
        base_price: basePrice,
        tax_rate: 21.00,
        supplier_id: supplierId,
        supplier_reference: group.supplierRef,
        is_visible_web: group.isVisibleWeb,
        is_active: true,
      }

      const { data: newProduct, error: prodErr } = await admin
        .from('products')
        .insert(productData)
        .select('id')
        .single()

      if (prodErr) {
        prodErrors.push({ row: group.variants[0]?.rowNum || 0, error: prodErr.message, data: group.name })
        prodSkipped++
        continue
      }

      log.created_ids.products.push(newProduct.id)
      existingSkus.add(sku)
      prodImported++

      // Insertar variantes
      await insertVariants(newProduct.id, sku, group.variants, existingVariantSkus, existingBarcodes, log, varErrors)
    } catch (e) {
      prodErrors.push({ row: group.variants[0]?.rowNum || 0, error: (e as Error).message, data: group.name })
      prodSkipped++
    }

    if ((gi + 1) % 100 === 0 || gi === groups.length - 1) {
      process.stdout.write(`\r  Progreso: ${gi + 1}/${groups.length} productos`)
    }
  }

  // Contar variantes reales
  varImported = log.created_ids.variants.length
  varSkipped = rows.length - varImported - varErrors.length

  log.productos = { imported: prodImported, skipped: prodSkipped, errors: prodErrors }
  log.variantes = { imported: varImported, skipped: varSkipped, errors: varErrors }
  console.log(`\n  ✅ Productos: ${prodImported} importados, ${prodSkipped} saltados, ${prodErrors.length} errores`)
  console.log(`  ✅ Variantes: ${varImported} importadas, ${varSkipped} saltadas, ${varErrors.length} errores`)
}

async function insertVariants(
  productId: string,
  productSku: string,
  variants: ProductGroup['variants'],
  existingVariantSkus: Set<string>,
  existingBarcodes: Set<string>,
  log: ImportLog,
  varErrors: ErrorEntry[]
): Promise<void> {
  const toInsert: Record<string, unknown>[] = []

  for (const v of variants) {
    const sizeStr = (v.size || 'UNICA').replace(/\s+/g, '')
    const variantSku = `${productSku}-${sizeStr}`

    if (existingVariantSkus.has(variantSku)) continue

    // Evitar barcodes duplicados
    let barcode = v.barcode
    if (barcode && existingBarcodes.has(barcode)) {
      barcode = null
    }

    toInsert.push({
      product_id: productId,
      variant_sku: variantSku,
      size: v.size,
      barcode,
      is_active: true,
    })

    existingVariantSkus.add(variantSku)
    if (barcode) existingBarcodes.add(barcode)
  }

  if (toInsert.length === 0) return

  // Insertar en batch
  const { data: inserted, error } = await admin
    .from('product_variants')
    .insert(toInsert)
    .select('id')

  if (error) {
    // Fallback: uno a uno
    for (const item of toInsert) {
      const { data: single, error: singleErr } = await admin
        .from('product_variants')
        .insert(item)
        .select('id')
        .single()

      if (singleErr) {
        varErrors.push({ row: 0, error: singleErr.message, data: String(item.variant_sku) })
      } else {
        log.created_ids.variants.push(single.id)
      }
    }
  } else {
    for (const v of inserted || []) log.created_ids.variants.push(v.id)
  }
}

// ── DRY-RUN helpers ────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')

function printSampleRows(label: string, rows: Record<string, unknown>[], mapFn: (row: Record<string, unknown>, idx: number) => Record<string, unknown>): void {
  console.log(`\n  --- ${label}: primeras 3 filas mapeadas ---`)
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const mapped = mapFn(rows[i], i)
    // Mostrar solo campos con valor
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(mapped)) {
      if (v !== null && v !== undefined && v !== '') clean[k] = v
    }
    console.log(`  [${i + 1}] ${JSON.stringify(clean, null, 0)}`)
  }
  console.log()
}

function dryRunProveedores(rows: Record<string, unknown>[]): void {
  printSampleRows('PROVEEDORES', rows, (row) => {
    const nombre = toStr(row['Nombre'])
    const tratamiento = toStr(row['Tratamiento'])
    return {
      name: [nombre, tratamiento].filter(Boolean).join(' '),
      nif_cif: toStr(row['NIF']),
      contact_phone: cleanPhone(row['Teléfono fijo (facturación)'] || row['Telefono fijo (facturacion)']),
      contact_email: cleanEmail(row['E-mail (facturación)'] || row['E-mail (facturacion)']),
      city: toStr(row['Ciudad (facturación)'] || row['Ciudad (facturacion)']),
      supplier_types: mapSupplierTypes(row['TIPO DE PROVEEDOR']),
      payment_terms: mapPaymentTerms(row['Código forma de pago'] || row['Codigo forma de pago']),
    }
  })

  // Estadísticas
  const nifs = rows.filter(r => toStr(r['NIF'])).length
  const emails = rows.filter(r => cleanEmail(r['E-mail (facturación)'] || r['E-mail (facturacion)'])).length
  const phones = rows.filter(r => cleanPhone(r['Teléfono fijo (facturación)'] || r['Telefono fijo (facturacion)'])).length
  console.log(`  Campos rellenos: NIF=${nifs}/${rows.length}, Email=${emails}/${rows.length}, Tel=${phones}/${rows.length}`)

  // Distribución de tipos
  const tipos: Record<string, number> = {}
  for (const r of rows) {
    const t = toStr(r['TIPO DE PROVEEDOR']) || '(vacío)'
    tipos[t] = (tipos[t] || 0) + 1
  }
  console.log(`  Tipos: ${JSON.stringify(tipos)}`)
}

function dryRunClientes(rows: Record<string, unknown>[]): void {
  printSampleRows('CLIENTES', rows, (row) => {
    const clienteRaw = toStr(row['Cliente'])
    const empresaRaw = toStr(row['EMPRESA'])
    const { first_name, last_name, nameNote } = splitClientName(clienteRaw, empresaRaw)
    return {
      first_name, last_name,
      email: cleanEmail(row['email']),
      phone: cleanPhone(row['Telefono']),
      company_name: empresaRaw ? toTitleCase(empresaRaw) : null,
      city: toStr(row['Poblacion']),
      province: toStr(row['Provincia']),
      date_of_birth: parseDate(row['FechaNacimient']),
      document_number: toStr(row['DNI']) || toStr(row['CIF']),
      client_type: empresaRaw ? 'company' : 'individual',
      nameNote,
    }
  })

  // Estadísticas
  const withEmail = rows.filter(r => cleanEmail(r['email'])).length
  const withPhone = rows.filter(r => cleanPhone(r['Telefono'])).length
  const withName = rows.filter(r => toStr(r['Cliente'])).length
  const withEmpresa = rows.filter(r => toStr(r['EMPRESA'])).length
  const withDni = rows.filter(r => toStr(r['DNI'])).length
  const withDob = rows.filter(r => parseDate(r['FechaNacimient'])).length
  console.log(`  Campos rellenos: Nombre=${withName}, Empresa=${withEmpresa}, Email=${withEmail}, Tel=${withPhone}, DNI=${withDni}, FechaNac=${withDob}`)
  console.log(`  Potenciales empresas: ${withEmpresa} de ${rows.length}`)
}

function dryRunArticulos(rows: Record<string, unknown>[], groups: ProductGroup[]): void {
  printSampleRows('ARTICULOS (filas raw)', rows, (row) => ({
    CODIGO: toStr(row['CODIGO']),
    NOMBRE: toStr(row['NOMBRE DEL PRODUCTO']),
    TALLA: toStr(row['TALLA']),
    PVP1: row['PVP1'],
    COSTE: row['COSTE'],
    MARCA: toStr(row['MARCA']),
    CATEGORIA: toStr(row['CATEGORIA']),
    EAN13: cleanEan(row['EAN13']),
    PROVEEDOR: toStr(row['PROVEEDOR']),
    WEB: toStr(row['WEB']),
    TEMPORADA: toStr(row['TEMPORADA']),
  }))

  // Primeros 3 grupos mapeados
  console.log('  --- PRODUCTOS agrupados: primeros 3 ---')
  for (let i = 0; i < Math.min(3, groups.length); i++) {
    const g = groups[i]
    const sku = `IMP-${g.codigo.padStart(5, '0')}`
    const basePrice = g.pvp > 0 ? Math.round((g.pvp / 1.21) * 100) / 100 : 0
    console.log(`  [${i + 1}] SKU=${sku} | "${g.name}" | PVP=${g.pvp} → base=${basePrice} | Brand=${g.brand} | Cat=${g.category} | Prov=${g.supplierName} | ${g.variants.length} variantes: [${g.variants.map(v => v.size).join(', ')}]`)
  }
  console.log()

  // Distribución de categorías
  const cats: Record<string, number> = {}
  for (const g of groups) {
    const c = g.category || '(sin categoría)'
    cats[c] = (cats[c] || 0) + 1
  }
  console.log(`  Categorías: ${JSON.stringify(cats)}`)

  // Distribución de marcas (top 10)
  const brands: Record<string, number> = {}
  for (const g of groups) {
    const b = g.brand || '(sin marca)'
    brands[b] = (brands[b] || 0) + 1
  }
  const topBrands = Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 10)
  console.log(`  Top 10 marcas: ${topBrands.map(([b, n]) => `${b}(${n})`).join(', ')}`)

  // Distribución de variantes por producto
  const varCounts = groups.map(g => g.variants.length)
  const avg = (varCounts.reduce((s, v) => s + v, 0) / varCounts.length).toFixed(1)
  const max = Math.max(...varCounts)
  const min = Math.min(...varCounts)
  console.log(`  Variantes por producto: min=${min}, max=${max}, media=${avg}`)

  // Proveedores únicos
  const uniqueSuppliers = new Set(groups.map(g => g.supplierName).filter(Boolean))
  console.log(`  Proveedores únicos referenciados: ${uniqueSuppliers.size}`)

  // Con web=true
  const webCount = groups.filter(g => g.isVisibleWeb).length
  console.log(`  Visibles en web: ${webCount} de ${groups.length}`)
}

// ── MAIN ───────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════╗')
  console.log(`║   IMPORTACIÓN DE DATOS — Sastrería Prats ${DRY_RUN ? '(DRY)' : '     '} ║`)
  console.log('╚════════════════════════════════════════════════╝')
  console.log()

  if (DRY_RUN) {
    console.log('  ⚠️  MODO DRY-RUN: solo lectura, no se insertará nada\n')
  }

  // Verificar que los archivos existen
  for (const [key, filePath] of Object.entries(FILES)) {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Archivo no encontrado: ${filePath}`)
      console.error(`   Asegúrate de que los archivos están en ${IMPORT_DIR}/`)
      process.exit(1)
    }
    const stats = fs.statSync(filePath)
    console.log(`  ✓ ${key}: ${filePath} (${(stats.size / 1024).toFixed(0)} KB)`)
  }
  console.log()

  // Leer archivos
  console.log('📖 Leyendo archivos Excel...')
  const proveedoresRows = readExcel(FILES.proveedores, SHEETS.proveedores)
  const clientesRows = readExcel(FILES.clientes, SHEETS.clientes)
  const articulosRows = readExcel(FILES.articulos, SHEETS.articulos)

  const productGroups = groupArticulos(articulosRows)

  // Mostrar columnas disponibles en cada archivo
  console.log('\n  📋 Columnas en PROVEEDORES:', Object.keys(proveedoresRows[0] || {}).join(', '))
  console.log('  📋 Columnas en CLIENTES:', Object.keys(clientesRows[0] || {}).join(', '))
  console.log('  📋 Columnas en ARTICULOS:', Object.keys(articulosRows[0] || {}).join(', '))

  console.log()
  console.log('╔════════════════════════════════════════════════╗')
  console.log('║               RESUMEN PRE-IMPORT              ║')
  console.log('╠════════════════════════════════════════════════╣')
  console.log(`║  📦 Proveedores:  ${String(proveedoresRows.length).padStart(6)} registros             ║`)
  console.log(`║  👤 Clientes:     ${String(clientesRows.length).padStart(6)} registros             ║`)
  console.log(`║  🏷️  Productos:    ${String(productGroups.length).padStart(6)} productos únicos      ║`)
  console.log(`║  📐 Variantes:    ${String(articulosRows.length).padStart(6)} filas (tallas)        ║`)
  console.log('╚════════════════════════════════════════════════╝')

  if (DRY_RUN) {
    console.log('\n══════════════════════════════════════')
    console.log('  DRY-RUN: Mapeo detallado')
    console.log('══════════════════════════════════════')
    dryRunProveedores(proveedoresRows)
    console.log()
    dryRunClientes(clientesRows)
    console.log()
    dryRunArticulos(articulosRows, productGroups)

    console.log('\n✅ Dry-run completado. Ningún dato fue modificado.')
    process.exit(0)
  }

  // Verificar conexión a Supabase
  const { error: pingError } = await admin.from('stores').select('id').limit(1)
  if (pingError) {
    console.error(`❌ No se puede conectar a Supabase: ${pingError.message}`)
    process.exit(1)
  }
  console.log('  ✓ Conexión a Supabase OK\n')

  const proceed = await confirm('¿Continuar con la importación? [s/n] ')
  if (!proceed) {
    console.log('❌ Importación cancelada.')
    process.exit(0)
  }

  const log: ImportLog = {
    timestamp: new Date().toISOString(),
    proveedores: { imported: 0, skipped: 0, errors: [] },
    clientes: { imported: 0, skipped: 0, errors: [] },
    productos: { imported: 0, skipped: 0, errors: [] },
    variantes: { imported: 0, skipped: 0, errors: [] },
    created_ids: { suppliers: [], clients: [], products: [], variants: [] },
  }

  const startTime = Date.now()

  // Orden: proveedores → productos (referencian proveedores) → clientes
  await importProveedores(proveedoresRows, log)
  await importArticulos(articulosRows, log)
  await importClientes(clientesRows, log)

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n')
  console.log('╔════════════════════════════════════════════════╗')
  console.log('║              RESULTADO FINAL                  ║')
  console.log('╠════════════════════════════════════════════════╣')
  console.log(`║  📦 Proveedores: ${String(log.proveedores.imported).padStart(5)} importados, ${String(log.proveedores.skipped).padStart(5)} saltados ║`)
  console.log(`║  👤 Clientes:    ${String(log.clientes.imported).padStart(5)} importados, ${String(log.clientes.skipped).padStart(5)} saltados ║`)
  console.log(`║  🏷️  Productos:   ${String(log.productos.imported).padStart(5)} importados, ${String(log.productos.skipped).padStart(5)} saltados ║`)
  console.log(`║  📐 Variantes:   ${String(log.variantes.imported).padStart(5)} importados, ${String(log.variantes.skipped).padStart(5)} saltados ║`)
  console.log(`║  ⏱️  Tiempo:      ${elapsed}s                           ║`)
  console.log('╚════════════════════════════════════════════════╝')

  // Errores detallados
  const allErrors = [
    ...log.proveedores.errors.map(e => ({ ...e, tabla: 'proveedores' })),
    ...log.clientes.errors.map(e => ({ ...e, tabla: 'clientes' })),
    ...log.productos.errors.map(e => ({ ...e, tabla: 'productos' })),
    ...log.variantes.errors.map(e => ({ ...e, tabla: 'variantes' })),
  ]
  if (allErrors.length > 0) {
    console.log(`\n⚠️  ${allErrors.length} errores encontrados:`)
    for (const e of allErrors.slice(0, 20)) {
      console.log(`   [${e.tabla}] Fila ${e.row}: ${e.error}${e.data ? ` (${e.data})` : ''}`)
    }
    if (allErrors.length > 20) {
      console.log(`   ... y ${allErrors.length - 20} errores más (ver log)`)
    }
  }

  // Guardar log
  const logPath = path.join(process.cwd(), 'import-log.json')
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf-8')
  console.log(`\n📄 Log guardado en: ${logPath}`)

  // Resumen de IDs para rollback
  console.log(`\n🔑 IDs creados para rollback:`)
  console.log(`   Proveedores: ${log.created_ids.suppliers.length}`)
  console.log(`   Clientes: ${log.created_ids.clients.length}`)
  console.log(`   Productos: ${log.created_ids.products.length}`)
  console.log(`   Variantes: ${log.created_ids.variants.length}`)
}

main().catch(e => {
  console.error('💥 Error fatal:', e)
  process.exit(1)
})
