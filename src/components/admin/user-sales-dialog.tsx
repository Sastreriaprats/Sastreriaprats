'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { getUserSalesSummary } from '@/actions/reports'
import { formatCurrency, formatDateTime } from '@/lib/utils'

type SummaryData = {
  user: { id: string; full_name: string | null; email: string | null } | null
  mtd: { total: number; sales_count: number }
  ytd: { total: number; sales_count: number }
  all_time: { total: number; sales_count: number }
  current_month: { year: number; month: number; label: string }
  stores: Array<{ id: string; name: string }>
  by_store: Record<string, number>
  recent_sales: Array<{
    sale_id: string
    ticket_number: string
    created_at: string
    sale_total: number
    lines_total_for_user: number
    client_name: string | null
    store_name: string | null
  }>
  by_month: Array<{
    year: number; month: number; label: string; total: number; sales_count: number
    by_store: Record<string, number>
    tailoring_collected: number
  }>
  tailoring_backoffice_total: number
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
  const [year, setYear] = useState<number | null>(null)

  useEffect(() => {
    if (!open || !userId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    setYear(null)
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

  // Años disponibles en el historial (desc) y año seleccionado (por defecto, el más reciente).
  const years = useMemo(
    () => (data ? [...new Set(data.by_month.map((m) => m.year))].sort((a, b) => b - a) : []),
    [data],
  )
  const selectedYear = year ?? years[0] ?? null
  const monthsOfYear = useMemo(
    () => (data && selectedYear != null ? data.by_month.filter((m) => m.year === selectedYear) : []),
    [data, selectedYear],
  )
  const hasTailoring = (data?.tailoring_backoffice_total ?? 0) > 0
  const yearIdx = selectedYear != null ? years.indexOf(selectedYear) : -1

  const yearTotals = useMemo(() => {
    const t = { total: 0, sales_count: 0, tailoring: 0, by_store: {} as Record<string, number> }
    for (const m of monthsOfYear) {
      t.total += m.total
      t.sales_count += m.sales_count
      t.tailoring += m.tailoring_collected
      for (const [k, v] of Object.entries(m.by_store)) t.by_store[k] = (t.by_store[k] || 0) + v
    }
    return t
  }, [monthsOfYear])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>Ventas y comisiones · {userLabel}</DialogTitle>
          <DialogDescription>
            Importes <strong>sin IVA</strong> de las líneas de venta atribuidas al vendedor
            (por reserva asignada o venta directa), descontando devoluciones y sin contar
            cobros de pedidos — la misma base que usa el motor de comisiones.
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
                      {data.mtd.sales_count} venta{data.mtd.sales_count !== 1 ? 's' : ''} · sin IVA
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
                      {data.ytd.sales_count} venta{data.ytd.sales_count !== 1 ? 's' : ''} · sin IVA
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
                      {data.all_time.sales_count} venta{data.all_time.sales_count !== 1 ? 's' : ''} · sin IVA
                    </p>
                  </CardContent>
                </Card>
              </div>

              {data.stores.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {data.stores.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs">
                      <span className="text-muted-foreground">{s.name}:</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(data.by_store[s.id] ?? 0)}</span>
                    </span>
                  ))}
                  {hasTailoring && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs">
                      <span className="text-blue-700">Sastrería cobrada (backoffice):</span>
                      <span className="font-semibold tabular-nums text-blue-700">
                        {formatCurrency(data.tailoring_backoffice_total)}
                      </span>
                    </span>
                  )}
                </div>
              )}

              {data.by_month.length > 0 && selectedYear != null && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Historial mensual</h3>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={yearIdx >= years.length - 1}
                        onClick={() => setYear(years[yearIdx + 1])}
                        title="Año anterior"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-semibold tabular-nums w-12 text-center">{selectedYear}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={yearIdx <= 0}
                        onClick={() => setYear(years[yearIdx - 1])}
                        title="Año siguiente"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mes</TableHead>
                          <TableHead className="text-right">Ventas</TableHead>
                          {data.stores.map((s) => (
                            <TableHead key={s.id} className="text-right whitespace-nowrap">{s.name}</TableHead>
                          ))}
                          {hasTailoring && (
                            <TableHead className="text-right whitespace-nowrap text-blue-700">Sastr. cobrada</TableHead>
                          )}
                          <TableHead className="text-right">Total (sin IVA)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthsOfYear.map((m) => (
                          <TableRow key={`${m.year}-${m.month}`}>
                            <TableCell>{m.label}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.sales_count}</TableCell>
                            {data.stores.map((s) => (
                              <TableCell key={s.id} className="text-right tabular-nums">
                                {m.by_store[s.id] ? formatCurrency(m.by_store[s.id]) : '—'}
                              </TableCell>
                            ))}
                            {hasTailoring && (
                              <TableCell className="text-right tabular-nums text-blue-700">
                                {m.tailoring_collected ? formatCurrency(m.tailoring_collected) : '—'}
                              </TableCell>
                            )}
                            <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(m.total)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell>Total {selectedYear}</TableCell>
                          <TableCell className="text-right tabular-nums">{yearTotals.sales_count}</TableCell>
                          {data.stores.map((s) => (
                            <TableCell key={s.id} className="text-right tabular-nums">
                              {yearTotals.by_store[s.id] ? formatCurrency(yearTotals.by_store[s.id]) : '—'}
                            </TableCell>
                          ))}
                          {hasTailoring && (
                            <TableCell className="text-right tabular-nums text-blue-700">
                              {yearTotals.tailoring ? formatCurrency(yearTotals.tailoring) : '—'}
                            </TableCell>
                          )}
                          <TableCell className="text-right tabular-nums">{formatCurrency(yearTotals.total)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  {hasTailoring && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      «Sastr. cobrada» = pagos de pedidos registrados por este empleado en backoffice (sin IVA).
                      Es una serie informativa: no forma parte del total vendido ni de la base de comisiones.
                    </p>
                  )}
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
                          <TableHead className="text-right">Vendido sin IVA (€)</TableHead>
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
