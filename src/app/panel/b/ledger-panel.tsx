'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Landmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getViewB, addCashEntry, removeCashEntry, createBankDeposit, deleteBankDeposit } from '@/actions/ops'
import type { ViewB, MovementRow, MovementKind } from '@/lib/ops/types'
import { downloadExcelMulti } from '@/lib/excel/export'
import { Tabs, Kpis, QuarterTable, MonthlyCashTable, MovementsTable, eur, groupByMonth, monthKey, PageHeader, YearSelect, TOTAL_ROW } from '../accounting-ui'

const thisYear = new Date().getFullYear()
const CATS = ['proveedor', 'nomina', 'alquiler', 'venta', 'otro']
const IVAS = [0, 10, 18, 21]
// Fecha de HOY en hora local (toISOString daría el día anterior de madrugada)
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Id del cobro como item de depósito (venta / cobro de pedido / factura)
const itemId = (m: MovementRow) => m.saleId ?? m.paymentId ?? m.invoiceId ?? ''
const itemKey = (m: MovementRow) => `${m.kind}:${itemId(m)}`

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

  // Nuevo ingreso al banco
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [depDate, setDepDate] = useState(today())
  const [depNote, setDepNote] = useState('')
  const [openDep, setOpenDep] = useState<string | null>(null)

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

  // Cobros que se pueden ingresar al banco (los manuales son control interno, no van)
  const depositable = useMemo(
    () => (data?.movements ?? []).filter((m) => m.kind !== 'manual' && itemId(m)),
    [data],
  )
  const selectedTotal = useMemo(
    () => depositable.filter((m) => selected.has(itemKey(m))).reduce((s, m) => s + m.total, 0),
    [depositable, selected],
  )
  const yearDeposits = useMemo(
    () => (data?.deposits ?? []).filter((d) => d.date.startsWith(String(year))),
    [data, year],
  )
  const yearDepositsTotal = useMemo(() => yearDeposits.reduce((s, d) => s + d.total, 0), [yearDeposits])

  const toggleSel = (m: MovementRow) => {
    const k = itemKey(m)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const allSelected = depositable.length > 0 && depositable.every((m) => selected.has(itemKey(m)))
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(depositable.map((m) => itemKey(m))))
  }

  const onCreateDeposit = async () => {
    if (selected.size === 0) { toast.error('Selecciona al menos un cobro'); return }
    if (!depDate) { toast.error('Fecha del ingreso obligatoria'); return }
    setBusy(true)
    const items = depositable
      .filter((m) => selected.has(itemKey(m)))
      .map((m) => ({ kind: m.kind as MovementKind, id: itemId(m) }))
    const res = await createBankDeposit({ year, date: depDate, note: depNote, items })
    setBusy(false)
    if (res.ok) {
      toast.success('Ingreso al banco registrado; los cobros pasan al escenario C')
      setShowNew(false); setSelected(new Set()); setDepNote(''); setDepDate(today())
      load()
    } else toast.error('error' in res && res.error ? res.error : 'Error')
  }

  const onDeleteDeposit = async (id: string) => {
    if (!window.confirm('¿Deshacer este ingreso? Los cobros volverán a la contabilidad en efectivo (B) y saldrán del escenario C.')) return
    const res = await deleteBankDeposit(id)
    if (res.ok) { toast.success('Ingreso deshecho'); load() } else toast.error('Error')
  }

  const n2 = (n: number) => Number((Number(n) || 0).toFixed(2))
  const onExcel = async () => {
    if (!data) return
    const cashTotal = data.view.income + data.view.ivaRepercutido
    await downloadExcelMulti([
      { name: 'Resumen efectivo', rows: [
        { Concepto: 'Efectivo cobrado (tickets, total)', Importe: n2(cashTotal) },
        { Concepto: 'Nº cobros efectivo', Importe: data.view.salesCount },
        { Concepto: 'Cobros manuales', Importe: n2(data.manual.inTotal) },
        { Concepto: 'Pagos manuales', Importe: n2(data.manual.outTotal) },
        { Concepto: 'Ingresado al banco (cobros del año)', Importe: n2(data.depositedTotal) },
        { Concepto: 'Neto en efectivo', Importe: n2(cashTotal + data.manual.inTotal - data.manual.outTotal) },
      ] },
      { name: 'IVA trimestral', rows: data.view.quarters.map((q) => ({
        Trimestre: q.quarter, Periodo: q.period, 'Base ventas': n2(q.baseSales), 'IVA repercutido': n2(q.ivaRepercutido),
      })) },
      { name: 'Mensual', rows: (() => {
        // Misma agrupación que la tabla Mensual (groupByMonth compartido)
        const byMonth = groupByMonth(data.movements.filter((m) => m.kind !== 'manual'))
        return Array.from({ length: 12 }, (_, i) => {
          const key = monthKey(year, i)
          return { Mes: key, 'Efectivo (total)': n2((byMonth[key] ?? []).reduce((s, m) => s + m.total, 0)) }
        })
      })() },
      { name: 'Cobros efectivo', rows: data.movements.map((m) => ({
        Fecha: m.date, Ticket: m.ref, 'Método': m.method, Cliente: m.client ?? '', Total: n2(m.total),
      })) },
      { name: 'Ingresos al banco', rows: yearDeposits.flatMap((d) => d.items.map((i) => ({
        'Fecha ingreso': d.date, Nota: d.note, 'Fecha cobro': i.date, Ticket: i.ref, Cliente: i.client ?? '', Importe: n2(i.amount),
      }))) },
      { name: 'Manuales', rows: data.entries.map((e) => ({
        Fecha: e.date, Tipo: e.direction === 'in' ? 'Cobro' : 'Pago', 'Categoría': e.category, Concepto: e.concept,
        Base: n2(e.base), 'IVA %': e.ivaRate, IVA: n2(e.vat), Total: n2(e.amount),
      })) },
    ], `efectivo-b-${year}`)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contabilidad en efectivo"
        subtitle={`Ejercicio ${year} · cobros en efectivo, ingresos al banco y control interno de caja`}
      >
        <YearSelect
          value={year}
          years={[thisYear, thisYear - 1, thisYear - 2]}
          onChange={(y) => { setYear(y); setShowNew(false); setSelected(new Set()); setOpenDep(null) }}
        />
        <Button variant="outline" size="sm" disabled={!data} onClick={onExcel}>Exportar Excel</Button>
      </PageHeader>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'iva', label: 'IVA trimestral' },
          { key: 'mensual', label: 'Mensual' },
          { key: 'movimientos', label: 'Cobros en efectivo' },
          { key: 'banco', label: 'Ingresos al banco' },
          { key: 'manual', label: 'Movimientos manuales' },
        ]}
      />

      {loading || !data ? (
        <p className="text-slate-400">{loading ? 'Cargando…' : 'Sin datos.'}</p>
      ) : tab === 'resumen' ? (
        <div className="space-y-5">
          {(() => {
            const v = data.view, m = data.manual
            const tTotal = v.income + v.ivaRepercutido
            const cTotal = tTotal + m.inTotal
            const neto = cTotal - m.outTotal
            const Row = (label: string, total: number, cls = '') => (
              <tr className={cls}>
                <td className="px-4 py-2.5">{label}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{eur(total)}</td>
              </tr>
            )
            return (
              <>
                <Kpis view={v} variant="cash" deposited={data.depositedTotal} available={neto} />
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
                    <span className="text-sm font-semibold text-prats-navy">Resumen general de efectivo</span>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400">Ejercicio {year}</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Concepto</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Row('Cobros por ventas (tickets)', tTotal)}
                      {Row('Cobros manuales (efectivo)', m.inTotal)}
                      {Row('Total cobros en efectivo', cTotal, TOTAL_ROW)}
                      {Row('Pagos manuales (efectivo)', m.outTotal, 'text-red-700')}
                      <tr className="bg-prats-navy font-semibold text-white">
                        <td className="px-4 py-3">NETO EN EFECTIVO (cobros − pagos)</td>
                        <td className="px-4 py-3 text-right tabular-nums">{eur(neto)}</td>
                      </tr>
                      <tr className="text-slate-500">
                        <td className="px-4 py-2.5">Ya ingresado al banco este año — {data.depositedCount} {data.depositedCount === 1 ? 'cobro' : 'cobros'} (fuera de B; cuentan en el escenario C)</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{eur(data.depositedTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )
          })()}
          <p className="text-xs text-slate-400">
            Importes totales con IVA incluido. Incluye los cobros en efectivo de ventas + los cobros y pagos manuales.
            Los cobros ya ingresados al banco no cuentan aquí: pasan al escenario C. Los manuales son control interno.
          </p>
        </div>
      ) : tab === 'iva' ? (
        <QuarterTable view={data.view} variant="cash" />
      ) : tab === 'mensual' ? (
        <div className="space-y-3">
          <MonthlyCashTable year={year} rows={data.movements.filter((m) => m.kind !== 'manual')} />
          <p className="text-xs text-slate-400">Totales con IVA incluido. Pincha en un mes para ver todos sus cobros. Los cobros manuales no se incluyen (tienen su pestaña).</p>
        </div>
      ) : tab === 'movimientos' ? (
        <MovementsTable rows={data.movements} />
      ) : tab === 'banco' ? (
        <div className="space-y-4">
          {/* Tarjetas + acción */}
          <div className="flex flex-wrap items-stretch gap-4">
            <div className="min-w-44 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ingresado en {year}</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{eur(yearDepositsTotal)}</p>
            </div>
            <div className="min-w-44 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nº de ingresos</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{yearDeposits.length}</p>
            </div>
            <Button className="ml-auto self-center" onClick={() => { setShowNew((s) => !s); setSelected(new Set()) }}>
              <Landmark className="mr-1.5 h-4 w-4" />
              {showNew ? 'Cancelar' : 'Nuevo ingreso al banco'}
            </Button>
          </div>

          {/* Alta de ingreso: selección de cobros */}
          {showNew && (
            <div className="rounded-lg border border-prats-gold/50 bg-prats-beige-light p-4 shadow-sm">
              <p className="mb-1 text-sm font-semibold text-prats-navy">Selecciona los cobros en efectivo que vas a ingresar en el banco</p>
              <p className="mb-3 text-xs text-slate-500">
                Cada cobro seleccionado desaparecerá de la contabilidad en efectivo (B) y pasará a contar en el escenario C con su fecha original.
              </p>
              <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4 md:items-end">
                <div>
                  <label className="text-xs text-slate-500">Fecha del ingreso</label>
                  <Input type="date" value={depDate} onChange={(e) => setDepDate(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Nota (opcional)</label>
                  <Input value={depNote} onChange={(e) => setDepNote(e.target.value)} placeholder="p. ej. Ingreso ventanilla Santander" />
                </div>
                <div className="text-sm">
                  Seleccionado: <b className="tabular-nums">{eur(selectedTotal)}</b>
                  <span className="ml-1 text-xs text-slate-500">({selected.size} cobros)</span>
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-8 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = !allSelected && selected.size > 0 }}
                          onChange={toggleAll}
                          disabled={depositable.length === 0}
                          className="h-4 w-4 cursor-pointer accent-blue-600"
                          title="Seleccionar todos"
                        />
                      </th>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Ticket</th>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {depositable.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No hay cobros en efectivo disponibles.</td></tr>
                    ) : depositable.map((m) => (
                      <tr key={itemKey(m)} className="cursor-pointer hover:bg-slate-50/60" onClick={() => toggleSel(m)}>
                        <td className="px-3 py-2">
                          <input type="checkbox" readOnly checked={selected.has(itemKey(m))} className="h-4 w-4 accent-blue-600" />
                        </td>
                        <td className="px-3 py-2 text-slate-500">{m.date}</td>
                        <td className="px-3 py-2 font-mono text-xs font-medium text-slate-700">{m.ref}</td>
                        <td className="px-3 py-2 text-slate-700">{m.client ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{eur(m.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <Button onClick={onCreateDeposit} disabled={busy || selected.size === 0}>
                  Registrar ingreso de {eur(selectedTotal)}
                </Button>
              </div>
            </div>
          )}

          {/* Lista de depósitos del año */}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Fecha ingreso</th>
                  <th className="px-4 py-2.5 text-left">Nota</th>
                  <th className="px-4 py-2.5 text-right">Nº cobros</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="w-8 px-2 py-2.5" />
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yearDeposits.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Sin ingresos al banco en {year}.</td></tr>
                ) : yearDeposits.map((d) => [
                  <tr key={d.id} className="cursor-pointer hover:bg-slate-50/60" onClick={() => setOpenDep(openDep === d.id ? null : d.id)}>
                    <td className="px-4 py-2.5 text-slate-600">{d.date}</td>
                    <td className="px-4 py-2.5 text-slate-700">{d.note || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{d.items.length}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{eur(d.total)}</td>
                    <td className="px-2 py-2.5 text-slate-400">
                      {openDep === d.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteDeposit(d.id) }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Deshacer
                      </button>
                    </td>
                  </tr>,
                  openDep === d.id && (
                    <tr key={`${d.id}-detail`}>
                      <td colSpan={6} className="bg-slate-50/70 px-4 pb-4 pt-1">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                              <th className="px-2 py-1.5">Fecha cobro</th>
                              <th className="px-2 py-1.5">Ticket</th>
                              <th className="px-2 py-1.5">Cliente</th>
                              <th className="px-2 py-1.5 text-right">Importe</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60">
                            {d.items.map((i) => (
                              <tr key={i.id} className="bg-white">
                                <td className="px-2 py-1.5 text-slate-500">{i.date}</td>
                                <td className="px-2 py-1.5 font-mono font-medium text-slate-700">{i.ref}</td>
                                <td className="px-2 py-1.5 text-slate-700">{i.client ?? '—'}</td>
                                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{eur(i.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ])}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Un ingreso al banco mueve los cobros asociados de la contabilidad en efectivo (B) al escenario C, con su fecha original.
            La contabilidad A no cambia. &quot;Deshacer&quot; devuelve los cobros a B.
            Esta lista muestra los ingresos por su fecha de ingreso; el KPI del Resumen suma los cobros del año que ya están en el banco
            (pueden diferir si un ingreso de enero lleva cobros de diciembre).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Alta manual */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Cobros manuales</p>
              <p className="text-lg font-bold text-emerald-700">{eur(data.manual.inTotal)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Pagos manuales</p>
              <p className="text-lg font-bold text-red-700">{eur(data.manual.outTotal)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Neto</p>
              <p className="text-lg font-bold">{eur(data.manual.inTotal - data.manual.outTotal)}</p>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
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
