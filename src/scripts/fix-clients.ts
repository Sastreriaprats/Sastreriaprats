/**
 * FIX CLIENTS — Corregir datos de empresa y eliminar duplicados
 * npx tsx src/scripts/fix-clients.ts
 * npx tsx src/scripts/fix-clients.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const DRY_RUN = process.argv.includes('--dry-run')
const FILE_PATH = 'C:/Users/USUARIO/Downloads/BBDD CLIENTES BOUTIQUE Y SASTRERIA.xlsx'

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

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  const s = String(val).trim()
  if (/^\d+\.0$/.test(s)) return s.replace('.0', '')
  return s || null
}

function cleanPhone(val: unknown): string | null {
  const s = toStr(val)
  if (!s) return null
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

// Score how "complete" a client record is
function completenessScore(c: Record<string, unknown>): number {
  let score = 0
  const fields = ['email', 'phone', 'phone_secondary', 'address', 'city', 'postal_code',
    'province', 'company_name', 'company_nif', 'document_number', 'date_of_birth', 'internal_notes']
  for (const f of fields) {
    if (c[f] !== null && c[f] !== undefined && c[f] !== '') score++
  }
  return score
}

// Merge two client records: keep non-null values from secondary into primary
function mergeClientData(primary: Record<string, unknown>, secondary: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  const mergeFields = ['phone', 'phone_secondary', 'address', 'city', 'postal_code',
    'province', 'company_name', 'company_nif', 'document_number', 'document_type',
    'date_of_birth', 'internal_notes', 'nationality']
  for (const f of mergeFields) {
    if ((!primary[f] || primary[f] === '') && secondary[f] && secondary[f] !== '') {
      updates[f] = secondary[f]
    }
  }
  // Merge notes
  if (secondary.internal_notes && primary.internal_notes && secondary.internal_notes !== primary.internal_notes) {
    updates.internal_notes = primary.internal_notes + '\n' + secondary.internal_notes
  }
  return updates
}

async function loadAllClients(): Promise<Record<string, unknown>[]> {
  let all: Record<string, unknown>[] = []
  let offset = 0
  while (true) {
    const { data } = await admin.from('clients')
      .select('*')
      .eq('source', 'import_excel')
      .range(offset, offset + 999)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < 1000) break
    offset += 1000
  }
  return all
}

async function main(): Promise<void> {
  console.log(`=== FIX CLIENTS ${DRY_RUN ? '(DRY-RUN)' : ''} ===\n`)

  // ── FASE 1: Actualizar datos de empresa desde Excel ──────

  console.log('--- FASE 1: Datos de empresa ---')

  if (fs.existsSync(FILE_PATH)) {
    const wb = XLSX.readFile(FILE_PATH)
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets['Hoja1'], { defval: null })

    let empresaUpdated = 0
    let empresaSkipped = 0

    for (const row of rows) {
      const empresa = toStr(row['EMPRESA'])
      if (!empresa) continue

      const email = cleanEmail(row['email'])
      const phone = cleanPhone(row['Telefono'])
      const cif = toStr(row['CIF'])

      // Find client by email or phone
      let clientId: string | null = null
      if (email) {
        const { data } = await admin.from('clients').select('id, company_name').eq('email', email).eq('source', 'import_excel').limit(1).maybeSingle()
        if (data) clientId = data.id
      }
      if (!clientId && phone) {
        const { data } = await admin.from('clients').select('id, company_name').eq('phone', phone).eq('source', 'import_excel').limit(1).maybeSingle()
        if (data) clientId = data.id
      }

      if (!clientId) { empresaSkipped++; continue }

      const updatePayload: Record<string, unknown> = {
        company_name: empresa,
        client_type: 'company',
      }
      if (cif) updatePayload.company_nif = cif

      if (!DRY_RUN) {
        await admin.from('clients').update(updatePayload).eq('id', clientId)
      }
      empresaUpdated++
    }

    console.log(`  Empresas actualizadas: ${empresaUpdated}`)
    console.log(`  Sin match: ${empresaSkipped}`)
  } else {
    console.log('  Excel no encontrado, saltando fase 1')
  }

  // ── FASE 2: Eliminar duplicados ──────────────────────────

  console.log('\n--- FASE 2: Duplicados por email ---')

  const allClients = await loadAllClients()
  console.log(`  Total clientes: ${allClients.length}`)

  // Group by email
  const emailGroups = new Map<string, Record<string, unknown>[]>()
  for (const c of allClients) {
    const email = c.email as string | null
    if (!email) continue
    if (!emailGroups.has(email)) emailGroups.set(email, [])
    emailGroups.get(email)!.push(c)
  }

  let emailDupsRemoved = 0
  let emailDupsMerged = 0
  const idsDeleted = new Set<string>()

  for (const [email, group] of Array.from(emailGroups.entries())) {
    if (group.length <= 1) continue

    // Sort by completeness, keep the best
    group.sort((a, b) => completenessScore(b) - completenessScore(a))
    const keep = group[0]
    const remove = group.slice(1)

    // Merge data from duplicates into the keeper
    let mergedUpdates: Record<string, unknown> = {}
    for (const dup of remove) {
      const updates = mergeClientData(keep, dup)
      mergedUpdates = { ...mergedUpdates, ...updates }
    }

    if (Object.keys(mergedUpdates).length > 0 && !DRY_RUN) {
      await admin.from('clients').update(mergedUpdates).eq('id', keep.id as string)
      emailDupsMerged++
    }

    // Delete duplicates
    for (const dup of remove) {
      const dupId = dup.id as string
      if (idsDeleted.has(dupId)) continue
      if (!DRY_RUN) {
        await admin.from('clients').delete().eq('id', dupId)
      }
      idsDeleted.add(dupId)
      emailDupsRemoved++
    }
  }

  console.log(`  Duplicados email eliminados: ${emailDupsRemoved}`)
  console.log(`  Registros combinados: ${emailDupsMerged}`)

  // Reload after email dedup
  console.log('\n--- FASE 3: Duplicados por teléfono ---')

  const afterEmailDedup = DRY_RUN ? allClients.filter(c => !idsDeleted.has(c.id as string)) : await loadAllClients()
  console.log(`  Clientes tras dedup email: ${afterEmailDedup.length}`)

  const phoneGroups = new Map<string, Record<string, unknown>[]>()
  for (const c of afterEmailDedup) {
    const phone = c.phone as string | null
    if (!phone) continue
    if (!phoneGroups.has(phone)) phoneGroups.set(phone, [])
    phoneGroups.get(phone)!.push(c)
  }

  let phoneDupsRemoved = 0
  let phoneDupsMerged = 0

  for (const [phone, group] of Array.from(phoneGroups.entries())) {
    if (group.length <= 1) continue

    group.sort((a, b) => completenessScore(b) - completenessScore(a))
    const keep = group[0]
    const remove = group.slice(1)

    let mergedUpdates: Record<string, unknown> = {}
    for (const dup of remove) {
      const updates = mergeClientData(keep, dup)
      mergedUpdates = { ...mergedUpdates, ...updates }
    }

    if (Object.keys(mergedUpdates).length > 0 && !DRY_RUN) {
      await admin.from('clients').update(mergedUpdates).eq('id', keep.id as string)
      phoneDupsMerged++
    }

    for (const dup of remove) {
      const dupId = dup.id as string
      if (idsDeleted.has(dupId)) continue
      if (!DRY_RUN) {
        await admin.from('clients').delete().eq('id', dupId)
      }
      idsDeleted.add(dupId)
      phoneDupsRemoved++
    }
  }

  console.log(`  Duplicados teléfono eliminados: ${phoneDupsRemoved}`)
  console.log(`  Registros combinados: ${phoneDupsMerged}`)

  // Final count
  const { count: finalCount } = await admin.from('clients').select('id', { count: 'exact', head: true }).eq('source', 'import_excel')
  const { count: companyCount } = await admin.from('clients').select('id', { count: 'exact', head: true }).eq('client_type', 'company').eq('source', 'import_excel')

  console.log(`\n=== RESULTADO ===`)
  console.log(`  Total clientes: ${finalCount}`)
  console.log(`  Tipo empresa: ${companyCount}`)
  console.log(`  Duplicados eliminados: ${idsDeleted.size}`)
  if (DRY_RUN) console.log('  (dry-run, ningún dato modificado)')
}

main().catch(e => { console.error('Error:', e); process.exit(1) })
