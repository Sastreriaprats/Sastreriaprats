import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkUserPermission } from '@/actions/auth'

type AnyRec = Record<string, unknown>
type Row = (string | number)[]

const TAB_TITLES: Record<string, string> = {
  sales: 'VENTAS',
  products: 'PRODUCTOS',
  tailors: 'SASTRES',
  clients: 'CLIENTES',
  stores: 'POR TIENDA',
  employees: 'POR EMPLEADO',
  time: 'POR HORA / DÍA DE LA SEMANA',
  expenses: 'GASTOS',
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

  const rows: Row[] = []
  rows.push(['INFORME SASTRERÍA PRATS'])
  rows.push(['Sección', tabTitle])
  rows.push(['Periodo', String(start ?? ''), 'a', String(end ?? '')])
  if (storeFilterName) rows.push(['Tienda', String(storeFilterName)])
  if (channelLabel) rows.push(['Canal', String(channelLabel)])
  if (taxLabel) rows.push(['Importes', String(taxLabel)])
  rows.push(['Generado', new Date().toLocaleString('es-ES')])
  rows.push([])

  switch (activeTab) {
    case 'sales': sectionSales(rows, salesData, compareData); break
    case 'products': sectionProducts(rows, topProducts); break
    case 'tailors': sectionTailors(rows, tailorData); break
    case 'clients': sectionClients(rows, clientsData); break
    case 'stores': sectionStores(rows, storeData); break
    case 'employees': sectionEmployees(rows, employeeData, employeeStores); break
    case 'time': sectionTime(rows, timePatternData); break
    case 'expenses': sectionExpenses(rows, expensesData, expensesComparison); break
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, tabTitle.slice(0, 31))
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="informe-prats-${activeTab}-${start}-${end}.xlsx"`,
    },
  })
}

function num(n: unknown): number {
  return Number(n) || 0
}

// ─── Section builders ────────────────────────────────────────────────────────

function sectionSales(rows: Row[], salesData: AnyRec | null, compareData: AnyRec | null) {
  if (!salesData) { rows.push(['Sin datos para el periodo seleccionado']); return }
  const t = (salesData.totals as AnyRec) || {}
  const chart = (salesData.chartData as AnyRec[]) || []
  const changes = (compareData?.changes as AnyRec) || null

  rows.push(['RESUMEN'])
  rows.push(['Facturación total', num(t.total)])
  rows.push(['Boutique + Tarjetas', num(t.pos)])
  rows.push(['Online', num(t.online)])
  rows.push(['Sastrería', num(t.tailoring)])
  rows.push(['Tickets', num(t.ticketCount)])
  rows.push(['Ticket medio', num(t.avgTicket)])
  if (changes) {
    rows.push(['Variación facturación %', Number((Number(changes.revenue) || 0).toFixed(2))])
    rows.push(['Variación nuevos clientes %', Number((Number(changes.newClients) || 0).toFixed(2))])
    rows.push(['Variación pedidos %', Number((Number(changes.ordersCount) || 0).toFixed(2))])
  }
  rows.push([])

  rows.push(['EVOLUCIÓN DE VENTAS'])
  rows.push(['Fecha', 'Boutique + Tarjetas', 'Online', 'Sastrería', 'Total'])
  for (const d of chart) {
    rows.push([String(d.date ?? ''), num(d.pos), num(d.online), num(d.tailoring), num(d.total)])
  }
}

function sectionProducts(rows: Row[], items: AnyRec[] | null) {
  if (!items?.length) { rows.push(['Sin datos para el periodo seleccionado']); return }
  rows.push(['TOP PRODUCTOS'])
  rows.push(['#', 'Producto', 'SKU', 'Uds compradas', 'Uds vendidas', 'Facturación', 'Coste ud.', 'Margen (sin IVA)', 'Margen %'])
  items.forEach((p, i) => {
    const marginPct = Number(p.revenue_net) > 0 ? (Number(p.margin) / Number(p.revenue_net)) * 100 : 0
    rows.push([
      i + 1, String(p.name ?? ''), String(p.sku ?? ''),
      num(p.purchased_units), num(p.units), num(p.revenue),
      num(p.unit_cost), num(p.margin),
      Number(p.unit_cost) > 0 && Number(p.revenue_net) > 0 ? `${marginPct.toFixed(1)}%` : '—',
    ])
  })
}

function sectionTailors(rows: Row[], items: AnyRec[] | null) {
  if (!items?.length) { rows.push(['Sin datos para el periodo seleccionado']); return }
  rows.push(['RENDIMIENTO SASTRES'])
  rows.push(['Sastre', 'Pedidos', 'Completados', '% Completado', 'Pruebas', 'Ticket medio', 'Facturación'])
  for (const t of items) {
    rows.push([
      String(t.name ?? ''), num(t.orders), num(t.completed),
      Number((Number(t.completionRate) || 0).toFixed(2)), num(t.fittings),
      Number((Number(t.avgOrderValue) || 0).toFixed(2)), num(t.revenue),
    ])
  }
}

function sectionClients(rows: Row[], data: AnyRec | null) {
  if (!data) { rows.push(['Sin datos para el periodo seleccionado']); return }
  const sources = (data.sources as Record<string, number>) || {}
  const topClients = (data.topClients as AnyRec[]) || []

  rows.push(['RESUMEN CLIENTES'])
  rows.push(['Nuevos clientes', num(data.newClients)])
  rows.push(['Total clientes', num(data.totalClients)])
  rows.push(['Clientes con compras', num(data.clientsWithPurchases)])
  rows.push([])

  if (Object.keys(sources).length) {
    rows.push(['ORIGEN DE CLIENTES'])
    rows.push(['Origen', 'Clientes'])
    for (const [k, v] of Object.entries(sources)) {
      rows.push([String(k), num(v)])
    }
    rows.push([])
  }

  if (topClients.length) {
    rows.push(['TOP CLIENTES POR FACTURACIÓN'])
    rows.push(['#', 'Cliente', 'Facturación'])
    topClients.forEach((c, i) => {
      rows.push([i + 1, String(c.full_name ?? ''), num(c.total_revenue)])
    })
  }
}

function sectionStores(rows: Row[], items: AnyRec[] | null) {
  if (!items?.length) { rows.push(['Sin datos para el periodo seleccionado']); return }
  rows.push(['FACTURACIÓN POR TIENDA'])
  rows.push(['Tienda', 'Boutique', 'Tarjetas', 'Sastrería', 'Total'])
  for (const s of items) {
    rows.push([String(s.store_name ?? ''), num(s.pos), num(s.gift_cards), num(s.tailoring), num(s.total)])
  }
  const sum = (k: string) => items.reduce((acc, d) => acc + (Number(d[k]) || 0), 0)
  rows.push(['TOTAL', sum('pos'), sum('gift_cards'), sum('tailoring'), sum('total')])
}

function sectionEmployees(rows: Row[], items: AnyRec[] | null, stores: AnyRec[] | null) {
  if (!items?.length) { rows.push(['Sin datos para el periodo seleccionado']); return }
  rows.push(['VENTAS POR EMPLEADO'])
  rows.push(['(Dinero por la caja de cada empleado — cobrar ≠ vender; «Sastrería cobrada» = pagos registrados en su caja aunque el pedido sea de otro sastre)'])
  rows.push(['Empleado', 'Nº ventas', 'Boutique', 'Tarjetas', 'Nº cobros sast.', 'Sastrería cobrada (su caja)', 'Pedidos sastre', 'Fact. sastre', 'Total (su caja)'])
  for (const e of items) {
    rows.push([
      String(e.employee_name ?? ''), num(e.pos_ops), num(e.boutique_total), num(e.gift_cards_total),
      num(e.tailoring_ops), num(e.tailoring_total), num(e.tailor_orders_count),
      num(e.tailor_orders_revenue), num(e.total),
    ])
  }
  const sum = (k: string) => items.reduce((acc, d) => acc + (Number(d[k]) || 0), 0)
  rows.push(['TOTAL', sum('pos_ops'), sum('boutique_total'), sum('gift_cards_total'), sum('tailoring_ops'), sum('tailoring_total'), sum('tailor_orders_count'), sum('tailor_orders_revenue'), sum('total')])

  // Tabla cruzada empleado × tienda (total "su caja" por tienda). Solo en modo "Todas".
  if (stores && stores.length > 1) {
    const cross = items
      .map((e) => ({ name: String(e.employee_name ?? ''), st: (e.store_totals as AnyRec) || {}, total: stores.reduce((s, c) => s + (Number((e.store_totals as AnyRec)?.[String(c.store_id)]) || 0), 0) }))
      .filter((r) => r.total > 0)
    if (cross.length) {
      rows.push([])
      rows.push(['VENTAS POR EMPLEADO Y TIENDA'])
      rows.push(['(Total «su caja» = Boutique + Tarjetas + Sastrería cobrada, separado por la tienda donde se registró)'])
      rows.push(['Empleado', ...stores.map((c) => String(c.store_name ?? '')), 'Total'])
      for (const r of cross) rows.push([r.name, ...stores.map((c) => num(r.st[String(c.store_id)])), num(r.total)])
      rows.push(['TOTAL', ...stores.map((c) => num(cross.reduce((s, r) => s + (Number(r.st[String(c.store_id)]) || 0), 0))), num(cross.reduce((s, r) => s + r.total, 0))])
    }
  }
}

function sectionTime(rows: Row[], data: AnyRec | null) {
  if (!data) { rows.push(['Sin datos para el periodo seleccionado']); return }
  const byHour = (data.byHour as AnyRec[]) || []
  const byDay = (data.byDayOfWeek as AnyRec[]) || []

  rows.push(['VENTAS POR HORA'])
  rows.push(['Hora', 'Operaciones', 'Total'])
  for (const h of byHour) {
    rows.push([num(h.hour), num(h.count), num(h.total)])
  }
  rows.push([])

  rows.push(['VENTAS POR DÍA DE LA SEMANA'])
  rows.push(['Día', 'Operaciones', 'Total'])
  for (const d of byDay) {
    rows.push([String(d.label ?? ''), num(d.count), num(d.total)])
  }
}

function sectionExpenses(rows: Row[], data: AnyRec | null, comparison: AnyRec | null) {
  if (!data) { rows.push(['Sin datos para el periodo seleccionado']); return }
  const byCat = (data.byCategory as AnyRec[]) || []
  const recent = (data.recentExpenses as AnyRec[]) || []

  rows.push(['RESUMEN GASTOS'])
  rows.push(['Total gastos', num(data.grandTotal)])
  rows.push(['Movimientos', byCat.reduce((s, c) => s + (Number(c.count) || 0), 0)])
  if (comparison) {
    rows.push(['Periodo anterior', num(comparison.previous)])
    rows.push(['Variación %', Number((Number(comparison.change) || 0).toFixed(2))])
  }
  rows.push([])

  if (byCat.length) {
    rows.push(['POR CATEGORÍA'])
    rows.push(['Categoría', 'Movimientos', 'Total'])
    for (const c of byCat) {
      rows.push([String(c.category ?? ''), num(c.count), num(c.total)])
    }
    rows.push(['TOTAL', byCat.reduce((s, c) => s + (Number(c.count) || 0), 0), num(data.grandTotal)])
    rows.push([])
  }

  const providers = (data.providersBreakdown as AnyRec[]) || []
  if (providers.length) {
    rows.push([])
    rows.push(['PROVEEDORES — POR TIPO DE PROVEEDOR Y FACTURA'])
    for (const t of providers) {
      rows.push([`${String(t.label ?? '')}`, '', num(t.total)])
      rows.push(['', 'Nº factura', 'Proveedor', 'Importe'])
      for (const inv of (t.invoices as AnyRec[]) || []) {
        rows.push(['', String(inv.invoice_number ?? ''), String(inv.supplier_name ?? ''), num(inv.total)])
      }
    }
    rows.push(['TOTAL proveedores', '', num(providers.reduce((s, t) => s + (Number(t.total) || 0), 0))])
  }

  if (recent.length) {
    rows.push([])
    rows.push(['ÚLTIMOS MOVIMIENTOS'])
    rows.push(['Fecha', 'Categoría', 'Descripción', 'Importe'])
    for (const t of recent) {
      rows.push([String(t.date ?? ''), String(t.category ?? ''), String(t.description ?? ''), num(t.total)])
    }
  }
}
