'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, FileDown, Receipt, ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { listTickets, getSaleForTicket } from '@/actions/pos'
import { createInvoiceFromSaleAction, generateInvoicePdfAction } from '@/actions/accounting'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'
import { toast } from 'sonner'

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  bizum: 'Bizum',
  transfer: 'Transferencia',
  voucher: 'Vale',
  mixed: 'Varios',
}

export function TicketsContent() {
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [clientSearch, setClientSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [invoiceLoadingId, setInvoiceLoadingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listTickets({
        page,
        pageSize,
        clientSearch: clientSearch.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        productSearch: productSearch.trim() || undefined,
      })
      if (result.success && result.data) {
        setData(result.data.data ?? [])
        setTotal(result.data.total ?? 0)
        setTotalPages(result.data.totalPages ?? 0)
      }
    } catch (e) {
      console.error('[TicketsContent] load:', e)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, clientSearch, dateFrom, dateTo, productSearch])

  useEffect(() => {
    load()
  }, [load])

  const handleDownloadPdf = async (saleId: string) => {
    setDownloadingId(saleId)
    try {
      const result = await getSaleForTicket(saleId)
      if (result.success && result.data) {
        const { sale, lines, payments, clientName, clientCode } = result.data
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
          lines: lines.map((l: any) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            discount_percentage: l.discount_percentage ?? 0,
            line_total: l.line_total,
          })),
          payments,
          clientName,
          clientCode,
        })
      }
    } catch (e) {
      console.error('[TicketsContent] download PDF:', e)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleFactura = async (saleId: string) => {
    setInvoiceLoadingId(saleId)
    try {
      const createRes = await createInvoiceFromSaleAction(saleId)
      if (!createRes.success || !createRes.data) {
        toast.error('error' in createRes ? createRes.error : 'Error al crear la factura')
        return
      }
      const pdfRes = await generateInvoicePdfAction(createRes.data.id)
      if (!pdfRes.success || !pdfRes.data?.url) {
        toast.error('error' in pdfRes ? pdfRes.error : 'Error al generar el PDF')
        return
      }
      window.open(pdfRes.data.url, '_blank', 'noopener,noreferrer')
      toast.success(`Factura ${createRes.data.invoice_number} generada`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al obtener la factura')
    } finally {
      setInvoiceLoadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Receipt className="h-7 w-7" />
          Tickets
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Listado de tickets de venta. Descarga el PDF desde aquí o desde la ficha del cliente.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Cliente</label>
            <Input
              placeholder="Nombre o código..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="w-48"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Desde</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Hasta</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Producto</label>
            <Input
              placeholder="Texto en descripción..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-48"
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => { setPage(1); load() }}>Buscar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p>No hay tickets con los filtros indicados.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Ticket</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Productos (resumen)</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead>Tienda</TableHead>
                    <TableHead className="w-[200px]">PDF / Factura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono">{row.ticket_number}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                      <TableCell>
                        {row.client_name ? (
                          <span>{row.client_name}{row.client_code ? ` (${row.client_code})` : ''}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm" title={row.products_summary}>
                        {row.products_summary}
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(row.total)}</TableCell>
                      <TableCell className="text-sm capitalize">{PAYMENT_LABELS[row.payment_method] ?? row.payment_method}</TableCell>
                      <TableCell className="text-sm">{row.store_name ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={downloadingId === row.id}
                            onClick={() => handleDownloadPdf(row.id)}
                          >
                            {downloadingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                            Descargar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            disabled={invoiceLoadingId === row.id}
                            onClick={() => handleFactura(row.id)}
                          >
                            {invoiceLoadingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                            Factura
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    {total} ticket{total !== 1 ? 's' : ''} · Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
