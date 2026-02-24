'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Scissors, Plus } from 'lucide-react'
import { formatCurrency, formatDate, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'

export function ClientOrdersTab({ clientId }: { clientId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await supabase
          .from('tailoring_orders')
          .select('id, order_number, order_type, status, order_date, estimated_delivery_date, total, total_paid, total_pending, stores(name)')
          .eq('client_id', clientId)
          .order('order_date', { ascending: false })
        if (!cancelled && data) setOrders(data)
      } catch (err) {
        console.error('[ClientOrdersTab] load error:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase, clientId])

  const goToNewOrder = () => router.push(`/admin/pedidos/nuevo?clientId=${clientId}`)

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  if (orders.length === 0) return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={goToNewOrder} className="gap-2 bg-prats-navy hover:bg-prats-navy/90">
          <Plus className="h-4 w-4" /> Nuevo pedido
        </Button>
      </div>
      <div className="text-center py-12 text-muted-foreground">
        <Scissors className="mx-auto h-12 w-12 mb-4 opacity-30" />
        <p>Este cliente no tiene pedidos de sastrería.</p>
        <p className="text-sm mt-2">Cree un pedido para este cliente con el botón de arriba.</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={goToNewOrder} variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo pedido
        </Button>
      </div>
      <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº Pedido</TableHead><TableHead>Tipo</TableHead><TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead><TableHead>Entrega est.</TableHead><TableHead>Total</TableHead>
            <TableHead>Pagado</TableHead><TableHead>Pendiente</TableHead><TableHead>Tienda</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o: any) => (
            <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/admin/pedidos/${o.id}`)}>
              <TableCell className="font-mono font-medium">{o.order_number}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{o.order_type === 'artesanal' ? 'Artesanal' : 'Industrial'}</Badge></TableCell>
              <TableCell><Badge className={`text-xs ${getOrderStatusColor(o.status)}`}>{getOrderStatusLabel(o.status)}</Badge></TableCell>
              <TableCell className="text-sm">{formatDate(o.order_date)}</TableCell>
              <TableCell className="text-sm">{formatDate(o.estimated_delivery_date)}</TableCell>
              <TableCell className="font-medium">{formatCurrency(o.total)}</TableCell>
              <TableCell>{formatCurrency(o.total_paid)}</TableCell>
              <TableCell><span className={o.total_pending > 0 ? 'text-amber-600 font-medium' : ''}>{formatCurrency(o.total_pending)}</span></TableCell>
              <TableCell className="text-sm">{(o.stores as any)?.name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  )
}
