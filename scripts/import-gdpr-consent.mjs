#!/usr/bin/env node
// =============================================================================
// scripts/import-gdpr-consent.mjs
//
// Importa el consentimiento RGPD firmado en papel a la tabla `clients`.
// Marca accepts_data_storage=true + data_consent_date=NOW() en clientes
// existentes (match por DNI > email) y crea nuevos cuando no hay match.
//
// Filosofía:
//   - NUNCA pisa datos del cliente existente. Solo enriquece campos NULL
//     y marca el consentimiento.
//   - first_name/last_name del CSV NO se aplican si BBDD ya tiene valores.
//     Si el nombre del CSV es significativamente distinto, anota en
//     internal_notes: "[RGPD 2026-05-25] Firmado como: <nombre CSV>".
//   - Saltar DNIs placeholder (01234567A, 12345678A, etc.) y loguear.
//   - Deduplicar internamente el CSV antes de procesar (preferir filas
//     con email y nombre más completo).
//
// Uso:
//   node scripts/import-gdpr-consent.mjs --help
//   node scripts/import-gdpr-consent.mjs --file ./gdpr.csv --dry-run
//   node scripts/import-gdpr-consent.mjs --file ./gdpr.csv --apply
//
// Variables de entorno (en .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// =============================================================================

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, basename } from 'node:path'

config({ path: '.env.local' })

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const BATCH_ID = 'GDPR-PAPEL-2026-05-25'
const SOURCE_NEW = 'gdpr_paper_2026'
const NOTE_PREFIX = '[RGPD 2026-05-25] Firmado como: '
const NOTE_PREFIX_EMAIL_ALT = '[RGPD 2026-05-25] Email alternativo firmado: '
const NOTE_PREFIX_NAME_ALT = '[RGPD 2026-05-25] Nombre alternativo firmado: '

const PLACEHOLDER_DNIS = new Set(['01234567A', '12345678A', '00000000A', '99999999A'])
const REPEATING_DNI_RE = /^(\d)\1{7}[A-Z]$/i
const VALID_DNI_RE = /^\d{8}[A-Z]$/i
const VALID_NIE_RE = /^[XYZ]\d{7}[A-Z]$/i

// =============================================================================
// CLI
// =============================================================================

function printHelp() {
  console.log(`
Uso:
  node scripts/import-gdpr-consent.mjs --file <ruta.csv> [--dry-run | --apply]

Flags:
  --file <ruta>   CSV con cabeceras: Nombre, Apellidos, DNI, Correo Electrónico
                  (separator ; o ,, autodetect; encoding UTF-8 con o sin BOM)
  --dry-run       Procesa el CSV y genera el reporte SIN tocar Supabase.
  --apply         Aplica los cambios (UPDATE / INSERT) en Supabase.
  --help          Muestra esta ayuda.

Exclusivos: --dry-run y --apply NO pueden combinarse.

Salida:
  - stdout: progreso + resumen agregado al final.
  - tmp/gdpr-import-report-{YYYYMMDD-HHMMSS}.csv: detalle fila a fila.

Lógica de matching:
  1. DNI normalizado (uppercase, sin espacios) si es válido.
  2. Email (lowercase, trim) si no hubo match por DNI.
  3. Si tampoco: INSERT nuevo con client_code = CLI-{YEAR}-{NNNN}.

Enriquecimiento (solo si BBDD tiene el campo NULL):
  - document_number, email, internal_notes (solo si nombre difiere).

Trazabilidad:
  - source = '${SOURCE_NEW}' (solo en nuevos)
  - migration_batch = '${BATCH_ID}' (solo si era NULL; preserva histórico)
  - data_consent_date = ISO timestamp del momento de ejecución

Placeholders rechazados:
  - DNIs literales: ${[...PLACEHOLDER_DNIS].join(', ')}
  - DNIs con 8 dígitos iguales (regex ^(\\d)\\1{7}[A-Z]$)
  - DNIs con formato inválido (no DNI ni NIE)
`)
}

function parseArgs(argv) {
  const out = { help: false, file: null, dryRun: false, apply: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--file') out.file = argv[++i]
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--apply') out.apply = true
    else { console.error(`Flag desconocido: ${a}`); process.exit(2) }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))

