'use client'

import { useCallback, useEffect, useState } from 'react'
import { getViewC } from '@/actions/ops'
import type { ViewC } from '@/lib/ops/types'
import { Tabs, Kpis, QuarterTable, MonthlyTable, MovementsTable, eur } from '../accounting-ui'

const thisYear = new Date().getFullYear()

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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Escenario sin efectivo</h1>
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
          { key: 'movimientos', label: 'Ventas (no efectivo)' },
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
                {([
                  ['Facturación', 'income'],
                  ['Gastos', 'expenses'],
                  ['Resultado', 'profit'],
                  ['IVA repercutido', 'ivaRepercutido'],
                  ['IVA soportado', 'ivaSoportado'],
                  ['IVA a ingresar', 'vatToPay'],
                ] as const).map(([label, key]) => (
                  <tr key={key} className="border-t">
                    <td className="px-4 py-2 font-medium text-slate-700">{label}</td>
                    <td className="px-4 py-2 text-right">{eur(data.A[key])}</td>
                    <td className="px-4 py-2 text-right">{eur(data.C[key])}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{eur(data.A[key] - data.C[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            C = A menos los cobros en efectivo. Solo cambia el lado de ingresos/IVA repercutido; gastos e IVA soportado son los mismos que A.
            Es una simulación de gestión: no se almacena ni sustituye a la contabilidad real (A).
          </p>
        </div>
      ) : tab === 'iva' ? (
        <QuarterTable view={data.C} variant="full" />
      ) : tab === 'mensual' ? (
        <MonthlyTable view={data.C} variant="full" />
      ) : (
        <MovementsTable rows={data.movements} />
      )}
    </div>
  )
}
