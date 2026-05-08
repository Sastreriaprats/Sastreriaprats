'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, ShoppingBag } from 'lucide-react'
import { listReservations } from '@/actions/reservations'
import { formatCurrency, formatDate } from '@/lib/utils'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active:        { label: 'Activa',            className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  pending_stock: { label: 'Pendiente stock',   className: 'bg-amber-100 text-amber-800 border-amber-200' },
  fulfilled:     { label: 'Cumplida',          className: 'bg-sky-100 text-sky-800 border-sky-200' },
  cancelled:     { label: 'Cancelada',         className: 'bg-slate-100 text-slate-700 border-slate-200' },
  expired:       { label: 'Expirada',          className: 'bg-rose-100 text-rose-800 border-rose-200' },
}

function summarizeLines(lines: any[] | undefined): { text: string; units: number } {
  if (!Array.isArray(lines) || lines.length === 0) return { text: '—', units: 0 }
  const units = lines.reduce((s, l) => s + Number(l?.quantity ?? 0), 0)
  const parts = lines.slice(0, 3).map((l) => {
    const name = l?.product_variant?.product?.name ?? 'Producto'
    const size = l?.product_variant?.size ? ` ${l.product_variant.size}` : ''
    const qty = Number(l?.quantity ?? 0)
    return `${name}${size}${qty > 1 ? ` ×${qty}` : ''}`
  })
  const extra = lines.length > 3 ? ` (+${lines.length - 3})` : ''
  return { text: parts.join(', ') + extra, units }
}

export function ClientReservationsTab({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [reservations, setReservations] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    listReservations({ clientId, page: 0, pageSize: 100 })
      .then((res) => {
        if (cancelled) return
        if (res.success) setReservations(res.data?.data ?? [])
      })
      .catch((err) => console.error('[ClientReservationsTab] load error:', err))
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [clientId])

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>

  if (reservations.length === 0) return (
    <div className="text-center py-12 text-muted-foreground">
      <ShoppingBag className="mx-auto h-12 w-12 mb-4 opacity-30" />
      <p>Este cliente no tiene reservas.</p>
    </div>
  )

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº reserva</TableHead>
            <TableHead>Productos</TableHead>
            <TableHead className="text-right">Uds</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Total / Pagado</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Expira</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reservations.map((r: any) => {
            const summary = summarizeLines(r.lines)
            const badge = STATUS_BADGE[r.status] ?? { label: r.status ?? '—', className: 'bg-gray-100 text-gray-700' }
            const pending = Math.max(0, Number(r.total ?? 0) - Number(r.total_paid ?? 0))
            return (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/admin/pedidos?tab=reservations`)}
              >
                <TableCell className="font-mono font-medium">{r.reservation_number}</TableCell>
                <TableCell className="text-sm max-w-[280px] truncate" title={summary.text}>
                  {summary.text}
                </TableCell>
                <TableCell className="text-right">{summary.units}</TableCell>
                <TableCell>
                  <Badge className={`text-xs border ${badge.className}`} variant="outline">{badge.label}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="text-sm font-medium">{formatCurrency(Number(r.total ?? 0))}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(Number(r.total_paid ?? 0))} pagado
                    {pending > 0 && <span className="text-amber-600"> · {formatCurrency(pending)} pdte</span>}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{formatDate(r.created_at)}</TableCell>
                <TableCell className="text-sm">{r.expires_at ? formatDate(r.expires_at) : '—'}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
