'use client'

import { useCallback, useEffect, useState } from 'react'
import { getScenarioC } from '@/actions/ops'
import type { ScenarioResult } from '@/lib/ops/types'

const eur = (n: number) => `${(Number(n) || 0).toFixed(2)} €`
const thisYear = new Date().getFullYear()

const ROWS: { key: keyof ScenarioResult['A']; label: string }[] = [
  { key: 'facturacion', label: 'Facturación' },
  { key: 'gastos', label: 'Gastos' },
  { key: 'resultado', label: 'Resultado' },
  { key: 'ivaRepercutido', label: 'IVA repercutido' },
  { key: 'ivaSoportado', label: 'IVA soportado' },
  { key: 'ivaAPagar', label: 'IVA a pagar' },
]

export function ScenarioCView() {
  const [year, setYear] = useState(thisYear)
  const [data, setData] = useState<ScenarioResult | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getScenarioC(year)
    setData(res.ok ? res.data : null)
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Escenario sin efectivo</h1>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="ml-auto h-9 rounded-md border px-2 text-sm">
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-400">Calculando…</p>
      ) : !data ? (
        <p className="text-slate-400">Sin datos.</p>
      ) : (
        <>
          <div className="rounded-lg border bg-white overflow-hidden">
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
                {ROWS.map((r) => {
                  const a = data.A[r.key]
                  const c = data.C[r.key]
                  return (
                    <tr key={r.key} className="border-t">
                      <td className="px-4 py-2 font-medium text-slate-700">{r.label}</td>
                      <td className="px-4 py-2 text-right">{eur(a)}</td>
                      <td className="px-4 py-2 text-right">{eur(c)}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{eur(a - c)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            C = A menos el efectivo marcado en "Efectivo" ({data.removed.lines} líneas · base {eur(data.removed.base)} · IVA {eur(data.removed.vat)}).
            Es una simulación de gestión; no se almacena ni sustituye a la contabilidad real (A), que permanece íntegra.
          </p>
        </>
      )}
    </div>
  )
}
