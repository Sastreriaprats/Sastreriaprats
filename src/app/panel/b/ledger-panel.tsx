'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getViewB, addCashEntry, removeCashEntry } from '@/actions/ops'
import type { ViewB } from '@/lib/ops/types'
import { downloadExcelMulti } from '@/lib/excel/export'
import { Tabs, Kpis, QuarterTable, MonthlyTable, MovementsTable, eur, MONTH_LABELS } from '../accounting-ui'

const thisYear = new Date().getFullYear()
const CATS = ['proveedor', 'nomina', 'alquiler', 'venta', 'otro']
const IVAS = [0, 10, 18, 21]

export function LedgerPanel() {
  const [year, setYear] = useState(thisYear)
  const [tab, setTab] = useState('resumen')
  const [data, setData] = useState<ViewB | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('venta')
  const [concept, setConcept] = useState('')
  const [base, setBase] = useState('')
  const [ivaRate, setIvaRate] = useState(0)

  const total = useMemo(() => (Number(base) || 0) * (1 + ivaRate / 100), [base, ivaRate])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getViewB(year)
    setData(res.ok ? res.data : null)
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  const onAdd = async () => {
    if (!date || !base) { toast.error('Fecha e importe neto obligatorios'); return }
    setBusy(true)
    const res = await addCashEntry({ date, concept, category, direction, base: Number(base), ivaRate })
    setBusy(false)
    if (res.ok) { toast.success(direction === 'in' ? 'Cobro añadido' : 'Pago añadido'); setConcept(''); setBase(''); load() }
    else toast.error('error' in res ? res.error : 'Error')
  }
  const onDelete = async (id: string) => {
    const res = await removeCashEntry(id)
    if (res.ok) load(); else toast.error('Error')
  }

  const n2 = (n: number) => Number((Number(n) || 0).toFixed(2))
  const onExcel = async () => {
    if (!data) return
    await downloadExcelMulti([
      { name: 'Resumen efectivo', rows: [
        { Concepto: 'Facturación efectivo (base)', Importe: n2(data.view.income) },
        { Concepto: 'IVA repercutido efectivo', Importe: n2(data.view.ivaRepercutido) },
        { Concepto: 'Nº cobros efectivo', Importe: data.view.salesCount },
        { Concepto: 'Cobros manuales', Importe: n2(data.totalIn) },
        { Concepto: 'Pagos manuales', Importe: n2(data.totalOut) },
      ] },
      { name: 'IVA trimestral', rows: data.view.quarters.map((q) => ({
        Trimestre: q.quarter, Periodo: q.period, 'Base ventas': n2(q.baseSales), 'IVA repercutido': n2(q.ivaRepercutido),
      })) },
      { name: 'Mensual', rows: data.view.monthly.map((m, i) => ({ Mes: MONTH_LABELS[i], Ingresos: n2(m.income) })) },
      { name: 'Cobros efectivo', rows: data.movements.map((m) => ({
        Fecha: m.date, Ticket: m.ref, 'Método': m.method, Base: n2(m.base), IVA: n2(m.vat), Total: n2(m.total),
      })) },
      { name: 'Manuales', rows: data.entries.map((e) => ({
        Fecha: e.date, Tipo: e.direction === 'in' ? 'Cobro' : 'Pago', 'Categoría': e.category, Concepto: e.concept,
        Base: n2(e.base), 'IVA %': e.ivaRate, IVA: n2(e.vat), Total: n2(e.amount),
      })) },
    ], `efectivo-b-${year}`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Contabilidad en efectivo</h1>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="ml-auto h-9 rounded-md border px-2 text-sm">
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Button variant="outline" size="sm" disabled={!data} onClick={onExcel}>Exportar Excel</Button>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'iva', label: 'IVA trimestral' },
          { key: 'mensual', label: 'Mensual' },
          { key: 'movimientos', label: 'Cobros en efectivo' },
          { key: 'manual', label: 'Movimientos manuales' },
        ]}
      />

      {loading || !data ? (
        <p className="text-slate-400">{loading ? 'Cargando…' : 'Sin datos.'}</p>
      ) : tab === 'resumen' ? (
        <div className="space-y-4">
          <Kpis view={data.view} variant="cash" />
          <p className="text-xs text-slate-400">Cobros 100% en efectivo de todas las ventas del año. Es la parte que la Capa C resta a la contabilidad real.</p>
        </div>
      ) : tab === 'iva' ? (
        <QuarterTable view={data.view} variant="cash" />
      ) : tab === 'mensual' ? (
        <MonthlyTable view={data.view} variant="cash" />
      ) : tab === 'movimientos' ? (
        <MovementsTable rows={data.movements} />
      ) : (
        <div className="space-y-4">
          {/* Alta manual */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-medium">Añadir movimiento manual en efectivo</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-7 md:items-end">
              <div>
                <label className="text-xs text-slate-500">Tipo</label>
                <select value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')} className="h-9 w-full rounded-md border px-2 text-sm">
                  <option value="in">Cobro</option>
                  <option value="out">Pago</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Fecha</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Categoría</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-full rounded-md border px-2 text-sm capitalize">
                  {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Concepto</label>
                <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Concepto" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Importe neto (€)</label>
                <Input type="number" step="0.01" value={base} onChange={(e) => setBase(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">IVA</label>
                <select value={ivaRate} onChange={(e) => setIvaRate(Number(e.target.value))} className="h-9 w-full rounded-md border px-2 text-sm">
                  {IVAS.map((v) => <option key={v} value={v}>{v}%</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <Button onClick={onAdd} disabled={busy}>Añadir</Button>
              <span className="text-sm text-slate-500">Total: <b className="text-slate-800">{eur(total)}</b> <span className="text-xs">(neto {eur(Number(base) || 0)} + IVA {ivaRate}%)</span></span>
            </div>
          </div>

          {/* Totales */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Cobros manuales</p>
              <p className="text-lg font-bold text-emerald-700">{eur(data.totalIn)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Pagos manuales</p>
              <p className="text-lg font-bold text-red-700">{eur(data.totalOut)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Neto</p>
              <p className="text-lg font-bold">{eur(data.totalIn - data.totalOut)}</p>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 text-left">Fecha</th>
                  <th className="px-3 py-2.5 text-left">Tipo</th>
                  <th className="px-3 py-2.5 text-left">Categoría</th>
                  <th className="px-3 py-2.5 text-left">Concepto</th>
                  <th className="px-3 py-2.5 text-right">Base</th>
                  <th className="px-3 py-2.5 text-right">IVA</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.entries.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Sin movimientos manuales.</td></tr>
                ) : data.entries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-slate-500">{e.date}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${e.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {e.direction === 'in' ? 'Cobro' : 'Pago'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 capitalize">{e.category}</td>
                    <td className="px-3 py-2.5">{e.concept}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{eur(e.base)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{eur(e.vat)} <span className="text-[10px] text-slate-400">({e.ivaRate}%)</span></td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{eur(e.amount)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => onDelete(e.id)} className="text-xs text-red-600 hover:underline">Borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">Control interno de cobros y pagos en efectivo hechos a mano. NO afectan a la contabilidad A ni al escenario C.</p>
        </div>
      )}
    </div>
  )
}
