'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  listLedger, syncErpCash, createManualEntry, setIncludeInC, removeLedgerEntry,
} from '@/actions/ops'
import type { LedgerLine } from '@/lib/ops/types'

const eur = (n: number) => `${(Number(n) || 0).toFixed(2)} €`
const thisYear = new Date().getFullYear()

export function LedgerPanel() {
  const [year, setYear] = useState(thisYear)
  const [lines, setLines] = useState<LedgerLine[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Alta manual
  const [date, setDate] = useState('')
  const [concept, setConcept] = useState('')
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [include, setInclude] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await listLedger(year)
    setLines(res.ok ? res.data : [])
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  const onSync = async () => {
    setBusy(true)
    const res = await syncErpCash(year)
    setBusy(false)
    if (res.ok) { toast.success(`Sincronizado (${res.data.scanned} cobros E revisados)`); load() }
    else toast.error('No se pudo sincronizar')
  }

  const onAdd = async () => {
    if (!date || !amount) { toast.error('Fecha e importe obligatorios'); return }
    setBusy(true)
    const res = await createManualEntry({ date, concept, direction, amount: Number(amount), includeInC: include })
    setBusy(false)
    if (res.ok) { toast.success('Línea añadida'); setConcept(''); setAmount(''); load() }
    else toast.error(res.error || 'Error')
  }

  const onToggle = async (l: LedgerLine) => {
    const res = await setIncludeInC(l.id, !l.includeInC)
    if (res.ok) setLines((prev) => prev.map((x) => x.id === l.id ? { ...x, includeInC: !x.includeInC } : x))
    else toast.error('Error')
  }

  const onDelete = async (l: LedgerLine) => {
    if (l.kind === 'erp') { toast.error('Las líneas del ERP no se borran; desmárcalas si no cuentan'); return }
    const res = await removeLedgerEntry(l.id)
    if (res.ok) { setLines((prev) => prev.filter((x) => x.id !== l.id)) }
    else toast.error('Error')
  }

  const inc = lines.filter((l) => l.includeInC)
  const totIn = inc.filter((l) => l.direction === 'in').reduce((s, l) => s + l.amount, 0)
  const totOut = inc.filter((l) => l.direction === 'out').reduce((s, l) => s + l.amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Control de efectivo</h1>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="ml-auto h-9 rounded-md border px-2 text-sm"
        >
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <Button variant="outline" onClick={onSync} disabled={busy}>Sincronizar cobros ERP (E)</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-slate-500">Efectivo marcado (cobros)</p>
          <p className="text-lg font-bold text-green-700">{eur(totIn)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-slate-500">Efectivo marcado (pagos)</p>
          <p className="text-lg font-bold text-red-700">{eur(totOut)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs text-slate-500">Neto marcado p/ escenario</p>
          <p className="text-lg font-bold">{eur(totIn - totOut)}</p>
        </div>
      </div>

      {/* Alta manual */}
      <div className="rounded-lg border bg-white p-4">
        <p className="text-sm font-medium mb-3">Añadir movimiento manual</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <div>
            <label className="text-xs text-slate-500">Fecha</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-500">Concepto</label>
            <Input value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Concepto" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Tipo</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')} className="h-9 w-full rounded-md border px-2 text-sm">
              <option value="in">Cobro</option>
              <option value="out">Pago</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Importe (€)</label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} /> En escenario
            </label>
          </div>
        </div>
        <div className="mt-3"><Button onClick={onAdd} disabled={busy}>Añadir</Button></div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left font-medium px-3 py-2">Fecha</th>
              <th className="text-left font-medium px-3 py-2">Concepto</th>
              <th className="text-left font-medium px-3 py-2">Origen</th>
              <th className="text-left font-medium px-3 py-2">Tipo</th>
              <th className="text-right font-medium px-3 py-2">Base</th>
              <th className="text-right font-medium px-3 py-2">IVA</th>
              <th className="text-right font-medium px-3 py-2">Importe</th>
              <th className="text-center font-medium px-3 py-2">En escenario</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">Cargando…</td></tr>
            ) : lines.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">Sin movimientos. Sincroniza o añade manualmente.</td></tr>
            ) : lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-3 py-2">{l.date}</td>
                <td className="px-3 py-2">{l.concept}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{l.kind === 'erp' ? 'ERP' : 'Manual'}</td>
                <td className="px-3 py-2">{l.direction === 'in' ? 'Cobro' : 'Pago'}</td>
                <td className="px-3 py-2 text-right">{eur(l.base)}</td>
                <td className="px-3 py-2 text-right">{eur(l.vat)}</td>
                <td className="px-3 py-2 text-right font-medium">{eur(l.amount)}</td>
                <td className="px-3 py-2 text-center">
                  <input type="checkbox" checked={l.includeInC} onChange={() => onToggle(l)} />
                </td>
                <td className="px-3 py-2 text-right">
                  {l.kind === 'manual' && (
                    <button onClick={() => onDelete(l)} className="text-xs text-red-600 hover:underline">Borrar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Las líneas "ERP" son cobros 100% efectivo (serie CLP-E) importados del sistema; su importe no se edita, solo se cura el check.
      </p>
    </div>
  )
}
