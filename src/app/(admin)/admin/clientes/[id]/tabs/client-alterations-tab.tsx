'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Shirt } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'

const statusLabels: Record<string, string> = { pending: 'Pendiente', in_progress: 'En curso', completed: 'Completado', delivered: 'Entregado' }
const statusColors: Record<string, string> = { pending: 'bg-amber-100 text-amber-700', in_progress: 'bg-blue-100 text-blue-700', completed: 'bg-green-100 text-green-700', delivered: 'bg-emerald-100 text-emerald-700' }

const typeLabels: Record<string, string> = { order: 'Pedido', boutique: 'Boutique', external: 'Externo' }
const typeColors: Record<string, string> = { order: 'bg-blue-100 text-blue-700', boutique: 'bg-purple-100 text-purple-700', external: 'bg-amber-100 text-amber-700' }

export function ClientAlterationsTab({ clientId }: { clientId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [alterations, setAlterations] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await supabase
          .from('boutique_alterations')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(100)
        if (!cancelled && data) {
          // Enrich with order numbers and assigned names
          const orderIds = [...new Set(data.filter(a => a.tailoring_order_id).map(a => a.tailoring_order_id))]
          const assignedIds = [...new Set(data.filter(a => a.assigned_to).map(a => a.assigned_to))]

          let ordersMap: Record<string, { id: string; order_number: string }> = {}
          let profilesMap: Record<string, string> = {}

          if (orderIds.length > 0) {
            const { data: orders } = await supabase
              .from('tailoring_orders')
              .select('id, order_number')
              .in('id', orderIds)
            if (orders) ordersMap = Object.fromEntries(orders.map(o => [o.id, o]))
          }
          if (assignedIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', assignedIds)
            if (profiles) profilesMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name]))
          }

          const enriched = data.map(a => ({
            ...a,
            _order: a.tailoring_order_id ? ordersMap[a.tailoring_order_id] : null,
            _assigned_name: a.assigned_to ? profilesMap[a.assigned_to] : null,
          }))
          setAlterations(enriched)
        }
      } catch (err) {
        console.error('[ClientAlterationsTab] load error:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [supabase, clientId])

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  if (alterations.length === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <Shirt className="mx-auto h-12 w-12 mb-4 opacity-30" /><p>No hay arreglos registrados.</p>
    </div>
  )

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Origen</TableHead>
            <TableHead>Prenda</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Asignado a</TableHead>
            <TableHead>Coste</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Entrega</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alterations.map((a: any) => (
            <TableRow key={a.id}>
              <TableCell className="text-sm">
                {a._order ? (
                  <Link href={`/admin/pedidos/${a._order.id}`} className="text-blue-600 hover:underline">
                    {a._order.order_number}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{a.garment_description || a.garment_type || 'Prenda externa'}</span>
                )}
              </TableCell>
              <TableCell className="text-sm">{a.garment_type || '—'}</TableCell>
              <TableCell className="text-sm max-w-[250px] truncate" title={a.description}>{a.description}</TableCell>
              <TableCell className="text-sm">{a._assigned_name || '—'}</TableCell>
              <TableCell className="font-medium">{a.has_cost ? formatCurrency(a.cost) : '—'}</TableCell>
              <TableCell>
                <Badge className={`text-xs ${statusColors[a.status] || ''}`}>
                  {statusLabels[a.status] || a.status}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{formatDate(a.created_at)}</TableCell>
              <TableCell className="text-sm">{a.delivered_at ? formatDate(a.delivered_at) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