if (args.help) { printHelp(); process.exit(0) }

if (!args.file) {
  console.error('Falta --file <ruta.csv>. Usa --help para ver ayuda.')
  process.exit(2)
}
if (args.dryRun && args.apply) {
  console.error('No se pueden combinar --dry-run y --apply. Elige uno.')
  process.exit(2)
}
if (!args.dryRun && !args.apply) {
  console.error('Indica --dry-run o --apply. Usa --help para ver ayuda.')
  process.exit(2)
}

const csvPath = resolve(process.cwd(), args.file)
if (!existsSync(csvPath)) {
  console.error(`No existe el archivo: ${csvPath}`)
  process.exit(2)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

// =============================================================================
// CSV parsing
// =============================================================================

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function detectDelimiter(line) {
  const semis = (line.match(/;/g) || []).length
  const commas = (line.match(/,/g) || []).length
  return semis > commas ? ';' : ','
}

function parseCsvLine(line, delim) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === delim) { out.push(cur); cur = '' }
      else cur += c
    }
  }
  out.push(cur)
  return out
}

function parseCsv(text) {
  const clean = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n').filter(l => l.length > 0)
  if (lines.length === 0) return []
  const delim = detectDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delim).map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delim)
    const row = {}
    for (let j = 0; j < headers.length; j++) row[headers[j]] = (cols[j] ?? '').trim()
    rows.push(row)
  }
  return { headers, rows, delim }
}

function pick(row, ...keys) {
  for (const k of keys) {
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === k.toLowerCase()) {
        const v = row[rk]
        if (v != null && v !== '') return v
      }
    }
  }
  return ''
}

// =============================================================================
// Normalización
// =============================================================================

function normalizeDni(s) {
  return String(s || '').replace(/\s/g, '').toUpperCase()
}
function normalizeEmail(s) {
  const t = String(s || '').trim().toLowerCase()
  return t || null
}
function normalizeName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}
function isValidDni(s) {
  return VALID_DNI_RE.test(s) || VALID_NIE_RE.test(s)
}
function isPlaceholderDni(s) {
  if (!s) return false
  if (PLACEHOLDER_DNIS.has(s)) return true
  if (REPEATING_DNI_RE.test(s)) return true
  if (!isValidDni(s)) return true
  return false
}
function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function normalizeForCompare(s) {
  return stripAccents(String(s || '').toLowerCase()).replace(/\s+/g, ' ').trim()
}
function namesAreSignificantlyDifferent(bbddName, csvName) {
  const a = normalizeForCompare(bbddName)
  const b = normalizeForCompare(csvName)
  if (!a || !b) return false
  if (a === b) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return !longer.includes(shorter)
}

// =============================================================================
// Deduplicación interna del CSV
// =============================================================================

function scoreRow(r) {
  let s = 0
  if (r.email) s += 100
  s += (r.first_name?.length || 0) + (r.last_name?.length || 0)
  return s
}

