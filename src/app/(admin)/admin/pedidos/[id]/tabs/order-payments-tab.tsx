'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CreditCard, Loader2 } from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const saleTypeLabels: Record<string, string> = { tailoring_deposit: 'Señal', tailoring_final: 'Pago final' }

export function OrderPaymentsTab({ order }: { order: any }) {
  const supabase = createClient()
  const [sales, setSales] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await supabase
          .from('sales')
          .select('id, ticket_number, sale_type, total, payment_method, status, created_at')
          .eq('tailoring_order_id', order.id)
          .order('created_at', { ascending: false })
        if (!cancelled && data) setSales(data)
      } catch (err) {
        console.error('[OrderPaymentsTab] load error:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase, order.id])

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Total pedido</p>
          <p className="text-xl font-bold">{formatCurrency(order.total)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Total pagado</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(order.total_paid)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">Pendiente</p>
          <p className={`text-xl font-bold ${order.total_pending > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {formatCurrency(order.total_pending)}
          </p>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : sales.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CreditCard className="mx-auto h-12 w-12 mb-4 opacity-30" />
          <p>No hay pagos registrados.</p>
          <p className="text-xs mt-1">Los pagos se registran desde el TPV.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead><TableHead>Tipo</TableHead><TableHead>Importe</TableHead>
                <TableHead>Método</TableHead><TableHead>Estado</TableHead><TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono">{s.ticket_number}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{saleTypeLabels[s.sale_type] || s.sale_type}</Badge></TableCell>
                  <TableCell className="font-medium">{formatCurrency(s.total)}</TableCell>
                  <TableCell className="text-sm capitalize">{s.payment_method}</TableCell>
                  <TableCell><Badge variant={s.status === 'completed' ? 'default' : 'destructive'} className="text-xs">{s.status === 'completed' ? 'Completado' : s.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(s.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
