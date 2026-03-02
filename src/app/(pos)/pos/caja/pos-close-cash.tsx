'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Lock, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react'
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
  const isExact = Math.abs(difference) < 0.01
  const isMinorDiff = !isExact && Math.abs(difference) <= 5

  const { execute, isLoading } = useAction(closeCashSession, {
    successMessage: 'Caja cerrada correctamente',
    onSuccess: onClosed,
  })

  return (
    <div className="h-full min-h-full overflow-y-auto overflow-x-hidden p-6 md:p-10 pb-24 bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Cabecera */}
        <div className="text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1B2A4A]/10 mb-6">
            <Lock className="h-8 w-8 text-[#1B2A4A]" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">
            Cierre de caja
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Abierta el {formatDateTime(session.opened_at)}
          </p>
        </div>

        {/* KPIs en grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Fondo inicial', value: session.opening_amount, color: 'text-slate-800' },
            { label: 'Ventas totales', value: session.total_sales || 0, color: 'text-emerald-600' },
            { label: 'Devoluciones', value: session.total_returns || 0, color: 'text-red-600' },
            { label: 'Retiradas', value: session.total_withdrawals || 0, color: 'text-amber-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{formatCurrency(value)}</p>
            </div>
          ))}
        </div>

        {/* Desglose pagos */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Desglose por método de pago</h2>
          <div className="space-y-3">
            {[
              ['Efectivo', session.total_cash_sales || 0],
              ['Tarjeta', session.total_card_sales || 0],
              ['Bizum', session.total_bizum_sales || 0],
              ['Transferencia', session.total_transfer_sales || 0],
              ['Vales', session.total_voucher_sales || 0],
            ].map(([method, amount]) => (
              <div key={String(method)} className="flex justify-between text-sm">
                <span className="text-slate-600">{method}</span>
                <span className="font-medium tabular-nums text-slate-800">{formatCurrency(Number(amount))}</span>
              </div>
            ))}
            <div className="border-t border-slate-200 pt-3 mt-3 flex justify-between font-semibold text-slate-800">
              <span>Total ventas</span>
              <span className="tabular-nums">{formatCurrency(session.total_sales || 0)}</span>
            </div>
          </div>
        </div>

        {/* Arqueo */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-semibold text-slate-800">Arqueo de caja</h2>
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-slate-600">Efectivo esperado en caja</span>
            <span className="text-lg font-semibold tabular-nums text-slate-800">{formatCurrency(expectedCash)}</span>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-600 font-medium">Efectivo contado (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              className="h-16 text-center text-2xl font-semibold font-mono rounded-xl border-slate-200 focus:ring-2 focus:ring-[#1B2A4A]/20"
              placeholder="0,00"
              autoFocus
            />
          </div>
          {countedCash && (
            <div className={`rounded-xl flex items-center justify-between px-4 py-4 ${
              isExact ? 'bg-emerald-50 border border-emerald-200' : isMinorDiff ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-center gap-2">
                {isExact ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                <span className="text-sm font-medium text-slate-700">Diferencia</span>
              </div>
              <span className={`text-xl font-bold tabular-nums ${isExact ? 'text-emerald-600' : difference > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                {difference > 0 ? '+' : ''}{formatCurrency(difference)}
              </span>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-slate-600 font-medium">Notas de cierre</Label>
            <Textarea
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="Observaciones del cierre..."
              rows={2}
              className="rounded-xl border-slate-200 resize-none"
            />
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1 h-14 rounded-xl border-slate-300 text-slate-700 hover:bg-slate-50 font-medium gap-2"
          >
            <ArrowLeft className="h-5 w-5" />
            Volver a venta
          </Button>
          <Button
            onClick={() => execute({ session_id: session.id, counted_cash: counted, closing_notes: closingNotes || undefined })}
            disabled={isLoading || !countedCash}
            className="flex-1 h-14 rounded-xl bg-[#1B2A4A] hover:bg-[#253a5c] font-semibold shadow-lg shadow-[#1B2A4A]/20 gap-2"
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
            Cerrar caja
          </Button>
        </div>
      </div>
    </div>
  )
}
