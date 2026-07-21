'use client'

import { Fragment, useState } from 'react'
import { ChevronRight, ShoppingCart, Package, TrendingUp, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import { aggregateSizeTotals } from '@/lib/reports/dimensions'

type Breakdown = { size: string; store_id: string; store_name: string; units: number; revenue: number }
type SizeBreakdown = { size: string; comprado: number; vendido: number; queda: number }
type ProductItem = {
  product_id: string; name: string; sku: string; category_id?: string | null; units: number; revenue: number
  revenue_net: number; unit_cost: number; cogs: number; margin: number
  purchased_units: number; purchased_cost: number; current_stock: number
  breakdown: Breakdown[]
  sizeBreakdown: SizeBreakdown[]
}

const pct = (margin: number, base: number) => (base > 0 ? (margin / base) * 100 : 0)

function marginClass(p: number) {
  if (p >= 50) return 'text-green-600'
  if (p >= 25) return 'text-emerald-600'
  if (p >= 0) return 'text-amber-600'
  return 'text-red-600'
}

type SortKey = 'name' | 'purchased_units' | 'units' | 'current_stock' | 'revenue' | 'unit_cost' | 'margin' | 'margin_pct'

// periodMode: las ventas vienen acotadas al periodo del filtro → "Compradas"
// (modelo de conservación histórico) no aplica y se oculta; el stock sigue
// siendo el actual de hoy.
export function TopProductsChart({ products, periodMode = false }: { products: ProductItem[]; periodMode?: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Orden por defecto: nº de unidades vendidas, de mayor a menor (petición
  // Mónica jul-2026); la cabecera sigue permitiendo reordenar por otra columna.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'units', dir: 'desc' })
  if (!products.length) return <p className="text-center text-muted-foreground py-12">Sin datos</p>

  const top10 = products.slice(0, 10)
  const maxRevenue = Math.max(...top10.map(p => p.revenue))
  const keyOf = (p: ProductItem, i: number) => p.product_id || p.sku || `${p.name}-${i}`
  const toggle = (k: string) => setExpanded(prev => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  // Totales históricos (sobre todo lo que devuelve el informe, no solo el top 10).
  const tot = products.reduce(
    (a, p) => ({
      purchasedUnits: a.purchasedUnits + p.purchased_units,
      purchasedCost: a.purchasedCost + p.purchased_cost,
      soldUnits: a.soldUnits + p.units,
      currentStock: a.currentStock + p.current_stock,
      revenueNet: a.revenueNet + p.revenue_net,
      cogs: a.cogs + p.cogs,
      margin: a.margin + p.margin,
    }),
    { purchasedUnits: 0, purchasedCost: 0, soldUnits: 0, currentStock: 0, revenueNet: 0, cogs: 0, margin: 0 },
  )

  // Orden de la tabla de detalle: clic en cabecera alterna asc/desc.
  const sortVal = (p: ProductItem, key: SortKey): number | string => {
    switch (key) {
      case 'name': return (p.name || '').toLowerCase()
      case 'purchased_units': return p.purchased_units
      case 'units': return p.units
      case 'current_stock': return p.current_stock
      case 'unit_cost': return p.unit_cost
      case 'margin': return p.margin
      case 'margin_pct': return pct(p.margin, p.revenue_net)
      default: return p.revenue
    }
  }
  const sortedProducts = [...products].sort((a, b) => {
    const va = sortVal(a, sort.key), vb = sortVal(b, sort.key)
    const cmp = typeof va === 'string' || typeof vb === 'string'
      ? String(va).localeCompare(String(vb))
      : (va as number) - (vb as number)
    return sort.dir === 'asc' ? cmp : -cmp
  })
  const onSort = (key: SortKey) => setSort(prev =>
    prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'name' ? 'asc' : 'desc' },
  )
  // Agregado por TALLA de TODOS los productos listados (no solo el top 10):
  // como respeta el buscador de arriba, filtrar por "pantalon" da el top de
  // tallas de pantalón. Sin filtro se mezclan tallajes de prendas distintas.
  const sizeTotals = aggregateSizeTotals(products).filter(s => s.vendido > 0)
  const maxSizeUnits = Math.max(...sizeTotals.map(s => s.vendido), 1)
  const totalSizeUnits = sizeTotals.reduce((s, x) => s + x.vendido, 0)

  const sortHead = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <TableHead className={align === 'right' ? 'text-right' : ''}>
      <button
        type="button"
        onClick={() => onSort(key)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${sort.key === key ? 'text-foreground font-semibold' : ''}`}
      >
        {label}
        {sort.key === key
          ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </TableHead>
  )

  return (
    <div className="space-y-6">
      {/* KPIs: comprado vs vendido vs stock vs margen (en modo periodo, sin "Comprado") */}
      <div className={`grid grid-cols-2 gap-4 ${periodMode ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {!periodMode && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Comprado (inicial + proveedor)</span>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{tot.purchasedUnits} <span className="text-base font-normal text-muted-foreground">uds</span></p>
              <p className="text-xs text-muted-foreground">{formatCurrency(tot.purchasedCost)} a coste</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{periodMode ? 'Vendido en el periodo' : 'Vendido'}</span>
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{tot.soldUnits} <span className="text-base font-normal text-muted-foreground">uds</span></p>
            <p className="text-xs text-muted-foreground">{formatCurrency(tot.revenueNet)} sin IVA</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{periodMode ? 'Stock actual (hoy)' : 'Stock actual'}</span>
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{tot.currentStock} <span className="text-base font-normal text-muted-foreground">uds</span></p>
            <p className="text-xs text-muted-foreground">
              sin vender{!periodMode && <> · {formatCurrency(tot.currentStock > 0 ? tot.purchasedCost - tot.cogs : 0)} a coste</>}
            </p>
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
                  <div className="flex justify-between items-baseline gap-3 text-sm mb-1">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground shrink-0 whitespace-nowrap">{formatCurrency(p.revenue)}</span>
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
                    <div className="flex justify-between items-baseline gap-3 text-sm mb-1">
                      <span className="font-medium">{p.name}</span>
                      <span className={`${marginClass(mp)} shrink-0 whitespace-nowrap`}>{formatCurrency(p.margin)} · {mp.toFixed(0)}%</span>
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

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Unidades vendidas por talla</CardTitle></CardHeader>
          <CardContent>
            {sizeTotals.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">Sin ventas con talla</p>
            ) : (
              <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                {sizeTotals.map((s) => (
                  <div key={s.size}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium font-mono">{s.size}</span>
                      <span className="text-muted-foreground">
                        <span className="font-semibold text-foreground tabular-nums">{s.vendido} uds</span>
                        {' '}· {totalSizeUnits > 0 ? ((s.vendido / totalSizeUnits) * 100).toFixed(0) : 0}%
                        {' '}· <span className={s.queda === 0 ? 'text-red-600 font-semibold' : ''}>quedan {s.queda}</span>
                      </span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-prats-navy rounded-full transition-all" style={{ width: `${(s.vendido / maxSizeUnits) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-3">
              Suma de <strong>todos los productos listados</strong> (respeta el buscador de arriba): filtra por &laquo;pantalon&raquo;, &laquo;camisa&raquo;&hellip; para ver el top de tallas de esa prenda. Sin filtro se mezclan tallajes de prendas distintas.
            </p>
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
                {sortHead('name', 'Producto', 'left')}
                {!periodMode && sortHead('purchased_units', 'Compradas')}
                {sortHead('units', 'Vendidas')}
                {sortHead('current_stock', 'Stock')}
                {sortHead('revenue', 'Facturación')}
                {sortHead('unit_cost', 'Coste ud.')}
                {sortHead('margin', 'Margen')}
                {sortHead('margin_pct', 'Margen %')}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProducts.map((p, i) => {
                const k = keyOf(p, i)
                const isOpen = expanded.has(k)
                const hasDetail = p.sizeBreakdown && p.sizeBreakdown.length > 0
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
                      {!periodMode && <TableCell className="text-right tabular-nums">{p.purchased_units || <span className="text-muted-foreground">—</span>}</TableCell>}
                      <TableCell className="text-right tabular-nums">{p.units}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{p.current_stock || '—'}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatCurrency(p.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{hasCost ? formatCurrency(p.unit_cost) : '—'}</TableCell>
                      <TableCell className={`text-right tabular-nums ${hasCost ? marginClass(mp) : 'text-muted-foreground'}`}>{hasCost ? formatCurrency(p.margin) : '—'}</TableCell>
                      <TableCell className={`text-right tabular-nums ${hasCost ? marginClass(mp) : 'text-muted-foreground'}`}>{hasCost && p.revenue_net > 0 ? `${mp.toFixed(1)}%` : '—'}</TableCell>
                    </TableRow>
                    {isOpen && hasDetail && (
                      <TableRow className="bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={periodMode ? 7 : 8} className="py-2">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-muted-foreground">
                                <th className="text-left font-medium pb-1">Talla</th>
                                {!periodMode && <th className="text-right font-medium pb-1">Comprado</th>}
                                <th className="text-right font-medium pb-1">Vendido</th>
                                <th className="text-right font-medium pb-1">Queda</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.sizeBreakdown.map((b, j) => (
                                <tr key={j}>
                                  <td className="py-0.5 font-mono">{b.size}</td>
                                  {!periodMode && <td className="py-0.5 text-right tabular-nums">{b.comprado}</td>}
                                  <td className="py-0.5 text-right tabular-nums">{b.vendido}</td>
                                  {/* Talla agotada resaltada en rojo (petición Mónica/Isma) */}
                                  <td className={`py-0.5 text-right tabular-nums ${b.queda === 0 ? 'text-red-600 font-semibold' : ''}`}>{b.queda}</td>
                                </tr>
                              ))}
                              <tr className="border-t font-semibold">
                                <td className="py-0.5">Total</td>
                                {!periodMode && <td className="py-0.5 text-right tabular-nums">{p.sizeBreakdown.reduce((s, b) => s + b.comprado, 0)}</td>}
                                <td className="py-0.5 text-right tabular-nums">{p.sizeBreakdown.reduce((s, b) => s + b.vendido, 0)}</td>
                                <td className={`py-0.5 text-right tabular-nums ${p.sizeBreakdown.reduce((s, b) => s + b.queda, 0) === 0 ? 'text-red-600' : ''}`}>{p.sizeBreakdown.reduce((s, b) => s + b.queda, 0)}</td>
                              </tr>
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
            {!periodMode && (
              <><strong>Compradas</strong> = <strong>Stock + Vendidas</strong>: todo el género que ha entrado del producto (stock inicial cargado a mano al darlo de alta + recepciones de proveedor). Se calcula como lo que queda en stock más lo vendido, porque el stock inicial se cargó directo sin dejar registro de compra; mermas o devoluciones a proveedor son un sesgo menor. Valor a coste estimado con el coste actual del producto.</>
            )}
            {periodMode && (
              <><strong>Vendidas y facturación</strong> son solo las del periodo y tienda del filtro superior; <strong>Stock</strong> es el actual de hoy (no el que había al cierre del periodo).</>
            )}
            <strong> Margen</strong> = facturación sin IVA − (uds vendidas × coste del producto); se calcula <strong>siempre sin IVA</strong> aunque la facturación se muestre con IVA. Los productos sin coste registrado aparecen con &laquo;—&raquo; en margen.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
