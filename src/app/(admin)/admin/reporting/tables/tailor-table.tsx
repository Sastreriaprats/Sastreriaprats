'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'

type TailorItem = {
  tailor_id: string
  name: string
  orders: number
  revenue: number
  fittings: number
  completed: number
  avgOrderValue: number
  completionRate: number
  /** Cobros REGISTRADOS en el periodo, agrupados por sastre del pedido. */
  paid_in_period: number
  /** Lo que falta por cobrar de los pedidos creados en el periodo (acumulado real). */
  pending_of_period_orders: number
  /** paid_in_period / revenue * 100. */
  paidRate: number
}

export function TailorTable({ data }: { data: TailorItem[] }) {
  if (!data.length) return <p className="text-center text-muted-foreground py-12">Sin datos</p>

  const totalRevenue = data.reduce((s, t) => s + t.revenue, 0)
  const totalPaid = data.reduce((s, t) => s + t.paid_in_period, 0)
  const totalPending = data.reduce((s, t) => s + t.pending_of_period_orders, 0)
  const totalPaidRate = totalRevenue > 0 ? Math.round((totalPaid / totalRevenue) * 100) : 0

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
              <TableHead className="text-right">Cobrado en periodo</TableHead>
              <TableHead className="text-right">Pendiente de pedidos</TableHead>
              <TableHead className="text-right">% Cobrado</TableHead>
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
                <TableCell className="text-right font-medium text-emerald-700 tabular-nums">{formatCurrency(t.paid_in_period)}</TableCell>
                <TableCell className={`text-right font-medium tabular-nums ${t.pending_of_period_orders > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
                  {formatCurrency(t.pending_of_period_orders)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={t.paidRate >= 90 ? 'default' : t.paidRate >= 50 ? 'secondary' : 'destructive'}
                    className="text-xs"
                  >
                    {t.paidRate}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(t.avgOrderValue)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 font-bold">
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right">{data.reduce((s, t) => s + t.orders, 0)}</TableCell>
              <TableCell className="text-right">{data.reduce((s, t) => s + t.completed, 0)}</TableCell>
              <TableCell />
              <TableCell className="text-right">{data.reduce((s, t) => s + t.fittings, 0)}</TableCell>
              <TableCell className="text-right">{formatCurrency(totalRevenue)}</TableCell>
              <TableCell className="text-right text-emerald-700 tabular-nums">{formatCurrency(totalPaid)}</TableCell>
              <TableCell className={`text-right tabular-nums ${totalPending > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>
                {formatCurrency(totalPending)}
              </TableCell>
              <TableCell className="text-right">
                <Badge
                  variant={totalPaidRate >= 90 ? 'default' : totalPaidRate >= 50 ? 'secondary' : 'destructive'}
                  className="text-xs"
                >
                  {totalPaidRate}%
                </Badge>
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
        <div className="text-[11px] text-muted-foreground mt-3 space-y-1">
          <p>Esta tabla muestra los pedidos <strong>creados</strong> por cada sastre en el periodo seleccionado.</p>
          <p>
            <strong>Cobrado en periodo</strong>: cobros registrados en este periodo, agrupados por el sastre del pedido
            (independientemente de quién registró el cobro físicamente).
          </p>
          <p>
            <strong>Pendiente de pedidos</strong>: lo que falta por cobrar de los pedidos creados en el periodo (basado en
            el total_paid acumulado de esos pedidos hasta hoy — refleja la deuda real del pedido, no del periodo).
          </p>
          <p>
            El <strong>TOTAL de Cobrado en periodo</strong> coincide con el <strong>TOTAL de Cobros Sast.</strong>
            de la pestaña &ldquo;Por empleado&rdquo;: ambos suman los mismos pagos, agrupados por dimensiones distintas
            (sastre del pedido vs cajero que registró).
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
