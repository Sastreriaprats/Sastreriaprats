'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getViewB, addCashPayment, removeCashPayment } from '@/actions/ops'
import type { ViewB } from '@/lib/ops/types'
import { Tabs, Kpis, QuarterTable, MonthlyTable, MovementsTable, eur } from '../accounting-ui'

const thisYear = new Date().getFullYear()
const CATS = [
  { v: 'proveedor', l: 'Proveedor' },
  { v: 'nomina', l: 'Nómina' },
  { v: 'alquiler', l: 'Alquiler' },
  { v: 'otro', l: 'Otro' },
]

export function LedgerPanel() {
  const [year, setYear] = useState(thisYear)
  const [tab, setTab] = useState('resumen')
  const [data, setData] = useState<ViewB | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [date, setDate] = useState('')
  const [concept, setConcept] = useState('')
  const [category, setCategory] = useState('proveedor')
  const [amount, setAmount] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getViewB(year)
    setData(res.ok ? res.data : null)
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  const onAdd = async () => {
    if (!date || !amount) { toast.error('Fecha e importe obligatorios'); return }
    setBusy(true)
    const res = await addCashPayment({ date, concept, category, amount: Number(amount) })
    setBusy(false)
    if (res.ok) { toast.success('Pago en efectivo añadido'); setConcept(''); setAmount(''); load() }
    else toast.error('error' in res ? res.error : 'Error')
  }
  const onDelete = async (id: string) => {
    const res = await removeCashPayment(id)
    if (res.ok) load(); else toast.error('Error')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Contabilidad en efectivo</h1>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="ml-auto h-9 rounded-md border px-2 text-sm">
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'iva', label: 'IVA trimestral' },
          { key: 'mensual', label: 'Mensual' },
          { key: 'movimientos', label: 'Cobros en efectivo' },
          { key: 'pagos', label: 'Pagos en efectivo (control)' },
        ]}
      />

      {loading || !data ? (
        <p className="text-slate-400">{loading ? 'Cargando…' : 'Sin datos.'}</p>
      ) : tab === 'resumen' ? (
        <div className="space-y-4">
          <Kpis view={data.view} variant="cash" />
          <p className="text-xs text-slate-400">Cobros 100% en efectivo (serie efectivo) de todas las ventas del año. Es la parte que la Capa C resta a la contabilidad real.</p>
        </div>
      ) : tab === 'iva' ? (
        <QuarterTable view={data.view} variant="cash" />
      ) : tab === 'mensual' ? (
        <MonthlyTable view={data.view} variant="cash" />
      ) : tab === 'movimientos' ? (
        <MovementsTable rows={data.movements} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm font-medium mb-3">Añadir pago en efectivo (proveedor, nómina…)</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
              <div>
                <label className="text-xs text-slate-500">Fecha</label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Categoría</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-full rounded-md border px-2 text-sm">
                  {CATS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Concepto</label>
                <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Concepto" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Importe (€)</label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </div>
            <div className="mt-3"><Button onClick={onAdd} disabled={busy}>Añadir</Button></div>
          </div>

          <div className="rounded-lg border bg-white p-4 flex items-center justify-between">
            <span className="text-sm text-slate-600">Total pagos en efectivo {year}</span>
            <span className="text-lg font-bold text-red-700">{eur(data.paymentsTotal)}</span>
          </div>

          <div className="rounded-lg border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Fecha</th>
                  <th className="text-left font-medium px-3 py-2">Categoría</th>
                  <th className="text-left font-medium px-3 py-2">Concepto</th>
                  <th className="text-right font-medium px-3 py-2">Base</th>
                  <th className="text-right font-medium px-3 py-2">IVA</th>
                  <th className="text-right font-medium px-3 py-2">Importe</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.payments.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Sin pagos registrados.</td></tr>
                ) : data.payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">{p.date}</td>
                    <td className="px-3 py-2 capitalize">{p.category}</td>
                    <td className="px-3 py-2">{p.concept}</td>
                    <td className="px-3 py-2 text-right">{eur(p.base)}</td>
                    <td className="px-3 py-2 text-right">{eur(p.vat)}</td>
                    <td className="px-3 py-2 text-right font-medium">{eur(p.amount)}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => onDelete(p.id)} className="text-xs text-red-600 hover:underline">Borrar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">Control interno de lo que pagáis en efectivo. NO afecta a la contabilidad A ni al escenario C; es solo informativo.</p>
        </div>
      )}
    </div>
  )
}
