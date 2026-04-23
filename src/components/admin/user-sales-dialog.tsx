'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2 } from 'lucide-react'
import { getUserSalesSummary } from '@/actions/reports'
import { formatCurrency, formatDateTime } from '@/lib/utils'

type SummaryData = {
  user: { id: string; full_name: string | null; email: string | null } | null
  mtd: { total: number; sales_count: number }
  ytd: { total: number; sales_count: number }
  all_time: { total: number; sales_count: number }
  current_month: { year: number; month: number; label: string }
  recent_sales: Array<{
    sale_id: string
    ticket_number: string
    created_at: string
    sale_total: number
    lines_total_for_user: number
    client_name: string | null
    store_name: string | null
  }>
  by_month: Array<{ year: number; month: number; label: string; total: number; sales_count: number }>
}

export function UserSalesDialog({
  userId,
  userLabel,
  open,
  onOpenChange,
}: {
  userId: string
  userLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SummaryData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    getUserSalesSummary({ user_id: userId, recent_limit: 25 })
      .then((res) => {
        if (cancelled) return
        if (res.success) setData(res.data as SummaryData)
        else setError(res.error ?? 'No se pudo cargar el resumen')
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'Error inesperado') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, userId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>Ventas y comisiones · {userLabel}</DialogTitle>
          <DialogDescription>
            Se contabilizan las líneas de venta (sale_lines) en las que el vendedor figura como responsable,
            ya sea por reserva asignada o por venta directa.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6 text-center">{error}</p>
          ) : data ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                      {data.current_month.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(data.mtd.total)}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.mtd.sales_count} venta{data.mtd.sales_count !== 1 ? 's' : ''}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                      Año {data.current_month.year}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(data.ytd.total)}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.ytd.sales_count} venta{data.ytd.sales_count !== 1 ? 's' : ''}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                      Histórico total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(data.all_time.total)}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.all_time.sales_count} venta{data.all_time.sales_count !== 1 ? 's' : ''}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {data.by_month.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Evolución mensual (últimos 12 meses)</h3>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mes</TableHead>
                          <TableHead className="text-right">Ventas</TableHead>
                          <TableHead className="text-right">Importe (€)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.by_month.map((m) => (
                          <TableRow key={`${m.year}-${m.month}`}>
                            <TableCell>{m.label}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.sales_count}</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(m.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold mb-2">Últimas ventas ({data.recent_sales.length})</h3>
                {data.recent_sales.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Sin ventas registradas</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticket</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Tienda</TableHead>
                          <TableHead className="text-right">Comisión (€)</TableHead>
                          <TableHead className="text-right">Total ticket (€)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recent_sales.map((s) => (
                          <TableRow key={s.sale_id}>
                            <TableCell className="font-mono text-xs">{s.ticket_number}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDateTime(s.created_at)}</TableCell>
                            <TableCell className="text-sm">{s.client_name ?? '—'}</TableCell>
                            <TableCell className="text-sm">{s.store_name ?? '—'}</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(s.lines_total_for_user)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(s.sale_total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex justify-end border-t pt-3 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
