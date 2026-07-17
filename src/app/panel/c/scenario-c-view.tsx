'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getViewC } from '@/actions/ops'
import type { ViewC, AccountingView, ApInvoiceLite, VatRateRow } from '@/lib/ops/types'
import { downloadExcelMulti } from '@/lib/excel/export'
import { Tabs, Kpis, QuarterTable, MonthlyFullExpandable, LedgerTable, DownloadBtn, TYPE_BADGE, TOTAL_ROW, PageHeader, YearSelect, eur, MONTH_LABELS, groupByMonth, monthKey } from '../accounting-ui'

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

// Documento de ingreso de la pestaña Facturas: factura emitida o ticket sin factura
type IncomeDoc = {
  docType: 'Factura' | 'Ticket' | 'Sastrería'
  number: string
  client: string
  date: string
  base: number
  vat: number
  total: number
  status?: string
  method?: string
  saleId?: string
  orderId?: string
  pdfUrl?: string
}

// Agregado anual por tercero (cliente o proveedor) para el modelo 347/349
type ThirdPartyRow = {
  name: string
  nif?: string
  byQuarter: [number, number, number, number]
  total: number
  count: number
  extra: number                 // clientes: cobros sin factura · proveedores: retenido
}

// Umbral del modelo 347: operaciones anuales con un tercero > 3.005,06 €
const THRESHOLD_347 = 3005.06

const inRange = (date: string, from: string, to: string) =>
  (!from || date >= from) && (!to || date <= to)

const quarterOf = (date: string) => Math.ceil(Number(date.slice(5, 7)) / 3)
const qPeriod = (year: number, q: number) => `${String((q - 1) * 3 + 1).padStart(2, '0')}/${year} – ${String(q * 3).padStart(2, '0')}/${year}`
const pct = (n: number) => `${Number(n) % 1 === 0 ? Number(n) : (Number(n) || 0).toLocaleString('es-ES')} %`
// Tipo de IVA de un documento emitido. Solo devuelve un número cuando TODO el
// documento va a un único tipo legal (cociente cuota/base ≈ 0/4/10/21). Si mezcla
// tipos —p.ej. un ticket con arreglos al 21% y cobros de pedido de sastrería al 0%—
// el cociente cae en un valor intermedio que no es ningún tipo real, y se devuelve
// null para pintar "mixto" en vez de inventar un 10% o un 0% engañoso.
const docRate = (base: number, vat: number): number | null => {
  const raw = base > 0 ? (vat / base) * 100 : 0
  return [0, 4, 10, 21].find((r) => Math.abs(r - raw) < 0.5) ?? null
}
const rateLabel = (base: number, vat: number) => {
  const r = docRate(base, vat)
  return r === null ? 'mixto' : pct(r)
}

