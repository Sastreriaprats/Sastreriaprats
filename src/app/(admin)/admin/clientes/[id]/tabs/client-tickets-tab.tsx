'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, ShoppingBag, FileDown } from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { PaymentMethodBadge } from '@/components/ui/payment-method-badge'
import { getSaleForTicket } from '@/actions/pos'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'

const saleTypeLabels: Record<string, string> = {
  boutique: 'Boutique',
  tailoring_deposit: 'Señal sastrería',
  tailoring_final: 'Pago final',
  alteration: 'Arreglo',
  online: 'Online',
}

export function ClientTicketsTab({ clientId }: { clientId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [sales, setSales] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await supabase
          .from('sales')
          .select('id, ticket_number, sale_type, total, payment_method, status, is_tax_free, created_at, stores(name)')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(100)
        if (!cancelled && data) setSales(data)
      } catch (err) {
        console.error('[ClientTicketsTab] load error:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase, clientId])

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
      console.error('[ClientTicketsTab] download PDF:', e)
    } finally {
      setDownloadingId(null)
    }
  }

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  if (sales.length === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <ShoppingBag className="mx-auto h-12 w-12 mb-4 opacity-30" />
      <p>No hay tickets para este cliente.</p>
    </div>
  )

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº Ticket</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Pago</TableHead>
            <TableHead>Tienda</TableHead>
            <TableHead className="w-[100px]">PDF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((s: any) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono">{s.ticket_number}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDateTime(s.created_at)}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{saleTypeLabels[s.sale_type] || s.sale_type}</Badge></TableCell>
              <TableCell className="font-medium">{formatCurrency(s.total)}</TableCell>
              <TableCell><PaymentMethodBadge method={s.payment_method} /></TableCell>
              <TableCell className="text-sm">{(s.stores as any)?.name}</TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  disabled={downloadingId === s.id}
                  onClick={() => handleDownloadPdf(s.id)}
                >
                  {downloadingId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                  Descargar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
