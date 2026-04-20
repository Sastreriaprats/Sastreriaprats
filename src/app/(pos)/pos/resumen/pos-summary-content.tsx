'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Loader2, TrendingUp, ShoppingBag, CreditCard, Users, Printer, FileText } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { PaymentMethodBadge } from '@/components/ui/payment-method-badge'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'
import { createInvoiceFromSaleAction, generateInvoicePdfAction } from '@/actions/accounting'
import { getStorePdfData } from '@/lib/pdf/pdf-company'
import { toast } from 'sonner'

const saleTypeLabels: Record<string, string> = {
  boutique: 'Boutique', tailoring_deposit: 'Señal', tailoring_final: 'Pago final', alteration: 'Arreglo', online: 'Online',
  order_payment: 'Pago pedido',
  return_voucher: 'Devolución · Vale', return_exchange: 'Devolución · Cambio',
}

type SessionMovement = {
  id: string
  kind: 'sale' | 'order_payment' | 'return'
  ticket_number: string
  sale_type: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
  payment_method: string
  is_tax_free: boolean
  status: string
  created_at: string
  clients: { full_name: string } | null
  profiles: { full_name: string } | null
  tailoring_order_id?: string
  return_voucher_code?: string | null
}

export function PosSummaryContent() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { activeStoreId, stores } = useAuth()
  const [session, setSession] = useState<any>(null)
  const [sales, setSales] = useState<SessionMovement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const [invoicingId, setInvoicingId] = useState<string | null>(null)
  const storeName = stores.find((s) => s.storeId === activeStoreId)?.storeName ?? null

  useEffect(() => {
    if (!activeStoreId) return
    const load = async () => {
      const { data: sess } = await supabase.from('cash_sessions')
        .select('*').eq('store_id', activeStoreId).eq('status', 'open').single()
      setSession(sess)

      if (sess) {
        const openedAt = sess.opened_at ?? new Date(0).toISOString()
        const closedAt = sess.closed_at ?? new Date().toISOString()
        const [salesRes, orderPaymentsRes, returnsRes] = await Promise.all([
          supabase.from('sales')
            .select('id, ticket_number, sale_type, subtotal, discount_amount, tax_amount, total, payment_method, is_tax_free, status, created_at, clients(full_name), profiles!sales_salesperson_id_fkey(full_name)')
            .eq('cash_session_id', sess.id)
            .order('created_at', { ascending: false }),
          supabase.from('tailoring_order_payments')
            .select('id, tailoring_order_id, payment_method, amount, created_at, tailoring_orders(order_number, clients(full_name))')
            .eq('cash_session_id', sess.id)
            .order('created_at', { ascending: false }),
          // Devoluciones de la sesión: filtrar por tienda y por rango temporal de la caja
          supabase.from('returns')
            .select('id, return_type, total_returned, reason, created_at, original_sale_id, voucher_id, profiles!returns_processed_by_fkey(full_name), sales!returns_original_sale_id_fkey(ticket_number, clients(full_name)), vouchers(code)')
            .eq('store_id', activeStoreId)
            .gte('created_at', openedAt)
            .lte('created_at', closedAt)
            .order('created_at', { ascending: false }),
        ])

        const saleRows: SessionMovement[] = (salesRes.data ?? []).map((s: any) => ({
          id: s.id,
          kind: 'sale',
          ticket_number: s.ticket_number,
          sale_type: s.sale_type,
          subtotal: Number(s.subtotal ?? 0),
          discount_amount: Number(s.discount_amount ?? 0),
          tax_amount: Number(s.tax_amount ?? 0),
          total: Number(s.total ?? 0),
          payment_method: s.payment_method,
          is_tax_free: s.is_tax_free ?? false,
          status: s.status,
          created_at: s.created_at,
          clients: s.clients ?? null,
          profiles: s.profiles ?? null,
        }))

        const orderRows: SessionMovement[] = (orderPaymentsRes.data ?? []).map((p: any) => ({
          id: p.id,
          kind: 'order_payment',
          ticket_number: p.tailoring_orders?.order_number ?? '—',
          sale_type: 'order_payment',
          subtotal: 0,
          discount_amount: 0,
          tax_amount: 0,
          total: Number(p.amount ?? 0),
          payment_method: p.payment_method,
          is_tax_free: false,
          status: 'paid',
          created_at: p.created_at,
          clients: p.tailoring_orders?.clients ?? null,
          profiles: null,
          tailoring_order_id: p.tailoring_order_id,
        }))

        const returnRows: SessionMovement[] = (returnsRes.data ?? []).map((r: any) => ({
          id: r.id,
          kind: 'return',
          ticket_number: r.sales?.ticket_number ?? '—',
          sale_type: r.return_type === 'voucher' ? 'return_voucher' : 'return_exchange',
          subtotal: 0,
          discount_amount: 0,
          tax_amount: 0,
          total: -Number(r.total_returned ?? 0),
          payment_method: r.return_type === 'voucher' ? 'voucher' : 'mixed',
          is_tax_free: false,
          status: 'refunded',
          created_at: r.created_at,
          clients: r.sales?.clients ?? null,
          profiles: r.profiles ?? null,
          return_voucher_code: r.vouchers?.code ?? null,
        }))

        const merged = [...saleRows, ...orderRows, ...returnRows].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        setSales(merged)
      }
      setIsLoading(false)
    }
    load()
  }, [supabase, activeStoreId])

  if (isLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!session) return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-4">
      <p>No hay caja abierta</p>
      <Button variant="outline" onClick={() => router.back()}>Volver al TPV</Button>
    </div>
  )

  const uniqueClients = new Set(sales.filter((s: any) => s.clients).map((s: any) => s.clients.full_name)).size
  const avgTicket = sales.length > 0 ? (session.total_sales || 0) / sales.length : 0

  const handlePrintTicket = async (sale: any) => {
    setPrintingId(sale.id)
    try {
      const { data: lines } = await supabase.from('sale_lines')
        .select('description, sku, quantity, unit_price, discount_percentage, tax_rate, line_total')
        .eq('sale_id', sale.id)
      const { data: payments } = await supabase.from('sale_payments')
        .select('payment_method, amount')
        .eq('sale_id', sale.id)
      const storeConfig = getStorePdfData(storeName)
      await generateTicketPdf({
        sale: {
          ticket_number: sale.ticket_number,
          created_at: sale.created_at || new Date().toISOString(),
          client_id: sale.clients?.full_name ? undefined : null,
          subtotal: Number(sale.subtotal ?? 0),
          discount_amount: Number(sale.discount_amount ?? 0),
          tax_amount: Number(sale.tax_amount ?? 0),
          total: Number(sale.total),
          payment_method: sale.payment_method,
          is_tax_free: sale.is_tax_free ?? false,
        },
        lines: (lines || []).map((l: any) => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: Number(l.unit_price),
          discount_percentage: Number(l.discount_percentage || 0),
          line_total: Number(l.line_total || 0),
          tax_rate: Number(l.tax_rate ?? 21),
          sku: l.sku || null,
        })),
        payments: (payments || []).map((p: any) => ({ payment_method: p.payment_method, amount: Number(p.amount) })),
        clientName: sale.clients?.full_name || null,
        attendedBy: (sale.profiles as any)?.full_name || null,
        storeAddress: storeConfig.address,
        storeSubtitle: storeConfig.subtitle ?? null,
        storePhones: storeConfig.phones,
      })
    } catch (e) {
      toast.error('Error al generar el ticket')
    } finally {
      setPrintingId(null)
    }
  }

  const handleInvoice = async (sale: any) => {
    setInvoicingId(sale.id)
    try {
      const createRes = await createInvoiceFromSaleAction(sale.id)
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
      toast.error('Error al emitir la factura')
    } finally {
      setInvoicingId(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 p-4 border-b bg-white">
        <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Resumen de la sesión</h1>
        <Badge variant="outline" className="text-xs">Abierta desde {formatDateTime(session.opened_at)}</Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Caja</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Apertura de caja</p>
              <p className="text-lg font-semibold mt-1">{session.opened_at ? formatDateTime(session.opened_at) : '—'}</p>
              <p className="text-sm text-muted-foreground mt-0.5">Fondo inicial: {formatCurrency(Number(session.opening_amount) || 0)}</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cierre de caja</p>
              <p className="text-lg font-semibold mt-1">{session.closed_at ? formatDateTime(session.closed_at) : 'Pendiente de cierre'}</p>
              {session.closed_at && <p className="text-sm text-muted-foreground mt-0.5">Sesión cerrada</p>}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><TrendingUp className="h-3 w-3" /> Ventas totales</div>
            <p className="text-2xl font-bold">{formatCurrency(session.total_sales || 0)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><ShoppingBag className="h-3 w-3" /> N&ordm; tickets</div>
            <p className="text-2xl font-bold">{sales.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><CreditCard className="h-3 w-3" /> Ticket medio</div>
            <p className="text-2xl font-bold">{formatCurrency(avgTicket)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Users className="h-3 w-3" /> Clientes únicos</div>
            <p className="text-2xl font-bold">{uniqueClients}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Desglose por método</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-4">
              {[
                { label: 'Efectivo', amount: session.total_cash_sales || 0, color: 'bg-green-100' },
                { label: 'Tarjeta', amount: session.total_card_sales || 0, color: 'bg-blue-100' },
                { label: 'Bizum', amount: session.total_bizum_sales || 0, color: 'bg-purple-100' },
                { label: 'Transferencia', amount: session.total_transfer_sales || 0, color: 'bg-amber-100' },
                { label: 'Vales', amount: session.total_voucher_sales || 0, color: 'bg-gray-100' },
              ].map(m => (
                <div key={m.label} className={`p-3 rounded-lg ${m.color} text-center`}>
                  <p className="text-xs font-medium">{m.label}</p>
                  <p className="text-lg font-bold mt-1">{formatCurrency(m.amount)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Ventas de la sesión ({sales.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead><TableHead>Tipo</TableHead><TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Total</TableHead><TableHead>Pago</TableHead><TableHead>Hora</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin ventas aún</TableCell></TableRow>
                  ) : sales.map((s) => (
                    <TableRow key={`${s.kind}:${s.id}`}>
                      <TableCell className="font-mono text-sm">{s.ticket_number}</TableCell>
                      <TableCell>
                        <Badge variant={s.kind === 'order_payment' ? 'secondary' : 'outline'} className="text-xs">
                          {saleTypeLabels[s.sale_type] || s.sale_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{s.clients?.full_name || '\u2014'}</TableCell>
                      <TableCell className="text-sm text-slate-600">{s.profiles?.full_name ?? '\u2014'}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(s.total)}</TableCell>
                      <TableCell><PaymentMethodBadge method={s.payment_method} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {s.kind === 'sale' ? (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Imprimir ticket"
                                disabled={printingId === s.id}
                                onClick={() => handlePrintTicket(s)}
                              >
                                {printingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Emitir factura"
                                disabled={invoicingId === s.id}
                                onClick={() => handleInvoice(s)}
                              >
                                {invoicingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Ver pedido"
                              onClick={() => s.tailoring_order_id && router.push(`/sastre/pedidos/${s.tailoring_order_id}`)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
