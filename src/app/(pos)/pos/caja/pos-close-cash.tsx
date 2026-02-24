'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Loader2, Lock, AlertTriangle, CheckCircle } from 'lucide-react'
import { useAction } from '@/hooks/use-action'
import { closeCashSession } from '@/actions/pos'
import { formatCurrency, formatDateTime } from '@/lib/utils'

export function PosCloseCash({ session, onClosed, onCancel }: {
  session: any; onClosed: () => void; onCancel: () => void
}) {
  const [countedCash, setCountedCash] = useState('')
  const [closingNotes, setClosingNotes] = useState('')

  const expectedCash = (session.opening_amount || 0)
    + (session.total_cash_sales || 0)
    - (session.total_returns || 0)
    - (session.total_withdrawals || 0)

  const counted = parseFloat(countedCash) || 0
  const difference = counted - expectedCash

  const { execute, isLoading } = useAction(closeCashSession, {
    successMessage: 'Caja cerrada correctamente',
    onSuccess: onClosed,
  })

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <Lock className="mx-auto h-12 w-12 text-prats-navy mb-4" />
          <h1 className="text-2xl font-bold">Cierre de caja</h1>
          <p className="text-muted-foreground">Abierta desde {formatDateTime(session.opened_at)}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Fondo inicial</p>
            <p className="text-lg font-bold">{formatCurrency(session.opening_amount)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Ventas totales</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(session.total_sales || 0)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Devoluciones</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(session.total_returns || 0)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Retiradas</p>
            <p className="text-lg font-bold text-amber-600">{formatCurrency(session.total_withdrawals || 0)}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Desglose por método de pago</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span>Efectivo</span><span className="font-medium">{formatCurrency(session.total_cash_sales || 0)}</span></div>
            <div className="flex justify-between text-sm"><span>Tarjeta</span><span className="font-medium">{formatCurrency(session.total_card_sales || 0)}</span></div>
            <div className="flex justify-between text-sm"><span>Bizum</span><span className="font-medium">{formatCurrency(session.total_bizum_sales || 0)}</span></div>
            <div className="flex justify-between text-sm"><span>Transferencia</span><span className="font-medium">{formatCurrency(session.total_transfer_sales || 0)}</span></div>
            <div className="flex justify-between text-sm"><span>Vales</span><span className="font-medium">{formatCurrency(session.total_voucher_sales || 0)}</span></div>
            <Separator />
            <div className="flex justify-between font-bold"><span>Total ventas</span><span>{formatCurrency(session.total_sales || 0)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Arqueo de caja</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm p-2 bg-muted rounded">
              <span>Efectivo esperado en caja</span>
              <span className="font-bold">{formatCurrency(expectedCash)}</span>
            </div>

            <div className="space-y-2">
              <Label>Efectivo contado (&euro;)</Label>
              <Input type="number" step="0.01" value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                className="text-center text-2xl h-14 font-mono" placeholder="0.00" autoFocus />
            </div>

            {countedCash && (
              <div className={`flex items-center justify-between p-3 rounded ${
                Math.abs(difference) < 0.01 ? 'bg-green-50' : Math.abs(difference) <= 5 ? 'bg-amber-50' : 'bg-red-50'
              }`}>
                <div className="flex items-center gap-2">
                  {Math.abs(difference) < 0.01 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  <span className="text-sm font-medium">Diferencia</span>
                </div>
                <span className={`text-xl font-bold ${
                  Math.abs(difference) < 0.01 ? 'text-green-600' : difference > 0 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notas de cierre</Label>
              <Textarea value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Observaciones del cierre..." rows={2} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button variant="outline" onClick={onCancel} className="flex-1 h-12">Volver a venta</Button>
          <Button onClick={() => execute({ session_id: session.id, counted_cash: counted, closing_notes: closingNotes || undefined })}
            disabled={isLoading || !countedCash} className="flex-1 h-12 bg-prats-navy hover:bg-prats-navy-light">
            {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Lock className="mr-2 h-5 w-5" />}
            Cerrar caja
          </Button>
        </div>
      </div>
    </div>
  )
}
