/**
 * FIX CLIENTS v3 — Dedup agresivo + empresas a client_companies
 * npx tsx src/scripts/fix-clients.ts
 * npx tsx src/scripts/fix-clients.ts --dry-run
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
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

const admin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// ── Helpers ────────────────────────────────────────────────

function toStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  if (/^\d+\.0$/.test(s)) return s.replace('.0', '')
  return s || null
}

function cleanPhone(v: unknown): string | null {
  const s = toStr(v)
  if (!s) return null
  const c = s.replace(/[^0-9+]/g, '')
  return c.length >= 6 && c !== '0' ? c : null
}

function cleanEmail(v: unknown): string | null {
  const s = toStr(v)
  if (!s) return null
  const e = s.toLowerCase().trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim()
}

const DEP_TABLES = ['sales', 'tailoring_orders', 'appointments', 'boutique_alterations',
  'client_measurements', 'vouchers', 'returns', 'contact_requests']

async function reassignAndDelete(keepId: string, dupId: string): Promise<number> {
  let deps = 0
  for (const table of DEP_TABLES) {
    const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).eq('client_id', dupId)
    if (count && count > 0) {
      if (!DRY_RUN) await admin.from(table).update({ client_id: keepId }).eq('client_id', dupId)
      deps += count
    }
  }
  // Move companies
  if (!DRY_RUN) await admin.from('client_companies').update({ client_id: keepId }).eq('client_id', dupId)
  // Merge fields
  if (!DRY_RUN) {
    const { data: keepData } = await admin.from('clients').select('*').eq('id', keepId).single()
    const { data: dupData } = await admin.from('clients').select('*').eq('id', dupId).single()
    if (keepData && dupData) {
      const updates: Record<string, unknown> = {}
      for (const f of ['phone', 'phone_secondary', 'email', 'address', 'city', 'postal_code', 'province',
        'company_name', 'company_nif', 'document_number', 'date_of_birth']) {
        if ((!keepData[f] || keepData[f] === '') && dupData[f] && dupData[f] !== '') updates[f] = dupData[f]
      }
      if (Object.keys(updates).length > 0) await admin.from('clients').update(updates).eq('id', keepId)
    }
  }
  // Delete
  if (!DRY_RUN) await admin.from('clients').delete().eq('id', dupId)
  return deps
}

async function loadAll(): Promise<Record<string, unknown>[]> {
  let all: Record<string, unknown>[] = []
  let off = 0
  while (true) {
    const { data } = await admin.from('clients').select('*').eq('source', 'import_excel').range(off, off + 999)
    if (!data || !data.length) break
    all = all.concat(data)
    if (data.length < 1000) break
    off += 1000
  }
  return all
}

// ── Main ───────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`=== FIX CLIENTS v3 ${DRY_RUN ? '(DRY-RUN)' : ''} ===\n`)

  // ── PASO 1: Leer Excel y agrupar por persona ──────────

  console.log('--- PASO 1: Leer Excel ---')
  type PersonInfo = {
    keys: Set<string> // emails + phones para buscar en BD
    name: string
    empresas: { nombre: string; cif: string | null }[]
  }

  const personas = new Map<string, PersonInfo>()

  if (fs.existsSync(FILE_PATH)) {
    const wb = XLSX.readFile(FILE_PATH)
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(wb.Sheets['Hoja1'], { defval: null })

    for (const row of rows) {
      const email = cleanEmail(row['email'])
      const phone = cleanPhone(row['Telefono'])
      const nombre = toStr(row['Cliente'])
      const empresa = toStr(row['EMPRESA'])
      const cif = toStr(row['CIF'])

      // Clave de agrupación: email > phone > nombre normalizado
      let groupKey: string
      if (email) groupKey = `email:${email}`
      else if (phone) groupKey = `phone:${phone}`
      else if (nombre) groupKey = `name:${norm(nombre)}`
      else continue

      if (!personas.has(groupKey)) {
        personas.set(groupKey, { keys: new Set(), name: nombre || empresa || '', empresas: [] })
      }
      const p = personas.get(groupKey)!
      if (email) p.keys.add(`email:${email}`)
      if (phone) p.keys.add(`phone:${phone}`)
      if (nombre && norm(nombre)) p.keys.add(`name:${norm(nombre)}`)
      // Nombre más largo = más completo
      if (nombre && nombre.length > p.name.length) p.name = nombre

      if (empresa && !p.empresas.some(e => e.nombre === empresa && e.cif === cif)) {
        p.empresas.push({ nombre: empresa, cif })
      }
    }
    console.log(`  Personas únicas en Excel: ${personas.size}`)
    console.log(`  Con empresa: ${Array.from(personas.values()).filter(p => p.empresas.length > 0).length}`)
    console.log(`  Con múltiples empresas: ${Array.from(personas.values()).filter(p => p.empresas.length > 1).length}`)
  } else {
    console.log(`  Excel no encontrado: ${FILE_PATH}`)
  }

  // ── PASO 2: Dedup en BD ───────────────────────────────

  console.log('\n--- PASO 2: Dedup agresivo ---')
  const allClients = await loadAll()
  console.log(`  Clientes en BD: ${allClients.length}`)

  // Construir índice: cada cliente → sus claves (email, phone, nombre normalizado)
  const clientKeys = new Map<string, Set<string>>() // clientId → keys
  const keyToClients = new Map<string, string[]>()   // key → clientIds

  for (const c of allClients) {
    const id = c.id as string
    const keys = new Set<string>()
    const email = (c.email as string || '').toLowerCase().trim()
    const phone = (c.phone as string || '').trim()
    const fullName = norm(`${c.first_name || ''} ${c.last_name || ''}`)

    if (email) keys.add(`email:${email}`)
    if (phone && phone !== '0') keys.add(`phone:${phone}`)
    if (fullName) keys.add(`name:${fullName}`)

    clientKeys.set(id, keys)
    for (const k of Array.from(keys)) {
      if (!keyToClients.has(k)) keyToClients.set(k, [])
      keyToClients.get(k)!.push(id)
    }
  }

  // Union-Find para agrupar clientes que comparten cualquier clave
  const parent = new Map<string, string>()
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x)
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)! }
    return x
  }
  function union(a: string, b: string): void {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  // Agrupar clientes que comparten alguna clave
  for (const [, ids] of Array.from(keyToClients.entries())) {
    if (ids.length <= 1) continue
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i])
  }

  // Construir grupos
  const groups = new Map<string, string[]>()
  for (const c of allClients) {
    const id = c.id as string
    const root = find(id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(id)
  }

  const dupGroups = Array.from(groups.values()).filter(g => g.length > 1)
  const totalDups = dupGroups.reduce((s, g) => s + g.length - 1, 0)
  console.log(`  Grupos con duplicados: ${dupGroups.length} (${totalDups} registros sobrantes)`)

  let merged = 0
  let depsReassigned = 0

  const clientById = new Map(allClients.map(c => [c.id as string, c]))

  for (const group of dupGroups) {
    // Ordenar: el más completo primero, luego el más antiguo
    const sorted = group
      .map(id => clientById.get(id)!)
      .filter(Boolean)
      .sort((a, b) => {
        // Más campos rellenos = más completo
        let scoreA = 0, scoreB = 0
        for (const f of ['email', 'phone', 'address', 'company_name', 'document_number', 'date_of_birth']) {
          if (a[f] && a[f] !== '') scoreA++
          if (b[f] && b[f] !== '') scoreB++
        }
        if (scoreB !== scoreA) return scoreB - scoreA
        return new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
      })

    const keep = sorted[0]
    const dups = sorted.slice(1)

    for (const dup of dups) {
      const deps = await reassignAndDelete(keep.id as string, dup.id as string)
      depsReassigned += deps
      merged++
    }
  }

  console.log(`  Fusionados: ${merged}`)
  console.log(`  Dependencias reasignadas: ${depsReassigned}`)

  // ── PASO 3: Empresas a client_companies ────────────────

  console.log('\n--- PASO 3: Empresas a client_companies ---')

  // Recargar clientes tras dedup
  const freshClients = DRY_RUN ? allClients : await loadAll()
  let empresasCreated = 0
  let empresasSkipped = 0

  for (const [, persona] of Array.from(personas.entries())) {
    if (persona.empresas.length === 0) continue

    // Buscar el cliente en la BD por cualquiera de sus claves
    let clientId: string | null = null
    for (const key of Array.from(persona.keys)) {
      if (clientId) break
      const [type, value] = key.split(':')
      if (type === 'email') {
        const match = freshClients.find(c => (c.email as string || '').toLowerCase() === value)
        if (match) clientId = match.id as string
      } else if (type === 'phone') {
        const match = freshClients.find(c => (c.phone as string) === value)
        if (match) clientId = match.id as string
      } else if (type === 'name') {
        const match = freshClients.find(c => norm(`${c.first_name || ''} ${c.last_name || ''}`) === value)
        if (match) clientId = match.id as string
      }
    }

    if (!clientId) { empresasSkipped += persona.empresas.length; continue }

    // Get existing companies
    const { data: existing } = await admin.from('client_companies').select('nif, company_name').eq('client_id', clientId)
    const existingNifs = new Set((existing || []).map((c: any) => (c.nif || '').toUpperCase()))
    const existingNames = new Set((existing || []).map((c: any) => (c.company_name || '').toUpperCase()))
    let isFirst = !existing || existing.length === 0

    for (const emp of persona.empresas) {
      const nifU = (emp.cif || '').toUpperCase()
      const nameU = emp.nombre.toUpperCase()
      if ((nifU && existingNifs.has(nifU)) || existingNames.has(nameU)) {
        empresasSkipped++
        continue
      }

      if (!DRY_RUN) {
        await admin.from('client_companies').insert({
          client_id: clientId,
          company_name: emp.nombre,
          nif: emp.cif,
          is_default: isFirst,
        })
        await admin.from('clients').update({ client_type: 'company' }).eq('id', clientId)
      }
      existingNifs.add(nifU)
      existingNames.add(nameU)
      isFirst = false
      empresasCreated++
    }
  }

  console.log(`  Empresas creadas: ${empresasCreated}`)
  console.log(`  Saltadas: ${empresasSkipped}`)

  // ── Resumen ────────────────────────────────────────────

  const { count: total } = await admin.from('clients').select('id', { count: 'exact', head: true }).eq('source', 'import_excel')
  const { count: companies } = await admin.from('client_companies').select('id', { count: 'exact', head: true })

  console.log(`\n╔════════════════════════════════════════════════╗`)
  console.log(`║              RESUMEN FINAL                     ║`)
  console.log(`╠════════════════════════════════════════════════╣`)
  console.log(`║  Duplicados fusionados:       ${String(merged).padStart(6)}           ║`)
  console.log(`║  Dependencias reasignadas:    ${String(depsReassigned).padStart(6)}           ║`)
  console.log(`║  Empresas creadas:            ${String(empresasCreated).padStart(6)}           ║`)
  console.log(`║  Total clientes:              ${String(total).padStart(6)}           ║`)
  console.log(`║  Total client_companies:      ${String(companies).padStart(6)}           ║`)
  console.log(`╚════════════════════════════════════════════════╝`)
  if (DRY_RUN) console.log('  (dry-run, ningún dato modificado)')
}

main().catch(e => { console.error('Error:', e); process.exit(1) })
