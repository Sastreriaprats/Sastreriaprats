'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { TrendingUp, TrendingDown, Wallet, Receipt, Percent, Hash, Download, Loader2, type LucideIcon } from 'lucide-react'
import { getTicketData } from '@/actions/ops'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'
import type { AccountingView, MovementRow, LedgerMovement } from '@/lib/ops/types'

export const eur = (n: number) =>
  `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const TONES: Record<string, { chip: string; icon: string; value: string }> = {
  green: { chip: 'bg-emerald-50', icon: 'text-emerald-600', value: 'text-emerald-700' },
  red: { chip: 'bg-red-50', icon: 'text-red-600', value: 'text-red-700' },
  amber: { chip: 'bg-amber-50', icon: 'text-amber-600', value: 'text-amber-700' },
  slate: { chip: 'bg-slate-100', icon: 'text-slate-500', value: 'text-slate-800' },
  blue: { chip: 'bg-blue-50', icon: 'text-blue-600', value: 'text-blue-700' },
}

function KpiCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: LucideIcon; tone: keyof typeof TONES }) {
  const t = TONES[tone]
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.chip}`}>
          <Icon className={`h-4 w-4 ${t.icon}`} />
        </span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${t.value}`}>{value}</p>
    </div>
  )
}

export function Kpis({ view, variant }: { view: AccountingView; variant: 'cash' | 'full' }) {
  if (variant === 'cash') {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Facturación en efectivo (base)" value={eur(view.income)} icon={Wallet} tone="green" />
        <KpiCard label="IVA repercutido efectivo" value={eur(view.ivaRepercutido)} icon={Percent} tone="blue" />
        <KpiCard label="Nº de cobros en efectivo" value={String(view.salesCount)} icon={Hash} tone="slate" />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard label="Ingresos (base)" value={eur(view.income)} icon={TrendingUp} tone="green" />
      <KpiCard label="Gastos (base)" value={eur(view.expenses)} icon={TrendingDown} tone="red" />
      <KpiCard label="Resultado neto" value={eur(view.profit)} icon={Receipt} tone={view.profit >= 0 ? 'green' : 'red'} />
      <KpiCard label="IVA a ingresar" value={eur(view.vatToPay)} icon={Percent} tone="amber" />
    </div>
  )
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">{children}</div>
}
const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500'
const THR = TH + ' text-right'
const TD = 'px-4 py-2.5'
const TDR = TD + ' text-right tabular-nums'

export function QuarterTable({ view, variant }: { view: AccountingView; variant: 'cash' | 'full' }) {
  const cash = variant === 'cash'
  const tot = view.quarters.reduce((a, q) => ({
    bs: a.bs + q.baseSales, rep: a.rep + q.ivaRepercutido, bp: a.bp + q.basePurchases, sop: a.sop + q.ivaSoportado,
  }), { bs: 0, rep: 0, bp: 0, sop: 0 })
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Trimestre</th>
            <th className={TH}>Periodo</th>
            <th className={THR}>Base ventas</th>
            <th className={THR}>IVA repercutido</th>
            {!cash && <th className={THR}>Base compras</th>}
            {!cash && <th className={THR}>IVA soportado</th>}
            <th className={THR}>{cash ? 'IVA efectivo' : 'Resultado'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {view.quarters.map((q) => (
            <tr key={q.quarter} className="hover:bg-slate-50/60">
              <td className={`${TD} font-semibold text-slate-700`}>{q.quarter}</td>
              <td className={`${TD} text-slate-500`}>{q.period}</td>
              <td className={TDR}>{eur(q.baseSales)}</td>
              <td className={TDR}>{eur(q.ivaRepercutido)}</td>
              {!cash && <td className={TDR}>{eur(q.basePurchases)}</td>}
              {!cash && <td className={TDR}>{eur(q.ivaSoportado)}</td>}
              <td className={`${TDR} font-semibold`}>{eur(cash ? q.ivaRepercutido : q.resultado)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold text-slate-800">
            <td className={TD} colSpan={2}>TOTAL año</td>
            <td className={TDR}>{eur(tot.bs)}</td>
            <td className={TDR}>{eur(tot.rep)}</td>
            {!cash && <td className={TDR}>{eur(tot.bp)}</td>}
            {!cash && <td className={TDR}>{eur(tot.sop)}</td>}
            <td className={TDR}>{eur(cash ? tot.rep : tot.rep - tot.sop)}</td>
          </tr>
        </tbody>
      </table>
    </TableShell>
  )
}

export function MonthlyTable({ view, variant }: { view: AccountingView; variant: 'cash' | 'full' }) {
  const cash = variant === 'cash'
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Mes</th>
            <th className={THR}>{cash ? 'Ingresos efectivo' : 'Ingresos'}</th>
            {!cash && <th className={THR}>Gastos</th>}
            {!cash && <th className={THR}>Resultado</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {view.monthly.map((m, i) => (
            <tr key={m.month} className="hover:bg-slate-50/60">
              <td className={`${TD} font-medium text-slate-600`}>{MONTH_LABELS[i]}</td>
              <td className={TDR}>{eur(m.income)}</td>
              {!cash && <td className={TDR}>{eur(m.expenses)}</td>}
              {!cash && <td className={`${TDR} ${m.income - m.expenses >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{eur(m.income - m.expenses)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  )
}

