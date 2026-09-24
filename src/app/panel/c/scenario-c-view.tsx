'use client'

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getViewC, getIssuedInvoicePdfUrls, getApInvoicePdfUrls, getTicketData, getOrderTicketData, getOrderPaymentTicketData, getOnlineTicketData } from '@/actions/ops'
import { generateTicketPdf } from '@/components/pos/ticket-pdf'
import { generateTailoringOrderTicketPdf } from '@/lib/pdf/tailoring-order-ticket'
import type { ViewC, AccountingView, ApInvoiceLite, VatRateRow, InvoiceOriginKind } from '@/lib/ops/types'
import { downloadExcelMulti } from '@/lib/excel/export'
import { downloadZip, extFromUrl, type ZipItem } from '../bulk-download'
import { ClientLedgerDialog, buildClientDetail, type ClientDetailTarget } from './client-ledger-dialog'
import { SupplierLedgerDialog, buildSupplierDetail, type SupplierDetailTarget } from './supplier-ledger-dialog'
import { ISP_RATE, isIsp, ispVat } from './intra-isp'
import { Tabs, Kpis, QuarterTable, MonthVatTable, MONTH_NAMES, MonthlyFullExpandable, LedgerTable, DownloadBtn, TYPE_BADGE, TOTAL_ROW, PageHeader, YearSelect, eur, MONTH_LABELS, groupByMonth, monthKey } from '../accounting-ui'

const thisYear = new Date().getFullYear()
const n2 = (n: number) => Number((Number(n) || 0).toFixed(2))

// Fecha desde la que manda la factura (DOC_RULE_START en actions/ops.ts), para
// explicar en pantalla por qué hay documentos informativos que no suman.
const DOC_RULE_LABEL = '1 de julio de 2026'

const METRICS: [string, keyof AccountingView][] = [
  ['Ventas', 'income'],
  ['Compras', 'expenses'],
  ['Resultado', 'profit'],
  ['IVA repercutido', 'ivaRepercutido'],
  ['IVA soportado', 'ivaSoportado'],
  ['IVA a ingresar', 'vatToPay'],
]

// Documento de ingreso de la pestaña Facturas: factura emitida o ticket sin factura
type IncomeDoc = {
  docType: 'Factura' | 'Ticket' | 'Sastrería' | 'Reserva' | 'Abono'
  number: string
  client: string
  date: string
  base: number
  vat: number
  total: number
  counted: boolean              // false = documento informativo (no suma; ver nota al pie)
  collected?: number            // cobrado (facturas ligadas a ticket/pedido/reserva)
  pending?: number              // pendiente de cobro
  status?: string
  method?: string
  saleId?: string
  orderId?: string
  orderPaymentId?: string
  onlineOrderId?: string
  invoiceId?: string
  origin?: string  // factura: ticket/pedidos/reservas/web a los que va asociada
  provenance: Provenance[]
  pdfUrl?: string
}

// Clave estable de un documento de ingreso (para marcarlo en la descarga): la
// factura por su id; el resto, por el documento que hay detrás y su fecha (un
// mismo pedido puede tener varios cobros en la lista).
const docKey = (d: IncomeDoc) =>
  d.invoiceId ? `inv:${d.invoiceId}`
    : d.saleId ? `sale:${d.saleId}`
      : d.onlineOrderId ? `web:${d.onlineOrderId}`
        : d.orderPaymentId ? `orderpay:${d.orderPaymentId}`
        : d.orderId ? `order:${d.orderId}:${d.date}`
          : `${d.docType}:${d.number}:${d.date}`
// Se puede descargar si hay factura o un ticket/pedido del que sacar el PDF
const canDownloadDoc = (d: IncomeDoc) => !!(d.invoiceId || d.saleId || d.orderId || d.onlineOrderId)

// PDF de un ticket o cobro de sastrería: no existe guardado, se arma en el
// navegador con los mismos datos que el botón de descarga de su fila.
async function buildDocPdfBlob(d: IncomeDoc): Promise<Blob | null> {
  try {
    if (d.saleId) {
      const res = await getTicketData(d.saleId)
      return res.ok ? ((await generateTicketPdf(res.data as never, 'blob')) as Blob) : null
    }
    if (d.onlineOrderId) {
      const res = await getOnlineTicketData(d.onlineOrderId)
      return res.ok ? ((await generateTicketPdf(res.data as never, 'blob')) as Blob) : null
    }
    if (d.orderPaymentId) {
      const res = await getOrderPaymentTicketData(d.orderPaymentId)
      return res.ok ? ((await generateTicketPdf(res.data, 'blob')) as Blob) : null
    }
    if (d.orderId) {
      const res = await getOrderTicketData(d.orderId)
      return res.ok ? ((await generateTailoringOrderTicketPdf(res.data as never, 'blob')) as Blob) : null
    }
  } catch { /* documento sin PDF: lo lista el ZIP como no descargado */ }
  return null
}

