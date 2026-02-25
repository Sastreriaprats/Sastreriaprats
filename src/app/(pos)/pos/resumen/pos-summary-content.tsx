'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Loader2, TrendingUp, ShoppingBag, CreditCard, Users } from 'lucide-react'
import { useAuth } from '@/components/providers/auth-provider'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const saleTypeLabels: Record<string, string> = {
  boutique: 'Boutique', tailoring_deposit: 'Señal', tailoring_final: 'Pago final', alteration: 'Arreglo', online: 'Online',
}

export function PosSummaryContent() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { activeStoreId } = useAuth()
  const [session, setSession] = useState<any>(null)
  const [sales, setSales] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!activeStoreId) return
    const load = async () => {
      const { data: sess } = await supabase.from('cash_sessions')
        .select('*').eq('store_id', activeStoreId).eq('status', 'open').single()
      setSession(sess)

      if (sess) {
        const { data: salesData } = await supabase.from('sales')
          .select('id, ticket_number, sale_type, total, payment_method, status, created_at, clients(full_name)')
          .eq('cash_session_id', sess.id)
          .order('created_at', { ascending: false })
        if (salesData) setSales(salesData)
      }
      setIsLoading(false)
    }
    load()
  }, [supabase, activeStoreId])

  if (isLoading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!session) return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-4">
      <p>No hay caja abierta</p>
      <Button variant="outline" onClick={() => router.push('/pos/caja')}>Volver al TPV</Button>
    </div>
  )

  const uniqueClients = new Set(sales.filter((s: any) => s.clients).map((s: any) => s.clients.full_name)).size
  const avgTicket = sales.length > 0 ? (session.total_sales || 0) / sales.length : 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 p-4 border-b bg-white">
        <Button variant="ghost" size="icon" onClick={() => router.push('/pos/caja')}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Resumen de la sesión</h1>
        <Badge variant="outline" className="text-xs">Abierta desde {formatDateTime(session.opened_at)}</Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                    <TableHead>Total</TableHead><TableHead>Pago</TableHead><TableHead>Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin ventas aún</TableCell></TableRow>
                  ) : sales.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm">{s.ticket_number}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{saleTypeLabels[s.sale_type] || s.sale_type}</Badge></TableCell>
                      <TableCell className="text-sm">{s.clients?.full_name || '\u2014'}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(s.total)}</TableCell>
                      <TableCell className="text-sm capitalize">{s.payment_method}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</TableCell>
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
