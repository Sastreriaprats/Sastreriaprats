'use client'

import type { AccountingView, MovementRow } from '@/lib/ops/types'

export const eur = (n: number) =>
  `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

export const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function Card({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' | 'slate' | 'amber' }) {
  const color = tone === 'green' ? 'text-emerald-700' : tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  )
}

export function Kpis({ view, variant }: { view: AccountingView; variant: 'cash' | 'full' }) {
  if (variant === 'cash') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card label="Facturación en efectivo (base)" value={eur(view.income)} tone="green" />
        <Card label="IVA repercutido efectivo" value={eur(view.ivaRepercutido)} tone="slate" />
        <Card label="Nº de cobros en efectivo" value={String(view.salesCount)} tone="slate" />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card label="Ingresos (base)" value={eur(view.income)} tone="green" />
      <Card label="Gastos (base)" value={eur(view.expenses)} tone="red" />
      <Card label="Resultado neto" value={eur(view.profit)} tone={view.profit >= 0 ? 'green' : 'red'} />
      <Card label="IVA a ingresar" value={eur(view.vatToPay)} tone="amber" />
    </div>
  )
}

export function QuarterTable({ view, variant }: { view: AccountingView; variant: 'cash' | 'full' }) {
  const cash = variant === 'cash'
  const totRep = view.quarters.reduce((s, q) => s + q.ivaRepercutido, 0)
  const totSop = view.quarters.reduce((s, q) => s + q.ivaSoportado, 0)
  const totBaseS = view.quarters.reduce((s, q) => s + q.baseSales, 0)
  const totBaseP = view.quarters.reduce((s, q) => s + q.basePurchases, 0)
  return (
    <div className="rounded-lg border bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="text-left font-medium px-3 py-2">Trimestre</th>
            <th className="text-left font-medium px-3 py-2">Periodo</th>
            <th className="text-right font-medium px-3 py-2">Base ventas</th>
            <th className="text-right font-medium px-3 py-2">IVA repercutido</th>
            {!cash && <th className="text-right font-medium px-3 py-2">Base compras</th>}
            {!cash && <th className="text-right font-medium px-3 py-2">IVA soportado</th>}
            <th className="text-right font-medium px-3 py-2">{cash ? 'IVA efectivo' : 'Resultado'}</th>
          </tr>
        </thead>
        <tbody>
          {view.quarters.map((q) => (
            <tr key={q.quarter} className="border-t">
              <td className="px-3 py-2 font-medium">{q.quarter}</td>
              <td className="px-3 py-2 text-slate-500">{q.period}</td>
              <td className="px-3 py-2 text-right">{eur(q.baseSales)}</td>
              <td className="px-3 py-2 text-right">{eur(q.ivaRepercutido)}</td>
              {!cash && <td className="px-3 py-2 text-right">{eur(q.basePurchases)}</td>}
              {!cash && <td className="px-3 py-2 text-right">{eur(q.ivaSoportado)}</td>}
              <td className="px-3 py-2 text-right font-semibold">{eur(cash ? q.ivaRepercutido : q.resultado)}</td>
            </tr>
          ))}
          <tr className="border-t bg-slate-50 font-semibold">
            <td className="px-3 py-2" colSpan={2}>TOTAL año</td>
            <td className="px-3 py-2 text-right">{eur(totBaseS)}</td>
            <td className="px-3 py-2 text-right">{eur(totRep)}</td>
            {!cash && <td className="px-3 py-2 text-right">{eur(totBaseP)}</td>}
            {!cash && <td className="px-3 py-2 text-right">{eur(totSop)}</td>}
            <td className="px-3 py-2 text-right">{eur(cash ? totRep : totRep - totSop)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function MonthlyTable({ view, variant }: { view: AccountingView; variant: 'cash' | 'full' }) {
  const cash = variant === 'cash'
  return (
    <div className="rounded-lg border bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="text-left font-medium px-3 py-2">Mes</th>
            <th className="text-right font-medium px-3 py-2">{cash ? 'Ingresos efectivo' : 'Ingresos'}</th>
            {!cash && <th className="text-right font-medium px-3 py-2">Gastos</th>}
            {!cash && <th className="text-right font-medium px-3 py-2">Resultado</th>}
          </tr>
        </thead>
        <tbody>
          {view.monthly.map((m, i) => (
            <tr key={m.month} className="border-t">
              <td className="px-3 py-2">{MONTH_LABELS[i]}</td>
              <td className="px-3 py-2 text-right">{eur(m.income)}</td>
              {!cash && <td className="px-3 py-2 text-right">{eur(m.expenses)}</td>}
              {!cash && <td className="px-3 py-2 text-right">{eur(m.income - m.expenses)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MovementsTable({ rows }: { rows: MovementRow[] }) {
  return (
    <div className="rounded-lg border bg-white overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="text-left font-medium px-3 py-2">Fecha</th>
            <th className="text-left font-medium px-3 py-2">Ticket</th>
            <th className="text-left font-medium px-3 py-2">Método</th>
            <th className="text-right font-medium px-3 py-2">Base</th>
            <th className="text-right font-medium px-3 py-2">IVA</th>
            <th className="text-right font-medium px-3 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Sin movimientos.</td></tr>
          ) : rows.map((m, i) => (
            <tr key={i} className="border-t">
              <td className="px-3 py-2">{m.date}</td>
              <td className="px-3 py-2 font-mono text-xs">{m.ref}</td>
              <td className="px-3 py-2 capitalize">{m.method}</td>
              <td className="px-3 py-2 text-right">{eur(m.base)}</td>
              <td className="px-3 py-2 text-right">{eur(m.vat)}</td>
              <td className="px-3 py-2 text-right font-medium">{eur(m.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length >= 1000 && <p className="text-xs text-slate-400 p-2">Mostrando los 1000 más recientes.</p>}
    </div>
  )
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 border-b">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm -mb-px border-b-2 ${active === t.key ? 'border-prats-navy text-prats-navy font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