function DownloadBtn({ saleId }: { saleId?: string }) {
  const [loading, setLoading] = useState(false)
  if (!saleId) return <span className="text-slate-300">—</span>
  const go = async () => {
    setLoading(true)
    try {
      const res = await getTicketData(saleId)
      if (!res.ok) { toast.error('Ticket no disponible'); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await generateTicketPdf(res.data as any)
    } catch {
      toast.error('No se pudo generar el PDF')
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      onClick={go}
      disabled={loading}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-prats-navy disabled:opacity-50"
      title="Descargar ticket en PDF"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
    </button>
  )
}

export function MovementsTable({ rows }: { rows: MovementRow[] }) {
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Fecha</th>
            <th className={TH}>Ticket</th>
            <th className={TH}>Método</th>
            <th className={THR}>Base</th>
            <th className={THR}>IVA</th>
            <th className={THR}>Total</th>
            <th className={THR}>PDF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Sin movimientos.</td></tr>
          ) : rows.map((m, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className={`${TD} text-slate-500`}>{m.date}</td>
              <td className={`${TD} font-mono text-xs font-medium text-slate-700`}>{m.ref}</td>
              <td className={`${TD} capitalize text-slate-600`}>{m.method}</td>
              <td className={TDR}>{eur(m.base)}</td>
              <td className={TDR}>{eur(m.vat)}</td>
              <td className={`${TDR} font-semibold`}>{eur(m.total)}</td>
              <td className={`${TD} text-right`}><DownloadBtn saleId={m.saleId} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length >= 1000 && <p className="p-3 text-xs text-slate-400">Mostrando los 1000 más recientes.</p>}
    </TableShell>
  )
}

const TYPE_BADGE: Record<string, string> = {
  Ticket: 'bg-emerald-50 text-emerald-700',
  Factura: 'bg-blue-50 text-blue-700',
  Compra: 'bg-red-50 text-red-700',
  Gasto: 'bg-red-50 text-red-700',
}

export function LedgerTable({ rows }: { rows: LedgerMovement[] }) {
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Fecha</th>
            <th className={TH}>Tipo</th>
            <th className={TH}>Concepto</th>
            <th className={THR}>Base</th>
            <th className={THR}>IVA</th>
            <th className={THR}>Total</th>
            <th className={THR}>PDF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Sin movimientos.</td></tr>
          ) : rows.map((m, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className={`${TD} text-slate-500`}>{m.date}</td>
              <td className={TD}>
                <span className={`rounded px-1.5 py-0.5 text-xs ${TYPE_BADGE[m.type] ?? 'bg-slate-100 text-slate-600'}`}>{m.type}</span>
              </td>
              <td className={`${TD} text-slate-700`}>{m.concept}</td>
              <td className={TDR}>{eur(m.base)}</td>
              <td className={TDR}>{eur(m.vat)}</td>
              <td className={`${TDR} font-semibold ${m.total >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{eur(m.total)}</td>
              <td className={`${TD} text-right`}><DownloadBtn saleId={m.saleId} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length >= 2000 && <p className="p-3 text-xs text-slate-400">Mostrando los 2000 más recientes.</p>}
    </TableShell>
  )
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-lg px-3.5 py-1.5 text-sm transition-colors ${
            active === t.key ? 'bg-white font-medium text-prats-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