function dedupCsvRows(rows) {
  // Agrupamos por la mejor clave que tenga la fila (DNI > email > nombre).
  // Si dos filas comparten clave, se queda la de mayor score; las restantes
  // se reportan como skipped_dup_csv. Además, el ganador hereda en
  // `lostInfo` las notas con la información del/los loser(s) que se
  // perderían (emails alternativos, nombres más completos), para que el
  // procesamiento posterior las concatene a internal_notes.
  const byKey = new Map()  // key -> { winner, losers[] }
  let idx = 0
  for (const r of rows) {
    r.__idx = idx++
    const key =
      (r.document_number && isValidDni(r.document_number) && !isPlaceholderDni(r.document_number) ? `dni:${r.document_number}` : null) ||
      (r.email ? `email:${r.email}` : null) ||
      `name:${normalizeForCompare(`${r.first_name} ${r.last_name}`)}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, { winner: r, losers: [] })
    } else {
      const a = scoreRow(prev.winner)
      const b = scoreRow(r)
      if (b > a) {
        // r es el nuevo ganador; el anterior winner pasa a losers
        prev.losers.push(prev.winner)
        prev.winner = r
      } else {
        prev.losers.push(r)
      }
    }
  }

  const kept = []
  const dropped = []
  for (const { winner, losers } of byKey.values()) {
    const lostInfo = []
    for (const l of losers) {
      // Email alternativo: el loser aporta un email distinto al del winner.
      // (Si el winner no tiene email pero el loser sí, el scoreRow lo
      // habría puesto como winner — no debería pasar; lo cubrimos igualmente.)
      if (l.email && l.email !== winner.email) {
        const note = `${NOTE_PREFIX_EMAIL_ALT}${l.email}`
        if (!lostInfo.includes(note)) lostInfo.push(note)
      }
      // Nombre alternativo: el loser tiene nombre más completo que el winner
      // y al normalizar (sin tildes, lowercase) el del winner NO es substring
      // del loser. Reutiliza namesAreSignificantlyDifferent para la regla.
      const winnerFull = [winner.first_name, winner.last_name].filter(Boolean).join(' ')
      const loserFull = [l.first_name, l.last_name].filter(Boolean).join(' ')
      if (
        loserFull && winnerFull &&
        loserFull.length > winnerFull.length &&
        namesAreSignificantlyDifferent(winnerFull, loserFull)
      ) {
        const note = `${NOTE_PREFIX_NAME_ALT}${loserFull}`
        if (!lostInfo.includes(note)) lostInfo.push(note)
      }
      dropped.push(l)
    }
    winner.lostInfo = lostInfo
    kept.push(winner)
  }
  kept.sort((a, b) => a.__idx - b.__idx)
  return { kept, dropped }
}

// =============================================================================
// Supabase: helpers
// =============================================================================

async function getNextClientCodeBase(year) {
  const pattern = `CLI-${year}-%`
  const { data, error } = await sb
    .from('clients')
    .select('client_code')
    .like('client_code', pattern)
    .order('client_code', { ascending: false })
    .limit(1)
  if (error) throw error
  if (!data || data.length === 0) return 1
  const parts = data[0].client_code.split('-')
  const last = parseInt(parts[parts.length - 1], 10)
  return Number.isFinite(last) ? last + 1 : 1
}

async function findMatchByDni(dni) {
  const { data, error } = await sb
    .from('clients')
    .select('id, document_number, email, first_name, last_name, internal_notes, migration_batch')
    .eq('document_number', dni)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return data && data[0] ? data[0] : null
}

async function findMatchByEmail(email) {
  const { data, error } = await sb
    .from('clients')
    .select('id, document_number, email, first_name, last_name, internal_notes, migration_batch')
    .eq('email', email)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  return data && data[0] ? data[0] : null
}

// =============================================================================
// Lógica core
// =============================================================================

function buildUpdate(match, row, nowIso) {
  const update = {
    accepts_data_storage: true,
    data_consent_date: nowIso,
  }
  const enrichedFields = []

  if ((match.document_number == null || match.document_number === '') && row.document_number) {
    update.document_number = row.document_number
    update.document_type = 'DNI'
    enrichedFields.push('document_number')
  }
  if ((match.email == null || match.email === '') && row.email) {
    update.email = row.email
    enrichedFields.push('email')
  }
  if (!match.migration_batch) {
    update.migration_batch = BATCH_ID
    enrichedFields.push('migration_batch')
  }

  // Concatenar notas: (1) discrepancia BBDD↔CSV winner + (2) info perdida
  // de losers del dedup interno. Evitar duplicados y líneas vacías.
  const notesToAdd = []
  const csvFull = [row.first_name, row.last_name].filter(Boolean).join(' ')
  const bbddFull = [match.first_name, match.last_name].filter(Boolean).join(' ')
  if (csvFull && bbddFull && namesAreSignificantlyDifferent(bbddFull, csvFull)) {
    notesToAdd.push(`${NOTE_PREFIX}${csvFull}`)
  }
  if (row.lostInfo && row.lostInfo.length) notesToAdd.push(...row.lostInfo)

  if (notesToAdd.length) {
    const existing = match.internal_notes || ''
    let final = existing
    for (const n of notesToAdd) {
      if (!n) continue
      if (!final.includes(n)) final = final ? `${final}\n${n}` : n
    }
    if (final !== existing) {
      update.internal_notes = final
      enrichedFields.push('internal_notes')
    }
  }

  return { update, enrichedFields, notesAdded: notesToAdd }
}

function buildInsert(row, clientCode, nowIso) {
  const insert = {
    client_code: clientCode,
    first_name: row.first_name || 'Sin nombre',
    last_name: row.last_name || '',
    email: row.email || null,
    document_number: row.document_number || null,
    document_type: 'DNI',
    accepts_data_storage: true,
    data_consent_date: nowIso,
    source: SOURCE_NEW,
    migration_batch: BATCH_ID,
    is_active: true,
  }
  const notesAdded = []
  if (row.lostInfo && row.lostInfo.length) {
    const deduped = []
    for (const n of row.lostInfo) {
      if (!n) continue
      if (!deduped.includes(n)) deduped.push(n)
    }
    if (deduped.length) {
      insert.internal_notes = deduped.join('\n')
      notesAdded.push(...deduped)
    }
  }
  return { insert, notesAdded }
}

// =============================================================================
// Reporte
// =============================================================================

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function writeReport(rows, dryRun) {
  const tmpDir = resolve(ROOT, 'tmp')
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })
  const now = new Date()
  const stamp =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '-' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  const suffix = dryRun ? '-dryrun' : ''
  const file = resolve(tmpDir, `gdpr-import-report-${stamp}${suffix}.csv`)
  const headers = ['nombre', 'apellidos', 'dni', 'email', 'action', 'matched_by', 'client_id', 'enriched_fields', 'notes']
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push([
      csvEscape(r.first_name),
      csvEscape(r.last_name),
      csvEscape(r.document_number),
      csvEscape(r.email),
      csvEscape(r.action),
      csvEscape(r.matched_by || ''),
      csvEscape(r.client_id || ''),
      csvEscape(r.enriched_fields || ''),
      csvEscape(r.notes || ''),
    ].join(','))
  }
  writeFileSync(file, '﻿' + lines.join('\n'), 'utf8')
  return file
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('━'.repeat(72))
  console.log(`GDPR consent import — ${args.dryRun ? 'DRY RUN' : 'APPLY'}`)
  console.log(`Batch: ${BATCH_ID}`)
  console.log(`CSV:   ${csvPath}`)
  console.log('━'.repeat(72))

  // 1. Parse CSV
  const text = readFileSync(csvPath, 'utf8')
  const parsed = parseCsv(text)
  if (!parsed.rows || parsed.rows.length === 0) {
    console.error('CSV vacío o sin cabeceras.')
    process.exit(1)
  }
  console.log(`Cabeceras: ${parsed.headers.join(' | ')}  (delim="${parsed.delim}")`)
  console.log(`Filas leídas: ${parsed.rows.length}`)

  // 2. Normalizar
  const normalized = parsed.rows.map(r => ({
    first_name: normalizeName(pick(r, 'Nombre')),
    last_name: normalizeName(pick(r, 'Apellidos')),
    document_number: normalizeDni(pick(r, 'DNI', 'NIF', 'Documento')),
    email: normalizeEmail(pick(r, 'Correo Electrónico', 'Correo', 'Email', 'E-mail')),
  }))

  // 3. Detectar placeholders. Un DNI inválido o placeholder NO impide
  //    el match por email, solo se descarta como identificador.
  const validRows = []
  const placeholderRows = []
  for (const r of normalized) {
    const hasName = r.first_name || r.last_name
    const hasEmail = !!r.email
    const hasDni = !!r.document_number
    if (!hasName && !hasEmail && !hasDni) continue // fila vacía
    if (hasDni && isPlaceholderDni(r.document_number)) {
      // Si NO hay email tampoco, no podemos matchear — al log de placeholders
      if (!hasEmail) {
        placeholderRows.push({ ...r })
        continue
      }
      // Si hay email, soltamos el DNI inválido y seguimos
      r.document_number = ''
    }
    validRows.push(r)
  }
  console.log(`Filas válidas: ${validRows.length}`)
  console.log(`Filas con DNI placeholder y sin email (a revisar manual): ${placeholderRows.length}`)

  // 4. Dedup interno
  const { kept, dropped } = dedupCsvRows(validRows)
  console.log(`Tras dedup interno: ${kept.length} únicos, ${dropped.length} duplicados del CSV`)

  // 5. Pre-flight: client_code base (sólo si vamos a insertar)
  const year = new Date().getFullYear()
  let codeCounter = await getNextClientCodeBase(year)
  console.log(`Próximo client_code base: CLI-${year}-${String(codeCounter).padStart(4, '0')}`)
  console.log('━'.repeat(72))

  // 6. Procesar cada fila
  const nowIso = new Date().toISOString()
  const report = []
  let updated = 0, inserted = 0, errors = 0
  let i = 0
  for (const row of kept) {
    i++
    try {
      let match = null
      let matchedBy = null
      if (row.document_number && isValidDni(row.document_number) && !isPlaceholderDni(row.document_number)) {
        match = await findMatchByDni(row.document_number)
        if (match) matchedBy = 'dni'
      }
      if (!match && row.email) {
        match = await findMatchByEmail(row.email)
        if (match) matchedBy = 'email'
      }

      if (match) {
        const { update, enrichedFields, notesAdded } = buildUpdate(match, row, nowIso)
        if (args.apply) {
          const { error } = await sb.from('clients').update(update).eq('id', match.id)
          if (error) throw error
        }
        updated++
        report.push({
          ...row,
          action: 'updated',
          matched_by: matchedBy,
          client_id: match.id,
          enriched_fields: enrichedFields.join(','),
          notes: (notesAdded || []).join(' | '),
        })
      } else {
        const code = `CLI-${year}-${String(codeCounter++).padStart(4, '0')}`
        const { insert, notesAdded } = buildInsert(row, code, nowIso)
        let newId = '(dry-run)'
        if (args.apply) {
          const { data, error } = await sb.from('clients').insert(insert).select('id').single()
          if (error) throw error
          newId = data.id
        }
        inserted++
        const noteParts = [`client_code=${code}`]
        if (notesAdded && notesAdded.length) noteParts.push(...notesAdded)
        report.push({
          ...row,
          action: 'inserted',
          matched_by: '',
          client_id: newId,
          enriched_fields: '',
          notes: noteParts.join(' | '),
        })
      }
    } catch (e) {
      errors++
      report.push({
        ...row,
        action: 'error',
        matched_by: '',
        client_id: '',
        enriched_fields: '',
        notes: (e && e.message) || String(e),
      })
    }
    if (i % 25 === 0) console.log(`  procesadas ${i}/${kept.length}…`)
  }

  for (const r of placeholderRows) report.push({
    ...r, action: 'skipped_placeholder', matched_by: '', client_id: '', enriched_fields: '',
    notes: 'DNI placeholder/inválido y sin email, requiere revisión manual',
  })
  for (const r of dropped) report.push({
    ...r, action: 'skipped_dup_csv', matched_by: '', client_id: '', enriched_fields: '',
    notes: 'Duplicado en el CSV; se quedó la fila con más datos',
  })

  // 7. Resumen
  console.log('━'.repeat(72))
  console.log(`RESUMEN`)
  console.log(`  updated              : ${updated}`)
  console.log(`  inserted             : ${inserted}`)
  console.log(`  skipped_placeholder  : ${placeholderRows.length}`)
  console.log(`  skipped_dup_csv      : ${dropped.length}`)
  console.log(`  errors               : ${errors}`)
  console.log(`  total CSV input      : ${parsed.rows.length}`)
  console.log('━'.repeat(72))

  // 8. Reporte CSV
  const reportFile = writeReport(report, args.dryRun)
  console.log(`Reporte: ${reportFile}`)

  if (args.dryRun) {
    console.log('')
    console.log('DRY RUN — no changes applied. To apply, re-run with --apply')
  } else {
    console.log('')
    console.log('APPLY — cambios persistidos en Supabase.')
  }
}

main().catch(err => {
  console.error('ERROR FATAL:', err)
  process.exit(1)
})
