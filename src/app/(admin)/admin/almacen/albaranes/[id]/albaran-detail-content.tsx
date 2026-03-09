'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, FileText, CheckCircle2, ArrowLeftRight } from 'lucide-react'
import { toast } from 'sonner'
import { getDeliveryNote, confirmDeliveryNote } from '@/actions/delivery-notes'
import { generateDeliveryNotePdf } from '@/lib/delivery-note-pdf'
import { formatDate, formatCurrency } from '@/lib/utils'

const statusLabels: Record<string, string> = {
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  anulado: 'Anulado',
}

export function AlbaranDetailContent({ id }: { id: string }) {
  const router = useRouter()
  const [note, setNote] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const res = await getDeliveryNote(id)
    if (res.success && res.data) setNote(res.data)
    else setNote(null)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  if (loading) return <div className="text-sm text-muted-foreground">Cargando albarán...</div>
  if (!note) return <div className="text-sm text-muted-foreground">Albarán no encontrado</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{note.number}</h1>
            <p className="text-muted-foreground">Albarán {note.type}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => generateDeliveryNotePdf(note)}>
            <FileText className="h-4 w-4" /> Imprimir PDF
          </Button>
          {note.status === 'borrador' && (
            <Button
              className="gap-2"
              onClick={async () => {
                const r = await confirmDeliveryNote(note.id)
                if (r.success) {
                  toast.success('Albarán confirmado')
                  load()
                } else {
                  toast.error(r.error || 'No se pudo confirmar')
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" /> Confirmar
            </Button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Estado</p><Badge className="mt-1">{statusLabels[note.status] || note.status}</Badge></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Origen</p><p className="font-medium mt-1">{note.from_warehouse?.name || '-'}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Destino</p><p className="font-medium mt-1">{note.to_warehouse?.name || '-'}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Creado por</p><p className="font-medium mt-1">{note.created_by_name || 'Sistema'}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Fecha</p><p className="font-medium mt-1">{formatDate(note.created_at)}</p></CardContent></Card>
      </div>

      {note.stock_transfer_id && (
        <Card>
          <CardContent className="pt-4">
            <Link href="/admin/stock?tab=traspasos" className="inline-flex items-center gap-2 text-sm text-prats-navy hover:underline">
              <ArrowLeftRight className="h-4 w-4" /> Ver traspaso
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Líneas</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>P.Unit.</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(note.lines || []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">Sin líneas</TableCell></TableRow>
                ) : (note.lines || []).map((line: any) => {
                  const qty = Number(line.quantity || 0)
                  const p = Number(line.unit_price || 0)
                  return (
                    <TableRow key={line.id}>
                      <TableCell>{line.product_name || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{line.sku || '-'}</TableCell>
                      <TableCell>{qty}</TableCell>
                      <TableCell>{p ? formatCurrency(p) : '-'}</TableCell>
                      <TableCell>{p ? formatCurrency(qty * p) : '-'}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {note.notes && (
            <p className="text-sm text-muted-foreground mt-4"><span className="font-medium text-foreground">Notas:</span> {note.notes}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
