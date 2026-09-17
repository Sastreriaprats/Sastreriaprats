'use client'

import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import { TrendingUp, TrendingDown, Wallet, Receipt, Percent, Hash, Landmark, Download, Loader2, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { getTicketData, getOrderTicketData, getOnlineTicketData, getApInvoicePdfUrl, getIssuedInvoicePdfUrls } from '@/actions/ops'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'
import { generateTailoringOrderTicketPdf, type TailoringTicketOrder } from '@/lib/pdf/tailoring-order-ticket'
import type { AccountingView, MovementRow, LedgerMovement } from '@/lib/ops/types'

export const eur = (n: number) =>
  `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

// Cabecera de página del panel: título + subtítulo del ejercicio + acciones.
export function PageHeader({ title, subtitle, children }: {
  title: string; subtitle: string; children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-prats-navy">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

// Selector de ejercicio con estilo propio del panel.
export function YearSelect({ value, years, onChange }: { value: number; years: number[]; onChange: (y: number) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Ejercicio</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-transparent font-medium text-prats-navy outline-none"
      >
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </label>
  )
}

export const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Tarjeta de indicador estilo financiero: etiqueta discreta arriba, cifra grande
// en tinta. `featured` = tarjeta destacada en navy (el dato clave de la vista).
function KpiCard({ label, value, icon: Icon, featured, negative }: {
  label: string; value: string; icon: LucideIcon; featured?: boolean; negative?: boolean
}) {
  if (featured) {
    return (
      <div className="rounded-lg border border-prats-navy bg-prats-navy p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{label}</span>
          <Icon className="h-4 w-4 text-prats-gold" />
        </div>
        <p className="mt-3 text-[26px] font-semibold leading-none text-white">{value}</p>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-slate-300" />
      </div>
      <p className={`mt-3 text-[26px] font-semibold leading-none ${negative ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

export function Kpis({ view, variant, deposited, available }: {
  view: AccountingView; variant: 'cash' | 'full'; deposited?: number; available?: number
}) {
  if (variant === 'cash') {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Efectivo cobrado (total)" value={eur(view.income + view.ivaRepercutido)} icon={Wallet} />
        <KpiCard label="Nº de cobros" value={String(view.salesCount)} icon={Hash} />
        <KpiCard label="Ingresado al banco (año)" value={eur(deposited ?? 0)} icon={Landmark} />
        <KpiCard label="Efectivo disponible (neto)" value={eur(available ?? view.income + view.ivaRepercutido)} icon={Receipt} featured />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard label="Ingresos (base)" value={eur(view.income)} icon={TrendingUp} />
      <KpiCard label="Gastos (base)" value={eur(view.expenses)} icon={TrendingDown} />
      <KpiCard label="Resultado neto" value={eur(view.profit)} icon={Receipt} negative={view.profit < 0} featured={view.profit >= 0} />
      <KpiCard label="IVA a ingresar" value={eur(view.vatToPay)} icon={Percent} />
    </div>
  )
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">{children}</div>
}
const TH = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500'
const THR = TH + ' text-right'
const TD = 'px-4 py-2.5'
const TDR = TD + ' text-right tabular-nums'
// Fila de total al estilo contable: doble línea superior
export const TOTAL_ROW = 'border-t-[3px] border-double border-slate-300 bg-slate-50 font-semibold text-slate-900'

// `retentions` (opcional, solo variant 'full'): retenciones de IRPF a ingresar
// por trimestre (índice 0..3 = T1..T4). Añade las columnas Retenciones y
// Total a liquidar (resultado de IVA + retenciones = lo que se paga a Hacienda).
// `ledger` (opcional): con él, cada trimestre se despliega al pincharlo y muestra
// todos sus movimientos (ingresos y facturas recibidas) con su base e IVA.
export function QuarterTable({ view, variant, retentions, ledger }: { view: AccountingView; variant: 'cash' | 'full'; retentions?: number[]; ledger?: LedgerMovement[] }) {
  const cash = variant === 'cash'
  const hasRet = !cash && retentions !== undefined
  const retQ = (i: number) => retentions?.[i] ?? 0
  const [open, setOpen] = useState<string | null>(null)
  const cols = 5 + (cash ? 0 : 2) + (hasRet ? 2 : 0)
  const monthsOfQuarter = (i: number) => view.monthlyVat.slice(i * 3, i * 3 + 3).map((m) => m.month)
  const tot = view.quarters.reduce((a, q, i) => ({
    bs: a.bs + q.baseSales, rep: a.rep + q.ivaRepercutido, bp: a.bp + q.basePurchases, sop: a.sop + q.ivaSoportado,
    ret: a.ret + retQ(i),
  }), { bs: 0, rep: 0, bp: 0, sop: 0, ret: 0 })
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Trimestre</th>
            <th className={TH}>Periodo</th>
            <th className={THR}>Base ventas</th>
            <th className={THR}>IVA repercutido</th>
            {!cash && <th className={THR}>Base compras</th>}
            {!cash && <th className={THR}>IVA soportado</th>}
            <th className={THR}>{cash ? 'IVA efectivo' : hasRet ? 'Resultado IVA' : 'Resultado'}</th>
            {hasRet && <th className={THR}>Retenciones</th>}
            {hasRet && <th className={THR}>Total a liquidar</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {view.quarters.map((q, i) => (
            <Fragment key={q.quarter}>
              <tr
                className={`hover:bg-slate-50/60 ${ledger ? 'cursor-pointer' : ''}`}
                onClick={ledger ? () => setOpen((o) => (o === q.quarter ? null : q.quarter)) : undefined}
              >
                <td className={`${TD} font-semibold text-slate-700`}>
                  {ledger && (open === q.quarter
                    ? <ChevronDown className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                    : <ChevronRight className="mr-1 inline h-3.5 w-3.5 text-slate-400" />)}
                  {q.quarter}
                </td>
                <td className={`${TD} text-slate-500`}>{q.period}</td>
                <td className={TDR}>{eur(q.baseSales)}</td>
                <td className={TDR}>{eur(q.ivaRepercutido)}</td>
                {!cash && <td className={TDR}>{eur(q.basePurchases)}</td>}
                {!cash && <td className={TDR}>{eur(q.ivaSoportado)}</td>}
                <td className={`${TDR} ${hasRet ? '' : 'font-semibold'}`}>{eur(cash ? q.ivaRepercutido : q.resultado)}</td>
                {hasRet && <td className={TDR}>{eur(retQ(i))}</td>}
                {hasRet && <td className={`${TDR} font-semibold`}>{eur(q.resultado + retQ(i))}</td>}
              </tr>
              {ledger && open === q.quarter && (
                <tr>
                  <td colSpan={cols} className="bg-slate-50/60 p-3">
                    <VatPeriodDetail ledger={ledger} months={monthsOfQuarter(i)} title={`Detalle de ${q.quarter} (${q.period})`} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          <tr className={TOTAL_ROW}>
            <td className={TD} colSpan={2}>TOTAL año</td>
            <td className={TDR}>{eur(tot.bs)}</td>
            <td className={TDR}>{eur(tot.rep)}</td>
            {!cash && <td className={TDR}>{eur(tot.bp)}</td>}
            {!cash && <td className={TDR}>{eur(tot.sop)}</td>}
            <td className={TDR}>{eur(cash ? tot.rep : tot.rep - tot.sop)}</td>
            {hasRet && <td className={TDR}>{eur(tot.ret)}</td>}
            {hasRet && <td className={TDR}>{eur(tot.rep - tot.sop + tot.ret)}</td>}
          </tr>
        </tbody>
      </table>
      {hasRet && (
        <p className="border-t p-3 text-xs text-slate-400">
          Total a liquidar = resultado de IVA (modelo 303) + retenciones de IRPF de facturas recibidas (modelos 111/115).
          Las retenciones se pagan siempre, aunque el IVA del trimestre salga a compensar.
        </p>
      )}
    </TableShell>
  )
}

// IVA por MES con subtotal de cada trimestre (las filas de subtotal salen de
// view.quarters, que suman exactamente sus tres meses). `retentions`: índice
// 0..11 = enero..diciembre; mismas columnas que QuarterTable.
export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export function MonthVatTable({ view, variant, retentions, ledger }: { view: AccountingView; variant: 'cash' | 'full'; retentions?: number[]; ledger?: LedgerMovement[] }) {
  const cash = variant === 'cash'
  const hasRet = !cash && retentions !== undefined
  const retM = (i: number) => retentions?.[i] ?? 0
  const [open, setOpen] = useState<string | null>(null)
  const cols = 4 + (cash ? 0 : 2) + (hasRet ? 2 : 0)
  const retQ = (q: number) => retM(q * 3) + retM(q * 3 + 1) + retM(q * 3 + 2)
  const tot = view.quarters.reduce((a, q, i) => ({
    bs: a.bs + q.baseSales, rep: a.rep + q.ivaRepercutido, bp: a.bp + q.basePurchases, sop: a.sop + q.ivaSoportado,
    ret: a.ret + retQ(i),
  }), { bs: 0, rep: 0, bp: 0, sop: 0, ret: 0 })
  const cells = (r: { baseSales: number; ivaRepercutido: number; basePurchases: number; ivaSoportado: number; resultado: number }, ret: number, strong: boolean) => (
    <>
      <td className={TDR}>{eur(r.baseSales)}</td>
      <td className={TDR}>{eur(r.ivaRepercutido)}</td>
      {!cash && <td className={TDR}>{eur(r.basePurchases)}</td>}
      {!cash && <td className={TDR}>{eur(r.ivaSoportado)}</td>}
      <td className={`${TDR} ${!hasRet && strong ? 'font-semibold' : ''}`}>{eur(cash ? r.ivaRepercutido : r.resultado)}</td>
      {hasRet && <td className={TDR}>{eur(ret)}</td>}
      {hasRet && <td className={`${TDR} ${strong ? 'font-semibold' : ''}`}>{eur(r.resultado + ret)}</td>}
    </>
  )
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Mes</th>
            <th className={THR}>Base ventas</th>
            <th className={THR}>IVA repercutido</th>
            {!cash && <th className={THR}>Base compras</th>}
            {!cash && <th className={THR}>IVA soportado</th>}
            <th className={THR}>{cash ? 'IVA efectivo' : hasRet ? 'Resultado IVA' : 'Resultado'}</th>
            {hasRet && <th className={THR}>Retenciones</th>}
            {hasRet && <th className={THR}>Total a liquidar</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {view.quarters.map((q, qi) => (
            <Fragment key={q.quarter}>
              {view.monthlyVat.slice(qi * 3, qi * 3 + 3).map((m, k) => (
                <Fragment key={m.month}>
                  <tr
                    className={`hover:bg-slate-50/60 ${ledger ? 'cursor-pointer' : ''}`}
                    onClick={ledger ? () => setOpen((o) => (o === m.month ? null : m.month)) : undefined}
                  >
                    <td className={`${TD} text-slate-700`}>
                      {ledger && (open === m.month
                        ? <ChevronDown className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                        : <ChevronRight className="mr-1 inline h-3.5 w-3.5 text-slate-400" />)}
                      {MONTH_NAMES[qi * 3 + k]}
                    </td>
                    {cells(m, retM(qi * 3 + k), false)}
                  </tr>
                  {ledger && open === m.month && (
                    <tr>
                      <td colSpan={cols} className="bg-slate-50/60 p-3">
                        <VatPeriodDetail ledger={ledger} months={[m.month]} title={`Detalle de ${MONTH_NAMES[qi * 3 + k]}`} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr
                className={`bg-slate-50/80 font-semibold text-slate-800 ${ledger ? 'cursor-pointer' : ''}`}
                onClick={ledger ? () => setOpen((o) => (o === q.quarter ? null : q.quarter)) : undefined}
              >
                <td className={TD}>
                  {ledger && (open === q.quarter
                    ? <ChevronDown className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                    : <ChevronRight className="mr-1 inline h-3.5 w-3.5 text-slate-400" />)}
                  Total {q.quarter} <span className="font-normal text-slate-400">({q.period})</span>
                </td>
                {cells(q, retQ(qi), true)}
              </tr>
              {ledger && open === q.quarter && (
                <tr>
                  <td colSpan={cols} className="bg-slate-50/60 p-3">
                    <VatPeriodDetail
                      ledger={ledger}
                      months={view.monthlyVat.slice(qi * 3, qi * 3 + 3).map((m) => m.month)}
                      title={`Detalle de ${q.quarter} (${q.period})`}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          <tr className={TOTAL_ROW}>
            <td className={TD}>TOTAL año</td>
            <td className={TDR}>{eur(tot.bs)}</td>
            <td className={TDR}>{eur(tot.rep)}</td>
            {!cash && <td className={TDR}>{eur(tot.bp)}</td>}
            {!cash && <td className={TDR}>{eur(tot.sop)}</td>}
            <td className={TDR}>{eur(cash ? tot.rep : tot.rep - tot.sop)}</td>
            {hasRet && <td className={TDR}>{eur(tot.ret)}</td>}
            {hasRet && <td className={TDR}>{eur(tot.rep - tot.sop + tot.ret)}</td>}
          </tr>
        </tbody>
      </table>
      {hasRet && (
        <p className="border-t p-3 text-xs text-slate-400">
          Desglose mensual informativo: el modelo 303 y los 111/115 se presentan por trimestre (filas de total). Las retenciones
          van por la fecha de la factura recibida.
        </p>
      )}
    </TableShell>
  )
}

// Detalle de un periodo del IVA: todos los documentos que forman sus cifras,
// separados en ingresos (IVA repercutido) y facturas recibidas (soportado), con
// su base, su cuota y el enlace a cada documento.
function VatPeriodDetail({ ledger, months, title }: { ledger: LedgerMovement[]; months: string[]; title: string }) {
  const rows = ledger.filter((m) => months.includes(m.date.slice(0, 7)))
  // Por TIPO, no por signo: un abono de proveedor tiene importe positivo y sigue
  // siendo una factura recibida (si no, se colaría en los ingresos).
  const isExpense = (m: LedgerMovement) => m.type === 'Factura recibida'
  const income = rows.filter((m) => !isExpense(m)).sort((a, b) => a.date.localeCompare(b.date))
  const expense = rows.filter(isExpense).sort((a, b) => a.date.localeCompare(b.date))
  // Con signo: los abonos restan (así los totales cuadran con la tabla de IVA)
  const sum = (arr: LedgerMovement[], k: 'base' | 'vat') => arr.reduce((s, m) => s + m[k], 0)
  const block = (label: string, arr: LedgerMovement[], baseLabel: string, vatLabel: string) => (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-semibold text-prats-navy">{label}</span>
        <span className="text-[11px] text-slate-500">
          {arr.length} docs · {baseLabel} {eur(sum(arr, 'base'))} · {vatLabel} {eur(sum(arr, 'vat'))}
        </span>
      </div>
      {arr.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-slate-400">Sin documentos.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left">Fecha</th>
              <th className="px-2 py-1.5 text-left">Tipo</th>
              <th className="px-2 py-1.5 text-left">Concepto</th>
              <th className="px-2 py-1.5 text-left">Cliente/Proveedor</th>
              <th className="px-2 py-1.5 text-right">Base</th>
              <th className="px-2 py-1.5 text-right">Cuota IVA</th>
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="px-2 py-1.5 text-right">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {arr.map((m, i) => (
              <tr key={i} className="hover:bg-slate-50/60">
                <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{m.date}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">{m.type}</td>
                <td className="px-2 py-1.5 text-slate-700">{m.concept}</td>
                <td className="px-2 py-1.5 text-slate-600">{m.client ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{eur(m.base)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{eur(m.vat)}</td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">{eur(Math.abs(m.total))}</td>
                <td className="px-2 py-1.5 text-right">
                  <DownloadBtn saleId={m.saleId} orderId={m.orderId} onlineOrderId={m.onlineOrderId} pdfUrl={m.pdfUrl} apPath={m.apPath} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      {block('Ingresos (IVA repercutido)', income, 'base', 'IVA')}
      {block('Facturas recibidas (IVA soportado)', expense, 'base', 'IVA')}
      <p className="text-[11px] text-slate-400">
        Los totales pueden diferir de la fila en unos céntimos: aquí cada documento va redondeado y la fila suma sin redondear.
      </p>
    </div>
  )
}

// `invoiceId` (solo escenario C): factura emitida sin PDF guardado → se genera al pulsar.
export function DownloadBtn({ saleId, orderId, onlineOrderId, pdfUrl, apPath, invoiceId }: { saleId?: string; orderId?: string; onlineOrderId?: string; pdfUrl?: string; apPath?: string; invoiceId?: string }) {
  const [loading, setLoading] = useState(false)
  if (!saleId && !orderId && !onlineOrderId && !pdfUrl && !apPath && !invoiceId) return <span className="text-slate-300">—</span>
  const go = async () => {
    setLoading(true)
    try {
      if (saleId) {
        const res = await getTicketData(saleId)
        if (!res.ok) { toast.error('Ticket no disponible'); return }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await generateTicketPdf(res.data as any)
      } else if (orderId) {
        const res = await getOrderTicketData(orderId)
        if (!res.ok) { toast.error('Pedido no disponible'); return }
        await generateTailoringOrderTicketPdf(res.data as unknown as TailoringTicketOrder)
      } else if (onlineOrderId) {
        const res = await getOnlineTicketData(onlineOrderId)
        if (!res.ok) { toast.error('Ticket no disponible'); return }
        await generateTicketPdf(res.data)
      } else if (pdfUrl) {
        window.open(pdfUrl, '_blank', 'noopener')
      } else if (apPath) {
        const res = await getApInvoicePdfUrl(apPath)
        if (!res.ok) { toast.error('PDF no disponible'); return }
        window.open(res.data.url, '_blank', 'noopener')
      } else if (invoiceId) {
        const res = await getIssuedInvoicePdfUrls([invoiceId])
        const url = res.ok ? res.data[0]?.url : null
        if (!url) { toast.error('PDF no disponible'); return }
        window.open(url, '_blank', 'noopener')
      }
    } catch {
      toast.error('No se pudo generar el PDF')
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      onClick={go}
      disabled={loading}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-prats-navy disabled:opacity-50"
      title={apPath ? 'Descargar factura del proveedor (PDF)' : 'Descargar ticket en PDF'}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
    </button>
  )
}

// Cobros en efectivo de la capa B: totales con IVA incluido (sin separar base/IVA).
export function MovementsTable({ rows }: { rows: MovementRow[] }) {
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Fecha</th>
            <th className={TH}>Ticket</th>
            <th className={TH}>Método</th>
            <th className={TH}>Cliente</th>
            <th className={THR}>Total</th>
            <th className={THR}>PDF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Sin movimientos.</td></tr>
          ) : rows.map((m, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className={`${TD} text-slate-500`}>{m.date}</td>
              <td className={`${TD} font-mono text-xs font-medium text-slate-700`}>{m.ref}</td>
              <td className={`${TD} capitalize text-slate-600`}>{m.method}</td>
              <td className={`${TD} text-slate-700`}>{m.client ?? <span className="text-slate-300">—</span>}</td>
              <td className={`${TDR} font-semibold`}>{eur(m.total)}</td>
              <td className={`${TD} text-right`}><DownloadBtn saleId={m.saleId} orderId={m.orderId} pdfUrl={m.pdfUrl} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length >= 5000 && <p className="p-3 text-xs text-slate-400">Mostrando los 5000 más recientes.</p>}
    </TableShell>
  )
}

// Agrupa movimientos por mes 'YYYY-MM'. Compartido entre la tabla Mensual de B
// y su hoja de Excel para que nunca diverjan.
export function groupByMonth<T extends { date: string }>(rows: T[]): Record<string, T[]> {
  const byMonth: Record<string, T[]> = {}
  for (const m of rows) {
    const k = m.date.slice(0, 7)
    ;(byMonth[k] ??= []).push(m)
  }
  return byMonth
}
export const monthKey = (year: number, i: number) => `${year}-${String(i + 1).padStart(2, '0')}`

// Mensual de la capa B: cada mes se despliega con el detalle de sus cobros
// (fecha, ticket, cliente, total con IVA y PDF). Totales sin separar base/IVA.
export function MonthlyCashTable({ year, rows }: { year: number; rows: MovementRow[] }) {
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const byMonth = groupByMonth(rows)
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Mes</th>
            <th className={THR}>Nº cobros</th>
            <th className={THR}>Efectivo (total)</th>
            <th className={`${TH} w-8`} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {MONTH_LABELS.map((label, i) => {
            const key = monthKey(year, i)
            const monthRows = byMonth[key] ?? []
            const total = monthRows.reduce((s, m) => s + m.total, 0)
            const isOpen = openMonth === key
            return [
              <tr
                key={key}
                onClick={() => monthRows.length > 0 && setOpenMonth(isOpen ? null : key)}
                className={monthRows.length > 0 ? 'cursor-pointer hover:bg-slate-50/60' : ''}
              >
                <td className={`${TD} font-medium text-slate-600`}>{label}</td>
                <td className={`${TDR} text-slate-500`}>{monthRows.length || '—'}</td>
                <td className={`${TDR} font-semibold`}>{eur(total)}</td>
                <td className={`${TD} text-slate-400`}>
                  {monthRows.length > 0 && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                </td>
              </tr>,
              isOpen && (
                <tr key={`${key}-detail`}>
                  <td colSpan={4} className="bg-slate-50/70 px-4 pb-4 pt-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                          <th className="px-2 py-1.5">Fecha</th>
                          <th className="px-2 py-1.5">Ticket</th>
                          <th className="px-2 py-1.5">Método</th>
                          <th className="px-2 py-1.5">Cliente</th>
                          <th className="px-2 py-1.5 text-right">Total</th>
                          <th className="px-2 py-1.5 text-right">PDF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60">
                        {monthRows.map((m, j) => (
                          <tr key={j} className="bg-white">
                            <td className="px-2 py-1.5 text-slate-500">{m.date}</td>
                            <td className="px-2 py-1.5 font-mono font-medium text-slate-700">{m.ref}</td>
                            <td className="px-2 py-1.5 capitalize text-slate-600">{m.method}</td>
                            <td className="px-2 py-1.5 text-slate-700">{m.client ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{eur(m.total)}</td>
                            <td className="px-2 py-1.5 text-right"><DownloadBtn saleId={m.saleId} orderId={m.orderId} pdfUrl={m.pdfUrl} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </TableShell>
  )
}

// Mensual del escenario C: cada mes se despliega con todos sus movimientos
// (tickets, cobros de sastrería, facturas y gastos) con su PDF.
export function MonthlyFullExpandable({ year, view, rows }: { year: number; view: AccountingView; rows: LedgerMovement[] }) {
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const byMonth = groupByMonth(rows)
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Mes</th>
            <th className={THR}>Ingresos</th>
            <th className={THR}>Gastos</th>
            <th className={THR}>Resultado</th>
            <th className={`${TH} w-8`} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {view.monthly.map((m, i) => {
            const key = monthKey(year, i)
            const monthRows = byMonth[key] ?? []
            const isOpen = openMonth === key
            return [
              <tr
                key={key}
                onClick={() => monthRows.length > 0 && setOpenMonth(isOpen ? null : key)}
                className={monthRows.length > 0 ? 'cursor-pointer hover:bg-slate-50/60' : ''}
              >
                <td className={`${TD} font-medium text-slate-600`}>{MONTH_LABELS[i]}</td>
                <td className={TDR}>{eur(m.income)}</td>
                <td className={TDR}>{eur(m.expenses)}</td>
                <td className={`${TDR} ${m.income - m.expenses >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{eur(m.income - m.expenses)}</td>
                <td className={`${TD} text-slate-400`}>
                  {monthRows.length > 0 && (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                </td>
              </tr>,
              isOpen && (
                <tr key={`${key}-detail`}>
                  <td colSpan={5} className="bg-slate-50/70 px-4 pb-4 pt-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                          <th className="px-2 py-1.5">Fecha</th>
                          <th className="px-2 py-1.5">Tipo</th>
                          <th className="px-2 py-1.5">Concepto</th>
                          <th className="px-2 py-1.5">Cliente / Proveedor</th>
                          <th className="px-2 py-1.5 text-right">Total</th>
                          <th className="px-2 py-1.5 text-right">PDF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60">
                        {monthRows.map((m2, j) => (
                          <tr key={j} className="bg-white">
                            <td className="px-2 py-1.5 text-slate-500">{m2.date}</td>
                            <td className="px-2 py-1.5">
                              <span className={`rounded px-1.5 py-0.5 ${TYPE_BADGE[m2.type] ?? 'bg-slate-100 text-slate-600'}`}>{m2.type}</span>
                            </td>
                            <td className="px-2 py-1.5 text-slate-700">{m2.concept}</td>
                            <td className="px-2 py-1.5 text-slate-700">{m2.client ?? '—'}</td>
                            <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${m2.total >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{eur(m2.total)}</td>
                            <td className="px-2 py-1.5 text-right"><DownloadBtn saleId={m2.saleId} orderId={m2.orderId} onlineOrderId={m2.onlineOrderId} pdfUrl={m2.pdfUrl} apPath={m2.apPath} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </TableShell>
  )
}

export const TYPE_BADGE: Record<string, string> = {
  Ticket: 'bg-emerald-50 text-emerald-700',
  'Sastrería': 'bg-violet-50 text-violet-700',
  Reserva: 'bg-amber-50 text-amber-700',
  Factura: 'bg-blue-50 text-blue-700',
  Abono: 'bg-orange-50 text-orange-700',
  'Factura recibida': 'bg-red-50 text-red-700',
  Compra: 'bg-red-50 text-red-700',
  Gasto: 'bg-red-50 text-red-700',
}

export function LedgerTable({ rows }: { rows: LedgerMovement[] }) {
  return (
    <TableShell>
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className={TH}>Fecha</th>
            <th className={TH}>Tipo</th>
            <th className={TH}>Concepto</th>
            <th className={TH}>Cliente / Proveedor</th>
            <th className={THR}>Base</th>
            <th className={THR}>IVA</th>
            <th className={THR}>Total</th>
            <th className={THR}>PDF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Sin movimientos.</td></tr>
          ) : rows.map((m, i) => (
            <tr key={i} className="hover:bg-slate-50/60">
              <td className={`${TD} text-slate-500`}>{m.date}</td>
              <td className={TD}>
                <span className={`rounded px-1.5 py-0.5 text-xs ${TYPE_BADGE[m.type] ?? 'bg-slate-100 text-slate-600'}`}>{m.type}</span>
              </td>
              <td className={`${TD} text-slate-700`}>{m.concept}</td>
              <td className={`${TD} text-slate-700`}>{m.client ?? <span className="text-slate-300">—</span>}</td>
              <td className={TDR}>{eur(m.base)}</td>
              <td className={TDR}>{eur(m.vat)}</td>
              <td className={`${TDR} font-semibold ${m.total >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{eur(m.total)}</td>
              <td className={`${TD} text-right`}><DownloadBtn saleId={m.saleId} orderId={m.orderId} onlineOrderId={m.onlineOrderId} pdfUrl={m.pdfUrl} apPath={m.apPath} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length >= 5000 && <p className="p-3 text-xs text-slate-400">Mostrando los 5000 más recientes.</p>}
    </TableShell>
  )
}

// Pestañas: 'underline' (navegación principal de la página, estilo libro
// contable) o 'segmented' (conmutador secundario compacto).
export function Tabs({ tabs, active, onChange, variant = 'underline' }: {
  tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void; variant?: 'underline' | 'segmented'
}) {
  if (variant === 'segmented') {
    return (
      <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`rounded px-3.5 py-1.5 text-sm transition-colors ${
              active === t.key ? 'bg-prats-navy font-medium text-white' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-x-6 border-b border-slate-200">
      {tabs.map((t) => {
        const isActive = active === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`relative -mb-px whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1 text-sm transition-colors ${
              isActive
                ? 'border-prats-gold font-semibold text-prats-navy'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
