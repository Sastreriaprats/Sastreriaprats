'use client'

import { Fragment, useState } from 'react'
import { ChevronRight, ShoppingCart, Package, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'

type Breakdown = { size: string; store_id: string; store_name: string; units: number; revenue: number }
type ProductItem = {
  product_id: string; name: string; sku: string; units: number; revenue: number
  revenue_net: number; unit_cost: number; cogs: number; margin: number
  purchased_units: number; purchased_cost: number
  breakdown: Breakdown[]
}

const pct = (margin: number, base: number) => (base > 0 ? (margin / base) * 100 : 0)

function marginClass(p: number) {
  if (p >= 50) return 'text-green-600'
  if (p >= 25) return 'text-emerald-600'
  if (p >= 0) return 'text-amber-600'
  return 'text-red-600'
}

export function TopProductsChart({ products }: { products: ProductItem[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  if (!products.length) return <p className="text-center text-muted-foreground py-12">Sin datos</p>

  const top10 = products.slice(0, 10)
  const maxRevenue = Math.max(...top10.map(p => p.revenue))
  const keyOf = (p: ProductItem, i: number) => p.product_id || p.sku || `${p.name}-${i}`
  const toggle = (k: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  // Totales del periodo (sobre todo lo que devuelve el informe, no solo el top 10).
  const tot = products.reduce(
    (a, p) => ({
      purchasedUnits: a.purchasedUnits + p.purchased_units,
      purchasedCost: a.purchasedCost + p.purchased_cost,
      soldUnits: a.soldUnits + p.units,
      revenueNet: a.revenueNet + p.revenue_net,
      cogs: a.cogs + p.cogs,
      margin: a.margin + p.margin,
    }),
    { purchasedUnits: 0, purchasedCost: 0, soldUnits: 0, revenueNet: 0, cogs: 0, margin: 0 },
  )

  return (
    <div className="space-y-6">
      {/* KPIs: comprado vs vendido vs margen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Comprado a proveedor</span>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{tot.purchasedUnits} <span className="text-base font-normal text-muted-foreground">uds</span></p>
            <p className="text-xs text-muted-foreground">{formatCurrency(tot.purchasedCost)} en coste</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Vendido</span>
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{tot.soldUnits} <span className="text-base font-normal text-muted-foreground">uds</span></p>
            <p className="text-xs text-muted-foreground">{formatCurrency(tot.revenueNet)} sin IVA</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Margen bruto</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className={`text-2xl font-bold ${marginClass(pct(tot.margin, tot.revenueNet))}`}>{formatCurrency(tot.margin)}</p>
            <p className="text-xs text-muted-foreground">{pct(tot.margin, tot.revenueNet).toFixed(1)}% sobre venta · coste {formatCurrency(tot.cogs)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Top 10 productos por facturación</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {top10.map((p, i) => (
                <div key={keyOf(p, i)}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium truncate max-w-[200px]">{p.name}</span>
                    <span className="text-muted-foreground">{formatCurrency(p.revenue)}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-prats-navy rounded-full transition-all" style={{ width: `${maxRevenue > 0 ? (p.revenue / maxRevenue) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Margen por producto (sin IVA)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...products].filter(p => p.unit_cost > 0 && p.units > 0).sort((a, b) => b.margin - a.margin).slice(0, 10).map((p, i) => {
                const mp = pct(p.margin, p.revenue_net)
                const maxAbs = Math.max(...products.filter(x => x.units > 0).map(x => Math.abs(x.margin)), 1)
                return (
                  <div key={keyOf(p, i)}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium truncate max-w-[170px]">{p.name}</span>
                      <span className={marginClass(mp)}>{formatCurrency(p.margin)} · {mp.toFixed(0)}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${p.margin >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${(Math.abs(p.margin) / maxAbs) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalle por producto</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Compradas</TableHead>
                <TableHead className="text-right">Vendidas</TableHead>
                <TableHead className="text-right">Facturación</TableHead>
                <TableHead className="text-right">Coste ud.</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                <TableHead className="text-right">Margen %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p, i) => {
                const k = keyOf(p, i)
                const isOpen = expanded.has(k)
                const hasDetail = p.breakdown && p.breakdown.length > 0
                const mp = pct(p.margin, p.revenue_net)
                const hasCost = p.unit_cost > 0
                return (
                  <Fragment key={k}>
                    <TableRow
                      className={hasDetail ? 'cursor-pointer' : ''}
                      onClick={hasDetail ? () => toggle(k) : undefined}
                    >
                      <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium text-sm flex items-center gap-1">
                          {hasDetail && <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
                          {p.name}
                        </p>
                        {p.sku && <p className="text-xs text-muted-foreground font-mono ml-[18px]">{p.sku}</p>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.purchased_units || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.units}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatCurrency(p.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{hasCost ? formatCurrency(p.unit_cost) : '—'}</TableCell>
                      <TableCell className={`text-right tabular-nums ${hasCost ? marginClass(mp) : 'text-muted-foreground'}`}>{hasCost ? formatCurrency(p.margin) : '—'}</TableCell>
                      <TableCell className={`text-right tabular-nums ${hasCost ? marginClass(mp) : 'text-muted-foreground'}`}>{hasCost && p.revenue_net > 0 ? `${mp.toFixed(1)}%` : '—'}</TableCell>
                    </TableRow>
                    {isOpen && hasDetail && (
                      <TableRow className="bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={7} className="py-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left font-medium pb-1">Talla</th>
                                <th className="text-left font-medium pb-1">Tienda</th>
                                <th className="text-right font-medium pb-1">Uds</th>
                                <th className="text-right font-medium pb-1">Importe</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.breakdown.map((b, j) => (
                                <tr key={j}>
                                  <td className="py-0.5 font-mono">{b.size}</td>
                                  <td className="py-0.5">{b.store_name}</td>
                                  <td className="py-0.5 text-right">{b.units}</td>
                                  <td className="py-0.5 text-right">{formatCurrency(b.revenue)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
          <p className="text-[11px] text-muted-foreground mt-3">
            <strong>Compradas</strong>: unidades pedidas a proveedor con fecha de pedido en el periodo (toda la empresa, sin filtro de tienda).
            <strong> Margen</strong> = facturación sin IVA − (uds vendidas × coste del producto); se calcula <strong>siempre sin IVA</strong> aunque la facturación se muestre con IVA. Los productos sin coste registrado aparecen con &laquo;—&raquo; en margen.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
