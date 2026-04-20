'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Lock, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { closeCashSession } from '@/actions/pos'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { CashCounter } from '@/components/cash/cash-counter'
import { generateCashSessionReport } from '@/lib/pdf/cash-session-report'
import { useAuth } from '@/components/providers/auth-provider'

export function PosCloseCash({ session, onClosed, onCancel }: {
  session: any; onClosed: () => void; onCancel: () => void
}) {
  const { isAdmin } = useAuth()
  const openingBreakdown: Record<string, number> | null =
    session.opening_breakdown && typeof session.opening_breakdown === 'object'
      ? session.opening_breakdown
      : null
  const hasOpeningBreakdown = !!openingBreakdown && Object.values(openingBreakdown).some((v) => (v || 0) > 0)
  const [cashBreakdown, setCashBreakdown] = useState<Record<string, number>>({})
  const [counted, setCounted] = useState(0)
  const [closingNotes, setClosingNotes] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const expectedCash = (session.opening_amount || 0)
    + (session.total_cash_sales || 0)
    - (session.total_returns || 0)
    - (session.total_withdrawals || 0)

  const difference = counted - expectedCash
  const hasCounted = counted > 0 || expectedCash === 0
  const isExact = hasCounted && Math.abs(difference) < 0.01
  const isMinorDiff = hasCounted && !isExact && Math.abs(difference) <= 5

  async function handleClose() {
    if (!hasCounted) return
    setIsLoading(true)
    try {
      const result = await closeCashSession({
        session_id: session.id,
        counted_cash: counted,
        closing_notes: closingNotes || undefined,
        closing_breakdown: cashBreakdown,
      })
      if (!result.success) {
        toast.error(result.error ?? 'Error al cerrar la caja')
        return
      }

      // Generar PDF de arqueo
      try {
        await generateCashSessionReport({
          storeName: '—',
          openedBy: session.opened_by ?? '—',
          closedBy: '—',
          openedAt: session.opened_at ?? '',
          closedAt: result.data?.closed_at ?? new Date().toISOString(),
          openingAmount: session.opening_amount || 0,
          closingBreakdown: cashBreakdown,
          totalSales: session.total_sales || 0,
          totalCashSales: session.total_cash_sales || 0,
          totalCardSales: session.total_card_sales || 0,
          totalBizumSales: session.total_bizum_sales || 0,
          totalTransferSales: session.total_transfer_sales || 0,
          totalVoucherSales: session.total_voucher_sales || 0,
          totalReturns: session.total_returns || 0,
          totalWithdrawals: session.total_withdrawals || 0,
          expectedCash,
          countedCash: counted,
          cashDifference: difference,
          closingNotes: closingNotes || undefined,
        })
      } catch (e) {
        console.error('[PDF] Error generando arqueo de caja:', e)
        toast.warning('Caja cerrada, pero no se pudo generar el PDF de arqueo')
      }

      toast.success('Caja cerrada correctamente')
      onClosed()
    } catch {
      toast.error('Error inesperado al cerrar la caja')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="h-full min-h-full overflow-y-auto overflow-x-hidden p-6 md:p-10 pb-24 bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="max-w-3xl mx-auto space-y-8">
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

        {/* Desglose de apertura (solo admin) */}
        {isAdmin && hasOpeningBreakdown && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Desglose de apertura</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#c9a96e] bg-[#c9a96e]/10 px-2 py-0.5 rounded-full">
                Solo admin
              </span>
            </div>
            <p className="text-xs text-slate-500 -mt-3">
              Billetes y monedas con los que se abrió la caja.
            </p>
            <CashCounter
              value={openingBreakdown ?? {}}
              onChange={() => {}}
              readOnly
              variant="light"
            />
          </div>
        )}

        {/* Arqueo */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-sm font-semibold text-slate-800">Arqueo de caja</h2>
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-slate-600">Efectivo esperado en caja</span>
            <span className="text-lg font-semibold tabular-nums text-slate-800">{formatCurrency(expectedCash)}</span>
          </div>

          <CashCounter
            value={cashBreakdown}
            onChange={(breakdown, total) => {
              setCashBreakdown(breakdown)
              setCounted(total)
            }}
            label="Efectivo contado"
            variant="light"
          />

          {hasCounted && (
            <>
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
              {!isExact && (
                <p className="text-sm text-red-600 font-medium text-center">
                  No se puede cerrar la caja con un descuadre. Verifica el efectivo contado.
                </p>
              )}
            </>
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
            onClick={handleClose}
            disabled={isLoading || !hasCounted || !isExact}
            className="flex-1 h-14 rounded-xl bg-[#1B2A4A] hover:bg-[#253a5c] font-semibold shadow-lg shadow-[#1B2A4A]/20 gap-2"
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
            {isLoading ? 'Cerrando...' : 'Cerrar caja'}
          </Button>
        </div>
      </div>
    </div>
  )
}
