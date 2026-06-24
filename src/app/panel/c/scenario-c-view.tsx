'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getViewC } from '@/actions/ops'
import type { ViewC, AccountingView } from '@/lib/ops/types'
import { downloadExcelMulti } from '@/lib/excel/export'
import { Tabs, Kpis, QuarterTable, MonthlyTable, MovementsTable, eur, MONTH_LABELS } from '../accounting-ui'

const thisYear = new Date().getFullYear()
const n2 = (n: number) => Number((Number(n) || 0).toFixed(2))

const METRICS: [string, keyof AccountingView][] = [
  ['Facturación', 'income'],
  ['Gastos', 'expenses'],
  ['Resultado', 'profit'],
  ['IVA repercutido', 'ivaRepercutido'],
  ['IVA soportado', 'ivaSoportado'],
  ['IVA a ingresar', 'vatToPay'],
]

export function ScenarioCView() {
  const [year, setYear] = useState(thisYear)
  const [tab, setTab] = useState('resumen')
  const [data, setData] = useState<ViewC | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getViewC(year)
    setData(res.ok ? res.data : null)
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  const onExcel = async () => {
    if (!data) return
    await downloadExcelMulti([
      { name: 'Resumen A vs C', rows: METRICS.map(([label, key]) => ({
        'Métrica': label, 'A (real)': n2(data.A[key] as number), 'C (sin efectivo)': n2(data.C[key] as number),
        'Diferencia': n2((data.A[key] as number) - (data.C[key] as number)),
      })) },
      { name: 'IVA trimestral C', rows: data.C.quarters.map((q) => ({
        Trimestre: q.quarter, Periodo: q.period, 'Base ventas': n2(q.baseSales), 'IVA repercutido': n2(q.ivaRepercutido),
        'Base compras': n2(q.basePurchases), 'IVA soportado': n2(q.ivaSoportado), Resultado: n2(q.resultado),
      })) },
      { name: 'Mensual C', rows: data.C.monthly.map((m, i) => ({
        Mes: MONTH_LABELS[i], Ingresos: n2(m.income), Gastos: n2(m.expenses), Resultado: n2(m.income - m.expenses),
      })) },
      { name: 'Ventas no efectivo', rows: data.movements.map((m) => ({
        Fecha: m.date, Ticket: m.ref, 'Método': m.method, Base: n2(m.base), IVA: n2(m.vat), Total: n2(m.total),
      })) },
      { name: 'Facturas', rows: data.invoices.map((f) => ({
        'Nº': f.number, Cliente: f.client, Fecha: f.date, Total: n2(f.total), Estado: f.status, Pago: f.method,
      })) },
    ], `escenario-c-${year}`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Escenario sin efectivo</h1>
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
          { key: 'movimientos', label: 'Ventas (no efectivo)' },
          { key: 'facturas', label: 'Facturas' },
        ]}
      />

      {loading || !data ? (
        <p className="text-slate-400">{loading ? 'Calculando…' : 'Sin datos.'}</p>
      ) : tab === 'resumen' ? (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Escenario C (sin efectivo)</p>
            <Kpis view={data.C} variant="full" />
          </div>
          <div className="rounded-lg border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Métrica</th>
                  <th className="text-right font-medium px-4 py-2">A (real, íntegra)</th>
                  <th className="text-right font-medium px-4 py-2">C (sin efectivo)</th>
                  <th className="text-right font-medium px-4 py-2">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map(([label, key]) => (
                  <tr key={key} className="border-t">
                    <td className="px-4 py-2 font-medium text-slate-700">{label}</td>
                    <td className="px-4 py-2 text-right">{eur(data.A[key] as number)}</td>
                    <td className="px-4 py-2 text-right">{eur(data.C[key] as number)}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{eur((data.A[key] as number) - (data.C[key] as number))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            C = A menos los cobros en efectivo. Solo cambia el lado de ingresos/IVA repercutido; gastos e IVA soportado son los mismos que A.
            Simulación de gestión: no se almacena ni sustituye a la contabilidad real (A).
          </p>
        </div>
      ) : tab === 'iva' ? (
        <QuarterTable view={data.C} variant="full" />
      ) : tab === 'mensual' ? (
        <MonthlyTable view={data.C} variant="full" />
      ) : tab === 'movimientos' ? (
        <MovementsTable rows={data.movements} />
      ) : (
        <div className="rounded-lg border bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Nº</th>
                <th className="text-left font-medium px-3 py-2">Cliente</th>
                <th className="text-left font-medium px-3 py-2">Fecha</th>
                <th className="text-right font-medium px-3 py-2">Total</th>
                <th className="text-left font-medium px-3 py-2">Estado</th>
                <th className="text-left font-medium px-3 py-2">Pago</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Sin facturas.</td></tr>
              ) : data.invoices.map((f, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{f.number}</td>
                  <td className="px-3 py-2">{f.client}</td>
                  <td className="px-3 py-2">{f.date}</td>
                  <td className="px-3 py-2 text-right font-medium">{eur(f.total)}</td>
                  <td className="px-3 py-2 capitalize">{f.status}</td>
                  <td className="px-3 py-2 capitalize">{f.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
