import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { checkUserPermission } from '@/actions/auth'

type AnyRec = Record<string, unknown>

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
    storeFilterName, channelLabel,
    salesData, compareData, topProducts, tailorData, clientsData,
    storeData, employeeData, timePatternData, expensesData, expensesComparison,
  } = body

  const activeTab: string = typeof tab === 'string' && TAB_TITLES[tab] ? tab : 'sales'
  const tabTitle = TAB_TITLES[activeTab]

  const lines: string[] = []
  lines.push('INFORME SASTRERÍA PRATS')
  lines.push(`Sección,${csv(tabTitle)}`)
  lines.push(`Periodo,${csv(start)},a,${csv(end)}`)
  if (storeFilterName) lines.push(`Tienda,${csv(storeFilterName)}`)
  if (channelLabel) lines.push(`Canal,${csv(channelLabel)}`)
  lines.push(`Generado,${csv(new Date().toLocaleString('es-ES'))}`)
  lines.push('')

  switch (activeTab) {
    case 'sales': sectionSales(lines, salesData, compareData); break
    case 'products': sectionProducts(lines, topProducts); break
    case 'tailors': sectionTailors(lines, tailorData); break
    case 'clients': sectionClients(lines, clientsData); break
    case 'stores': sectionStores(lines, storeData); break
    case 'employees': sectionEmployees(lines, employeeData); break
    case 'time': sectionTime(lines, timePatternData); break
    case 'expenses': sectionExpenses(lines, expensesData, expensesComparison); break
  }

  const csvBody = '﻿' + lines.join('\r\n')
  return new NextResponse(csvBody, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="informe-prats-${activeTab}-${start}-${end}.csv"`,
    },
  })
}

function csv(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\r\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function num(n: unknown): string {
  return String(Number(n) || 0)
}

// ─── Section builders ────────────────────────────────────────────────────────

function sectionSales(lines: string[], salesData: AnyRec | null, compareData: AnyRec | null) {
  if (!salesData) { lines.push('Sin datos para el periodo seleccionado'); return }
  const t = (salesData.totals as AnyRec) || {}
  const chart = (salesData.chartData as AnyRec[]) || []
  const changes = (compareData?.changes as AnyRec) || null

  lines.push('RESUMEN')
  lines.push(`Facturación total,${num(t.total)}`)
  lines.push(`TPV / Boutique,${num(t.pos)}`)
  lines.push(`Online,${num(t.online)}`)
  lines.push(`Sastrería,${num(t.tailoring)}`)
  lines.push(`Tickets,${num(t.ticketCount)}`)
  lines.push(`Ticket medio,${num(t.avgTicket)}`)
  if (changes) {
    lines.push(`Variación facturación %,${(Number(changes.revenue) || 0).toFixed(2)}`)
    lines.push(`Variación nuevos clientes %,${(Number(changes.newClients) || 0).toFixed(2)}`)
    lines.push(`Variación pedidos %,${(Number(changes.ordersCount) || 0).toFixed(2)}`)
  }
  lines.push('')

  lines.push('EVOLUCIÓN DE VENTAS')
  lines.push('Fecha,TPV,Online,Sastrería,Total')
  for (const d of chart) {
    lines.push(`${csv(d.date)},${num(d.pos)},${num(d.online)},${num(d.tailoring)},${num(d.total)}`)
  }
}

function sectionProducts(lines: string[], items: AnyRec[] | null) {
  if (!items?.length) { lines.push('Sin datos para el periodo seleccionado'); return }
  lines.push('TOP PRODUCTOS')
  lines.push('#,Producto,SKU,Unidades,Facturación')
  items.forEach((p, i) => {
    lines.push(`${i + 1},${csv(p.name)},${csv(p.sku)},${num(p.units)},${num(p.revenue)}`)
  })
}

function sectionTailors(lines: string[], items: AnyRec[] | null) {
  if (!items?.length) { lines.push('Sin datos para el periodo seleccionado'); return }
  lines.push('RENDIMIENTO SASTRES')
  lines.push('Sastre,Pedidos,Completados,% Completado,Pruebas,Ticket medio,Facturación')
  for (const t of items) {
    lines.push(`${csv(t.name)},${num(t.orders)},${num(t.completed)},${(Number(t.completionRate) || 0).toFixed(2)},${num(t.fittings)},${(Number(t.avgOrderValue) || 0).toFixed(2)},${num(t.revenue)}`)
  }
}

function sectionClients(lines: string[], data: AnyRec | null) {
  if (!data) { lines.push('Sin datos para el periodo seleccionado'); return }
  const sources = (data.sources as Record<string, number>) || {}
  const topClients = (data.topClients as AnyRec[]) || []

  lines.push('RESUMEN CLIENTES')
  lines.push(`Nuevos clientes,${num(data.newClients)}`)
  lines.push(`Total clientes,${num(data.totalClients)}`)
  lines.push(`Clientes con compras,${num(data.clientsWithPurchases)}`)
  lines.push('')

  if (Object.keys(sources).length) {
    lines.push('ORIGEN DE CLIENTES')
    lines.push('Origen,Clientes')
    for (const [k, v] of Object.entries(sources)) {
      lines.push(`${csv(k)},${num(v)}`)
    }
    lines.push('')
  }

  if (topClients.length) {
    lines.push('TOP CLIENTES POR FACTURACIÓN')
    lines.push('#,Cliente,Facturación')
    topClients.forEach((c, i) => {
      lines.push(`${i + 1},${csv(c.full_name)},${num(c.total_revenue)}`)
    })
  }
}

function sectionStores(lines: string[], items: AnyRec[] | null) {
  if (!items?.length) { lines.push('Sin datos para el periodo seleccionado'); return }
  lines.push('FACTURACIÓN POR TIENDA')
  lines.push('Tienda,TPV,Sastrería,Total')
  for (const s of items) {
    lines.push(`${csv(s.store_name)},${num(s.pos)},${num(s.tailoring)},${num(s.total)}`)
  }
  const sum = (k: string) => items.reduce((acc, d) => acc + (Number(d[k]) || 0), 0)
  lines.push(`TOTAL,${sum('pos')},${sum('tailoring')},${sum('total')}`)
}

function sectionEmployees(lines: string[], items: AnyRec[] | null) {
  if (!items?.length) { lines.push('Sin datos para el periodo seleccionado'); return }
  lines.push('VENTAS POR EMPLEADO')
  lines.push('Empleado,Ventas TPV,Total TPV,Cobros Sastrería,Total Sastrería,Pedidos sastre,Fact. sastre,Total')
  for (const e of items) {
    lines.push(`${csv(e.employee_name)},${num(e.pos_ops)},${num(e.pos_total)},${num(e.tailoring_ops)},${num(e.tailoring_total)},${num(e.tailor_orders_count)},${num(e.tailor_orders_revenue)},${num(e.total)}`)
  }
  const sum = (k: string) => items.reduce((acc, d) => acc + (Number(d[k]) || 0), 0)
  lines.push(`TOTAL,${sum('pos_ops')},${sum('pos_total')},${sum('tailoring_ops')},${sum('tailoring_total')},${sum('tailor_orders_count')},${sum('tailor_orders_revenue')},${sum('total')}`)
}

function sectionTime(lines: string[], data: AnyRec | null) {
  if (!data) { lines.push('Sin datos para el periodo seleccionado'); return }
  const byHour = (data.byHour as AnyRec[]) || []
  const byDay = (data.byDayOfWeek as AnyRec[]) || []

  lines.push('VENTAS POR HORA')
  lines.push('Hora,Operaciones,Total')
  for (const h of byHour) {
    lines.push(`${num(h.hour)},${num(h.count)},${num(h.total)}`)
  }
  lines.push('')

  lines.push('VENTAS POR DÍA DE LA SEMANA')
  lines.push('Día,Operaciones,Total')
  for (const d of byDay) {
    lines.push(`${csv(d.label)},${num(d.count)},${num(d.total)}`)
  }
}

function sectionExpenses(lines: string[], data: AnyRec | null, comparison: AnyRec | null) {
  if (!data) { lines.push('Sin datos para el periodo seleccionado'); return }
  const byCat = (data.byCategory as AnyRec[]) || []
  const recent = (data.recentExpenses as AnyRec[]) || []

  lines.push('RESUMEN GASTOS')
  lines.push(`Total gastos,${num(data.grandTotal)}`)
  lines.push(`Movimientos,${byCat.reduce((s, c) => s + (Number(c.count) || 0), 0)}`)
  if (comparison) {
    lines.push(`Periodo anterior,${num(comparison.previous)}`)
    lines.push(`Variación %,${(Number(comparison.change) || 0).toFixed(2)}`)
  }
  lines.push('')

  if (byCat.length) {
    lines.push('POR CATEGORÍA')
    lines.push('Categoría,Movimientos,Total')
    for (const c of byCat) {
      lines.push(`${csv(c.category)},${num(c.count)},${num(c.total)}`)
    }
    lines.push(`TOTAL,${byCat.reduce((s, c) => s + (Number(c.count) || 0), 0)},${num(data.grandTotal)}`)
    lines.push('')
  }

  if (recent.length) {
    lines.push('ÚLTIMOS MOVIMIENTOS')
    lines.push('Fecha,Categoría,Descripción,Importe')
    for (const t of recent) {
      lines.push(`${csv(t.date)},${csv(t.category)},${csv(t.description)},${num(t.total)}`)
    }
  }
}
