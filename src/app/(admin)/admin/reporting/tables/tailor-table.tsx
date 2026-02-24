'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'

type TailorItem = {
  tailor_id: string; name: string; orders: number; revenue: number
  fittings: number; completed: number; avgOrderValue: number; completionRate: number
}

export function TailorTable({ data }: { data: TailorItem[] }) {
  if (!data.length) return <p className="text-center text-muted-foreground py-12">Sin datos</p>

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Rendimiento por sastre</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sastre</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="text-right">Completados</TableHead>
              <TableHead className="text-right">% Completado</TableHead>
              <TableHead className="text-right">Pruebas</TableHead>
              <TableHead className="text-right">Facturación</TableHead>
              <TableHead className="text-right">Ticket medio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((t, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-right">{t.orders}</TableCell>
                <TableCell className="text-right">{t.completed}</TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={t.completionRate >= 80 ? 'default' : t.completionRate >= 50 ? 'secondary' : 'destructive'}
                    className="text-xs"
                  >
                    {t.completionRate.toFixed(0)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{t.fittings}</TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(t.revenue)}</TableCell>
                <TableCell className="text-right">{formatCurrency(t.avgOrderValue)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 font-bold">
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right">{data.reduce((s, t) => s + t.orders, 0)}</TableCell>
              <TableCell className="text-right">{data.reduce((s, t) => s + t.completed, 0)}</TableCell>
              <TableCell />
              <TableCell className="text-right">{data.reduce((s, t) => s + t.fittings, 0)}</TableCell>
              <TableCell className="text-right">{formatCurrency(data.reduce((s, t) => s + t.revenue, 0))}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