export function ScenarioCView() {
  const [year, setYear] = useState(thisYear)
  const [tab, setTab] = useState('resumen')
  const [data, setData] = useState<ViewC | null>(null)
  const [loading, setLoading] = useState(true)
  // Filtro por rango de fechas (Movimientos y Facturas)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [docSide, setDocSide] = useState<'ingresos' | 'gastos'>('ingresos')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getViewC(year)
    setData(res.ok ? res.data : null)
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  // Ingresos de la pestaña Facturas: todas las facturas emitidas + tickets/cobros
  // sin factura. Si un ticket o pedido tiene factura, solo figura la factura.
  const incomeDocs = useMemo<IncomeDoc[]>(() => {
    if (!data) return []
    const billedSales = new Set(data.invoices.filter((f) => f.saleId).map((f) => f.saleId))
    const billedOrders = new Set(data.invoices.filter((f) => f.orderId).map((f) => f.orderId))
    const docs: IncomeDoc[] = data.invoices.map((f) => ({
      docType: 'Factura', number: f.number, client: f.client, date: f.date,
      base: f.base, vat: f.vat, total: f.total,
      status: f.status, method: f.method, saleId: f.saleId, orderId: f.orderId, pdfUrl: f.pdfUrl,
    }))
    for (const m of data.ledger) {
      if (m.total <= 0) continue
      if (m.type !== 'Ticket' && m.type !== 'Sastrería') continue
      if (m.saleId && billedSales.has(m.saleId)) continue
      if (m.orderId && billedOrders.has(m.orderId)) continue
      docs.push({
        docType: m.type as 'Ticket' | 'Sastrería',
        number: m.concept.replace(/^(Ticket|Sastrería)\s+/, ''),
        client: m.client ?? '',
        date: m.date,
        base: m.base,
        vat: m.vat,
        total: m.total,
        saleId: m.saleId,
        orderId: m.orderId,
      })
    }
    return docs.sort((a, b) => b.date.localeCompare(a.date))
  }, [data])

  const filteredLedger = useMemo(
    () => (data?.ledger ?? []).filter((m) => inRange(m.date, fromDate, toDate)),
    [data, fromDate, toDate],
  )
  const filteredIncomeDocs = useMemo(
    () => incomeDocs.filter((d) => inRange(d.date, fromDate, toDate)),
    [incomeDocs, fromDate, toDate],
  )
  const filteredApInvoices = useMemo(
    () => (data?.apInvoices ?? []).filter((f) => inRange(f.date, fromDate, toDate)).sort((a, b) => b.date.localeCompare(a.date)),
    [data, fromDate, toDate],
  )
  // Facturas recibidas partidas: nacionales/resto vs intracomunitarias (CIF-IVA de otro país UE)
  const apDomestic = useMemo(() => filteredApInvoices.filter((f) => !f.isIntraEU), [filteredApInvoices])
  const apIntraEU = useMemo(() => filteredApInvoices.filter((f) => f.isIntraEU), [filteredApInvoices])
  // Facturas recibidas con retención de IRPF (alquileres 19%, profesionales 15%…)
  const retentionInvoices = useMemo(
    () => (data?.apInvoices ?? []).filter((f) => f.retentionAmount !== 0).sort((a, b) => a.date.localeCompare(b.date)),
    [data],
  )
  // Retenciones a ingresar por trimestre (índice 0..3 = T1..T4)
  const retentionsByQuarter = useMemo(() => {
    const arr = [0, 0, 0, 0]
    for (const f of retentionInvoices) arr[quarterOf(f.date) - 1] += f.retentionAmount
    return arr.map(n2)
  }, [retentionInvoices])

  // --- Agregados anuales por tercero (pestaña Clientes · modelos 347/349) ---
  // CLIENTES: facturado (facturas emitidas, IVA incluido) por trimestre; los
  // cobros del escenario sin factura (tickets/sastrería) van aparte en `extra`.
  const clients347 = useMemo<ThirdPartyRow[]>(() => {
    if (!data) return []
    const map = new Map<string, ThirdPartyRow>()
    const rowFor = (key: string, name: string, nif?: string) => {
      let row = map.get(key)
      if (!row) { row = { name, nif, byQuarter: [0, 0, 0, 0], total: 0, count: 0, extra: 0 }; map.set(key, row) }
      if (!row.nif && nif) row.nif = nif
      return row
    }
    for (const f of data.invoices) {
      const name = f.client.trim() || '(sin nombre)'
      const row = rowFor((f.nif || name).toUpperCase(), name, f.nif)
      const q = quarterOf(f.date)
      if (q >= 1 && q <= 4) row.byQuarter[q - 1] = n2(row.byQuarter[q - 1] + f.total)
      row.total = n2(row.total + f.total)
      row.count += 1
    }
    for (const d of incomeDocs) {
      if (d.docType === 'Factura' || !d.client.trim()) continue
      const name = d.client.trim()
      const row = rowFor(name.toUpperCase(), name)
      row.extra = n2(row.extra + d.total)
    }
    return [...map.values()].sort((a, b) => (b.total + b.extra) - (a.total + a.extra))
  }, [data, incomeDocs])

  // PROVEEDORES nacionales/resto (347): volumen anual base+IVA por trimestre;
  // `extra` = IRPF retenido (esas operaciones se declaran por el 190/180, no el 347).
  const suppliers347 = useMemo<ThirdPartyRow[]>(() => {
    if (!data) return []
    const map = new Map<string, ThirdPartyRow>()
    for (const f of data.apInvoices) {
      if (f.isIntraEU) continue
      const name = f.supplier.trim() || '(sin nombre)'
      const key = (f.cif || name).toUpperCase()
      let row = map.get(key)
      if (!row) { row = { name, nif: f.cif, byQuarter: [0, 0, 0, 0], total: 0, count: 0, extra: 0 }; map.set(key, row) }
      if (!row.nif && f.cif) row.nif = f.cif
      const amount = f.base + f.vat
      const q = quarterOf(f.date)
      if (q >= 1 && q <= 4) row.byQuarter[q - 1] = n2(row.byQuarter[q - 1] + amount)
      row.total = n2(row.total + amount)
      row.extra = n2(row.extra + f.retentionAmount)
      row.count += 1
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [data])

  // PROVEEDORES intracomunitarios (349): se declaran por BASE imponible.
  const suppliersIntra = useMemo<ThirdPartyRow[]>(() => {
    if (!data) return []
    const map = new Map<string, ThirdPartyRow>()
    for (const f of data.apInvoices) {
      if (!f.isIntraEU) continue
      const name = f.supplier.trim() || '(sin nombre)'
      const key = (f.cif || name).toUpperCase()
      let row = map.get(key)
      if (!row) { row = { name, nif: f.cif, byQuarter: [0, 0, 0, 0], total: 0, count: 0, extra: 0 }; map.set(key, row) }
      if (!row.nif && f.cif) row.nif = f.cif
      const q = quarterOf(f.date)
      if (q >= 1 && q <= 4) row.byQuarter[q - 1] = n2(row.byQuarter[q - 1] + f.base)
      row.total = n2(row.total + f.base)
      row.count += 1
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [data])

  // Con el filtro Desde/Hasta activo se exporta SOLO el detalle del rango
  // (movimientos y facturas); sin filtro, el informe anual completo.
  const onExcel = async () => {
    if (!data) return
    const detailSheets = [
      { name: 'Movimientos', rows: filteredLedger.map((m) => ({
        Fecha: m.date, Tipo: m.type, Concepto: m.concept, 'Cliente/Proveedor': m.client ?? '',
        Base: n2(m.base), IVA: n2(m.vat), Total: n2(m.total),
      })) },
      { name: 'Facturas ingresos', rows: filteredIncomeDocs.map((d) => ({
        Tipo: d.docType, 'Nº': d.number, Cliente: d.client, Fecha: d.date,
        Base: n2(d.base), 'Tipo IVA %': docRate(d.base, d.vat) ?? 'mixto', IVA: n2(d.vat), 'Retención': 0,
        Total: n2(d.total), Estado: d.status ?? '', Pago: d.method ?? '',
      })) },
      { name: 'Facturas gastos', rows: apDomestic.map((f) => ({
        'Nº': f.number, Proveedor: f.supplier, CIF: f.cif ?? '', Fecha: f.date,
        Base: n2(f.base), 'Tipo IVA %': f.vatRate ?? 'varios', IVA: n2(f.vat),
        'Tipo retención %': n2(f.retentionRate), 'Retención': n2(f.retentionAmount), Total: n2(f.total),
      })) },
      { name: 'Facturas intracomunitarias', rows: apIntraEU.map((f) => ({
        'Nº': f.number, Proveedor: f.supplier, 'NIF-IVA': f.cif ?? '', Fecha: f.date,
        Base: n2(f.base), IVA: n2(f.vat), Total: n2(f.total),
      })) },
    ]
    if (fromDate || toDate) {
      await downloadExcelMulti(detailSheets, `escenario-c-${fromDate || 'inicio'}-a-${toDate || 'fin'}`)
      return
    }
    await downloadExcelMulti([
      { name: 'Resumen C', rows: METRICS.map(([label, key]) => ({
        'Métrica': label, 'Importe': n2(data.C[key] as number),
      })) },
      { name: 'IVA trimestral C', rows: data.C.quarters.map((q, i) => ({
        Trimestre: q.quarter, Periodo: q.period, 'Base ventas': n2(q.baseSales), 'IVA repercutido': n2(q.ivaRepercutido),
        'Base compras': n2(q.basePurchases), 'IVA soportado': n2(q.ivaSoportado), 'Resultado IVA': n2(q.resultado),
        'Retenciones': n2(retentionsByQuarter[i]), 'Total a liquidar': n2(q.resultado + retentionsByQuarter[i]),
      })) },
      { name: 'IVA soportado por tipo', rows: [1, 2, 3, 4].flatMap((q) =>
        data.vatByRate
          .filter((r) => r.byQuarter[q - 1].base !== 0 || r.byQuarter[q - 1].vat !== 0)
          .map((r) => ({
            Trimestre: `T${q}`, 'Tipo IVA %': r.rate,
            Base: n2(r.byQuarter[q - 1].base), 'Cuota IVA': n2(r.byQuarter[q - 1].vat),
          }))
      ) },
      { name: 'Retenciones', rows: retentionInvoices.map((f) => ({
        Trimestre: `T${quarterOf(f.date)}`, Mes: f.date.slice(0, 7), Fecha: f.date,
        'Nº factura': f.number, Proveedor: f.supplier, Base: n2(f.base), 'IVA': n2(f.vat),
        'Tipo retención %': f.retentionRate, 'Retención': n2(f.retentionAmount), 'Total factura': n2(f.total),
      })) },
      { name: 'Mensual C', rows: data.C.monthly.map((m, i) => ({
        Mes: MONTH_LABELS[i], Ingresos: n2(m.income), Gastos: n2(m.expenses), Resultado: n2(m.income - m.expenses),
      })) },
      { name: '347 Clientes', rows: clients347.map((r) => ({
        Cliente: r.name, NIF: r.nif ?? '', T1: n2(r.byQuarter[0]), T2: n2(r.byQuarter[1]), T3: n2(r.byQuarter[2]), T4: n2(r.byQuarter[3]),
        'Facturado año': n2(r.total), 'Nº facturas': r.count, 'Cobros sin factura': n2(r.extra),
        'Supera 3.005,06': r.total > THRESHOLD_347 ? 'SÍ' : '',
      })) },
      { name: '347 Proveedores', rows: suppliers347.map((r) => ({
        Proveedor: r.name, CIF: r.nif ?? '', T1: n2(r.byQuarter[0]), T2: n2(r.byQuarter[1]), T3: n2(r.byQuarter[2]), T4: n2(r.byQuarter[3]),
        'Total año (con IVA)': n2(r.total), 'Nº facturas': r.count, 'IRPF retenido': n2(r.extra),
        'Supera 3.005,06': r.total > THRESHOLD_347 ? 'SÍ' : '',
      })) },
      { name: '349 Intracomunitarias', rows: suppliersIntra.map((r) => ({
        Proveedor: r.name, 'NIF-IVA': r.nif ?? '', T1: n2(r.byQuarter[0]), T2: n2(r.byQuarter[1]), T3: n2(r.byQuarter[2]), T4: n2(r.byQuarter[3]),
        'Base año': n2(r.total), 'Nº facturas': r.count,
      })) },
      ...detailSheets,
    ], `escenario-c-${year}`)
  }

  const DateRange = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-slate-500">Desde</label>
      <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-40" />
      <label className="text-xs text-slate-500">Hasta</label>
      <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-40" />
      {(fromDate || toDate) && (
        <button onClick={() => { setFromDate(''); setToDate('') }} className="text-xs text-slate-500 underline hover:text-slate-700">
          Quitar filtro
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title="Escenario sin efectivo"
        subtitle={`Ejercicio ${year} · contabilidad sin los cobros en efectivo pendientes de ingresar`}
      >
        <YearSelect
          value={year}
          years={[thisYear, thisYear - 1, thisYear - 2]}
          onChange={(y) => { setYear(y); setFromDate(''); setToDate('') }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!data}
          onClick={onExcel}
          title={fromDate || toDate ? 'Exporta solo los movimientos y facturas del rango filtrado' : 'Exporta el informe anual completo'}
        >
          {fromDate || toDate ? 'Exportar Excel (filtro)' : 'Exportar Excel'}
        </Button>
      </PageHeader>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'iva', label: 'IVA trimestral' },
          { key: 'retenciones', label: 'Retenciones' },
          { key: 'mensual', label: 'Mensual' },
          { key: 'movimientos', label: 'Movimientos' },
          { key: 'facturas', label: 'Facturas' },
          { key: 'terceros', label: 'Clientes · 347' },
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
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
              <span className="text-sm font-semibold text-prats-navy">Resumen del ejercicio</span>
              <span className="text-[11px] uppercase tracking-wider text-slate-400">Ejercicio {year}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5">Métrica</th>
                  <th className="text-right px-4 py-2.5">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {METRICS.map(([label, key]) => (
                  <tr key={key} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{label}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{eur(data.C[key] as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'iva' ? (
        <div className="space-y-5">
          <QuarterTable view={data.C} variant="full" retentions={retentionsByQuarter} />
          <VatByRateTable rows={data.vatByRate} />
        </div>
      ) : tab === 'retenciones' ? (
        <RetentionsTab year={year} invoices={retentionInvoices} />
      ) : tab === 'mensual' ? (
        <div className="space-y-3">
          <MonthlyFullExpandable year={year} view={data.C} rows={data.ledger} />
          <p className="text-xs text-slate-400">Pincha en un mes para ver todos sus movimientos (tickets, cobros, facturas y gastos) y descargar sus documentos.</p>
        </div>
      ) : tab === 'movimientos' ? (
        <div className="space-y-3">
          {DateRange}
          <LedgerTable rows={filteredLedger} />
        </div>
      ) : tab === 'facturas' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs
              variant="segmented"
              active={docSide}
              onChange={(k) => setDocSide(k as 'ingresos' | 'gastos')}
              tabs={[
                { key: 'ingresos', label: 'Ingresos' },
                { key: 'gastos', label: 'Gastos' },
              ]}
            />
            {DateRange}
          </div>

          {docSide === 'ingresos' ? (
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-3">Tipo</th>
                    <th className="text-left px-3 py-3">Nº</th>
                    <th className="text-left px-3 py-3">Cliente</th>
                    <th className="text-left px-3 py-3">Fecha</th>
                    <th className="text-right px-3 py-3">Base</th>
                    <th className="text-right px-3 py-3">IVA</th>
                    <th className="text-right px-3 py-3">Retención</th>
                    <th className="text-right px-3 py-3">Total</th>
                    <th className="text-left px-3 py-3">Estado</th>
                    <th className="text-left px-3 py-3">Pago</th>
                    <th className="text-right px-3 py-3">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIncomeDocs.length === 0 ? (
                    <tr><td colSpan={11} className="px-3 py-8 text-center text-slate-400">Sin documentos de ingreso.</td></tr>
                  ) : filteredIncomeDocs.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${TYPE_BADGE[d.docType] ?? 'bg-slate-100 text-slate-600'}`}>{d.docType}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{d.number}</td>
                      <td className="px-3 py-2">{d.client || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-slate-500">{d.date}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{eur(d.base)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {eur(d.vat)} <span className="text-[10px] text-slate-400">({rateLabel(d.base, d.vat)})</span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">—</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{eur(d.total)}</td>
                      <td className="px-3 py-2 capitalize text-slate-500">{d.status ?? '—'}</td>
                      <td className="px-3 py-2 capitalize text-slate-500">{d.method || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <DownloadBtn saleId={d.docType !== 'Factura' ? d.saleId : undefined} orderId={d.docType !== 'Factura' ? d.orderId : undefined} pdfUrl={d.pdfUrl} />
                      </td>
                    </tr>
                  ))}
                  {filteredIncomeDocs.length > 0 && (
                    <tr className={TOTAL_ROW}>
                      <td className="px-3 py-2.5" colSpan={4}>TOTAL ingresos ({filteredIncomeDocs.length} documentos)</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{eur(filteredIncomeDocs.reduce((s, d) => s + d.base, 0))}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{eur(filteredIncomeDocs.reduce((s, d) => s + d.vat, 0))}</td>
                      <td className="px-3 py-2.5 text-right text-slate-400">—</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{eur(filteredIncomeDocs.reduce((s, d) => s + d.total, 0))}</td>
                      <td colSpan={3} />
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="border-t p-3 text-xs text-slate-400">
                Tickets y facturas del escenario C, desglosados en base imponible + IVA (con su tipo). Las facturas emitidas no llevan
                retención de IRPF (actividad no sujeta), por eso la columna va vacía. Si un ticket o pedido tiene factura emitida, solo
                figura la factura (sin duplicar). El total suma los documentos listados por su importe completo: puede desviarse
                ligeramente del Resumen C con documentos de cobro parcial.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <ApInvoicesCard
                title="Facturas recibidas · nacionales y resto"
                tag={`${apDomestic.length} facturas`}
                rows={apDomestic}
                footnote="Facturas recibidas de proveedores nacionales (y de fuera de la UE) del año, sin proformas. El total es el importe
                del documento (base + IVA − retención); las retenciones se detallan en su pestaña. El tipo de IVA sale de las líneas de la
                factura; en las registradas sin desglose se deriva del cociente IVA/base."
              />
              <ApInvoicesCard
                title="Facturas intracomunitarias (UE)"
                tag={`${apIntraEU.length} facturas`}
                rows={apIntraEU}
                intra
                footnote="Proveedores con NIF-IVA de otro país de la UE (adquisiciones intracomunitarias). Llegan sin IVA (inversión del
                sujeto pasivo: el IVA se autorrepercute y deduce a la vez en el 303) y se declaran en el modelo 349, no en el 347."
              />
            </div>
          )}
        </div>
      ) : (
        <ThirdPartiesTab year={year} clients={clients347} suppliers={suppliers347} intra={suppliersIntra} />
      )}
    </div>
  )
}

// Tabla de facturas recibidas de proveedor (gastos), con desglose base / tipo de
// IVA / IVA / retención / total. `intra` = variante intracomunitaria (sin columna
// de retención: esas facturas llegan sin IVA ni IRPF).
function ApInvoicesCard({ title, tag, rows, footnote, intra = false }: {
  title: string
  tag: string
  rows: ApInvoiceLite[]
  footnote: string
  intra?: boolean
}) {
  const cols = intra ? 8 : 9
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold text-prats-navy">{title}</span>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{tag}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-3 py-3">Nº</th>
            <th className="text-left px-3 py-3">Proveedor</th>
            <th className="text-left px-3 py-3">Fecha</th>
            <th className="text-right px-3 py-3">Base</th>
            <th className="text-right px-3 py-3">Tipo IVA</th>
            <th className="text-right px-3 py-3">IVA</th>
            {!intra && <th className="text-right px-3 py-3">Retención</th>}
            <th className="text-right px-3 py-3">Total</th>
            <th className="text-right px-3 py-3">PDF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={cols} className="px-3 py-8 text-center text-slate-400">Sin facturas.</td></tr>
          ) : rows.map((f, i) => (
            <tr key={i} className="hover:bg-slate-50/50">
              <td className="px-3 py-2 font-mono text-xs text-slate-700">{f.number}</td>
              <td className="px-3 py-2">
                {f.supplier}
                {intra && f.cif && <span className="ml-1.5 text-[10px] font-mono text-slate-400">{f.cif}</span>}
              </td>
              <td className="px-3 py-2 text-slate-500">{f.date}</td>
              <td className="px-3 py-2 text-right tabular-nums">{eur(f.base)}</td>
              <td className="px-3 py-2 text-right text-slate-500">{f.vatRate === null ? 'varios' : pct(f.vatRate)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{eur(f.vat)}</td>
              {!intra && (
                <td className="px-3 py-2 text-right tabular-nums">
                  {f.retentionAmount !== 0
                    ? <span className="text-amber-700">−{eur(f.retentionAmount)} <span className="text-[10px] text-amber-600/80">({pct(f.retentionRate)})</span></span>
                    : <span className="text-slate-300">—</span>}
                </td>
              )}
              <td className="px-3 py-2 text-right font-medium tabular-nums">{eur(f.total)}</td>
              <td className="px-3 py-2 text-right"><DownloadBtn apPath={f.attachmentPath} /></td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className={TOTAL_ROW}>
              <td className="px-3 py-2.5" colSpan={3}>TOTAL ({rows.length} facturas)</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{eur(rows.reduce((s, f) => s + f.base, 0))}</td>
              <td />
              <td className="px-3 py-2.5 text-right tabular-nums">{eur(rows.reduce((s, f) => s + f.vat, 0))}</td>
              {!intra && (
                <td className="px-3 py-2.5 text-right tabular-nums">{eur(rows.reduce((s, f) => s + f.retentionAmount, 0))}</td>
              )}
              <td className="px-3 py-2.5 text-right tabular-nums">{eur(rows.reduce((s, f) => s + f.total, 0))}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t p-3 text-xs text-slate-400">{footnote}</p>
    </div>
  )
}

// Pestaña Clientes · 347: cuánto se ha facturado/cobrado a cada cliente y cuánto
// ha facturado cada proveedor en el año, con desglose trimestral (el 347 se
// declara por trimestres) y marca sobre los que superan los 3.005,06 €.
function ThirdPartiesTab({ year, clients, suppliers, intra }: {
  year: number
  clients: ThirdPartyRow[]
  suppliers: ThirdPartyRow[]
  intra: ThirdPartyRow[]
}) {
  const [side, setSide] = useState<'clientes' | 'proveedores'>('clientes')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const match = (r: ThirdPartyRow) =>
    !q || r.name.toLowerCase().includes(q) || (r.nif ?? '').toLowerCase().includes(q)

  const over347 = (side === 'clientes' ? clients : suppliers).filter((r) => r.total > THRESHOLD_347).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          variant="segmented"
          active={side}
          onChange={(k) => setSide(k as 'clientes' | 'proveedores')}
          tabs={[
            { key: 'clientes', label: 'Clientes' },
            { key: 'proveedores', label: 'Proveedores' },
          ]}
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            <span className="font-semibold text-prats-navy">{over347}</span> superan el umbral del 347 ({eur(THRESHOLD_347)})
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o NIF…"
            className="h-8 w-56"
          />
        </div>
      </div>

      {side === 'clientes' ? (
        <ThirdPartyTable
          title="Facturación por cliente"
          tag={`Ejercicio ${year}`}
          nameLabel="Cliente"
          totalLabel="Facturado año"
          extraLabel="Cobros sin factura"
          rows={clients.filter(match)}
          footnote="Facturado = facturas emitidas del año (IVA incluido, criterio del 347), con su desglose por trimestre. «Cobros sin
          factura» son los tickets y cobros de sastrería del escenario C sin factura asociada: no van al 347, pero sirven para ver el
          volumen real por cliente. En dorado, los clientes que superan los 3.005,06 € facturados (declarables en el 347)."
        />
      ) : (
        <div className="space-y-5">
          <ThirdPartyTable
            title="Compras por proveedor · nacionales y resto (347)"
            tag={`Ejercicio ${year}`}
            nameLabel="Proveedor"
            totalLabel="Total año (con IVA)"
            extraLabel="IRPF retenido"
            rows={suppliers.filter(match)}
            footnote="Volumen anual por proveedor: base + IVA de sus facturas recibidas (criterio del 347), por trimestre. En dorado, los
            que superan los 3.005,06 €. Ojo: las operaciones con retención de IRPF (profesionales, alquileres) ya se declaran en los
            modelos 190/180 y no se incluyen en el 347."
          />
          <ThirdPartyTable
            title="Proveedores intracomunitarios (349)"
            tag={`Ejercicio ${year}`}
            nameLabel="Proveedor"
            totalLabel="Base año"
            rows={intra.filter(match)}
            noThreshold
            footnote="Adquisiciones intracomunitarias por proveedor, en BASE imponible (criterio del modelo 349, que no tiene umbral
            mínimo). Estas operaciones van al 349, no al 347."
          />
        </div>
      )}
    </div>
  )
}

// Tabla genérica de agregado anual por tercero con desglose trimestral.
function ThirdPartyTable({ title, tag, nameLabel, totalLabel, extraLabel, rows, footnote, noThreshold = false }: {
  title: string
  tag: string
  nameLabel: string
  totalLabel: string
  extraLabel?: string
  rows: ThirdPartyRow[]
  footnote: string
  noThreshold?: boolean
}) {
  const cols = 8 + (extraLabel ? 1 : 0)
  const sum = (fn: (r: ThirdPartyRow) => number) => rows.reduce((s, r) => s + fn(r), 0)
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold text-prats-navy">{title}</span>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{tag}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-3 py-3">{nameLabel}</th>
            <th className="text-left px-3 py-3">NIF</th>
            <th className="text-right px-3 py-3">T1</th>
            <th className="text-right px-3 py-3">T2</th>
            <th className="text-right px-3 py-3">T3</th>
            <th className="text-right px-3 py-3">T4</th>
            <th className="text-right px-3 py-3">{totalLabel}</th>
            {extraLabel && <th className="text-right px-3 py-3">{extraLabel}</th>}
            <th className="text-right px-3 py-3">Nº docs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={cols} className="px-3 py-8 text-center text-slate-400">Sin registros.</td></tr>
          ) : rows.map((r, i) => {
            const over = !noThreshold && r.total > THRESHOLD_347
            return (
              <tr key={i} className={over ? 'bg-prats-gold/5 hover:bg-prats-gold/10' : 'hover:bg-slate-50/50'}>
                <td className="px-3 py-2 font-medium text-slate-700">
                  {r.name}
                  {over && (
                    <span className="ml-1.5 rounded bg-prats-gold/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-prats-gold">347</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.nif ?? <span className="text-slate-300">—</span>}</td>
                {r.byQuarter.map((v, j) => (
                  <td key={j} className="px-3 py-2 text-right tabular-nums text-slate-600">{v !== 0 ? eur(v) : <span className="text-slate-300">—</span>}</td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{r.total !== 0 ? eur(r.total) : <span className="text-slate-300">—</span>}</td>
                {extraLabel && (
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.extra !== 0 ? eur(r.extra) : <span className="text-slate-300">—</span>}</td>
                )}
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.count || '—'}</td>
              </tr>
            )
          })}
          {rows.length > 0 && (
            <tr className={TOTAL_ROW}>
              <td className="px-3 py-2.5" colSpan={2}>TOTAL ({rows.length})</td>
              {[0, 1, 2, 3].map((j) => (
                <td key={j} className="px-3 py-2.5 text-right tabular-nums">{eur(sum((r) => r.byQuarter[j]))}</td>
              ))}
              <td className="px-3 py-2.5 text-right tabular-nums">{eur(sum((r) => r.total))}</td>
              {extraLabel && <td className="px-3 py-2.5 text-right tabular-nums">{eur(sum((r) => r.extra))}</td>}
              <td className="px-3 py-2.5 text-right tabular-nums">{sum((r) => r.count)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t p-3 text-xs text-slate-400">{footnote}</p>
    </div>
  )
}

// Desglose del IVA soportado por tipo impositivo (0/10/21…) y trimestre.
// Las facturas registradas con líneas usan su desglose real; las de solo
// cabecera derivan el tipo del cociente IVA/base.
function VatByRateTable({ rows }: { rows: VatRateRow[] }) {
  const cells = [1, 2, 3, 4].flatMap((q) =>
    rows
      .filter((r) => r.byQuarter[q - 1].base !== 0 || r.byQuarter[q - 1].vat !== 0)
      .map((r) => ({ q, rate: r.rate, base: r.byQuarter[q - 1].base, vat: r.byQuarter[q - 1].vat })),
  )
  const totBase = rows.reduce((s, r) => s + r.base, 0)
  const totVat = rows.reduce((s, r) => s + r.vat, 0)
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold text-prats-navy">IVA soportado por tipo impositivo</span>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">Facturas recibidas</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="text-left px-4 py-2.5">Trimestre</th>
            <th className="text-left px-4 py-2.5">Tipo</th>
            <th className="text-right px-4 py-2.5">Base</th>
            <th className="text-right px-4 py-2.5">Cuota IVA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cells.length === 0 ? (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Sin facturas recibidas.</td></tr>
          ) : cells.map((c, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className="px-4 py-2.5 font-semibold text-slate-700">{i === 0 || cells[i - 1].q !== c.q ? `T${c.q}` : ''}</td>
              <td className="px-4 py-2.5 text-slate-600">{pct(c.rate)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{eur(c.base)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{eur(c.vat)}</td>
            </tr>
          ))}
          {cells.length > 0 && (
            <tr className={TOTAL_ROW}>
              <td className="px-4 py-2.5" colSpan={2}>TOTAL año</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{eur(totBase)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{eur(totVat)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t p-3 text-xs text-slate-400">
        Desglose por tipo del IVA soportado en facturas recibidas. Las facturas registradas sin desglose de líneas se
        clasifican por su tipo efectivo (IVA / base).
      </p>
    </div>
  )
}

// Retenciones de IRPF de las facturas recibidas: resumen por trimestre y
// detalle mensual desplegable con las facturas concretas y su PDF.
function RetentionsTab({ year, invoices }: { year: number; invoices: ApInvoiceLite[] }) {
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const byMonth = groupByMonth(invoices)
  const byQuarter = [1, 2, 3, 4].map((q) => {
    const rows = invoices.filter((f) => quarterOf(f.date) === q)
    return {
      q,
      count: rows.length,
      base: rows.reduce((s, f) => s + f.base, 0),
      retention: rows.reduce((s, f) => s + f.retentionAmount, 0),
    }
  })
  const totBase = invoices.reduce((s, f) => s + f.base, 0)
  const totRet = invoices.reduce((s, f) => s + f.retentionAmount, 0)

  const detailTable = (rows: ApInvoiceLite[]) => (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
          <th className="px-2 py-1.5">Fecha</th>
          <th className="px-2 py-1.5">Nº factura</th>
          <th className="px-2 py-1.5">Proveedor</th>
          <th className="px-2 py-1.5 text-right">Base</th>
          <th className="px-2 py-1.5 text-right">Tipo</th>
          <th className="px-2 py-1.5 text-right">Retención</th>
          <th className="px-2 py-1.5 text-right">Total factura</th>
          <th className="px-2 py-1.5 text-right">PDF</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200/60">
        {rows.map((f, j) => (
          <tr key={j} className="bg-white">
            <td className="px-2 py-1.5 text-slate-500">{f.date}</td>
            <td className="px-2 py-1.5 font-mono font-medium text-slate-700">{f.number}</td>
            <td className="px-2 py-1.5 text-slate-700">{f.supplier}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{eur(f.base)}</td>
            <td className="px-2 py-1.5 text-right text-slate-600">{pct(f.retentionRate)}</td>
            <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-amber-700">{eur(f.retentionAmount)}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{eur(f.total)}</td>
            <td className="px-2 py-1.5 text-right"><DownloadBtn apPath={f.attachmentPath} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-prats-navy">Retenciones por trimestre</span>
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Ejercicio {year}</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5">Trimestre</th>
              <th className="text-left px-4 py-2.5">Periodo</th>
              <th className="text-right px-4 py-2.5">Nº facturas</th>
              <th className="text-right px-4 py-2.5">Base sujeta</th>
              <th className="text-right px-4 py-2.5">Retención</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {byQuarter.map((r) => (
              <tr key={r.q} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-semibold text-slate-700">T{r.q}</td>
                <td className="px-4 py-2.5 text-slate-500">{qPeriod(year, r.q)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{r.count || '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.count ? eur(r.base) : '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.count ? eur(r.retention) : '—'}</td>
              </tr>
            ))}
            <tr className={TOTAL_ROW}>
              <td className="px-4 py-2.5" colSpan={2}>TOTAL año</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{invoices.length || '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{eur(totBase)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{eur(totRet)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-prats-navy">Retenciones por mes</span>
          <span className="text-[11px] uppercase tracking-wider text-slate-400">Pincha en un mes para ver sus facturas</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-2.5">Mes</th>
              <th className="text-right px-4 py-2.5">Nº facturas</th>
              <th className="text-right px-4 py-2.5">Base sujeta</th>
              <th className="text-right px-4 py-2.5">Retención</th>
              <th className="w-8 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MONTH_LABELS.map((label, i) => {
              const key = monthKey(year, i)
              const monthRows = byMonth[key] ?? []
              const isOpen = openMonth === key
              return [
                <tr
                  key={key}
                  onClick={() => monthRows.length > 0 && setOpenMonth(isOpen ? null : key)}
                  className={monthRows.length > 0 ? 'cursor-pointer hover:bg-slate-50/60' : ''}
                >
                  <td className="px-4 py-2.5 font-medium text-slate-600">{label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{monthRows.length || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{monthRows.length ? eur(monthRows.reduce((s, f) => s + f.base, 0)) : '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{monthRows.length ? eur(monthRows.reduce((s, f) => s + f.retentionAmount, 0)) : '—'}</td>
                  <td className="px-4 py-2.5 text-slate-400">
                    {monthRows.length > 0 && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${key}-detail`}>
                    <td colSpan={5} className="bg-slate-50/70 px-4 pb-4 pt-1">{detailTable(monthRows)}</td>
                  </tr>
                ),
              ]
            })}
          </tbody>
        </table>
        <p className="border-t p-3 text-xs text-slate-400">
          Retenciones de IRPF practicadas en facturas recibidas (profesionales 15% · alquileres 19%). La retención se
          descuenta del pago al proveedor y se ingresa a Hacienda en el trimestre correspondiente (modelos 111 / 115).
        </p>
      </div>
    </div>
  )
}
