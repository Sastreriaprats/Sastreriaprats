'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Shirt } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

const statusLabels: Record<string, string> = { pending: 'Pendiente', in_progress: 'En curso', completed: 'Completado', delivered: 'Entregado' }
const statusColors: Record<string, string> = { pending: 'bg-gray-100 text-gray-700', in_progress: 'bg-amber-100 text-amber-700', completed: 'bg-green-100 text-green-700', delivered: 'bg-blue-100 text-blue-700' }

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
        if (!cancelled && data) setAlterations(data)
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
      <Shirt className="mx-auto h-12 w-12 mb-4 opacity-30" /><p>No hay arreglos de boutique registrados.</p>
    </div>
  )

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Descripción</TableHead><TableHead>Coste</TableHead><TableHead>Estado</TableHead><TableHead>Fecha</TableHead><TableHead>Entrega</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {alterations.map((a: any) => (
            <TableRow key={a.id}>
              <TableCell>{a.description}</TableCell>
              <TableCell className="font-medium">{formatCurrency(a.cost)}</TableCell>
              <TableCell><Badge className={`text-xs ${statusColors[a.status] || ''}`}>{statusLabels[a.status] || a.status}</Badge></TableCell>
              <TableCell className="text-sm">{formatDate(a.created_at)}</TableCell>
              <TableCell className="text-sm">{formatDate(a.delivered_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
