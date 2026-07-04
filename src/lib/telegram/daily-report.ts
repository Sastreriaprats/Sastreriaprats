// Genera el texto del reporte diario de facturación por caja y tienda.
// Se ejecuta desde el cron /api/cron/daily-report y se envía al grupo de Telegram.

import { createAdminClient } from '@/lib/supabase/admin'

type SessionRow = {
  code: string
  display_name: string | null
  session_id: string
  status: string
  opened_at: string
  closed_at: string | null
  opened_by_name: string | null
  total_cash_sales: number | null
  total_card_sales: number | null
  total_bizum_sales: number | null
  total_transfer_sales: number | null
  total_voucher_sales: number | null
  total_sales: number | null
  cash_difference: number | null
  ticket_count: number | null
}

const eur = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)

const num = (v: number | null | undefined) => Number(v ?? 0)

/** Fecha de hoy en Madrid, formato dd/mm/aaaa. */
function madridToday(): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date())
}

// SQL: cajas (sesiones) abiertas HOY en hora de Madrid, con su desglose por método.
const REPORT_SQL = `
SELECT
  st.code,
  st.display_name,
  cs.id::text                              AS session_id,
  cs.status,
  cs.opened_at,
  cs.closed_at,
  pr.full_name                             AS opened_by_name,
  cs.total_cash_sales,
  cs.total_card_sales,
  cs.total_bizum_sales,
  cs.total_transfer_sales,
  cs.total_voucher_sales,
  cs.total_sales,
  cs.cash_difference,
  (SELECT count(*) FROM sales sa
     WHERE sa.cash_session_id = cs.id AND sa.status <> 'voided') AS ticket_count
FROM cash_sessions cs
JOIN stores st ON st.id = cs.store_id
LEFT JOIN profiles pr ON pr.id = cs.opened_by
WHERE (cs.opened_at AT TIME ZONE 'Europe/Madrid')::date
      = (now() AT TIME ZONE 'Europe/Madrid')::date
ORDER BY st.code, cs.opened_at
`.trim()

export async function buildDailyReport(): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('rpc_bot_readonly_query', { p_sql: REPORT_SQL })
  if (error) throw new Error(`Consulta del reporte falló: ${error.message}`)

  const rows = (data as SessionRow[]) || []
  const fecha = madridToday()

  if (rows.length === 0) {
    return `📊 Facturación del ${fecha}\n\nHoy no hay cajas abiertas todavía.`
  }

  // Agrupar por tienda.
  const byStore = new Map<string, SessionRow[]>()
  for (const r of rows) {
    const key = r.display_name || r.code
    if (!byStore.has(key)) byStore.set(key, [])
    byStore.get(key)!.push(r)
  }

  const lines: string[] = [`📊 Facturación del ${fecha}`, '']
  let grand = 0

  const hora = (iso: string) =>
    new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))

  for (const [store, sessions] of byStore) {
    let storeTotal = 0
    lines.push(`🏬 ${store}`)
    for (const s of sessions) {
      const total = num(s.total_sales)
      storeTotal += total
      const estado = s.status === 'closed' ? 'cerrada' : 'abierta'
      const breakdown = [
        ['Efectivo', num(s.total_cash_sales)],
        ['Tarjeta', num(s.total_card_sales)],
        ['Bizum', num(s.total_bizum_sales)],
        ['Transf.', num(s.total_transfer_sales)],
        ['Vales', num(s.total_voucher_sales)],
      ]
        .filter(([, v]) => (v as number) !== 0)
        .map(([k, v]) => `${k} ${eur(v as number)}`)
        .join(' · ')

      lines.push(
        `  • Caja ${hora(s.opened_at)} (${estado}) — ${eur(total)}` +
          `${s.ticket_count ? ` · ${s.ticket_count} tickets` : ''}`
      )
      if (breakdown) lines.push(`    ${breakdown}`)
      if (s.status === 'closed' && num(s.cash_difference) !== 0) {
        lines.push(`    ⚠️ Descuadre efectivo: ${eur(num(s.cash_difference))}`)
      }
    }
    lines.push(`  Subtotal ${store}: ${eur(storeTotal)}`, '')
    grand += storeTotal
  }

  lines.push(`💰 TOTAL DÍA: ${eur(grand)}`)
  return lines.join('\n')
}
