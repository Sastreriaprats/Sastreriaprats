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
  total: number
  status?: string
  method?: string
  saleId?: string
  orderId?: string
  pdfUrl?: string
}

const inRange = (date: string, from: string, to: string) =>
  (!from || date >= from) && (!to || date <= to)

const quarterOf = (date: string) => Math.ceil(Number(date.slice(5, 7)) / 3)
const qPeriod = (year: number, q: number) => `${String((q - 1) * 3 + 1).padStart(2, '0')}/${year} – ${String(q * 3).padStart(2, '0')}/${year}`
const pct = (n: number) => `${Number(n) % 1 === 0 ? Number(n) : (Number(n) || 0).toLocaleString('es-ES')} %`

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
      docType: 'Factura', number: f.number, client: f.client, date: f.date, total: f.total,
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

  const onExcel = async () => {
    if (!data) return
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
      { name: 'Movimientos', rows: data.ledger.map((m) => ({
        Fecha: m.date, Tipo: m.type, Concepto: m.concept, 'Cliente/Proveedor': m.client ?? '',
        Base: n2(m.base), IVA: n2(m.vat), Total: n2(m.total),
      })) },
      { name: 'Facturas ingresos', rows: incomeDocs.map((d) => ({
        Tipo: d.docType, 'Nº': d.number, Cliente: d.client, Fecha: d.date, Total: n2(d.total), Estado: d.status ?? '', Pago: d.method ?? '',
      })) },
      { name: 'Facturas gastos', rows: data.apInvoices.map((f) => ({
        'Nº': f.number, Proveedor: f.supplier, Fecha: f.date, Base: n2(f.base), IVA: n2(f.vat),
        'Retención': n2(f.retentionAmount), Total: n2(f.total),
      })) },
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
        <Button variant="outline" size="sm" disabled={!data} onClick={onExcel}>Exportar Excel</Button>
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
      ) : (
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
                    <th className="text-right px-3 py-3">Total</th>
                    <th className="text-left px-3 py-3">Estado</th>
                    <th className="text-left px-3 py-3">Pago</th>
                    <th className="text-right px-3 py-3">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIncomeDocs.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Sin documentos de ingreso.</td></tr>
                  ) : filteredIncomeDocs.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${TYPE_BADGE[d.docType] ?? 'bg-slate-100 text-slate-600'}`}>{d.docType}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{d.number}</td>
                      <td className="px-3 py-2">{d.client || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-slate-500">{d.date}</td>
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
                      <td className="px-3 py-2.5 text-right tabular-nums">{eur(filteredIncomeDocs.reduce((s, d) => s + d.total, 0))}</td>
                      <td colSpan={3} />
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="border-t p-3 text-xs text-slate-400">
                Tickets y facturas del escenario C. Si un ticket o pedido tiene factura emitida, solo figura la factura (sin duplicar).
                El total suma los documentos listados: puede no coincidir con el Resumen C, porque las facturas se listan por su total
                completo aunque se cobraran en efectivo.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-3">Nº</th>
                    <th className="text-left px-3 py-3">Proveedor</th>
                    <th className="text-left px-3 py-3">Fecha</th>
                    <th className="text-right px-3 py-3">Base</th>
                    <th className="text-right px-3 py-3">IVA</th>
                    <th className="text-right px-3 py-3">Retención</th>
                    <th className="text-right px-3 py-3">Total</th>
                    <th className="text-right px-3 py-3">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredApInvoices.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Sin facturas de proveedor.</td></tr>
                  ) : filteredApInvoices.map((f, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{f.number}</td>
                      <td className="px-3 py-2">{f.supplier}</td>
                      <td className="px-3 py-2 text-slate-500">{f.date}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{eur(f.base)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{eur(f.vat)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {f.retentionAmount !== 0
                          ? <span className="text-amber-700">−{eur(f.retentionAmount)} <span className="text-[10px] text-amber-600/80">({pct(f.retentionRate)})</span></span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{eur(f.total)}</td>
                      <td className="px-3 py-2 text-right"><DownloadBtn apPath={f.attachmentPath} /></td>
                    </tr>
                  ))}
                  {filteredApInvoices.length > 0 && (
                    <tr className={TOTAL_ROW}>
                      <td className="px-3 py-2.5" colSpan={5}>TOTAL gastos ({filteredApInvoices.length} facturas)</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{eur(filteredApInvoices.reduce((s, f) => s + f.retentionAmount, 0))}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{eur(filteredApInvoices.reduce((s, f) => s + f.total, 0))}</td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="border-t p-3 text-xs text-slate-400">
                Todas las facturas recibidas de proveedor del año (sin proformas). El total es el importe del documento
                (base + IVA − retención); las retenciones se detallan en su pestaña.
              </p>
            </div>
          )}
        </div>
      )}
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
