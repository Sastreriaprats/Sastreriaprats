'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { TrendingUp, TrendingDown, Wallet, Receipt, Percent, Hash, Landmark, Download, Loader2, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { getTicketData, getOrderTicketData } from '@/actions/ops'
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

export function QuarterTable({ view, variant }: { view: AccountingView; variant: 'cash' | 'full' }) {
  const cash = variant === 'cash'
  const tot = view.quarters.reduce((a, q) => ({
    bs: a.bs + q.baseSales, rep: a.rep + q.ivaRepercutido, bp: a.bp + q.basePurchases, sop: a.sop + q.ivaSoportado,
  }), { bs: 0, rep: 0, bp: 0, sop: 0 })
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
            <th className={THR}>{cash ? 'IVA efectivo' : 'Resultado'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {view.quarters.map((q) => (
            <tr key={q.quarter} className="hover:bg-slate-50/60">
              <td className={`${TD} font-semibold text-slate-700`}>{q.quarter}</td>
              <td className={`${TD} text-slate-500`}>{q.period}</td>
              <td className={TDR}>{eur(q.baseSales)}</td>
              <td className={TDR}>{eur(q.ivaRepercutido)}</td>
              {!cash && <td className={TDR}>{eur(q.basePurchases)}</td>}
              {!cash && <td className={TDR}>{eur(q.ivaSoportado)}</td>}
              <td className={`${TDR} font-semibold`}>{eur(cash ? q.ivaRepercutido : q.resultado)}</td>
            </tr>
          ))}
          <tr className={TOTAL_ROW}>
            <td className={TD} colSpan={2}>TOTAL año</td>
            <td className={TDR}>{eur(tot.bs)}</td>
            <td className={TDR}>{eur(tot.rep)}</td>
            {!cash && <td className={TDR}>{eur(tot.bp)}</td>}
            {!cash && <td className={TDR}>{eur(tot.sop)}</td>}
            <td className={TDR}>{eur(cash ? tot.rep : tot.rep - tot.sop)}</td>
          </tr>
        </tbody>
      </table>
    </TableShell>
  )
}

export function DownloadBtn({ saleId, orderId, pdfUrl }: { saleId?: string; orderId?: string; pdfUrl?: string }) {
  const [loading, setLoading] = useState(false)
  if (!saleId && !orderId && !pdfUrl) return <span className="text-slate-300">—</span>
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
      } else if (pdfUrl) {
        window.open(pdfUrl, '_blank', 'noopener')
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
      title="Descargar ticket en PDF"
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
                            <td className="px-2 py-1.5 text-right"><DownloadBtn saleId={m2.saleId} orderId={m2.orderId} pdfUrl={m2.pdfUrl} /></td>
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
  Factura: 'bg-blue-50 text-blue-700',
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
              <td className={`${TD} text-right`}><DownloadBtn saleId={m.saleId} orderId={m.orderId} pdfUrl={m.pdfUrl} /></td>
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
