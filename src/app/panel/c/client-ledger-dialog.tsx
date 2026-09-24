'use client'

import { useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { InvoiceLite, LedgerMovement } from '@/lib/ops/types'
import { downloadExcelMulti } from '@/lib/excel/export'
import { Tabs, DownloadBtn, TOTAL_ROW, eur } from '../accounting-ui'

const n2 = (n: number) => Number((Number(n) || 0).toFixed(2))

// Referencias de documento (CLP-T-2026-0042, TICK-2026-0046, PIN-2026-0101,
// RSV-2026-0044, WEL-2026-0005, WEB-MRAT2YPC…) que aparecen en el origen de una
// factura y en el concepto de un cobro: sirven para casar cobro ↔ factura.
const REF_RE = /\b(?:[A-Z]{3,4}(?:-[ETP])?-\d{4}-\d{4}|WEB-[A-Z0-9]+)\b/g
const refsOf = (s?: string) => new Set((s ?? '').toUpperCase().match(REF_RE) ?? [])

// Documento de ingreso sin factura (ticket o cobro de sastrería del escenario C)
export type NoInvoiceDoc = {
  docType: string
  number: string
  date: string
  base: number
  vat: number
  total: number
  saleId?: string
  orderId?: string
  orderPaymentId?: string
}

export type ClientDetailTarget = { key: string; name: string; nif?: string }

type MayorRow = {
  date: string
  doc: string
  concept: string
  debe: number
  haber: number
  saldo: number
  pdf: { saleId?: string; orderId?: string; orderPaymentId?: string; pdfUrl?: string; invoiceId?: string }
}

// Detalle de un cliente del escenario C: sus facturas, los cobros de C que
// liquidan esas facturas (por referencia de ticket/pedido/reserva) y los
// tickets/cobros sin factura. Con eso monta el libro mayor (cuenta 430):
// facturas al DEBE, cobros al HABER, saldo = pendiente de cobro.
export function buildClientDetail(
  target: ClientDetailTarget,
  invoices: InvoiceLite[],
  ledger: LedgerMovement[],
  noInvoiceDocs: NoInvoiceDoc[],
) {
  const keyOf = (f: InvoiceLite) => (f.nif || f.client.trim() || '(sin nombre)').toUpperCase()
  const clientInvoices = invoices.filter((f) => keyOf(f) === target.key).sort((a, b) => a.date.localeCompare(b.date))

  // ref → factura(s) que la cubren
  const invoiceByRef = new Map<string, string[]>()
  for (const f of clientInvoices) {
    for (const r of refsOf(f.origin)) invoiceByRef.set(r, [...(invoiceByRef.get(r) ?? []), f.number])
  }
  const payments = ledger
    .filter((m) => m.total > 0 && (m.type === 'Ticket' || m.type === 'Sastrería' || m.type === 'Reserva'))
    .map((m) => {
      const hits = [...refsOf(m.concept)].flatMap((r) => invoiceByRef.get(r) ?? [])
      return hits.length ? { m, invoiceNumbers: [...new Set(hits)] } : null
    })
    .filter((x): x is { m: LedgerMovement; invoiceNumbers: string[] } => !!x)
    .sort((a, b) => a.m.date.localeCompare(b.m.date))

  // Sin factura: los del cliente que no estén ya casados con una de sus facturas
  const noInvoice = noInvoiceDocs
    .filter((d) => ![...refsOf(`${d.docType} ${d.number}`)].some((r) => invoiceByRef.has(r)))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Libro mayor: en la misma fecha, primero el cargo (factura) y luego el abono
  type Entry = Omit<MayorRow, 'saldo'> & { order: number }
  const entries: Entry[] = []
  for (const f of clientInvoices) {
    const rect = f.total < 0
    entries.push({
      date: f.date, order: rect ? 1 : 0, doc: f.number,
      concept: `${rect ? 'Factura rectificativa' : 'Factura'}${f.origin ? ` · ${f.origin}` : ''}`,
      debe: rect ? 0 : f.total, haber: rect ? -f.total : 0,
      pdf: { pdfUrl: f.pdfUrl, invoiceId: f.id },
    })
  }
  for (const p of payments) {
    entries.push({
      date: p.m.date, order: 1, doc: p.m.concept.replace(/^(Ticket|Sastrería|Reserva)\s+/, ''),
      concept: `Cobro ${p.m.type.toLowerCase()} · aplicado a ${p.invoiceNumbers.join(', ')}`,
      debe: 0, haber: p.m.total,
      pdf: { saleId: p.m.saleId, orderId: p.m.orderId, orderPaymentId: p.m.orderPaymentId },
    })
  }
  for (const d of noInvoice) {
    entries.push({
      date: d.date, order: 2, doc: d.number,
      concept: `${d.docType} sin factura (cargo y cobro)`,
      debe: d.total, haber: d.total,
      pdf: { saleId: d.saleId, orderId: d.orderId, orderPaymentId: d.orderPaymentId },
    })
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
  let saldo = 0
  const mayor: MayorRow[] = entries.map((e) => {
    saldo = n2(saldo + e.debe - e.haber)
    return { date: e.date, doc: e.doc, concept: e.concept, debe: e.debe, haber: e.haber, saldo, pdf: e.pdf }
  })

  const invoiced = n2(clientInvoices.reduce((s, f) => s + f.total, 0))
  const collected = n2(payments.reduce((s, p) => s + p.m.total, 0))
  const noInvoiceTotal = n2(noInvoice.reduce((s, d) => s + d.total, 0))
  const byQuarter = [0, 0, 0, 0]
  for (const f of clientInvoices) {
    const q = Math.ceil(Number(f.date.slice(5, 7)) / 3)
    if (q >= 1 && q <= 4) byQuarter[q - 1] = n2(byQuarter[q - 1] + f.total)
  }
  return { invoices: clientInvoices, payments, noInvoice, mayor, invoiced, collected, noInvoiceTotal, byQuarter, pending: saldo }
}

const INVOICE_STATUS: Record<string, string> = {
  issued: 'Emitida', paid: 'Cobrada', partially_paid: 'Cobro parcial', overdue: 'Vencida', rectified: 'Rectificada', sent: 'Enviada',
}
const TH = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500'
const THR = `${TH} text-right`
const TD = 'px-3 py-2'
const TDR = `${TD} text-right tabular-nums`
const dash = <span className="text-slate-300">—</span>

export function ClientLedgerDialog({ year, target, detail, onClose }: {
  year: number
  target: ClientDetailTarget | null
  detail: ReturnType<typeof buildClientDetail> | null
  onClose: () => void
}) {
  const [view, setView] = useState<'facturacion' | 'mayor'>('facturacion')
  const kpis = useMemo(() => detail ? [
    ['Facturado', detail.invoiced],
    ['Cobrado (facturas)', detail.collected],
    ['Cobros sin factura', detail.noInvoiceTotal],
    ['Saldo pendiente', detail.pending],
  ] as [string, number][] : [], [detail])

  const onExcel = async () => {
    if (!target || !detail) return
    const slug = target.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase()
    await downloadExcelMulti([
      { name: 'Libro mayor', rows: detail.mayor.map((r) => ({
        Fecha: r.date, Documento: r.doc, Concepto: r.concept, Debe: n2(r.debe), Haber: n2(r.haber), Saldo: n2(r.saldo),
      })) },
      { name: 'Facturas', rows: detail.invoices.map((f) => ({
        'Nº': f.number, Fecha: f.date, Origen: f.origin ?? '', Base: n2(f.base), IVA: n2(f.vat), Total: n2(f.total),
        Estado: INVOICE_STATUS[f.status] ?? f.status,
      })) },
      { name: 'Cobros de facturas', rows: detail.payments.map((p) => ({
        Fecha: p.m.date, Concepto: p.m.concept, 'Aplicado a': p.invoiceNumbers.join(', '), Total: n2(p.m.total),
      })) },
      { name: 'Sin factura', rows: detail.noInvoice.map((d) => ({
        Fecha: d.date, Tipo: d.docType, 'Nº': d.number, Base: n2(d.base), IVA: n2(d.vat), Total: n2(d.total),
      })) },
    ], `cliente-${slug || 'detalle'}-C-${year}`)
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { onClose(); setView('facturacion') } }}>
      <DialogContent className="max-w-5xl">
        {target && detail && (
          <>
            <DialogHeader>
              <DialogTitle className="text-prats-navy">{target.name}</DialogTitle>
              <DialogDescription>
                {target.nif ? <span className="font-mono">{target.nif}</span> : 'Sin NIF'} · Ejercicio {year} · escenario C
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {kpis.map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                  <p className={`mt-1 text-lg font-semibold tabular-nums ${label === 'Saldo pendiente' && value > 0.005 ? 'text-amber-700' : 'text-slate-900'}`}>{eur(value)}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tabs
                variant="segmented"
                active={view}
                onChange={(k) => setView(k as 'facturacion' | 'mayor')}
                tabs={[
                  { key: 'facturacion', label: 'Facturación' },
                  { key: 'mayor', label: 'Libro mayor' },
                ]}
              />
              <Button variant="outline" size="sm" onClick={onExcel}>Exportar Excel</Button>
            </div>

            {view === 'facturacion' ? (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className={TH}>Nº</th>
                        <th className={TH}>Fecha</th>
                        <th className={TH}>Origen</th>
                        <th className={THR}>Base</th>
                        <th className={THR}>IVA</th>
                        <th className={THR}>Total</th>
                        <th className={TH}>Estado</th>
                        <th className={THR}>PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.invoices.length === 0 ? (
                        <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Sin facturas emitidas en el ejercicio.</td></tr>
                      ) : detail.invoices.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50/60">
                          <td className={`${TD} font-mono text-xs text-slate-700`}>{f.number}</td>
                          <td className={`${TD} text-slate-500`}>{f.date}</td>
                          <td className={`${TD} font-mono text-[11px] text-slate-500`}>{f.origin ?? 'Manual'}</td>
                          <td className={TDR}>{eur(f.base)}</td>
                          <td className={TDR}>{eur(f.vat)}</td>
                          <td className={`${TDR} font-medium`}>{eur(f.total)}</td>
                          <td className={`${TD} text-slate-500`}>{INVOICE_STATUS[f.status] ?? f.status}</td>
                          <td className={`${TD} text-right`}><DownloadBtn pdfUrl={f.pdfUrl} invoiceId={f.id} /></td>
                        </tr>
                      ))}
                      {detail.invoices.length > 0 && (
                        <tr className={TOTAL_ROW}>
                          <td className={TD} colSpan={3}>
                            TOTAL facturado
                            <span className="ml-2 font-normal text-slate-500">
                              {detail.byQuarter.map((v, i) => `T${i + 1} ${eur(v)}`).join(' · ')}
                            </span>
                          </td>
                          <td className={TDR}>{eur(detail.invoices.reduce((s, f) => s + f.base, 0))}</td>
                          <td className={TDR}>{eur(detail.invoices.reduce((s, f) => s + f.vat, 0))}</td>
                          <td className={TDR}>{eur(detail.invoiced)}</td>
                          <td colSpan={2} />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {detail.noInvoice.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <p className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-prats-navy">Tickets y cobros sin factura</p>
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className={TH}>Fecha</th>
                          <th className={TH}>Tipo</th>
                          <th className={TH}>Nº</th>
                          <th className={THR}>Base</th>
                          <th className={THR}>IVA</th>
                          <th className={THR}>Total</th>
                          <th className={THR}>PDF</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.noInvoice.map((d, i) => (
                          <tr key={i} className="hover:bg-slate-50/60">
                            <td className={`${TD} text-slate-500`}>{d.date}</td>
                            <td className={`${TD} text-slate-600`}>{d.docType}</td>
                            <td className={`${TD} font-mono text-xs text-slate-700`}>{d.number}</td>
                            <td className={TDR}>{eur(d.base)}</td>
                            <td className={TDR}>{eur(d.vat)}</td>
                            <td className={`${TDR} font-medium`}>{eur(d.total)}</td>
                            <td className={`${TD} text-right`}><DownloadBtn saleId={d.saleId} orderId={d.orderId} orderPaymentId={d.orderPaymentId} /></td>
                          </tr>
                        ))}
                        <tr className={TOTAL_ROW}>
                          <td className={TD} colSpan={5}>TOTAL sin factura ({detail.noInvoice.length})</td>
                          <td className={TDR}>{eur(detail.noInvoiceTotal)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={TH}>Fecha</th>
                      <th className={TH}>Documento</th>
                      <th className={TH}>Concepto</th>
                      <th className={THR}>Debe</th>
                      <th className={THR}>Haber</th>
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
                        <td className={`${TD} text-right`}><DownloadBtn {...r.pdf} /></td>
                      </tr>
                    ))}
                    {detail.mayor.length > 0 && (
                      <tr className={TOTAL_ROW}>
                        <td className={TD} colSpan={3}>Sumas y saldo final</td>
                        <td className={TDR}>{eur(detail.mayor.reduce((s, r) => s + r.debe, 0))}</td>
                        <td className={TDR}>{eur(detail.mayor.reduce((s, r) => s + r.haber, 0))}</td>
                        <td className={TDR}>{eur(detail.pending)}</td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
                <p className="border-t p-3 text-xs text-slate-400">
                  Cuenta del cliente: facturas emitidas al Debe y cobros al Haber (importes con IVA). Los cobros se casan con su factura
                  por la referencia del ticket, pedido o reserva que factura. Los tickets y cobros sin factura se cargan y abonan a la
                  vez. Solo figuran documentos y cobros del escenario C de este ejercicio: un saldo pendiente puede corresponder a cobros
                  de otro ejercicio o registrados fuera de este escenario.
                </p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
