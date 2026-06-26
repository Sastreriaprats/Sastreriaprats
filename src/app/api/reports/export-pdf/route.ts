import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkUserPermission } from '@/actions/auth'

type AnyRec = Record<string, unknown>

const TAB_TITLES: Record<string, string> = {
  sales: 'Ventas',
  products: 'Productos',
  tailors: 'Sastres',
  clients: 'Clientes',
  stores: 'Por tienda',
  employees: 'Por empleado',
  time: 'Por hora / día de la semana',
  expenses: 'Gastos',
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hasPerm = await checkUserPermission(user.id, 'reporting.export')
  if (!hasPerm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const {
    start, end, tab,
    storeFilterName, channelLabel, taxLabel,
    salesData, compareData, topProducts, tailorData, clientsData,
    storeData, employeeData, employeeStores, timePatternData, expensesData, expensesComparison,
  } = body

  const activeTab: string = typeof tab === 'string' && TAB_TITLES[tab] ? tab : 'sales'
  const tabTitle = TAB_TITLES[activeTab]
  const filtersLine = [
    storeFilterName ? `Tienda: ${storeFilterName}` : null,
    channelLabel ? `Canal: ${channelLabel}` : null,
    taxLabel ? `Importes: ${taxLabel}` : null,
  ].filter(Boolean).join(' · ')

  let section = ''
  switch (activeTab) {
    case 'sales':
      section = renderSales(salesData, compareData)
      break
    case 'products':
      section = renderProducts(topProducts)
      break
    case 'tailors':
      section = renderTailors(tailorData)
      break
    case 'clients':
      section = renderClients(clientsData)
      break
    case 'stores':
      section = renderStores(storeData)
      break
    case 'employees':
      section = renderEmployees(employeeData, employeeStores)
      break
    case 'time':
      section = renderTime(timePatternData)
      break
    case 'expenses':
      section = renderExpenses(expensesData, expensesComparison)
      break
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: 'Helvetica', sans-serif; color: #1a2744; padding: 40px; font-size: 12px; }
  h1 { font-size: 24px; border-bottom: 3px solid #c9a84c; padding-bottom: 10px; margin-bottom: 6px; }
  h2 { font-size: 16px; margin-top: 30px; color: #1a2744; }
  h3 { font-size: 13px; margin-top: 20px; color: #1a2744; }
  .meta { color: #6b7280; font-size: 11px; margin-bottom: 20px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; text-align: center; }
  .kpi-value { font-size: 20px; font-weight: bold; }
  .kpi-label { font-size: 10px; color: #6b7280; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #1a2744; color: white; padding: 8px; text-align: left; font-size: 10px; }
  td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
  tr:nth-child(even) td { background: #f9fafb; }
  tfoot td { font-weight: bold; background: #f3f4f6; border-top: 2px solid #1a2744; }
  .right { text-align: right; }
  .muted { color: #6b7280; }
  .pos { color: #16a34a; }
  .neg { color: #dc2626; }
  .empty { padding: 40px; text-align: center; color: #9ca3af; font-style: italic; }
  .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  .gold { color: #c9a84c; }
  @media print { body { padding: 20px; } }
</style>
</head><body>
<h1>Sastrería Prats <span class="gold">— ${escapeHtml(tabTitle)}</span></h1>
<p class="meta">Periodo: ${escapeHtml(String(start))} a ${escapeHtml(String(end))} · Generado: ${new Date().toLocaleString('es-ES')}</p>
${filtersLine ? `<p class="meta">${escapeHtml(filtersLine)}</p>` : ''}

${section}

<div class="footer">Sastrería Prats · Calle de Serrano 82, Madrid · Informe generado automáticamente</div>
</body></html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="informe-prats-${activeTab}-${start}-${end}.html"`,
    },
  })
}

function fmtEur(n: number | undefined | null): string {
  return `€${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number | undefined | null): string {
  const v = Number(n) || 0
  const cls = v >= 0 ? 'pos' : 'neg'
  const arrow = v >= 0 ? '↑' : '↓'
  return `<span class="${cls}">${arrow} ${Math.abs(v).toFixed(1)}%</span>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function empty(msg = 'Sin datos para el periodo seleccionado'): string {
  return `<div class="empty">${msg}</div>`
}

// ─── Renderers ───────────────────────────────────────────────────────────────

function renderSales(salesData: AnyRec | null, compareData: AnyRec | null): string {
  if (!salesData) return empty()
  const t = (salesData.totals as AnyRec) || {}
  const chart = (salesData.chartData as AnyRec[]) || []
  const changes = (compareData?.changes as AnyRec) || null

  const kpis = `
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-value">${fmtEur(t.total as number)}</div><div class="kpi-label">Facturación total ${changes ? fmtPct(changes.revenue as number) : ''}</div></div>
  <div class="kpi"><div class="kpi-value">${fmtEur(t.pos as number)}</div><div class="kpi-label">Boutique + Tarjetas</div></div>
  <div class="kpi"><div class="kpi-value">${fmtEur(t.tailoring as number)}</div><div class="kpi-label">Sastrería</div></div>
  <div class="kpi"><div class="kpi-value">${fmtEur(t.avgTicket as number)}</div><div class="kpi-label">Ticket medio (${t.ticketCount || 0} tickets)</div></div>
</div>`

  if (!chart.length) return kpis + empty('Sin movimientos en el periodo')

  const rows = chart.map(d => `
<tr>
  <td>${escapeHtml(String(d.date))}</td>
  <td class="right">${fmtEur(d.pos as number)}</td>
  <td class="right">${fmtEur(d.online as number)}</td>
  <td class="right">${fmtEur(d.tailoring as number)}</td>
  <td class="right"><b>${fmtEur(d.total as number)}</b></td>
</tr>`).join('')

  const sum = (k: string) => chart.reduce((s, d) => s + (Number(d[k]) || 0), 0)

  return `${kpis}
<h2>Evolución de ventas</h2>
<table>
  <thead><tr><th>Fecha</th><th class="right">Boutique + Tarjetas</th><th class="right">Online</th><th class="right">Sastrería</th><th class="right">Total</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td>TOTAL</td>
    <td class="right">${fmtEur(sum('pos'))}</td>
    <td class="right">${fmtEur(sum('online'))}</td>
    <td class="right">${fmtEur(sum('tailoring'))}</td>
    <td class="right">${fmtEur(sum('total'))}</td>
  </tr></tfoot>
</table>`
}

function renderProducts(items: AnyRec[] | null): string {
  if (!items?.length) return empty()
  const rows = items.map((p, i) => {
    const hasCost = Number(p.unit_cost) > 0
    const marginPct = Number(p.revenue_net) > 0 ? (Number(p.margin) / Number(p.revenue_net)) * 100 : 0
    return `
<tr>
  <td>${i + 1}</td>
  <td>${escapeHtml(String(p.name ?? ''))}</td>
  <td class="muted">${escapeHtml(String(p.sku ?? ''))}</td>
  <td class="right">${p.purchased_units || '—'}</td>
  <td class="right">${p.units || 0}</td>
  <td class="right">${p.current_stock || '—'}</td>
  <td class="right">${fmtEur(p.revenue as number)}</td>
  <td class="right">${hasCost ? fmtEur(p.unit_cost as number) : '—'}</td>
  <td class="right">${hasCost ? fmtEur(p.margin as number) : '—'}</td>
  <td class="right">${hasCost && Number(p.revenue_net) > 0 ? `${marginPct.toFixed(1)}%` : '—'}</td>
</tr>`
  }).join('')
  return `<h2>Top productos</h2>
<table>
  <thead><tr><th>#</th><th>Producto</th><th>SKU</th><th class="right">Compradas</th><th class="right">Vendidas</th><th class="right">Stock</th><th class="right">Facturación</th><th class="right">Coste ud.</th><th class="right">Margen</th><th class="right">Margen %</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="muted" style="font-size:11px;margin-top:6px">Datos históricos totales del producto (no dependen del filtro de fechas). Margen = facturación sin IVA − (uds vendidas × coste). Compradas = Stock actual + Vendidas (stock inicial cargado a mano + recepciones de proveedor).</p>`
}

function renderTailors(items: AnyRec[] | null): string {
  if (!items?.length) return empty()
  const rows = items.map(t => `
<tr>
  <td>${escapeHtml(String(t.name ?? ''))}</td>
  <td class="right">${t.orders || 0}</td>
  <td class="right">${t.completed || 0}</td>
  <td class="right">${(Number(t.completionRate) || 0).toFixed(1)}%</td>
  <td class="right">${t.fittings || 0}</td>
  <td class="right">${fmtEur(t.avgOrderValue as number)}</td>
  <td class="right"><b>${fmtEur(t.revenue as number)}</b></td>
</tr>`).join('')
  return `<h2>Rendimiento por sastre</h2>
<table>
  <thead><tr><th>Sastre</th><th class="right">Pedidos</th><th class="right">Completados</th><th class="right">% Compl.</th><th class="right">Pruebas</th><th class="right">Ticket medio</th><th class="right">Facturación</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`
}

function renderClients(data: AnyRec | null): string {
  if (!data) return empty()
  const sources = (data.sources as Record<string, number>) || {}
  const topClients = (data.topClients as AnyRec[]) || []

  const kpis = `
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-value">${data.newClients || 0}</div><div class="kpi-label">Nuevos clientes</div></div>
  <div class="kpi"><div class="kpi-value">${data.totalClients || 0}</div><div class="kpi-label">Total clientes</div></div>
  <div class="kpi"><div class="kpi-value">${data.clientsWithPurchases || 0}</div><div class="kpi-label">Con compras</div></div>
</div>`

  const sourceRows = Object.entries(sources).map(([k, v]) =>
    `<tr><td>${escapeHtml(k)}</td><td class="right">${v}</td></tr>`).join('')

  const topRows = topClients.map((c, i) =>
    `<tr><td>${i + 1}</td><td>${escapeHtml(String(c.full_name ?? ''))}</td><td class="right">${fmtEur(c.total_revenue as number)}</td></tr>`).join('')

  return `${kpis}
${sourceRows ? `<h2>Origen de clientes</h2>
<table>
  <thead><tr><th>Origen</th><th class="right">Clientes</th></tr></thead>
  <tbody>${sourceRows}</tbody>
</table>` : ''}

${topRows ? `<h2>Top clientes por facturación</h2>
<table>
  <thead><tr><th>#</th><th>Cliente</th><th class="right">Facturación</th></tr></thead>
  <tbody>${topRows}</tbody>
</table>` : ''}`
}

function renderStores(items: AnyRec[] | null): string {
  if (!items?.length) return empty()
  const rows = items.map(s => `
<tr>
  <td>${escapeHtml(String(s.store_name ?? ''))}</td>
  <td class="right">${fmtEur(s.pos as number)}</td>
  <td class="right">${fmtEur(s.gift_cards as number)}</td>
  <td class="right">${fmtEur(s.tailoring as number)}</td>
  <td class="right"><b>${fmtEur(s.total as number)}</b></td>
</tr>`).join('')
  const sum = (k: string) => items.reduce((s, d) => s + (Number(d[k]) || 0), 0)
  return `<h2>Facturación por tienda</h2>
<table>
  <thead><tr><th>Tienda</th><th class="right">Boutique</th><th class="right">Tarjetas</th><th class="right">Sastrería</th><th class="right">Total</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td>TOTAL</td>
    <td class="right">${fmtEur(sum('pos'))}</td>
    <td class="right">${fmtEur(sum('gift_cards'))}</td>
    <td class="right">${fmtEur(sum('tailoring'))}</td>
    <td class="right">${fmtEur(sum('total'))}</td>
  </tr></tfoot>
</table>`
}

function renderEmployees(items: AnyRec[] | null, stores: AnyRec[] | null): string {
  if (!items?.length) return empty()
  const rows = items.map(e => `
<tr>
  <td>${escapeHtml(String(e.employee_name ?? ''))}</td>
  <td class="right muted">${e.pos_ops || 0}</td>
  <td class="right">${fmtEur(e.boutique_total as number)}</td>
  <td class="right">${fmtEur(e.gift_cards_total as number)}</td>
  <td class="right muted">${e.tailoring_ops || 0}</td>
  <td class="right">${fmtEur(e.tailoring_total as number)}</td>
  <td class="right muted">${e.tailor_orders_count || 0}</td>
  <td class="right">${fmtEur(e.tailor_orders_revenue as number)}</td>
  <td class="right"><b>${fmtEur(e.total as number)}</b></td>
</tr>`).join('')
  const sum = (k: string) => items.reduce((s, d) => s + (Number(d[k]) || 0), 0)
  return `<h2>Ventas por empleado</h2>
<p class="muted" style="font-size:10px;margin:0 0 6px">Dinero que pasó por la caja de cada empleado (cobrar ≠ vender). «Sastrería cobrada» = pagos registrados en su caja, aunque el pedido sea de otro sastre.</p>
<table>
  <thead><tr>
    <th>Empleado</th>
    <th class="right">Nº ventas</th>
    <th class="right">Boutique</th>
    <th class="right">Tarjetas</th>
    <th class="right">Nº cobros sast.</th>
    <th class="right">Sastrería cobrada (su caja)</th>
    <th class="right">Pedidos sastre</th>
    <th class="right">Fact. sastre</th>
    <th class="right">Total (su caja)</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td>TOTAL</td>
    <td class="right">${sum('pos_ops')}</td>
    <td class="right">${fmtEur(sum('boutique_total'))}</td>
    <td class="right">${fmtEur(sum('gift_cards_total'))}</td>
    <td class="right">${sum('tailoring_ops')}</td>
    <td class="right">${fmtEur(sum('tailoring_total'))}</td>
    <td class="right">${sum('tailor_orders_count')}</td>
    <td class="right">${fmtEur(sum('tailor_orders_revenue'))}</td>
    <td class="right">${fmtEur(sum('total'))}</td>
  </tr></tfoot>
</table>
<p class="muted" style="font-size:10px;margin-top:6px">Pedidos sastre y Fact. sastre no se suman al total (evita duplicar con los cobros).</p>
${renderEmployeesByStore(items, stores)}`
}

function renderEmployeesByStore(items: AnyRec[], stores: AnyRec[] | null): string {
  if (!stores || stores.length <= 1) return ''
  const cross = items
    .map((e) => ({ name: String(e.employee_name ?? ''), st: (e.store_totals as AnyRec) || {}, total: stores.reduce((s, c) => s + (Number((e.store_totals as AnyRec)?.[String(c.store_id)]) || 0), 0) }))
    .filter((r) => r.total > 0)
  if (!cross.length) return ''
  const head = stores.map((c) => `<th class="right">${escapeHtml(String(c.store_name ?? ''))}</th>`).join('')
  const rows = cross.map((r) => `
<tr>
  <td>${escapeHtml(r.name)}</td>
  ${stores.map((c) => `<td class="right">${fmtEur(r.st[String(c.store_id)] as number)}</td>`).join('')}
  <td class="right"><b>${fmtEur(r.total)}</b></td>
</tr>`).join('')
  const foot = stores.map((c) => `<td class="right">${fmtEur(cross.reduce((s, r) => s + (Number(r.st[String(c.store_id)]) || 0), 0))}</td>`).join('')
  return `<h2>Ventas por empleado y tienda</h2>
<p class="muted" style="font-size:10px;margin:0 0 6px">Total «su caja» (Boutique + Tarjetas + Sastrería cobrada) de cada empleado, separado por la tienda donde se registró la venta o el cobro.</p>
<table>
  <thead><tr><th>Empleado</th>${head}<th class="right">Total</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td>TOTAL</td>${foot}<td class="right">${fmtEur(cross.reduce((s, r) => s + r.total, 0))}</td></tr></tfoot>
</table>`
}

function renderTime(data: AnyRec | null): string {
  if (!data) return empty()
  const byHour = (data.byHour as AnyRec[]) || []
  const byDay = (data.byDayOfWeek as AnyRec[]) || []

  const hourRows = byHour.filter(h => Number(h.total) > 0).map(h => `
<tr>
  <td>${h.hour}:00 – ${(Number(h.hour) + 1)}:00 h</td>
  <td class="right">${h.count || 0}</td>
  <td class="right">${fmtEur(h.total as number)}</td>
</tr>`).join('')

  const dayRows = byDay.map(d => `
<tr>
  <td>${escapeHtml(String(d.label ?? ''))}</td>
  <td class="right">${d.count || 0}</td>
  <td class="right">${fmtEur(d.total as number)}</td>
</tr>`).join('')

  return `<h2>Ventas por hora del día</h2>
${hourRows ? `<table>
  <thead><tr><th>Franja</th><th class="right">Operaciones</th><th class="right">Total</th></tr></thead>
  <tbody>${hourRows}</tbody>
</table>` : empty('Sin movimientos por hora')}

<h2>Ventas por día de la semana</h2>
${dayRows ? `<table>
  <thead><tr><th>Día</th><th class="right">Operaciones</th><th class="right">Total</th></tr></thead>
  <tbody>${dayRows}</tbody>
</table>` : empty('Sin movimientos por día')}`
}

function renderExpenses(data: AnyRec | null, comparison: AnyRec | null): string {
  if (!data) return empty()
  const byCat = (data.byCategory as AnyRec[]) || []
  const recent = (data.recentExpenses as AnyRec[]) || []

  if (!byCat.length) return empty('Sin gastos registrados en el periodo')

  const kpis = `
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-value neg">${fmtEur(data.grandTotal as number)}</div><div class="kpi-label">Total gastos</div></div>
  <div class="kpi"><div class="kpi-value">${byCat.reduce((s, c) => s + (Number(c.count) || 0), 0)}</div><div class="kpi-label">Movimientos</div></div>
  ${comparison ? `<div class="kpi"><div class="kpi-value">${fmtEur(comparison.previous as number)}</div><div class="kpi-label">Periodo anterior ${fmtPct(-(Number(comparison.change) || 0))}</div></div>` : ''}
</div>`

  const catRows = byCat.map(c => `
<tr>
  <td>${escapeHtml(String(c.category ?? ''))}</td>
  <td class="right">${c.count || 0}</td>
  <td class="right neg"><b>${fmtEur(c.total as number)}</b></td>
</tr>`).join('')

  const recentRows = recent.map(t => `
<tr>
  <td>${escapeHtml(String(t.date ?? ''))}</td>
  <td>${escapeHtml(String(t.category ?? ''))}</td>
  <td>${escapeHtml(String(t.description ?? ''))}</td>
  <td class="right neg">${fmtEur(t.total as number)}</td>
</tr>`).join('')

  return `${kpis}
<h2>Por categoría</h2>
<table>
  <thead><tr><th>Categoría</th><th class="right">Movimientos</th><th class="right">Total</th></tr></thead>
  <tbody>${catRows}</tbody>
  <tfoot><tr>
    <td>TOTAL</td>
    <td class="right">${byCat.reduce((s, c) => s + (Number(c.count) || 0), 0)}</td>
    <td class="right neg">${fmtEur(data.grandTotal as number)}</td>
  </tr></tfoot>
</table>

${renderProvidersBreakdown((data.providersBreakdown as AnyRec[]) || [])}

${recentRows ? `<h2>Últimos movimientos</h2>
<table>
  <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th class="right">Importe</th></tr></thead>
  <tbody>${recentRows}</tbody>
</table>` : ''}`
}

function renderProvidersBreakdown(providers: AnyRec[]): string {
  if (!providers.length) return ''
  const blocks = providers.map((t) => {
    const invRows = ((t.invoices as AnyRec[]) || []).map((inv) => `
<tr>
  <td>${escapeHtml(String(inv.invoice_number ?? ''))}</td>
  <td>${escapeHtml(String(inv.supplier_name ?? ''))}</td>
  <td class="right neg">${fmtEur(inv.total as number)}</td>
</tr>`).join('')
    return `<h3>${escapeHtml(String(t.label ?? ''))} — <span class="neg">${fmtEur(t.total as number)}</span></h3>
<table>
  <thead><tr><th>Nº factura</th><th>Proveedor</th><th class="right">Importe</th></tr></thead>
  <tbody>${invRows}</tbody>
</table>`
  }).join('')
  const total = providers.reduce((s, t) => s + (Number(t.total) || 0), 0)
  return `<h2>Proveedores — por tipo de proveedor y factura</h2>
${blocks}
<p style="margin-top:8px"><b>TOTAL proveedores: <span class="neg">${fmtEur(total)}</span></b></p>`
}
