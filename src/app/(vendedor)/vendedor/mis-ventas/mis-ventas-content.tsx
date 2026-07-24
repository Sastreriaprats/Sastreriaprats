'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DatePickerPopover } from '@/components/ui/date-picker-popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TrendingUp, Receipt, CircleDollarSign, Printer, Loader2 } from 'lucide-react'
import { getMyEmployeeSales, type MyEmployeeSales } from '@/actions/my-sales'
import { getSaleForTicket } from '@/actions/pos'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'
import { getStorePdfData } from '@/lib/pdf/pdf-company'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

const SALE_TYPE_LABELS: Record<string, string> = {
  boutique: 'Boutique',
  gift_card: 'Tarjeta regalo',
  tailoring_deposit: 'Señal sastrería',
  tailoring_final: 'Pago sastrería',
  alteration: 'Arreglo',
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Formateo en hora LOCAL (no toISOString, que desplaza un día por la zona de Madrid).
const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function formatHourMinute(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDayLong(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function getMonthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0) // último día del mes
  return { start: fmtLocal(start), end: fmtLocal(end) }
}

export function MisVentasContent() {
  const now = new Date()
  const [dateRange, setDateRange] = useState(() => ({
    start: fmtLocal(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: fmtLocal(now),
  }))

  const [data, setData] = useState<MyEmployeeSales | null>(null)
  const [loading, setLoading] = useState(true)
  const [printingId, setPrintingId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const salesRes = await getMyEmployeeSales({ from: dateRange.start, to: dateRange.end })
      if (salesRes.data) setData(salesRes.data)
      else if (salesRes.error) toast.error(salesRes.error)
    } catch (err) {
      console.error('[MisVentasContent]', err)
      toast.error('Error al cargar tus ventas')
    } finally {
      setLoading(false)
    }
  }, [dateRange.start, dateRange.end])

  useEffect(() => { fetchAll() }, [fetchAll])

  const setPreset = (preset: 'today' | 'month' | 'year') => {
    const n = new Date()
    if (preset === 'today') {
      const t = fmtLocal(n)
      setDateRange({ start: t, end: t })
    } else if (preset === 'month') {
      setDateRange({ start: fmtLocal(new Date(n.getFullYear(), n.getMonth(), 1)), end: fmtLocal(n) })
    } else {
      setDateRange({ start: fmtLocal(new Date(n.getFullYear(), 0, 1)), end: fmtLocal(n) })
    }
  }

  // Desplegable de los últimos 24 meses. value = `${year}-${monthIndex}`.
  const monthOptions = (() => {
    const out: { value: string; label: string; year: number; month: number }[] = []
    let y = now.getFullYear(), m = now.getMonth()
    for (let i = 0; i < 24; i++) {
      out.push({ value: `${y}-${m}`, label: `${MONTH_NAMES[m].charAt(0).toUpperCase()}${MONTH_NAMES[m].slice(1)} ${y}`, year: y, month: m })
      m -= 1
      if (m < 0) { m = 11; y -= 1 }
    }
    return out
  })()
  const selectedMonthValue = (() => {
    const sd = new Date(dateRange.start + 'T00:00:00')
    const { start } = getMonthRange(sd.getFullYear(), sd.getMonth())
    // Refleja el desplegable solo si el rango arranca el día 1 de un mes natural.
    return dateRange.start === start ? `${sd.getFullYear()}-${sd.getMonth()}` : ''
  })()

  const handlePrint = async (saleId: string) => {
    setPrintingId(saleId)
    try {
      const res = await getSaleForTicket(saleId)
      if (res.success && res.data) {
        const { sale, lines, payments, clientName, clientCode, storeName, salespersonName } = res.data
        const storeConfig = getStorePdfData(storeName)
        await generateTicketPdf({
          sale: {
            ticket_number: sale.ticket_number,
            created_at: sale.created_at,
            client_id: sale.client_id,
            subtotal: sale.subtotal,
            discount_amount: sale.discount_amount,
            discount_percentage: sale.discount_percentage,
            tax_amount: sale.tax_amount,
            total: sale.total,
            payment_method: sale.payment_method,
            is_tax_free: sale.is_tax_free,
          },
          lines: lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_percentage: l.discount_percentage ?? 0,
            line_total: l.line_total,
          })),
          payments,
          clientName,
          clientCode,
          attendedBy: salespersonName ?? null,
          storeAddress: storeConfig.address,
          storeSubtitle: storeConfig.subtitle ?? null,
          storePhones: storeConfig.phones,
        })
      } else {
        toast.error('No se pudo cargar el ticket')
      }
    } catch (e) {
      console.error('[MisVentasContent] print:', e)
      toast.error('Error al generar el ticket')
    } finally {
      setPrintingId(null)
    }
  }

  const dayTotals = new Map((data?.byDay ?? []).map((d) => [d.day, d]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mis ventas</h1>
        <p className="text-muted-foreground">
          Todas tus ventas, de cualquier tienda. Elige un día, un mes o un rango y reimprime cualquier ticket.
        </p>
      </div>

      {/* Filtros de fecha */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border p-0.5">
          <Button variant="ghost" size="sm" className="h-7 px-3 text-xs" onClick={() => setPreset('today')}>Hoy</Button>
          <Button variant="ghost" size="sm" className="h-7 px-3 text-xs" onClick={() => setPreset('month')}>Este mes</Button>
          <Button variant="ghost" size="sm" className="h-7 px-3 text-xs" onClick={() => setPreset('year')}>Este año</Button>
        </div>
        <Select
          value={selectedMonthValue}
          onValueChange={(v) => { const opt = monthOptions.find(o => o.value === v); if (opt) setDateRange(getMonthRange(opt.year, opt.month)) }}
        >
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Elegir mes…" /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <DatePickerPopover containerClassName="w-40 h-8" value={dateRange.start} max={dateRange.end} onChange={date => setDateRange(prev => ({ ...prev, start: date }))} />
          <span className="text-xs text-muted-foreground">a</span>
          <DatePickerPopover containerClassName="w-40 h-8" value={dateRange.end} min={dateRange.start} onChange={date => setDateRange(prev => ({ ...prev, end: date }))} />
        </div>
      </div>

      {/* Resumen del periodo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-[#1a2744]/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-[#1a2744]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Total vendido</p>
                <p className="text-xs text-muted-foreground">Periodo seleccionado · sin IVA</p>
              </div>
            </div>
            {loading ? <Skeleton className="h-8 w-32" /> : <p className="text-2xl font-bold">{formatCurrency(data?.totals.net ?? 0)}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-[#1a2744]/10 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-[#1a2744]" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Nº de tickets</p>
                <p className="text-xs text-muted-foreground">Ventas del periodo</p>
              </div>
            </div>
            {loading ? <Skeleton className="h-8 w-20" /> : <p className="text-2xl font-bold">{data?.totals.count ?? 0}</p>}
          </CardContent>
        </Card>

      </div>

      {/* Detalle por día */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-[#1a2744]" /> Detalle de ventas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 pb-4 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (data?.sales ?? []).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">No hay ventas tuyas en este periodo</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Hora</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Tienda</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Importe (sin IVA)</TableHead>
                    <TableHead className="w-12 text-right">Ticket</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.sales ?? []).map((s, i, arr) => {
                    const prev = arr[i - 1]
                    const isNewDay = !prev || prev.day !== s.day
                    const dt = dayTotals.get(s.day)
                    return (
                      <Fragment key={s.sale_id}>
                        {isNewDay && (
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableCell colSpan={5} className="py-2 font-medium capitalize">{formatDayLong(s.day)}</TableCell>
                            <TableCell className="py-2 text-right font-semibold tabular-nums">{formatCurrency(dt?.net ?? 0)}</TableCell>
                            <TableCell className="py-2 text-right text-xs text-muted-foreground">{dt?.count ?? 0}</TableCell>
                          </TableRow>
                        )}
                        <TableRow>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">{formatHourMinute(s.created_at)}</TableCell>
                          <TableCell className="font-mono text-sm">{s.ticket_number}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.store_name ?? '—'}</TableCell>
                          <TableCell className="text-sm">
                            {s.client_name ?? <span className="text-muted-foreground">Sin cliente</span>}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1">
                              <Badge variant="outline" className="text-xs font-medium">{SALE_TYPE_LABELS[s.sale_type ?? ''] ?? (s.sale_type ?? 'Venta')}</Badge>
                              {s.from_reservation && <Badge variant="secondary" className="text-[10px]">Reserva</Badge>}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatCurrency(s.amount_net)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Reimprimir ticket"
                              disabled={printingId === s.sale_id}
                              onClick={() => handlePrint(s.sale_id)}
                            >
                              {printingId === s.sale_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
