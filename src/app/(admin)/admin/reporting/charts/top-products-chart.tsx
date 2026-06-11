'use client'

import { Fragment, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'

type Breakdown = { size: string; store_id: string; store_name: string; units: number; revenue: number }
type ProductItem = { product_id: string; name: string; sku: string; units: number; revenue: number; breakdown: Breakdown[] }

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

  return (
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
        <CardHeader><CardTitle className="text-base">Detalle por producto</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Uds</TableHead>
                <TableHead className="text-right">Facturación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p, i) => {
                const k = keyOf(p, i)
                const isOpen = expanded.has(k)
                const hasDetail = p.breakdown && p.breakdown.length > 0
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
                      <TableCell className="text-right">{p.units}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(p.revenue)}</TableCell>
                    </TableRow>
                    {isOpen && hasDetail && (
                      <TableRow className="bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={3} className="py-2">
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
        </CardContent>
      </Card>
    </div>
  )
}
