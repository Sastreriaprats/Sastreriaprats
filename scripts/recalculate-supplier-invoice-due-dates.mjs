#!/usr/bin/env node
// Recalcula `due_date` de facturas de proveedor y sus cuotas
// usando `suppliers.payment_days` como fuente de verdad.
//
// - Ignora facturas cuyo proveedor tiene plan 'custom' (se respeta el plan).
// - Para cada factura con un supplier que tenga payment_days definido,
//   calcula newDue = invoice_date + payment_days.
// - Actualiza `ap_supplier_invoices.due_date`.
// - Regenera cuotas en `ap_supplier_invoice_due_dates` SOLO si
//   ninguna cuota está pagada (preserva cobros ya registrados).
//
// Uso:
//   node scripts/recalculate-supplier-invoice-due-dates.mjs          # dry-run
//   node scripts/recalculate-supplier-invoice-due-dates.mjs --apply  # aplica

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const apply = process.argv.includes('--apply')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

function addDaysISO(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function resolvePaymentDays(sup) {
  if (sup.payment_days !== null && sup.payment_days !== undefined) {
    const n = Number(sup.payment_days)
    if (Number.isFinite(n) && n >= 0) return n
  }
  switch (sup.payment_terms) {
    case 'immediate': return 0
    case 'net_15': return 15
    case 'net_30': return 30
    case 'net_60': return 60
    case 'net_90': return 90
    default: return 30
  }
}

const { data: suppliers, error: supErr } = await sb
  .from('suppliers')
  .select('id, name, payment_days, payment_terms')
if (supErr) {
  console.error('Error leyendo suppliers:', supErr.message)
  process.exit(1)
}

// -- Paso 1: Backfill de payment_days ------------------------------
// Sincroniza payment_days con el plazo derivado del enum cuando están
// desincronizados (y el proveedor no tiene plan 'custom').
const PRESET_DAYS = { immediate: 0, net_15: 15, net_30: 30, net_60: 60, net_90: 90 }
const supplierBackfill = []
for (const s of suppliers) {
  if (s.payment_terms === 'custom') continue
  const preset = PRESET_DAYS[s.payment_terms]
  if (preset === undefined) continue
  const current = s.payment_days === null || s.payment_days === undefined
    ? null
    : Number(s.payment_days)
  if (current !== preset) {
    supplierBackfill.push({ id: s.id, name: s.name, from: current, to: preset })
  }
}
if (supplierBackfill.length > 0) {
  console.log(`Proveedores a sincronizar payment_days ↔ payment_terms: ${supplierBackfill.length}`)
  for (const r of supplierBackfill.slice(0, 20)) {
    console.log(`  ${r.name.padEnd(30).slice(0, 30)}  ${r.from ?? 'null'} → ${r.to}`)
  }
  if (supplierBackfill.length > 20) console.log(`  ... y ${supplierBackfill.length - 20} más`)
  if (apply) {
    for (const r of supplierBackfill) {
      const { error } = await sb
        .from('suppliers')
        .update({ payment_days: r.to, updated_at: new Date().toISOString() })
        .eq('id', r.id)
      if (error) console.error(`  ✗ ${r.name}: ${error.message}`)
    }
  }
  // Aplicar el backfill en memoria SIEMPRE (para que dry-run prediga
  // el efecto sobre los vencimientos como si ya estuviera aplicado).
  for (const s of suppliers) {
    const hit = supplierBackfill.find((r) => r.id === s.id)
    if (hit) s.payment_days = hit.to
  }
  console.log('')
}

const supMap = new Map(suppliers.map((s) => [s.id, s]))

const { data: invoices, error: invErr } = await sb
  .from('ap_supplier_invoices')
  .select('id, supplier_id, invoice_number, invoice_date, due_date, total_amount')
if (invErr) {
  console.error('Error leyendo ap_supplier_invoices:', invErr.message)
  process.exit(1)
}

let toUpdateInvoice = []
let toRegenSchedule = []
let skippedCustom = 0
let skippedNoSupplier = 0
let skippedSameDate = 0
let skippedHasPaid = 0

for (const inv of invoices) {
  if (!inv.supplier_id) { skippedNoSupplier++; continue }
  const sup = supMap.get(inv.supplier_id)
  if (!sup) { skippedNoSupplier++; continue }
  if (sup.payment_terms === 'custom') { skippedCustom++; continue }
  const days = resolvePaymentDays(sup)
  const newDue = addDaysISO(inv.invoice_date, days)
  if (newDue === inv.due_date) { skippedSameDate++; continue }

  toUpdateInvoice.push({ inv, newDue, sup, days })
}

console.log('Resumen:')
console.log(`  Facturas totales: ${invoices.length}`)
console.log(`  A actualizar: ${toUpdateInvoice.length}`)
console.log(`  Saltadas (ya coinciden): ${skippedSameDate}`)
console.log(`  Saltadas (proveedor 'custom'): ${skippedCustom}`)
console.log(`  Saltadas (sin proveedor): ${skippedNoSupplier}`)

if (toUpdateInvoice.length === 0) {
  console.log('\nNada que actualizar.')
  process.exit(0)
}

console.log('\nDetalle (primeras 20):')
for (const r of toUpdateInvoice.slice(0, 20)) {
  console.log(
    `  ${r.sup.name.padEnd(30).slice(0, 30)}  Factura ${String(r.inv.invoice_number).padEnd(12)}  ` +
    `${r.inv.invoice_date} → ${r.inv.due_date}  ⇒  ${r.newDue}  (${r.days} días)`
  )
}
if (toUpdateInvoice.length > 20) console.log(`  ... y ${toUpdateInvoice.length - 20} más`)

if (!apply) {
  console.log('\nDry-run. Para aplicar ejecuta:')
  console.log('  node scripts/recalculate-supplier-invoice-due-dates.mjs --apply')
  process.exit(0)
}

const invoiceIds = toUpdateInvoice.map((r) => r.inv.id)
const { data: scheduleRows, error: schErr } = await sb
  .from('ap_supplier_invoice_due_dates')
  .select('id, supplier_invoice_id, is_paid, sort_order')
  .in('supplier_invoice_id', invoiceIds)
if (schErr) {
  console.error('Error leyendo ap_supplier_invoice_due_dates:', schErr.message)
  process.exit(1)
}

const scheduleByInvoice = new Map()
for (const row of scheduleRows ?? []) {
  const arr = scheduleByInvoice.get(row.supplier_invoice_id) ?? []
  arr.push(row)
  scheduleByInvoice.set(row.supplier_invoice_id, arr)
}

let okInvoice = 0
let okSchedule = 0

for (const r of toUpdateInvoice) {
  const { error: upErr } = await sb
    .from('ap_supplier_invoices')
    .update({ due_date: r.newDue, updated_at: new Date().toISOString() })
    .eq('id', r.inv.id)
  if (upErr) {
    console.error(`  ✗ Factura ${r.inv.invoice_number}: ${upErr.message}`)
    continue
  }
  okInvoice++

  const rows = scheduleByInvoice.get(r.inv.id) ?? []
  const hasPaid = rows.some((x) => x.is_paid)
  if (hasPaid) { skippedHasPaid++; continue }

  const { error: delErr } = await sb
    .from('ap_supplier_invoice_due_dates')
    .delete()
    .eq('supplier_invoice_id', r.inv.id)
  if (delErr) {
    console.error(`  ✗ delete cuotas ${r.inv.invoice_number}: ${delErr.message}`)
    continue
  }

  const { error: insErr } = await sb
    .from('ap_supplier_invoice_due_dates')
    .insert({
      supplier_invoice_id: r.inv.id,
      due_date: r.newDue,
      amount: r.inv.total_amount,
      sort_order: 0,
      is_paid: false,
    })
  if (insErr) {
    console.error(`  ✗ insert cuota ${r.inv.invoice_number}: ${insErr.message}`)
    continue
  }
  okSchedule++
}

console.log('\nHecho:')
console.log(`  Facturas actualizadas: ${okInvoice}`)
console.log(`  Cuotas regeneradas: ${okSchedule}`)
console.log(`  Saltadas por tener cobros ya registrados: ${skippedHasPaid}`)
