import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { start, end, salesData, topProducts, tailorData } = body

  const lines: string[] = []

  lines.push('INFORME SASTRERÍA PRATS')
  lines.push(`Periodo,${start},a,${end}`)
  lines.push('')
  lines.push('RESUMEN')
  lines.push(`Facturación total,${salesData?.totals?.total || 0}`)
  lines.push(`TPV / Boutique,${salesData?.totals?.pos || 0}`)
  lines.push(`Online,${salesData?.totals?.online || 0}`)
  lines.push(`Sastrería,${salesData?.totals?.tailoring || 0}`)
  lines.push(`Tickets,${salesData?.totals?.ticketCount || 0}`)
  lines.push(`Ticket medio,${salesData?.totals?.avgTicket || 0}`)
  lines.push('')

  lines.push('VENTAS POR DÍA')
  lines.push('Fecha,TPV,Online,Sastrería,Total')
  for (const d of salesData?.chartData || []) {
    lines.push(`${d.date},${d.pos},${d.online},${d.tailoring},${d.total}`)
  }
  lines.push('')

  lines.push('TOP PRODUCTOS')
  lines.push('#,Producto,SKU,Unidades,Facturación')
  for (let i = 0; i < (topProducts || []).length; i++) {
    const p = topProducts[i]
    lines.push(`${i + 1},"${p.name}",${p.sku || ''},${p.units},${p.revenue}`)
  }
  lines.push('')

  lines.push('RENDIMIENTO SASTRES')
  lines.push('Sastre,Pedidos,Completados,% Completado,Pruebas,Facturación,Ticket medio')
  for (const t of tailorData || []) {
    lines.push(`"${t.name}",${t.orders},${t.completed},${t.completionRate.toFixed(1)}%,${t.fittings},${t.revenue},${t.avgOrderValue.toFixed(2)}`)
  }

  const csv = '\uFEFF' + lines.join('\r\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="informe-prats-${start}-${end}.csv"`,
    },
  })
}