// Procedencia de un documento de ingreso: de qué sale la factura (manual = hecha
// a mano, sin ticket/pedido/reserva/web) o "sin factura" (ticket/cobro sin facturar)
type Provenance = InvoiceOriginKind | 'manual' | 'sin_factura'
const PROVENANCE: Record<Provenance, { label: string; cls: string }> = {
  ticket: { label: 'Ticket', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  pedido: { label: 'Pedido', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  reserva: { label: 'Reserva', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  web: { label: 'Web', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  manual: { label: 'Manual', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
  sin_factura: { label: 'Sin factura', cls: 'bg-white text-slate-400 ring-slate-200' },
}
const INVOICE_STATUS: Record<string, string> = {
  issued: 'Emitida', paid: 'Cobrada', partially_paid: 'Cobro parcial', overdue: 'Vencida',
  rectified: 'Rectificada', sent: 'Enviada',
}

// Orden de las listas de Facturas (ingresos y gastos)
type SortKey = 'date_desc' | 'date_asc' | 'number_asc' | 'number_desc' | 'name_asc' | 'name_desc' | 'total_desc' | 'total_asc'
const SORT_OPTIONS: [SortKey, string][] = [
  ['date_desc', 'Fecha (recientes primero)'],
  ['date_asc', 'Fecha (antiguas primero)'],
  ['number_asc', 'Nº (ascendente)'],
  ['number_desc', 'Nº (descendente)'],
  ['name_asc', 'Cliente/proveedor (A-Z)'],
  ['name_desc', 'Cliente/proveedor (Z-A)'],
  ['total_desc', 'Total (mayor primero)'],
  ['total_asc', 'Total (menor primero)'],
]
function sortDocs<T>(rows: T[], key: SortKey, get: (r: T) => { date: string; number: string; name: string; total: number }) {
  const [field, dir] = key.split('_') as ['date' | 'number' | 'name' | 'total', 'asc' | 'desc']
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((ra, rb) => {
    const a = get(ra), b = get(rb)
    const cmp = field === 'total' ? a.total - b.total
      : field === 'date' ? a.date.localeCompare(b.date)
      : a[field].localeCompare(b[field], 'es', { numeric: true, sensitivity: 'base' })
    return cmp * sign || b.date.localeCompare(a.date)
  })
}

// Agregado anual por tercero (cliente o proveedor) para el modelo 347/349
type ThirdPartyRow = {
  key: string                   // NIF (o nombre) en mayúsculas: agrupa y abre su detalle
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

// Buscador libre de Movimientos y Facturas. Busca el texto en proveedor/cliente,
// nº, concepto, CIF y notas (sin distinguir mayúsculas ni acentos) y, si lo
// escrito es una cifra ("176", "1.234,56", "350 €"), también en los importes.
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function makeMatcher(query: string) {
  const q = fold(query.trim())
  if (!q) return null
  const digits = q.replace(/[€\s]/g, '')
  // "1.234,56" → "1234.56"; "176,5" → "176.5"; "1234.56" se queda igual
  const normalized = digits.includes(',') ? digits.replace(/\./g, '').replace(',', '.') : digits
  const isAmount = /^-?\d+(\.\d{1,2})?$/.test(normalized)
  const needle = normalized.replace(/^-/, '')
  return (texts: (string | undefined)[], amounts: number[]) =>
    texts.some((t) => !!t && fold(t).includes(q)) ||
    (isAmount && amounts.some((n) => Math.abs(Number(n) || 0).toFixed(2).includes(needle)))
}

const quarterOf = (date: string) => Math.ceil(Number(date.slice(5, 7)) / 3)

// Fila del desglose de IVA soportado por tipo; `isp` = adquisiciones intracomunitarias
type VatRowView = VatRateRow & { isp?: boolean }
const rateText = (r: { rate: number; isp?: boolean }) => (r.isp ? `ISP intracomunitaria ${pct(r.rate)}` : pct(r.rate))
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
  // Buscador (texto o importe) y filtro por proveedor (Movimientos y Facturas)
  const [query, setQuery] = useState('')
  const [supplier, setSupplier] = useState('')
  const matcher = useMemo(() => makeMatcher(query), [query])
  // Facturas: filtro por procedencia (solo ingresos), orden y descarga en grupo
  const [provenance, setProvenance] = useState<Provenance | ''>('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null)
  // Facturas elegidas a mano para el ZIP: ids de factura emitida / adjuntos de proveedor
  const [selInc, setSelInc] = useState<Set<string>>(new Set())
  const [selExp, setSelExp] = useState<Set<string>>(new Set())
  // Tercero abierto en el modal de facturación + libro mayor
  const [clientTarget, setClientTarget] = useState<ClientDetailTarget | null>(null)
  const [supplierTarget, setSupplierTarget] = useState<SupplierDetailTarget | null>(null)
  // Pestaña IVA: desglose por trimestre o por mes
  const [ivaPeriod, setIvaPeriod] = useState<'trimestres' | 'meses'>('trimestres')
  const hasFilter = !!(fromDate || toDate || query.trim() || supplier || provenance)

  const load = useCallback(async () => {
    setLoading(true)
    setSelInc(new Set()); setSelExp(new Set())
    const res = await getViewC(year)
    setData(res.ok ? res.data : null)
    setLoading(false)
  }, [year])

  useEffect(() => { load() }, [load])

  // VENTAS de la pestaña Facturas. Manda el documento: la factura emitida es la
  // venta (con su abono si sustituye a algo ya declarado en un trimestre
  // cerrado) y, sin factura, cuenta el ticket o el cobro. Las facturas antiguas
  // ligadas a un ticket/pedido/reserva se declararon por sus cobros: se listan
  // como informativas y NO suman, para que el total cuadre con Resumen y Mensual.
  const incomeDocs = useMemo<IncomeDoc[]>(() => {
    if (!data) return []
    const byId = new Map(data.invoices.map((f) => [f.id, f]))
    const docs: IncomeDoc[] = data.invoices.map((f) => ({
      docType: 'Factura', number: f.number, client: f.client, date: f.date,
      base: f.base, vat: f.vat, total: f.total,
      counted: f.counted, collected: f.collected, pending: f.pending,
      status: f.status, method: f.method, saleId: f.saleId, orderId: f.orderId, invoiceId: f.id,
      origin: f.origin, provenance: f.originKinds.length ? f.originKinds : ['manual'], pdfUrl: f.pdfUrl,
    }))
    for (const m of data.ledger) {
      if (m.type === 'Abono') {
        const f = m.invoiceId ? byId.get(m.invoiceId) : undefined
        docs.push({
          docType: 'Abono',
          number: f?.number ?? '',
          client: m.client ?? '',
          date: m.date,
          base: m.base, vat: m.vat, total: m.total, counted: true,
          origin: f?.origin,
          provenance: f?.originKinds.length ? f.originKinds : ['manual'],
        })
        continue
      }
      if (m.total <= 0) continue
      if (m.type !== 'Ticket' && m.type !== 'Sastrería' && m.type !== 'Reserva') continue
      docs.push({
        docType: m.type as 'Ticket' | 'Sastrería' | 'Reserva',
        number: m.concept.replace(/^(Ticket|Sastrería|Reserva)\s+/, ''),
        client: m.client ?? '',
        date: m.date,
        base: m.base,
        vat: m.vat,
        total: m.total,
        counted: true,
        saleId: m.saleId,
        orderId: m.orderId,
        orderPaymentId: m.orderPaymentId,
        onlineOrderId: m.onlineOrderId,
        provenance: ['sin_factura'],
      })
    }
    return docs.sort((a, b) => b.date.localeCompare(a.date))
  }, [data])

  // Proveedores del año (desplegable del filtro), por orden alfabético
  const supplierOptions = useMemo(
    () => [...new Set((data?.apInvoices ?? []).map((f) => f.supplier.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [data],
  )

  // Con proveedor elegido, Movimientos muestra solo sus facturas recibidas
  const filteredLedger = useMemo(
    () => (data?.ledger ?? []).filter((m) =>
      inRange(m.date, fromDate, toDate) &&
      (!supplier || (m.type === 'Factura recibida' && (m.client ?? '').trim() === supplier)) &&
      (!matcher || matcher([m.concept, m.client, m.type], [m.base, m.vat, m.total]))),
    [data, fromDate, toDate, supplier, matcher],
  )
  // El filtro de proveedor no aplica a ingresos (ahí se busca por cliente con el buscador)
  const filteredIncomeDocs = useMemo(
    () => sortDocs(
      incomeDocs.filter((d) =>
        inRange(d.date, fromDate, toDate) &&
        (!provenance || d.provenance.includes(provenance)) &&
        (!matcher || matcher([d.number, d.client, d.docType, d.method, d.origin], [d.base, d.vat, d.total]))),
      sortKey,
      (d) => ({ date: d.date, number: d.number, name: d.client, total: d.total }),
    ),
    [incomeDocs, fromDate, toDate, provenance, matcher, sortKey],
  )
  const filteredApInvoices = useMemo(
    () => sortDocs(
      (data?.apInvoices ?? []).filter((f) =>
        inRange(f.date, fromDate, toDate) &&
        (!supplier || f.supplier.trim() === supplier) &&
        (!matcher || matcher([f.number, f.supplier, f.cif, f.note], [f.base, f.vat, f.total, f.retentionAmount]))),
      sortKey,
      (f) => ({ date: f.date, number: f.number, name: f.supplier, total: f.total }),
    ),
    [data, fromDate, toDate, supplier, matcher, sortKey],
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
  // Adquisiciones intracomunitarias con ISP: base y cuota autorrepercutida por
  // trimestre (0..3) y por mes (0..11)
  const isp = useMemo(() => {
    const zero = () => ({ base: 0, vat: 0, count: 0 })
    const q = [0, 1, 2, 3].map(zero), m = Array.from({ length: 12 }, zero)
    for (const f of (data?.apInvoices ?? []).filter(isIsp)) {
      const mo = Number(f.date.slice(5, 7))
      if (mo < 1 || mo > 12) continue
      for (const cell of [q[Math.ceil(mo / 3) - 1], m[mo - 1]]) {
        cell.base = n2(cell.base + f.base); cell.vat = n2(cell.vat + ispVat(f)); cell.count += 1
      }
    }
    const base = n2(q.reduce((s, c) => s + c.base, 0)), vat = n2(q.reduce((s, c) => s + c.vat, 0))
    return { byQuarter: q, byMonth: m, base, vat, count: q.reduce((s, c) => s + c.count, 0) }
  }, [data])
  // IVA soportado por tipo: las compras con ISP salen de la fila del 0 % (llegan
  // sin IVA) y van a una fila propia con su cuota autorrepercutida (deducible)
  const vatRows = useMemo<VatRowView[]>(() => {
    if (!data) return []
    if (isp.count === 0) return data.vatByRate
    const nearZero = (n: number) => Math.abs(n) < 0.005
    const rows: VatRowView[] = data.vatByRate
      .map((r) => r.rate !== 0 ? r : {
        ...r,
        byQuarter: r.byQuarter.map((c, i) => ({ base: n2(c.base - isp.byQuarter[i].base), vat: c.vat })),
        byMonth: r.byMonth.map((c, i) => ({ base: n2(c.base - isp.byMonth[i].base), vat: c.vat })),
        base: n2(r.base - isp.base),
      })
      .filter((r) => !(r.rate === 0 && nearZero(r.base) && nearZero(r.vat) && r.byMonth.every((c) => nearZero(c.base))))
    rows.push({
      rate: ISP_RATE, isp: true, base: isp.base, vat: isp.vat,
      byQuarter: isp.byQuarter.map((c) => ({ base: c.base, vat: c.vat })),
      byMonth: isp.byMonth.map((c) => ({ base: c.base, vat: c.vat })),
    })
    return rows
  }, [data, isp])
  // Ídem por mes (índice 0..11 = enero..diciembre)
  const retentionsByMonth = useMemo(() => {
    const arr = Array(12).fill(0) as number[]
    for (const f of retentionInvoices) arr[Number(f.date.slice(5, 7)) - 1] += f.retentionAmount
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
      if (!row) { row = { key, name, nif, byQuarter: [0, 0, 0, 0], total: 0, count: 0, extra: 0 }; map.set(key, row) }
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
      if (!row) { row = { key, name, nif: f.cif, byQuarter: [0, 0, 0, 0], total: 0, count: 0, extra: 0 }; map.set(key, row) }
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
      if (!row) { row = { key, name, nif: f.cif, byQuarter: [0, 0, 0, 0], total: 0, count: 0, extra: 0 }; map.set(key, row) }
      if (!row.nif && f.cif) row.nif = f.cif
      const q = quarterOf(f.date)
      if (q >= 1 && q <= 4) row.byQuarter[q - 1] = n2(row.byQuarter[q - 1] + f.base)
      row.total = n2(row.total + f.base)
      row.count += 1
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [data])

  // Con algún filtro activo (fechas, buscador o proveedor) se exporta SOLO el
  // detalle filtrado (movimientos y facturas); sin filtro, el informe anual completo.
  const onExcel = async () => {
    if (!data) return
    const detailSheets = [
      { name: 'Movimientos', rows: filteredLedger.map((m) => ({
        Fecha: m.date, Tipo: m.type, Concepto: m.concept, 'Cliente/Proveedor': m.client ?? '',
        Base: n2(m.base), IVA: n2(m.vat), Total: n2(m.total),
      })) },
      { name: 'Facturas ingresos', rows: filteredIncomeDocs.map((d) => ({
        Tipo: d.docType, 'Nº': d.number,
        Procedencia: d.provenance.map((p) => PROVENANCE[p].label).join(' + '), Referencia: d.origin ?? '',
        Cliente: d.client, Fecha: d.date,
        Base: n2(d.base), 'Tipo IVA %': docRate(d.base, d.vat) ?? 'mixto', IVA: n2(d.vat),
        Total: n2(d.total), Cobrado: d.collected ?? '', Pendiente: d.pending ?? '',
        Cuenta: d.counted ? 'SÍ' : 'Informativa',
        Estado: d.status ? INVOICE_STATUS[d.status] ?? d.status : '', Pago: d.method ?? '',
      })) },
      { name: 'Facturas gastos', rows: apDomestic.map((f) => ({
        'Nº': f.number, Proveedor: f.supplier, CIF: f.cif ?? '', Fecha: f.date,
        Base: n2(f.base), 'Tipo IVA %': f.vatRate ?? 'varios', IVA: n2(f.vat),
        'Tipo retención %': n2(f.retentionRate), 'Retención': n2(f.retentionAmount), Total: n2(f.total),
        Notas: f.note ?? '',
      })) },
      { name: 'Facturas intracomunitarias', rows: apIntraEU.map((f) => ({
        'Nº': f.number, Proveedor: f.supplier, 'NIF-IVA': f.cif ?? '', Fecha: f.date,
        Base: n2(f.base), 'Régimen': isIsp(f) ? `ISP ${ISP_RATE}%` : 'Con IVA',
        'Cuota autorrepercutida (devengada y deducible)': isIsp(f) ? ispVat(f) : 0,
        'IVA facturado': n2(f.vat), 'Total pagado': n2(f.total),
        Notas: f.note ?? '',
      })) },
    ]
    if (hasFilter) {
      await downloadExcelMulti(detailSheets, `escenario-c-${fromDate || 'inicio'}-a-${toDate || 'fin'}${query.trim() || supplier || provenance ? '-filtrado' : ''}`)
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
      { name: 'IVA mensual C', rows: data.C.monthlyVat.map((m, i) => ({
        Trimestre: `T${Math.ceil((i + 1) / 3)}`, Mes: MONTH_NAMES[i], 'Base ventas': n2(m.baseSales), 'IVA repercutido': n2(m.ivaRepercutido),
        'Base compras': n2(m.basePurchases), 'IVA soportado': n2(m.ivaSoportado), 'Resultado IVA': n2(m.resultado),
        'Retenciones': n2(retentionsByMonth[i]), 'Total a liquidar': n2(m.resultado + retentionsByMonth[i]),
      })) },
      { name: 'IVA soportado por tipo', rows: [1, 2, 3, 4].flatMap((q) =>
        vatRows
          .filter((r) => r.byQuarter[q - 1].base !== 0 || r.byQuarter[q - 1].vat !== 0)
          .map((r) => ({
            Trimestre: `T${q}`, 'Tipo IVA': rateText(r),
            Base: n2(r.byQuarter[q - 1].base), 'Cuota IVA': n2(r.byQuarter[q - 1].vat),
          }))
      ) },
      { name: 'IVA soportado tipo (mes)', rows: MONTH_NAMES.flatMap((mes, i) =>
        vatRows
          .filter((r) => r.byMonth[i].base !== 0 || r.byMonth[i].vat !== 0)
          .map((r) => ({
            Trimestre: `T${Math.ceil((i + 1) / 3)}`, Mes: mes, 'Tipo IVA': rateText(r),
            Base: n2(r.byMonth[i].base), 'Cuota IVA': n2(r.byMonth[i].vat),
          }))
      ) },
      { name: 'Intracomunitarias ISP', rows: [
        ...data.C.quarters.map((q, i) => ispExcelRow(`${q.quarter} (${q.period})`, q, isp.byQuarter[i])),
        ...data.C.monthlyVat.map((m, i) => ispExcelRow(MONTH_NAMES[i], m, isp.byMonth[i])),
      ] },
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

  const clearFilters = () => { setFromDate(''); setToDate(''); setQuery(''); setSupplier(''); setProvenance('') }

  // Detalle del cliente abierto (facturas, cobros que las liquidan, sin factura y mayor)
  const clientDetail = useMemo(() => {
    if (!data || !clientTarget) return null
    const noInvoiceDocs = incomeDocs.filter((d) => d.docType !== 'Factura' && d.client.trim().toUpperCase() === clientTarget.key)
    return buildClientDetail(clientTarget, data.invoices, data.ledger, noInvoiceDocs)
  }, [data, incomeDocs, clientTarget])

  // Detalle del proveedor abierto (facturas recibidas, pagos y saldo pendiente)
  const supplierDetail = useMemo(
    () => (data && supplierTarget ? buildSupplierDetail(supplierTarget, data.apInvoices) : null),
    [data, supplierTarget],
  )

  // Descarga en un ZIP: los documentos MARCADOS si hay alguno; si no, todos los
  // que se están viendo (con filtros y orden).
  // Ingresos: facturas (PDF guardado) y tickets/cobros (el PDF se genera aquí).
  // Gastos: adjuntos de las facturas de proveedor que lo tengan.
  const visibleIncome = useMemo(() => filteredIncomeDocs.filter(canDownloadDoc), [filteredIncomeDocs])
  const visibleExpense = useMemo(() => filteredApInvoices.filter((f) => f.attachmentPath), [filteredApInvoices])
  const bulkIncome = useMemo(
    () => (selInc.size ? incomeDocs.filter((d) => canDownloadDoc(d) && selInc.has(docKey(d))) : visibleIncome),
    [selInc, incomeDocs, visibleIncome],
  )
  const bulkExpense = useMemo(
    () => (selExp.size ? (data?.apInvoices ?? []).filter((f) => f.attachmentPath && selExp.has(f.attachmentPath)) : visibleExpense),
    [selExp, data, visibleExpense],
  )
  const bulkCount = docSide === 'ingresos' ? bulkIncome.length : bulkExpense.length
  const selectedCount = docSide === 'ingresos' ? selInc.size : selExp.size
  const toggleIn = (set: Set<string>, ids: string[], on: boolean) => {
    const next = new Set(set)
    for (const id of ids) { if (on) next.add(id); else next.delete(id) }
    return next
  }
  const onBulkDownload = async () => {
    if (bulk || bulkCount === 0) return
    // Los tickets y cobros se generan uno a uno en el navegador: avisar si son muchos
    const generated = docSide === 'ingresos' ? bulkIncome.filter((d) => !d.invoiceId).length : 0
    if ((bulkCount > 150 || generated > 60) && !window.confirm(`Vas a descargar ${bulkCount} documentos en un ZIP${generated ? ` (${generated} tickets o cobros se generan al vuelo)` : ''}. Puede tardar varios minutos. ¿Continuar?`)) return
    const range = fromDate || toDate ? `${fromDate || 'inicio'}-a-${toDate || 'fin'}` : String(year)
    setBulk({ done: 0, total: bulkCount })
    try {
      let items: ZipItem[]
      if (docSide === 'ingresos') {
        // Facturas sin PDF guardado: se genera en servidor, por lotes
        const missing = bulkIncome.filter((d) => d.invoiceId && !d.pdfUrl).map((d) => d.invoiceId!)
        const urls = new Map<string, string | null>()
        for (let i = 0; i < missing.length; i += 5) {
          const res = await getIssuedInvoicePdfUrls(missing.slice(i, i + 5))
          if (res.ok) for (const r of res.data) urls.set(r.id, r.url)
        }
        items = bulkIncome.map((d) => {
          const name = `${d.date} ${d.number} ${d.client}`.trim() + '.pdf'
          // Factura: PDF guardado (o recién generado). Ticket o cobro de
          // sastrería: no hay PDF, se arma en el navegador con sus datos.
          if (d.invoiceId) return { name, url: d.pdfUrl || urls.get(d.invoiceId) || null }
          return { name, blob: () => buildDocPdfBlob(d) }
        })
      } else {
        const urls: (string | null)[] = []
        for (let i = 0; i < bulkExpense.length; i += 200) {
          const res = await getApInvoicePdfUrls(bulkExpense.slice(i, i + 200).map((f) => f.attachmentPath!))
          urls.push(...(res.ok ? res.data : bulkExpense.slice(i, i + 200).map(() => null)))
        }
        items = bulkExpense.map((f, i) => ({
          name: `${f.date} ${f.supplier} ${f.number}${extFromUrl(f.attachmentPath)}`,
          url: urls[i] ?? null,
        }))
      }
      const { ok, failed } = await downloadZip(
        items,
        `${docSide === 'ingresos' ? 'documentos-ingresos' : 'facturas-recibidas'}-C-${range}`,
        (done, total) => setBulk({ done, total }),
      )
      if (failed.length) toast.warning(`${ok} descargadas · ${failed.length} sin archivo (lista dentro del ZIP)`)
      else toast.success(`${ok} facturas descargadas`)
    } catch {
      toast.error('No se pudo preparar la descarga')
    } finally {
      setBulk(null)
    }
  }

  // Barra de filtros de Movimientos y Facturas. `withSupplier` = mostrar el
  // desplegable de proveedor (no tiene sentido en Facturas → Ingresos).
  // Se invoca como función (no como <Componente/>) para que el input no se
  // desmonte en cada tecla y no pierda el foco.
  const filtersBar = (withSupplier: boolean, placeholder: string, extra?: ReactNode) => (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full sm:w-72"
      />
      {withSupplier && (
        <select
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          className="h-8 max-w-full rounded-md border border-input bg-white px-2 text-sm text-slate-700 sm:max-w-[16rem]"
          aria-label="Filtrar por proveedor"
        >
          <option value="">Todos los proveedores</option>
          {supplierOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {extra}
      <label className="text-xs text-slate-500">Desde</label>
      <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 w-40" />
      <label className="text-xs text-slate-500">Hasta</label>
      <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 w-40" />
      {hasFilter && (
        <button onClick={clearFilters} className="text-xs text-slate-500 underline hover:text-slate-700">
          Quitar filtros
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
          onChange={(y) => { setYear(y); clearFilters() }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={!data}
          onClick={onExcel}
          title={hasFilter ? 'Exporta solo los movimientos y facturas filtrados' : 'Exporta el informe anual completo'}
        >
          {hasFilter ? 'Exportar Excel (filtro)' : 'Exportar Excel'}
        </Button>
      </PageHeader>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'resumen', label: 'Resumen' },
          { key: 'iva', label: 'IVA' },
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
          <Tabs
            variant="segmented"
            active={ivaPeriod}
            onChange={(k) => setIvaPeriod(k as 'trimestres' | 'meses')}
            tabs={[
              { key: 'trimestres', label: 'Por trimestre' },
              { key: 'meses', label: 'Por mes' },
            ]}
          />
          {ivaPeriod === 'meses'
            ? <MonthVatTable view={data.C} variant="full" retentions={retentionsByMonth} ledger={data.ledger} />
            : <QuarterTable view={data.C} variant="full" retentions={retentionsByQuarter} ledger={data.ledger} />}
          <p className="text-xs text-slate-400">Pincha en un trimestre o en un mes para ver todos sus documentos con su base y su cuota de IVA.</p>
          {isp.count > 0 && <IntraIspCard view={data.C} isp={isp} byMonth={ivaPeriod === 'meses'} />}
          <VatByRateTable rows={vatRows} byMonth={ivaPeriod === 'meses'} invoices={data.apInvoices} />
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
          {filtersBar(true, 'Buscar concepto, cliente, proveedor o importe…')}
          {hasFilter && (
            <p className="text-xs text-slate-500">
              {filteredLedger.length} movimientos · ingresos {eur(filteredLedger.reduce((s, m) => s + (m.total > 0 ? m.total : 0), 0))}
              {' '}· gastos {eur(-filteredLedger.reduce((s, m) => s + (m.total < 0 ? m.total : 0), 0))}
            </p>
          )}
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
            <div className="flex flex-wrap items-center gap-2">
              {selectedCount > 0 && !bulk && (
                <button
                  onClick={() => (docSide === 'ingresos' ? setSelInc(new Set()) : setSelExp(new Set()))}
                  className="text-xs text-slate-500 underline hover:text-slate-700"
                >
                  Quitar selección
                </button>
              )}
              <Button
                variant={selectedCount > 0 ? 'default' : 'outline'}
                size="sm"
                onClick={onBulkDownload}
                disabled={!!bulk || bulkCount === 0}
                title={selectedCount > 0
                  ? 'Descarga en un ZIP solo los documentos marcados'
                  : docSide === 'ingresos'
                    ? 'Descarga en un ZIP los documentos que se ven en la lista: facturas, tickets y cobros de sastrería (marca casillas para elegir solo algunos)'
                    : 'Descarga en un ZIP los PDF de las facturas de proveedor que se ven en la lista (marca casillas para elegir solo algunas)'}
              >
                {bulk
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Descargando {bulk.done}/{bulk.total}…</>
                  : <><Download className="mr-1.5 h-3.5 w-3.5" />
                    {selectedCount > 0
                      ? `Descargar ${bulkCount} ${bulkCount === 1 ? 'seleccionado' : 'seleccionados'} (ZIP)`
                      : `Descargar ${bulkCount === 1 ? 'el visible' : `los ${bulkCount} visibles`} (ZIP)`}
                  </>}
              </Button>
            </div>
          </div>
          {(() => {
            const sortSelect = (
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-8 max-w-full rounded-md border border-input bg-white px-2 text-sm text-slate-700"
                aria-label="Ordenar"
              >
                {SORT_OPTIONS.map(([k, label]) => <option key={k} value={k}>Ordenar: {label}</option>)}
              </select>
            )
            return docSide === 'gastos'
              ? filtersBar(true, 'Buscar proveedor, nº, CIF, nota o importe…', sortSelect)
              : filtersBar(false, 'Buscar cliente, nº, ticket/pedido o importe…', (
                <>
                  <select
                    value={provenance}
                    onChange={(e) => setProvenance(e.target.value as Provenance | '')}
                    className="h-8 max-w-full rounded-md border border-input bg-white px-2 text-sm text-slate-700"
                    aria-label="Filtrar por procedencia"
                  >
                    <option value="">Toda procedencia</option>
                    {(Object.keys(PROVENANCE) as Provenance[]).map((p) => (
                      <option key={p} value={p}>{p === 'sin_factura' ? 'Sin factura (tickets y cobros)' : `Factura de ${PROVENANCE[p].label.toLowerCase()}`}</option>
                    ))}
                  </select>
                  {sortSelect}
                </>
              ))
          })()}
          {hasFilter && (
            <p className="text-xs text-slate-500">
              {docSide === 'ingresos'
                ? `${filteredIncomeDocs.length} documentos · ${eur(filteredIncomeDocs.reduce((s, d) => s + d.total, 0))}`
                : `${filteredApInvoices.length} facturas · ${eur(filteredApInvoices.reduce((s, f) => s + f.total, 0))}`}
            </p>
          )}

          {docSide === 'ingresos' ? (
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="w-8 pl-3 py-3">
                      <SelectAllBox
                        ids={visibleIncome.map(docKey)}
                        selected={selInc}
                        onChange={(ids, on) => setSelInc((s) => toggleIn(s, ids, on))}
                        label="Marcar todos los documentos visibles"
                      />
                    </th>
                    <th className="text-left px-3 py-3">Tipo</th>
                    <th className="text-left px-3 py-3">Nº</th>
                    <th className="text-left px-3 py-3">Procedencia</th>
                    <th className="text-left px-3 py-3">Cliente</th>
                    <th className="text-left px-3 py-3">Fecha</th>
                    <th className="text-right px-3 py-3">Base</th>
                    <th className="text-right px-3 py-3">IVA</th>
                    <th className="text-right px-3 py-3">Total</th>
                    <th className="text-right px-3 py-3">Cobrado</th>
                    <th className="text-right px-3 py-3">Pendiente</th>
                    <th className="text-left px-3 py-3">Estado</th>
                    <th className="text-left px-3 py-3">Pago</th>
                    <th className="text-right px-3 py-3">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIncomeDocs.length === 0 ? (
                    <tr><td colSpan={14} className="px-3 py-8 text-center text-slate-400">Sin documentos de ingreso.</td></tr>
                  ) : filteredIncomeDocs.map((d, i) => (
                    <tr
                      key={i}
                      className={selInc.has(docKey(d)) ? 'bg-sky-50/60' : d.counted ? 'hover:bg-slate-50/50' : 'bg-slate-50/40 text-slate-400'}
                      title={d.counted ? undefined : 'Informativa: esta venta se declaró por sus cobros, así que no suma en el total'}
                    >
                      <td className="w-8 pl-3 py-2">
                        {canDownloadDoc(d) && (
                          <input
                            type="checkbox"
                            checked={selInc.has(docKey(d))}
                            onChange={(e) => setSelInc((s) => toggleIn(s, [docKey(d)], e.target.checked))}
                            aria-label={`Marcar ${d.number}`}
                            className="h-4 w-4 cursor-pointer accent-prats-navy"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${TYPE_BADGE[d.docType] ?? 'bg-slate-100 text-slate-600'}`}>{d.docType}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{d.number}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {d.provenance.map((p) => (
                            <span key={p} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PROVENANCE[p].cls}`}>{PROVENANCE[p].label}</span>
                          ))}
                        </div>
                        {d.origin && <div className="mt-0.5 max-w-[16rem] font-mono text-[11px] leading-snug text-slate-500">{d.origin.replace(/^(Ticket|Pedidos?|Reservas?|Web)\s+/, '')}</div>}
                      </td>
                      <td className="px-3 py-2">{d.client || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-slate-500">{d.date}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{eur(d.base)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {eur(d.vat)} <span className="text-[10px] text-slate-400">({rateLabel(d.base, d.vat)})</span>
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{eur(d.total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d.collected === undefined
                          ? <span className="text-slate-300">—</span>
                          : <span className={d.collected > 0 ? 'text-emerald-700' : 'text-slate-400'}>{eur(d.collected)}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d.pending === undefined
                          ? <span className="text-slate-300">—</span>
                          : d.pending > 0.004
                            ? <span className="font-medium text-amber-700">{eur(d.pending)}</span>
                            : <span className="text-slate-400">{eur(0)}</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{d.status ? INVOICE_STATUS[d.status] ?? d.status : '—'}</td>
                      <td className="px-3 py-2 capitalize text-slate-500">{d.method || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <DownloadBtn saleId={d.docType !== 'Factura' ? d.saleId : undefined} orderId={d.docType !== 'Factura' ? d.orderId : undefined} orderPaymentId={d.docType !== 'Factura' ? d.orderPaymentId : undefined} onlineOrderId={d.docType !== 'Factura' ? d.onlineOrderId : undefined} pdfUrl={d.pdfUrl} invoiceId={d.docType === 'Factura' ? d.invoiceId : undefined} />
                      </td>
                    </tr>
                  ))}
                  {filteredIncomeDocs.length > 0 && (() => {
                    const counted = filteredIncomeDocs.filter((d) => d.counted)
                    const info = filteredIncomeDocs.length - counted.length
                    return (
                      <tr className={TOTAL_ROW}>
                        <td className="px-3 py-2.5" colSpan={6}>
                          TOTAL ventas ({counted.length} documentos)
                          {info > 0 && <span className="ml-1 font-normal text-slate-400">· {info} informativa{info === 1 ? '' : 's'} sin sumar</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{eur(counted.reduce((s, d) => s + d.base, 0))}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{eur(counted.reduce((s, d) => s + d.vat, 0))}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{eur(counted.reduce((s, d) => s + d.total, 0))}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{eur(counted.reduce((s, d) => s + (d.collected ?? 0), 0))}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{eur(counted.reduce((s, d) => s + (d.pending ?? 0), 0))}</td>
                        <td colSpan={3} />
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
              <p className="border-t p-3 text-xs text-slate-400">
                Ventas del escenario C, en base imponible + IVA (con su tipo). Manda el documento: una factura emitida es la venta, en su
                fecha; lo que no se factura cuenta por su ticket o su cobro. Cuando una factura sustituye a algo ya declarado en un
                trimestre anterior, aparece además su <strong>abono</strong> en negativo, con la fecha de la factura, para no tocar aquel
                trimestre. Las filas en gris son informativas: ventas anteriores al {DOC_RULE_LABEL} que se declararon por sus cobros, así
                que no suman. Cobrado y pendiente salen de los cobros de cada factura; en las facturas sueltas no hay ese dato («—»).
                Así el total cuadra con el Resumen y con el Mensual.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <ApInvoicesCard
                title="Facturas recibidas · nacionales y resto"
                tag={`${apDomestic.length} facturas`}
                rows={apDomestic}
                selected={selExp}
                onSelect={(ids, on) => setSelExp((s) => toggleIn(s, ids, on))}
                footnote="Facturas recibidas de proveedores nacionales (y de fuera de la UE) del año, sin proformas. El total es el importe
                del documento (base + IVA − retención); las retenciones se detallan en su pestaña. El tipo de IVA sale de las líneas de la
                factura; en las registradas sin desglose se deriva del cociente IVA/base."
              />
              <ApInvoicesCard
                title="Facturas intracomunitarias (UE)"
                tag={`${apIntraEU.length} facturas`}
                rows={apIntraEU}
                intra
                selected={selExp}
                onSelect={(ids, on) => setSelExp((s) => toggleIn(s, ids, on))}
                footnote={`Proveedores con NIF-IVA de otro país de la UE (adquisiciones intracomunitarias). Llegan sin IVA: régimen de
                inversión del sujeto pasivo (ISP), la empresa autorrepercute el IVA al ${ISP_RATE} % (devengado, casillas 10-11 del 303) y lo
                deduce a la vez (casillas 36-37 si son bienes corrientes, 28-29 si son servicios), sin efecto en el resultado. El total es lo
                pagado al proveedor (sin IVA). Se declaran en el modelo 349, no en el 347. «Con IVA» = proveedor UE que ya factura IVA
                español (sin ISP).`}
              />
            </div>
          )}
        </div>
      ) : (
        <ThirdPartiesTab
          year={year}
          clients={clients347}
          suppliers={suppliers347}
          intra={suppliersIntra}
          onClientClick={(r) => setClientTarget({ key: r.key, name: r.name, nif: r.nif })}
          onSupplierClick={(r) => setSupplierTarget({ key: r.key, name: r.name, nif: r.nif })}
        />
      )}
      <ClientLedgerDialog year={year} target={clientTarget} detail={clientDetail} onClose={() => setClientTarget(null)} />
      <SupplierLedgerDialog year={year} target={supplierTarget} detail={supplierDetail} onClose={() => setSupplierTarget(null)} />
    </div>
  )
}

/// Tabla de facturas recibidas de proveedor (gastos), con desglose base / tipo de
// IVA / IVA / retención / total y casilla para elegirlas en la descarga ZIP.
// `intra` = variante intracomunitaria: sin retención y con el régimen de
// inversión del sujeto pasivo (cuota autorrepercutida, que se deduce a la vez).
function ApInvoicesCard({ title, tag, rows, footnote, intra = false, selected, onSelect }: {
  title: string
  tag: string
  rows: ApInvoiceLite[]
  footnote: string
  intra?: boolean
  selected: Set<string>
  onSelect: (paths: string[], on: boolean) => void
}) {
  const cols = 11
  const selectable = rows.filter((f) => f.attachmentPath).map((f) => f.attachmentPath!)
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold text-prats-navy">{title}</span>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{tag}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="w-8 pl-3 py-3">
              <SelectAllBox ids={selectable} selected={selected} onChange={onSelect} label="Marcar todas las facturas visibles de esta tabla" />
            </th>
            <th className="text-left px-3 py-3">Nº</th>
            <th className="text-left px-3 py-3">Proveedor</th>
            <th className="text-left px-3 py-3">Fecha</th>
            <th className="text-right px-3 py-3">Base</th>
            {intra ? (
              <>
                <th className="text-left px-3 py-3">Régimen</th>
                <th className="text-right px-3 py-3" title="IVA que se autorrepercute (devengado) y se deduce a la vez en el 303">Cuota autorrep.</th>
                <th className="text-right px-3 py-3">IVA facturado</th>
              </>
            ) : (
              <>
                <th className="text-right px-3 py-3">Tipo IVA</th>
                <th className="text-right px-3 py-3">IVA</th>
                <th className="text-right px-3 py-3">Retención</th>
              </>
            )}
            <th className="text-right px-3 py-3">Total</th>
            <th className="text-left px-3 py-3">Notas</th>
            <th className="text-right px-3 py-3">PDF</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={cols} className="px-3 py-8 text-center text-slate-400">Sin facturas.</td></tr>
          ) : rows.map((f, i) => {
            const isSel = !!f.attachmentPath && selected.has(f.attachmentPath)
            const isp = intra && isIsp(f)
            return (
              <tr key={i} className={isSel ? 'bg-sky-50/60' : 'hover:bg-slate-50/50'}>
                <td className="w-8 pl-3 py-2">
                  {f.attachmentPath && (
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={(e) => onSelect([f.attachmentPath!], e.target.checked)}
                      aria-label={`Marcar ${f.number}`}
                      className="h-4 w-4 cursor-pointer accent-prats-navy"
                    />
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-700">{f.number}</td>
                <td className="px-3 py-2">
                  {f.supplier}
                  {intra && f.cif && <span className="ml-1.5 text-[10px] font-mono text-slate-400">{f.cif}</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">{f.date}</td>
                <td className="px-3 py-2 text-right tabular-nums">{eur(f.base)}</td>
                {intra ? (
                  <>
                    <td className="px-3 py-2">
                      {isp
                        ? <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">ISP {pct(ISP_RATE)}</span>
                        : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200" title="El proveedor factura con IVA: no hay inversión del sujeto pasivo">Con IVA ({f.vatRate === null ? 'varios' : pct(f.vatRate)})</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{isp ? eur(ispVat(f)) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.vat !== 0 ? eur(f.vat) : <span className="text-slate-300">—</span>}</td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 text-right text-slate-500">{f.vatRate === null ? 'varios' : pct(f.vatRate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{eur(f.vat)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {f.retentionAmount !== 0
                        ? <span className="text-amber-700">−{eur(f.retentionAmount)} <span className="text-[10px] text-amber-600/80">({pct(f.retentionRate)})</span></span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  </>
                )}
                <td className="px-3 py-2 text-right font-medium tabular-nums">{eur(f.total)}</td>
                <td className="px-3 py-2 max-w-[18rem] text-slate-600">
                  {f.note
                    ? <span className="block truncate" title={f.note}>{f.note}</span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2 text-right"><DownloadBtn apPath={f.attachmentPath} /></td>
              </tr>
            )
          })}
          {rows.length > 0 && (
            <tr className={TOTAL_ROW}>
              <td className="px-3 py-2.5" colSpan={4}>TOTAL ({rows.length} facturas)</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{eur(rows.reduce((s, f) => s + f.base, 0))}</td>
              {intra ? (
                <>
                  <td />
                  <td className="px-3 py-2.5 text-right tabular-nums">{eur(rows.reduce((s, f) => s + (isIsp(f) ? ispVat(f) : 0), 0))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{eur(rows.reduce((s, f) => s + f.vat, 0))}</td>
                </>
              ) : (
                <>
                  <td />
                  <td className="px-3 py-2.5 text-right tabular-nums">{eur(rows.reduce((s, f) => s + f.vat, 0))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{eur(rows.reduce((s, f) => s + f.retentionAmount, 0))}</td>
                </>
              )}
              <td className="px-3 py-2.5 text-right tabular-nums">{eur(rows.reduce((s, f) => s + f.total, 0))}</td>
              <td />
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t p-3 text-xs text-slate-400">{footnote}</p>
    </div>
  )
}

// Casilla de cabecera: marca/desmarca todas las filas visibles (indeterminada si
// solo hay algunas marcadas).
function SelectAllBox({ ids, selected, onChange, label }: {
  ids: string[]
  selected: Set<string>
  onChange: (ids: string[], on: boolean) => void
  label: string
}) {
  const marked = ids.filter((id) => selected.has(id)).length
  const all = ids.length > 0 && marked === ids.length
  return (
    <input
      type="checkbox"
      disabled={ids.length === 0}
      checked={all}
      ref={(el) => { if (el) el.indeterminate = marked > 0 && !all }}
      onChange={() => onChange(ids, !all)}
      aria-label={label}
      title={label}
      className="h-4 w-4 cursor-pointer accent-prats-navy disabled:cursor-default"
    />
  )
}

// Pestaña Clientes · 347: cuánto se ha facturado/cobrado a cada cliente y cuánto
// ha facturado cada proveedor en el año, con desglose trimestral (el 347 se
// declara por trimestres) y marca sobre los que superan los 3.005,06 €.
function ThirdPartiesTab({ year, clients, suppliers, intra, onClientClick, onSupplierClick }: {
  year: number
  clients: ThirdPartyRow[]
  suppliers: ThirdPartyRow[]
  intra: ThirdPartyRow[]
  onClientClick: (row: ThirdPartyRow) => void
  onSupplierClick: (row: ThirdPartyRow) => void
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
          onRowClick={onClientClick}
          footnote="Facturado = facturas emitidas del año (IVA incluido, criterio del 347), con su desglose por trimestre. «Cobros sin
          factura» son los tickets y cobros de sastrería del escenario C sin factura asociada: no van al 347, pero sirven para ver el
          volumen real por cliente. En dorado, los clientes que superan los 3.005,06 € facturados (declarables en el 347). Pincha en
          un cliente para ver su facturación y su libro mayor; pincha en una cabecera para ordenar."
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
            onRowClick={onSupplierClick}
            footnote="Volumen anual por proveedor: base + IVA de sus facturas recibidas (criterio del 347), por trimestre. En dorado, los
            que superan los 3.005,06 €. Ojo: las operaciones con retención de IRPF (profesionales, alquileres) ya se declaran en los
            modelos 190/180 y no se incluyen en el 347. Pincha en un proveedor para ver sus facturas y su libro mayor; pincha en una
            cabecera para ordenar."
          />
          <ThirdPartyTable
            title="Proveedores intracomunitarios (349)"
            tag={`Ejercicio ${year}`}
            nameLabel="Proveedor"
            totalLabel="Base año"
            rows={intra.filter(match)}
            noThreshold
            onRowClick={onSupplierClick}
            footnote="Adquisiciones intracomunitarias por proveedor, en BASE imponible (criterio del modelo 349, que no tiene umbral
            mínimo). Estas operaciones van al 349, no al 347, y llevan inversión del sujeto pasivo. Pincha en un proveedor para ver el
            detalle."
          />
        </div>
      )}
    </div>
  )
}

// Tabla genérica de agregado anual por tercero con desglose trimestral.
type ThirdPartySortCol = 'name' | 'nif' | 'q0' | 'q1' | 'q2' | 'q3' | 'total' | 'extra' | 'count'
const tpValue = (r: ThirdPartyRow, col: ThirdPartySortCol): string | number =>
  col === 'name' ? r.name : col === 'nif' ? (r.nif ?? '') : col[0] === 'q' ? r.byQuarter[Number(col[1])] : r[col as 'total' | 'extra' | 'count']

function ThirdPartyTable({ title, tag, nameLabel, totalLabel, extraLabel, rows: rawRows, footnote, noThreshold = false, onRowClick }: {
  title: string
  tag: string
  nameLabel: string
  totalLabel: string
  extraLabel?: string
  rows: ThirdPartyRow[]
  footnote: string
  noThreshold?: boolean
  onRowClick?: (row: ThirdPartyRow) => void
}) {
  // Orden alfabético por defecto; pinchar una cabecera ordena por ella (otra vez = invierte)
  const [sort, setSort] = useState<{ col: ThirdPartySortCol; dir: 1 | -1 }>({ col: 'name', dir: 1 })
  const rows = useMemo(() => [...rawRows].sort((a, b) => {
    const va = tpValue(a, sort.col), vb = tpValue(b, sort.col)
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' })
    return cmp * sort.dir || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  }), [rawRows, sort])
  const header = (col: ThirdPartySortCol, label: string, right = false) => {
    const active = sort.col === col
    const Icon = active ? (sort.dir === 1 ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <th className={`px-3 py-3 ${right ? 'text-right' : 'text-left'}`} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          onClick={() => setSort((s) => (s.col === col
            ? { col, dir: s.dir === 1 ? -1 : 1 }
            // Texto empieza A→Z; importes, de mayor a menor
            : { col, dir: col === 'name' || col === 'nif' ? 1 : -1 }))}
          className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-prats-navy ${active ? 'text-prats-navy' : ''}`}
        >
          {label}
          <Icon className={`h-3 w-3 ${active ? '' : 'opacity-40'}`} />
        </button>
      </th>
    )
  }
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
            {header('name', nameLabel)}
            {header('nif', 'NIF')}
            {header('q0', 'T1', true)}
            {header('q1', 'T2', true)}
            {header('q2', 'T3', true)}
            {header('q3', 'T4', true)}
            {header('total', totalLabel, true)}
            {extraLabel && header('extra', extraLabel, true)}
            {header('count', 'Nº docs', true)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={cols} className="px-3 py-8 text-center text-slate-400">Sin registros.</td></tr>
          ) : rows.map((r, i) => {
            const over = !noThreshold && r.total > THRESHOLD_347
            return (
              <tr
                key={r.key || i}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`${over ? 'bg-prats-gold/5 hover:bg-prats-gold/10' : 'hover:bg-slate-50/50'} ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                <td className="px-3 py-2 font-medium text-slate-700">
                  {onRowClick
                    ? <span className="underline decoration-slate-300 underline-offset-2 hover:text-prats-navy hover:decoration-prats-navy">{r.name}</span>
                    : r.name}
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
function VatByRateTable({ rows, byMonth = false, invoices = [] }: { rows: VatRowView[]; byMonth?: boolean; invoices?: ApInvoiceLite[] }) {
  const [open, setOpen] = useState<string | null>(null)
  // Facturas de ese periodo y ese tipo (las de varios tipos no encajan en ninguna fila)
  const detailFor = (group: string, rate: number, isp?: boolean) => invoices.filter((f) => {
    const mi = Number(f.date.slice(5, 7)) - 1
    const inPeriod = byMonth ? MONTH_NAMES[mi] === group : `T${Math.ceil((mi + 1) / 3)}` === group
    return inPeriod && (isp ? isIsp(f) : !isIsp(f) && f.vatRate === rate)
  }).sort((a, b) => a.date.localeCompare(b.date))
  // `group` = etiqueta de la primera columna (T1… o Enero…); solo se pinta en la
  // primera fila de cada grupo.
  const cells = byMonth
    ? MONTH_NAMES.flatMap((mes, i) =>
      rows
        .filter((r) => r.byMonth[i].base !== 0 || r.byMonth[i].vat !== 0)
        .map((r) => ({ group: mes, rate: r.rate, isp: r.isp, base: r.byMonth[i].base, vat: r.byMonth[i].vat })))
    : [1, 2, 3, 4].flatMap((q) =>
      rows
        .filter((r) => r.byQuarter[q - 1].base !== 0 || r.byQuarter[q - 1].vat !== 0)
        .map((r) => ({ group: `T${q}`, rate: r.rate, isp: r.isp, base: r.byQuarter[q - 1].base, vat: r.byQuarter[q - 1].vat })))
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
            <th className="text-left px-4 py-2.5">{byMonth ? 'Mes' : 'Trimestre'}</th>
            <th className="text-left px-4 py-2.5">Tipo</th>
            <th className="text-right px-4 py-2.5">Base</th>
            <th className="text-right px-4 py-2.5">Cuota IVA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cells.length === 0 ? (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Sin facturas recibidas.</td></tr>
          ) : cells.map((c, i) => {
            const key = `${c.group}·${c.isp ? 'isp' : c.rate}`
            const rowsDetail = open === key ? detailFor(c.group, c.rate, c.isp) : []
            return (
              <Fragment key={key}>
                <tr className="cursor-pointer hover:bg-slate-50/60" onClick={() => setOpen((o) => (o === key ? null : key))}>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">{i === 0 || cells[i - 1].group !== c.group ? c.group : ''}</td>
                  <td className={`px-4 py-2.5 ${c.isp ? 'text-indigo-700' : 'text-slate-600'}`}>
                    {open === key
                      ? <ChevronDown className="mr-1 inline h-3.5 w-3.5 text-slate-400" />
                      : <ChevronRight className="mr-1 inline h-3.5 w-3.5 text-slate-400" />}
                    {rateText(c)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{eur(c.base)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{eur(c.vat)}</td>
                </tr>
                {open === key && (
                  <tr>
                    <td colSpan={4} className="bg-slate-50/60 p-3">
                      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                        <div className="flex items-baseline justify-between border-b border-slate-200 px-3 py-2">
                          <span className="text-xs font-semibold text-prats-navy">Facturas recibidas · {c.group} · {rateText(c)}</span>
                          <span className="text-[11px] text-slate-500">{rowsDetail.length} facturas</span>
                        </div>
                        {rowsDetail.length === 0 ? (
                          <p className="px-3 py-4 text-center text-xs text-slate-400">
                            Sin facturas con ese tipo exacto (las de varios tipos se reparten por líneas y no salen aquí).
                          </p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                              <tr>
                                <th className="px-2 py-1.5 text-left">Fecha</th>
                                <th className="px-2 py-1.5 text-left">Nº</th>
                                <th className="px-2 py-1.5 text-left">Proveedor</th>
                                <th className="px-2 py-1.5 text-right">Base</th>
                                <th className="px-2 py-1.5 text-right">Cuota IVA</th>
                                <th className="px-2 py-1.5 text-right">Total</th>
                                <th className="px-2 py-1.5 text-right">PDF</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {rowsDetail.map((f) => (
                                <tr key={f.id} className="hover:bg-slate-50/60">
                                  <td className="whitespace-nowrap px-2 py-1.5 text-slate-500">{f.date}</td>
                                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-slate-700">{f.number}</td>
                                  <td className="px-2 py-1.5 text-slate-600">{f.supplier}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{eur(f.base)}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{eur(c.isp ? ispVat(f) : f.vat)}</td>
                                  <td className="px-2 py-1.5 text-right font-medium tabular-nums">{eur(f.total)}</td>
                                  <td className="px-2 py-1.5 text-right"><DownloadBtn apPath={f.attachmentPath} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
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
        clasifican por su tipo efectivo (IVA / base). «ISP intracomunitaria» = compras a proveedores de la UE sin IVA: su cuota
        es la autorrepercutida, que se deduce en la misma declaración.
      </p>
    </div>
  )
}

type IspCell = { base: number; vat: number; count: number }
type IvaRowLike = { baseSales: number; ivaRepercutido: number; basePurchases: number; ivaSoportado: number; resultado: number }
// Fila del Excel "Intracomunitarias ISP": el 303 con la autorrepercusión sumada a
// ambos lados (devengado y deducible); el resultado no cambia.
function ispExcelRow(periodo: string, r: IvaRowLike, c: IspCell) {
  return {
    Periodo: periodo,
    'Base adquisiciones intracom.': n2(c.base),
    'Cuota autorrepercutida (cas. 11)': n2(c.vat),
    'Cuota deducible intracom.': n2(c.vat),
    'IVA devengado total': n2(r.ivaRepercutido + c.vat),
    'IVA deducible total': n2(r.ivaSoportado + c.vat),
    'Resultado IVA': n2(r.resultado),
    'Nº facturas': c.count,
  }
}

// Adquisiciones intracomunitarias con inversión del sujeto pasivo, por trimestre
// o mes, y cómo quedan los totales del 303 al sumarlas: el IVA autorrepercutido
// va al devengado y el mismo importe al deducible (resultado sin cambios).
function IntraIspCard({ view, isp, byMonth }: {
  view: AccountingView
  isp: { byQuarter: IspCell[]; byMonth: IspCell[]; base: number; vat: number; count: number }
  byMonth: boolean
}) {
  const periods = byMonth
    ? view.monthlyVat.map((m, i) => ({ label: MONTH_NAMES[i], row: m as IvaRowLike, c: isp.byMonth[i] }))
    : view.quarters.map((q, i) => ({ label: `${q.quarter} (${q.period})`, row: q as IvaRowLike, c: isp.byQuarter[i] }))
  const TH = 'px-3 py-2.5 text-right'
  const TD = 'px-3 py-2 text-right tabular-nums'
  const tot = periods.reduce((a, p) => ({ rep: a.rep + p.row.ivaRepercutido, sop: a.sop + p.row.ivaSoportado, res: a.res + p.row.resultado }), { rep: 0, sop: 0, res: 0 })
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold text-prats-navy">Adquisiciones intracomunitarias · inversión del sujeto pasivo</span>
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{isp.count} facturas · ISP {pct(ISP_RATE)}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2.5 text-left">{byMonth ? 'Mes' : 'Trimestre'}</th>
            <th className={TH}>Base adquisiciones</th>
            <th className={TH}>IVA autorrepercutido</th>
            <th className={TH}>IVA deducible intracom.</th>
            <th className={TH}>IVA devengado total</th>
            <th className={TH}>IVA deducible total</th>
            <th className={TH}>Resultado IVA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {periods.map((p) => (
            <tr key={p.label} className="hover:bg-slate-50/60">
              <td className="px-3 py-2 font-medium text-slate-700">{p.label}</td>
              <td className={TD}>{p.c.base !== 0 ? eur(p.c.base) : <span className="text-slate-300">—</span>}</td>
              <td className={`${TD} text-indigo-700`}>{p.c.vat !== 0 ? eur(p.c.vat) : <span className="text-slate-300">—</span>}</td>
              <td className={`${TD} text-indigo-700`}>{p.c.vat !== 0 ? eur(p.c.vat) : <span className="text-slate-300">—</span>}</td>
              <td className={TD}>{eur(p.row.ivaRepercutido + p.c.vat)}</td>
              <td className={TD}>{eur(p.row.ivaSoportado + p.c.vat)}</td>
              <td className={`${TD} font-semibold`}>{eur(p.row.resultado)}</td>
            </tr>
          ))}
          <tr className={TOTAL_ROW}>
            <td className="px-3 py-2.5">TOTAL año</td>
            <td className={TD}>{eur(isp.base)}</td>
            <td className={TD}>{eur(isp.vat)}</td>
            <td className={TD}>{eur(isp.vat)}</td>
            <td className={TD}>{eur(tot.rep + isp.vat)}</td>
            <td className={TD}>{eur(tot.sop + isp.vat)}</td>
            <td className={TD}>{eur(tot.res)}</td>
          </tr>
        </tbody>
      </table>
      <p className="border-t p-3 text-xs text-slate-400">
        Compras a proveedores con NIF-IVA de otro país de la UE facturadas sin IVA. La empresa autorrepercute el IVA español al
        {' '}{pct(ISP_RATE)} y lo deduce a la vez: modelo 303, IVA devengado casillas 10-11 (adquisiciones intracomunitarias) y
        deducible casillas 36-37 (bienes corrientes; 38-39 si son bienes de inversión, 28-29 si son servicios). El resultado no
        cambia, pero ambos importes deben declararse; las operaciones se relacionan además en el modelo 349. «IVA devengado / deducible
        total» = importes de la tabla de IVA más la autorrepercusión. Se excluyen los proveedores UE que ya facturan con IVA.
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
