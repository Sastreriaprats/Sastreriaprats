import { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/actions/auth'
import { getReturn } from '@/actions/returns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ReturnCancelButton } from './return-cancel-button'

export const metadata: Metadata = { title: 'Detalle de devolución' }

const TYPE_LABEL: Record<string, string> = { voucher: 'Vale', exchange: 'Cambio', cash: 'Efectivo', refund: 'Reintegro' }
const REFUND_METHOD_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', bizum: 'Bizum', transfer: 'Transferencia' }
const VOUCHER_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700', used: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700', partially_used: 'bg-amber-100 text-amber-700', expired: 'bg-gray-100 text-gray-500',
}
const VOUCHER_LABEL: Record<string, string> = {
  active: 'Activo', used: 'Usado', cancelled: 'Cancelado', partially_used: 'Usado parcial', expired: 'Caducado',
}

export default async function ReturnDetailPage(props: { params: Promise<{ id: string }> }) {
  await requirePermission('returns.view')
  const { id } = await props.params
  const res = await getReturn(id)
  if (!res.success || !res.data) notFound()
  const r = res.data

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon"><Link href="/admin/devoluciones"><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Devolución · {TYPE_LABEL[r.return_type] ?? r.return_type}</h1>
          <p className="text-muted-foreground">{formatDate(r.created_at)} · {formatCurrency(r.total_returned)}</p>
        </div>
        <div className="ml-auto">
          <ReturnCancelButton returnId={r.id} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Ticket original:</span> <span className="font-mono">{r.ticket_number ?? '—'}</span>{r.sale_total != null && <span className="text-muted-foreground"> · {formatCurrency(r.sale_total)}</span>}</p>
            <p><span className="text-muted-foreground">Cliente:</span> {r.client_name ?? '—'}</p>
            <p><span className="text-muted-foreground">Tipo:</span> {TYPE_LABEL[r.return_type] ?? r.return_type}</p>
            {r.return_type === 'refund' && (
              <p><span className="text-muted-foreground">Método del reintegro:</span> {r.refund_method ? (REFUND_METHOD_LABEL[r.refund_method] ?? r.refund_method) : '—'}</p>
            )}
            <p><span className="text-muted-foreground">Importe devuelto:</span> {formatCurrency(r.total_returned)}</p>
            <p><span className="text-muted-foreground">Procesada por:</span> {r.processed_by_name ?? '—'}</p>
            <p><span className="text-muted-foreground">Tienda:</span> {r.store_name ?? '—'}</p>
            {r.reason && <p><span className="text-muted-foreground">Motivo:</span> {r.reason}</p>}
            {r.notes && <p><span className="text-muted-foreground">Notas:</span> {r.notes}</p>}
            <div className="pt-2">
              <Button asChild variant="outline" size="sm"><Link href="/admin/tickets">Ver tickets</Link></Button>
            </div>
          </CardContent>
        </Card>

        {r.return_type === 'voucher' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Vale generado</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {r.voucher_code ? (
                <>
                  <p><span className="text-muted-foreground">Código:</span> <span className="font-mono">{r.voucher_code}</span></p>
                  <p>
                    <span className="text-muted-foreground">Estado:</span>{' '}
                    {r.voucher_status
                      ? <Badge className={`text-xs ${VOUCHER_BADGE[r.voucher_status] ?? ''}`}>{VOUCHER_LABEL[r.voucher_status] ?? r.voucher_status}</Badge>
                      : '—'}
                  </p>
                  <p><span className="text-muted-foreground">Importe original:</span> {r.voucher_original != null ? formatCurrency(r.voucher_original) : '—'}</p>
                  <p><span className="text-muted-foreground">Saldo restante:</span> {r.voucher_remaining != null ? formatCurrency(r.voucher_remaining) : '—'}</p>
                </>
              ) : <p className="text-muted-foreground">El vale asociado ya no existe.</p>}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Líneas devueltas</CardTitle></CardHeader>
        <CardContent>
          {r.returned_lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se registraron líneas devueltas para este ticket.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artículo</TableHead>
                  <TableHead className="text-center">Devuelto</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead>Fecha devolución</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.returned_lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{l.description}</TableCell>
                    <TableCell className="text-center tabular-nums">{l.quantity_returned} / {l.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(l.unit_price)}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.returned_at ? formatDate(l.returned_at) : '—'}</TableCell>
                    <TableCell>{l.return_reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-xs text-muted-foreground mt-3">Las líneas devueltas se registran en el ticket original (no por devolución individual), así que reflejan el estado actual de las líneas devueltas de ese ticket.</p>
        </CardContent>
      </Card>
    </div>
  )
}
