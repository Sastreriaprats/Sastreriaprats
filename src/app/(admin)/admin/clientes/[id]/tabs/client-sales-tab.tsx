'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, ShoppingBag } from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/lib/utils'

const saleTypeLabels: Record<string, string> = {
  boutique: 'Boutique', tailoring_deposit: 'Señal sastrería', tailoring_final: 'Pago final', alteration: 'Arreglo', online: 'Online',
}

export function ClientSalesTab({ clientId }: { clientId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [sales, setSales] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

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
        console.error('[ClientSalesTab] load error:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase, clientId])

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  if (sales.length === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <ShoppingBag className="mx-auto h-12 w-12 mb-4 opacity-30" /><p>No hay ventas registradas.</p>
    </div>
  )

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticket</TableHead><TableHead>Tipo</TableHead><TableHead>Total</TableHead>
            <TableHead>Pago</TableHead><TableHead>Estado</TableHead><TableHead>Tienda</TableHead>
            <TableHead>Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((s: any) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono">{s.ticket_number}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{saleTypeLabels[s.sale_type] || s.sale_type}</Badge></TableCell>
              <TableCell className="font-medium">{formatCurrency(s.total)}</TableCell>
              <TableCell className="text-sm capitalize">{s.payment_method}</TableCell>
              <TableCell><Badge variant={s.status === 'completed' ? 'default' : 'destructive'} className="text-xs">{s.status === 'completed' ? 'Completada' : s.status}</Badge></TableCell>
              <TableCell className="text-sm">{(s.stores as any)?.name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatDateTime(s.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
