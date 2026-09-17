'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ApInvoiceLite } from '@/lib/ops/types'
import { downloadExcelMulti } from '@/lib/excel/export'
import { Tabs, DownloadBtn, TOTAL_ROW, eur } from '../accounting-ui'
import { ISP_RATE, isIsp, ispVat } from './intra-isp'

const n2 = (n: number) => Number((Number(n) || 0).toFixed(2))
const pct = (n: number) => `${Number(n) % 1 === 0 ? Number(n) : (Number(n) || 0).toLocaleString('es-ES')} %`

export type SupplierDetailTarget = { key: string; name: string; nif?: string }

type MayorRow = { date: string; doc: string; concept: string; debe: number; haber: number; saldo: number; apPath?: string }

// Detalle de un proveedor del escenario C: sus facturas recibidas del año y su
// libro mayor (cuenta 400): las facturas al HABER (lo que se le debe) y los
// pagos al DEBE; el saldo es lo pendiente de pagarle.
export function buildSupplierDetail(target: SupplierDetailTarget, apInvoices: ApInvoiceLite[]) {
  const invoices = apInvoices
    .filter((f) => ((f.cif || f.supplier.trim() || '(sin nombre)').toUpperCase()) === target.key)
    .sort((a, b) => a.date.localeCompare(b.date))

  type Entry = Omit<MayorRow, 'saldo'> & { order: number }
  const entries: Entry[] = []
  for (const f of invoices) {
    entries.push({
      date: f.date, order: 0, doc: f.number,
      concept: `Factura recibida${isIsp(f) ? ` · intracomunitaria (ISP ${pct(ISP_RATE)})` : ''}${f.retentionAmount !== 0 ? ` · retención ${pct(f.retentionRate)}` : ''}`,
      debe: 0, haber: f.total, apPath: f.attachmentPath,
    })
    for (const p of f.payments) {
      entries.push({ date: p.date, order: 1, doc: f.number, concept: 'Pago', debe: p.amount, haber: 0 })
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
  let saldo = 0
  const mayor: MayorRow[] = entries.map((e) => {
    saldo = n2(saldo + e.haber - e.debe)
    return { date: e.date, doc: e.doc, concept: e.concept, debe: e.debe, haber: e.haber, saldo, apPath: e.apPath }
  })

  const billed = n2(invoices.reduce((s, f) => s + f.total, 0))
  const paid = n2(invoices.reduce((s, f) => s + f.payments.reduce((t, p) => t + p.amount, 0), 0))
  const retained = n2(invoices.reduce((s, f) => s + f.retentionAmount, 0))
  const ispBase = n2(invoices.filter(isIsp).reduce((s, f) => s + f.base, 0))
  const ispCuota = n2(invoices.filter(isIsp).reduce((s, f) => s + ispVat(f), 0))
  const byQuarter = [0, 0, 0, 0]
  for (const f of invoices) {
    const q = Math.ceil(Number(f.date.slice(5, 7)) / 3)
    if (q >= 1 && q <= 4) byQuarter[q - 1] = n2(byQuarter[q - 1] + f.base + f.vat)
  }
  return { invoices, mayor, billed, paid, pending: n2(billed - paid), retained, ispBase, ispCuota, byQuarter }
}

const TH = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500'
const THR = `${TH} text-right`
const TD = 'px-3 py-2'
const TDR = `${TD} text-right tabular-nums`
const dash = <span className="text-slate-300">—</span>

export function SupplierLedgerDialog({ year, target, detail, onClose }: {
  year: number
  target: SupplierDetailTarget | null
  detail: ReturnType<typeof buildSupplierDetail> | null
  onClose: () => void
}) {
  const [view, setView] = useState<'facturas' | 'mayor'>('facturas')

  const onExcel = async () => {
    if (!target || !detail) return
    const slug = target.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()
    await downloadExcelMulti([
      { name: 'Libro mayor', rows: detail.mayor.map((r) => ({
        Fecha: r.date, Documento: r.doc, Concepto: r.concept, Debe: n2(r.debe), Haber: n2(r.haber), Saldo: n2(r.saldo),
      })) },
      { name: 'Facturas recibidas', rows: detail.invoices.map((f) => ({
        'Nº': f.number, Fecha: f.date, Base: n2(f.base),
        'Régimen': isIsp(f) ? `ISP ${ISP_RATE}%` : (f.vatRate === null ? 'varios' : `${f.vatRate}%`),
        IVA: n2(f.vat), 'Cuota autorrepercutida': isIsp(f) ? ispVat(f) : 0,
        'Retención': n2(f.retentionAmount), Total: n2(f.total),
        Estado: f.status === 'pagada' ? 'Pagada' : 'Pendiente',
        Pagado: n2(f.payments.reduce((s, p) => s + p.amount, 0)), Notas: f.note ?? '',
      })) },
    ], `proveedor-${slug || 'detalle'}-C-${year}`)
  }

  const kpis: [string, number][] = detail ? [
    ['Facturado', detail.billed],
    ['Pagado', detail.paid],
    ['Pendiente de pago', detail.pending],
    ['IRPF retenido', detail.retained],
  ] : []

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { onClose(); setView('facturas') } }}>
      <DialogContent className="max-w-5xl">
        {target && detail && (
          <>
            <DialogHeader>
              <DialogTitle className="text-prats-navy">{target.name}</DialogTitle>
              <DialogDescription>
                {target.nif ? <span className="font-mono">{target.nif}</span> : 'Sin CIF'} · Ejercicio {year} · escenario C
                {detail.ispBase !== 0 && ` · intracomunitario: base ${eur(detail.ispBase)}, IVA autorrepercutido ${eur(detail.ispCuota)}`}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {kpis.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                  <p className={`mt-1 text-lg font-semibold tabular-nums ${label === 'Pendiente de pago' && value > 0.005 ? 'text-amber-700' : 'text-slate-900'}`}>{eur(value)}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tabs
                variant="segmented"
                active={view}
                onChange={(k) => setView(k as 'facturas' | 'mayor')}
                tabs={[
                  { key: 'facturas', label: 'Facturas recibidas' },
                  { key: 'mayor', label: 'Libro mayor' },
                ]}
              />
              <Button variant="outline" size="sm" onClick={onExcel}>Exportar Excel</Button>
            </div>

            {view === 'facturas' ? (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={TH}>Nº</th>
                      <th className={TH}>Fecha</th>
                      <th className={THR}>Base</th>
                      <th className={TH}>Régimen</th>
                      <th className={THR}>IVA</th>
                      <th className={THR}>Retención</th>
                      <th className={THR}>Total</th>
                      <th className={TH}>Estado</th>
                      <th className={THR}>PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.invoices.length === 0 ? (
                      <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">Sin facturas en el ejercicio.</td></tr>
                    ) : detail.invoices.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50/60">
                        <td className={`${TD} font-mono text-xs text-slate-700`}>{f.number}</td>
                        <td className={`${TD} whitespace-nowrap text-slate-500`}>{f.date}</td>
                        <td className={TDR}>{eur(f.base)}</td>
                        <td className={TD}>
                          {isIsp(f)
                            ? <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">ISP {pct(ISP_RATE)} · {eur(ispVat(f))}</span>
                            : <span className="text-slate-500">{f.vatRate === null ? 'varios' : pct(f.vatRate)}</span>}
                        </td>
                        <td className={TDR}>{f.vat !== 0 ? eur(f.vat) : dash}</td>
                        <td className={TDR}>{f.retentionAmount !== 0 ? <span className="text-amber-700">−{eur(f.retentionAmount)}</span> : dash}</td>
                        <td className={`${TDR} font-medium`}>{eur(f.total)}</td>
                        <td className={TD}>
                          {f.status === 'pagada'
                            ? <span className="text-emerald-700">Pagada</span>
                            : <span className="text-amber-700">Pendiente</span>}
                        </td>
                        <td className={`${TD} text-right`}><DownloadBtn apPath={f.attachmentPath} /></td>
                      </tr>
                    ))}
                    {detail.invoices.length > 0 && (
                      <tr className={TOTAL_ROW}>
                        <td className={TD} colSpan={2}>
                          TOTAL ({detail.invoices.length})
                          <span className="ml-2 font-normal text-slate-500">
                            {detail.byQuarter.map((v, i) => `T${i + 1} ${eur(v)}`).join(' · ')}
                          </span>
                        </td>
                        <td className={TDR}>{eur(detail.invoices.reduce((s, f) => s + f.base, 0))}</td>
                        <td />
                        <td className={TDR}>{eur(detail.invoices.reduce((s, f) => s + f.vat, 0))}</td>
                        <td className={TDR}>{eur(detail.retained)}</td>
                        <td className={TDR}>{eur(detail.billed)}</td>
                        <td colSpan={2} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={TH}>Fecha</th>
                      <th className={TH}>Documento</th>
                      <th className={TH}>Concepto</th>
                      <th className={THR}>Debe (pagos)</th>
                      <th className={THR}>Haber (facturas)</th>
                      <th className={THR}>Saldo</th>
                      <th className={THR}>PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detail.mayor.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Sin movimientos en el ejercicio.</td></tr>
                    ) : detail.mayor.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/60">
                        <td className={`${TD} whitespace-nowrap text-slate-500`}>{r.date}</td>
                        <td className={`${TD} whitespace-nowrap font-mono text-xs text-slate-700`}>{r.doc}</td>
                        <td className={`${TD} text-slate-600`}>{r.concept}</td>
                        <td className={TDR}>{r.debe ? eur(r.debe) : dash}</td>
                        <td className={TDR}>{r.haber ? eur(r.haber) : dash}</td>
                        <td className={`${TDR} font-medium ${r.saldo > 0.005 ? 'text-amber-700' : 'text-slate-900'}`}>{eur(r.saldo)}</td>
                        <td className={`${TD} text-right`}><DownloadBtn apPath={r.apPath} /></td>
                      </tr>
                    ))}
                    {detail.mayor.length > 0 && (
                      <tr className={TOTAL_ROW}>
                        <td className={TD} colSpan={3}>Sumas y saldo final</td>
                        <td className={TDR}>{eur(detail.paid)}</td>
                        <td className={TDR}>{eur(detail.billed)}</td>
                        <td className={TDR}>{eur(detail.pending)}</td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
                <p className="border-t p-3 text-xs text-slate-400">
                  Cuenta del proveedor: sus facturas recibidas al Haber por el importe del documento (base + IVA − retención) y los pagos
                  al Debe. El saldo es lo pendiente de pagarle de este ejercicio; las facturas de años anteriores no figuran. La retención
                  de IRPF no se paga al proveedor: se ingresa a Hacienda por los modelos 111/115.
                </p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
