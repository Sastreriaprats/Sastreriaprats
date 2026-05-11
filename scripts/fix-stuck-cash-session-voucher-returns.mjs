#!/usr/bin/env node
// Repara las sesiones de caja que quedaron descuadradas porque la
// migración 138 (versión antigua de rpc_create_return) restó del
// total_sales y sumó al total_returns el importe de devoluciones por
// VALE o CAMBIO, cuando esas devoluciones no mueven dinero del cajón.
//
// Acción: por cada sesión con status='open', recorre las devoluciones
// de tipo 'voucher' o 'exchange' creadas durante esa sesión y revierte
// la doble actualización (vuelve a sumar al total_sales y resta del
// total_returns).
//
// Idempotente: se basa en marcar las devoluciones ya compensadas con
// un campo notes (NULL -> compensar; '__cash_session_revert_141__' -> ya
// compensada). No utilizamos columnas nuevas para no requerir migración.

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })
const MARKER = '__cash_session_revert_141__'

const { data: sessions, error: sErr } = await sb
  .from('cash_sessions')
  .select('id, store_id, opened_at, total_sales, total_returns, status, stores(name)')
  .eq('status', 'open')

if (sErr) {
  console.error('Error leyendo sesiones de caja abiertas:', sErr)
  process.exit(1)
}

if (!sessions || sessions.length === 0) {
  console.log('No hay sesiones de caja abiertas. Nada que reparar.')
  process.exit(0)
}

let totalAdjusted = 0

for (const s of sessions) {
  const storeName = s.stores?.name || s.store_id
  const { data: returns, error: rErr } = await sb
    .from('returns')
    .select('id, return_type, total_returned, created_at, reason')
    .eq('store_id', s.store_id)
    .in('return_type', ['voucher', 'exchange'])
    .gte('created_at', s.opened_at)

  if (rErr) {
    console.error(`[${storeName}] Error leyendo devoluciones:`, rErr)
    continue
  }

  const pending = (returns || []).filter((r) => !(r.reason || '').includes(MARKER))
  if (pending.length === 0) {
    console.log(`[${storeName}] OK: sin devoluciones por vale/cambio pendientes de revertir.`)
    continue
  }

  const totalToRevert = pending.reduce((sum, r) => sum + Number(r.total_returned || 0), 0)
  const newTotalSales = Number(s.total_sales || 0) + totalToRevert
  const newTotalReturns = Math.max(0, Number(s.total_returns || 0) - totalToRevert)

  console.log(
    `[${storeName}] Revirtiendo ${pending.length} devolución(es) por vale/cambio · `
    + `total=${totalToRevert.toFixed(2)} € · `
    + `total_sales ${s.total_sales} → ${newTotalSales} · `
    + `total_returns ${s.total_returns} → ${newTotalReturns}`
  )

  const { error: uErr } = await sb
    .from('cash_sessions')
    .update({ total_sales: newTotalSales, total_returns: newTotalReturns })
    .eq('id', s.id)

  if (uErr) {
    console.error(`[${storeName}] Error actualizando cash_sessions:`, uErr)
    continue
  }

  for (const r of pending) {
    const newReason = (r.reason ? r.reason + ' ' : '') + MARKER
    const { error: rUpdErr } = await sb.from('returns').update({ reason: newReason }).eq('id', r.id)
    if (rUpdErr) console.error(`  └─ aviso: no se pudo marcar return ${r.id}:`, rUpdErr.message)
  }

  totalAdjusted += pending.length
}

console.log(`\n✔ Hecho. Devoluciones compensadas: ${totalAdjusted}`)
console.log('Recomendación: aplicar también la migración 141 para que no vuelva a ocurrir.')
