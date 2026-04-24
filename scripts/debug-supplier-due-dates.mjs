#!/usr/bin/env node
// Diagnóstico: muestra cada factura de proveedor con
// los datos del proveedor (payment_terms, payment_days) y
// el due_date actual vs. el que resultaría con esos datos.

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
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

const { data: suppliers } = await sb
  .from('suppliers')
  .select('id, name, payment_terms, payment_days')
const supMap = new Map(suppliers.map((s) => [s.id, s]))

const { data: invoices } = await sb
  .from('ap_supplier_invoices')
  .select('id, supplier_id, supplier_name, invoice_number, invoice_date, due_date')
  .order('invoice_date', { ascending: false })

console.log(
  'Proveedor'.padEnd(30) +
  ' | terms'.padEnd(11) +
  ' | days' +
  ' | factura'.padEnd(14) +
  ' | fecha fra'.padEnd(12) +
  ' | due actual ' +
  ' | due esperado ' +
  ' | estado'
)
console.log('-'.repeat(140))

for (const inv of invoices) {
  const sup = supMap.get(inv.supplier_id)
  const name = (sup?.name ?? inv.supplier_name ?? '?').padEnd(30).slice(0, 30)
  const terms = String(sup?.payment_terms ?? '?').padEnd(9)
  const daysDb = sup?.payment_days === null ? 'null' : String(sup?.payment_days ?? '?')
  const days = sup ? resolvePaymentDays(sup) : 30
  const expected = addDaysISO(inv.invoice_date, days)
  const ok = expected === inv.due_date ? 'OK' : 'DIFF'
  console.log(
    `${name} | ${terms} | ${daysDb.padEnd(4)} | ${String(inv.invoice_number).padEnd(12)} | ${inv.invoice_date} | ${inv.due_date}  | ${expected}  | ${ok}`
  )
}
