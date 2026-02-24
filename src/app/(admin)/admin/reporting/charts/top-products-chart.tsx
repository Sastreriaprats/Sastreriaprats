'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'

type ProductItem = { name: string; sku: string; units: number; revenue: number }

export function TopProductsChart({ products }: { products: ProductItem[] }) {
  if (!products.length) return <p className="text-center text-muted-foreground py-12">Sin datos</p>

  const maxRevenue = Math.max(...products.map(p => p.revenue))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Top 10 productos por facturación</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {products.map((p, i) => (
              <div key={i}>
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
              {products.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{p.name}</p>
                    {p.sku && <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>}
                  </TableCell>
                  <TableCell className="text-right">{p.units}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(p.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
