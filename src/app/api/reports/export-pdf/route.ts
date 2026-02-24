import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { start, end, salesData, topProducts, tailorData } = body

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: 'Helvetica', sans-serif; color: #1a2744; padding: 40px; font-size: 12px; }
  h1 { font-size: 24px; border-bottom: 3px solid #c9a84c; padding-bottom: 10px; }
  h2 { font-size: 16px; margin-top: 30px; color: #1a2744; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 20px 0; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center; }
  .kpi-value { font-size: 22px; font-weight: bold; }
  .kpi-label { font-size: 10px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #1a2744; color: white; padding: 8px; text-align: left; font-size: 10px; }
  td { padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
  tr:nth-child(even) { background: #f9fafb; }
  .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #9ca3af; }
  .gold { color: #c9a84c; }
  @media print { body { padding: 20px; } }
</style>
</head><body>
<h1>Sastrería Prats <span class="gold">— Informe</span></h1>
<p>Periodo: ${start} a ${end} · Generado: ${new Date().toLocaleDateString('es-ES')}</p>

<div class="kpi-grid">
  <div class="kpi"><div class="kpi-value">${fmtEur(salesData?.totals?.total)}</div><div class="kpi-label">Facturación total</div></div>
  <div class="kpi"><div class="kpi-value">${fmtEur(salesData?.totals?.pos)}</div><div class="kpi-label">TPV</div></div>
  <div class="kpi"><div class="kpi-value">${fmtEur(salesData?.totals?.tailoring)}</div><div class="kpi-label">Sastrería</div></div>
  <div class="kpi"><div class="kpi-value">${salesData?.totals?.ticketCount || 0}</div><div class="kpi-label">Tickets</div></div>
</div>

<h2>Top Productos</h2>
<table><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Facturación</th></tr>
${(topProducts || []).map((p: Record<string, unknown>, i: number) =>
  `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.units}</td><td>${fmtEur(p.revenue as number)}</td></tr>`
).join('')}
</table>

<h2>Rendimiento por sastre</h2>
<table><tr><th>Sastre</th><th>Pedidos</th><th>Completados</th><th>Pruebas</th><th>Facturación</th></tr>
${(tailorData || []).map((t: Record<string, unknown>) =>
  `<tr><td>${t.name}</td><td>${t.orders}</td><td>${t.completed}</td><td>${t.fittings}</td><td>${fmtEur(t.revenue as number)}</td></tr>`
).join('')}
</table>

<div class="footer">Sastrería Prats · Calle de Serrano 82, Madrid · Informe generado automáticamente</div>
</body></html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="informe-prats-${start}-${end}.html"`,
    },
  })
}

function fmtEur(n: number | undefined | null): string {
  return `€${(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
