'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate, getOrderStatusLabel } from '@/lib/utils'
import { getStatusesFor } from '@/lib/orders/statuses'
import { getLineGroup, getLineName, type LineGroup } from '@/lib/orders/line-groups'
import { buildLineRefSuffixes, sortLinesForDisplay } from '@/lib/orders/line-refs'
import { PaymentHistory } from '@/components/payments/payment-history'
import { getOrder, markLineDelivered, updateOrderStatus } from '@/actions/orders'
import { getAlterationsByOrder, updateAlterationStatus } from '@/actions/alterations'
import type { AlterationRow } from '@/types/alterations'
import { generateFichaForLine, generateFichaForLineCamiseria } from '@/lib/pdf/ficha-confeccion'
import { generateTicketComplemento } from '@/lib/pdf/ticket-boutique'
import { generateTailoringOrderTicketPdf } from '@/lib/pdf/tailoring-order-ticket'
import { NewAlterationDialog } from '@/app/(sastre)/sastre/arreglos/arreglos-content'
import { statusChangeToast } from '@/lib/orders/status-toast'
import { EditOrderDialog } from '@/components/orders/edit-order-dialog'
import { EditFichaDialog } from '@/components/orders/edit-ficha-dialog'
import { LinePhotosViewer } from '@/components/orders/line-photos-viewer'
import { getOrderLinePhotosBatch } from '@/actions/order-line-photos'
import { Input } from '@/components/ui/input'
import { Plus, Scissors, Loader2, Pencil, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { useActiveStore } from '@/hooks/use-store'

/** Normaliza para búsqueda: minúsculas y sin acentos. */
function normalizeSearch(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function isLineCamiseria(line: any): boolean {
  const cfg = line?.configuration ?? {}
  return cfg.tipo === 'camiseria' || cfg.puno !== undefined
}

/** True si la línea es "camisa" por prenda/prendaLabel (línea principal camisería sin tipo/puno). */
function isLineCamisaByPrenda(line: any): boolean {
  const cfg = line?.configuration ?? {}
  const prenda = (cfg.prenda as string)?.trim().toLowerCase()
  if (prenda === 'camisa') return true
  const label = (cfg.prendaLabel as string)?.trim().toLowerCase()
  return label === 'camisa'
}

function isComplemento(line: any): boolean {
  return getLineGroup(line) === 'complementos'
}

export function SastrePedidoDetailContent({ order: orderProp }: { order: any }) {
  const [order, setOrder] = useState(orderProp)
  useEffect(() => {
    setOrder(orderProp)
  }, [orderProp])

  const clientName = order.clients?.full_name ?? order.client_id ?? '—'
  const router = useRouter()
  const { activeStoreId } = useActiveStore()
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null)
  const [ticketLoadingId, setTicketLoadingId] = useState<string | null>(null)
  const [lineQuery, setLineQuery] = useState('')

  // Arreglos del pedido
  const [orderAlterations, setOrderAlterations] = useState<AlterationRow[]>([])
  const [alterationsLoading, setAlterationsLoading] = useState(true)
  const [alterationDialogOpen, setAlterationDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingFichaLine, setEditingFichaLine] = useState<any | null>(null)

  const LOCKED = new Set(['delivered', 'cancelled'])
  const canEditFicha = !LOCKED.has(order?.status)

  const loadAlterations = useCallback(async () => {
    setAlterationsLoading(true)
    const res = await getAlterationsByOrder({ tailoring_order_id: order.id })
    if (res.success) setOrderAlterations(res.data)
    setAlterationsLoading(false)
  }, [order.id])

  useEffect(() => { loadAlterations() }, [loadAlterations])

  const refreshOrder = async () => {
    const res = await getOrder(order.id)
    if (res?.success && res?.data) setOrder(res.data)
  }

  // Orden estable + agrupado: las prendas de un mismo traje/chaqué salen
  // consecutivas (chaqueta → chaleco → pantalón) aunque la BD las devuelva
  // desordenadas o el sort_order haya quedado intercalado por ediciones.
  const lines: any[] = sortLinesForDisplay<any>(order?.tailoring_order_lines ?? [])
  // Referencia por prenda (la misma que imprime la boleta): PIN-…-AMER-TRJ1
  const lineRefs = buildLineRefSuffixes(lines)

  // Fotos por prenda (signed URLs) — 1 sola llamada batch, no N+1.
  const lineIdsKey = lines.map((l: { id: string }) => l.id).filter(Boolean).join(',')
  const photosSig = lines.map((l: { id: string; photos?: string[] }) => (l.photos || []).join('+')).join('|')
  const [photosByLine, setPhotosByLine] = useState<Record<string, { path: string; url: string }[]>>({})
  useEffect(() => {
    const ids = lineIdsKey ? lineIdsKey.split(',') : []
    if (ids.length === 0) { setPhotosByLine({}); return }
    let cancelled = false
    getOrderLinePhotosBatch(ids).then((res) => { if (!cancelled && res.success) setPhotosByLine(res.data) })
    return () => { cancelled = true }
  }, [lineIdsKey, photosSig])

  const hasCamiseriaLines = lines.some((l: any) => isLineCamiseria(l))
  const visibleLines = hasCamiseriaLines
    ? lines.filter(
        (l: any) =>
          !(!isLineCamiseria(l) && !isComplemento(l) && isLineCamisaByPrenda(l))
      )
    : lines

  const deliveredCount = visibleLines.filter((l: any) => l.delivered_at).length
  const totalCount = visibleLines.length

  // Texto buscable por prenda: nombre, referencia y campos útiles del taller.
  const buildLineSearchText = (line: any): string => {
    const cfg = line?.configuration ?? {}
    const ref = lineRefs.get(String(line.id))
    return normalizeSearch(
      [
        getLineName(line),
        ref,
        ref ? `${order.order_number}-${ref}` : '',
        line?.garment_types?.name,
        cfg.prendaLabel,
        cfg.prenda,
        cfg.product_name,
        cfg.modCuello,
        cfg.puno,
        line?.model_name,
        line?.fabric_description,
        line?.finishing_notes,
      ]
        .filter(Boolean)
        .join(' ')
    )
  }

  const normalizedQuery = normalizeSearch(lineQuery).trim()
  const matchesQuery = (line: any) =>
    normalizedQuery === '' || buildLineSearchText(line).includes(normalizedQuery)

  const groupLines = (group: LineGroup) =>
    visibleLines.filter((l: any) => getLineGroup(l) === group && matchesQuery(l))

  const sastreriaLines = groupLines('sastreria')
  const camiseriaLines = groupLines('camiseria')
  const complementosLines = groupLines('complementos')
  const filteredCount = sastreriaLines.length + camiseriaLines.length + complementosLines.length

  const handleMarkDelivered = async (lineId: string) => {
    setMarkingId(lineId)
    try {
      const res = await markLineDelivered(lineId)
      if (res?.success) await refreshOrder()
    } finally {
      setMarkingId(null)
    }
  }

  const handleDownloadFichaSastreria = async (line: any) => {
    if (!order) return
    setPdfLoadingId(line.id)
    try {
      await generateFichaForLine(order, line)
    } finally {
      setPdfLoadingId(null)
    }
  }

  const handleDownloadFicha = async (line: any, lineIndex: number) => {
    if (!order) return
    setPdfLoadingId(line.id)
    try {
      await generateFichaForLineCamiseria(order, line, lineIndex)
    } finally {
      setPdfLoadingId(null)
    }
  }

  const handleDownloadTicketComplemento = async (line: any) => {
    if (!order) return
    setTicketLoadingId(line.id)
    try {
      await generateTicketComplemento(order, line)
    } finally {
      setTicketLoadingId(null)
    }
  }

  // Fuente única compartida con el admin (src/lib/orders/statuses.ts) — el
  // sastre ve exactamente los mismos estados que el admin para el mismo tipo.
  const typeStatuses = getStatusesFor(order?.order_type)
  const statusOptions = (typeStatuses as readonly string[]).includes(order?.status)
    ? [...typeStatuses]
    : [order?.status, ...typeStatuses].filter(Boolean) as string[]

  const handleStatusChange = async (newStatus: string) => {
    if (!order?.id || newStatus === order.status) return
    const res = await updateOrderStatus({ orderId: order.id, newStatus })
    if (res?.success) {
      statusChangeToast((res.data as { ahead_lines_count?: number })?.ahead_lines_count ?? 0)
      await refreshOrder()
    }
  }

  const LINE_STATUS_COLORS: Record<string, string> = {
    created:       'bg-gray-400',
    in_production: 'bg-blue-400',
    in_fitting:    'bg-amber-400',
    finished:      'bg-green-400',
    delivered:     'bg-emerald-400',
  }

  const handleLineStatusChange = async (lineId: string, newStatus: string) => {
    const res = await updateOrderStatus({ orderId: order.id, lineId, newStatus })
    if (res?.success) await refreshOrder()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="border-white/10 bg-white/[0.04] shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">{order.order_number}</h2>
              <p className="text-white/60 text-sm mt-0.5">Cliente: {clientName}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-3 py-1 rounded-lg bg-white/[0.08] text-white/70 border border-white/10">
                {getOrderStatusLabel(order.status)}
              </span>
              {!['delivered', 'cancelled'].includes(order.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 bg-white/[0.04] text-white border-white/15 hover:bg-white/10"
                  onClick={() => setEditDialogOpen(true)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              )}
              <select
                value={order.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="bg-white/[0.07] text-white border border-white/15 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 cursor-pointer focus:outline-none focus:border-[#c9a96e]/50 transition-all [&>option]:bg-[#0d1629] [&>option]:text-white"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{getOrderStatusLabel(s)}</option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide">Fecha</p>
            <p className="text-white">{formatDate(order.order_date)}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide">Total</p>
            <p className="text-white">
              {formatCurrency(order.total)}
              {(() => {
                const ls = order.tailoring_order_lines || []
                const gifts = ls.filter((l: any) => l.is_gift === true).length
                if (gifts === 0) return null
                return (
                  <span className="ml-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-400/50 text-amber-300 align-middle">
                    {gifts === ls.length ? 'Regalo' : 'Incl. regalo'}
                  </span>
                )
              })()}
            </p>
          </div>
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide">Pagado</p>
            <p className="text-white">{formatCurrency(order.total_paid ?? 0)}</p>
          </div>
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide">Pendiente</p>
            <p className="text-amber-400 font-medium">{formatCurrency(order.total_pending ?? 0)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Ticket global */}
      <Button
        className="bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] hover:bg-[#c9a96e]/25 gap-2"
        disabled={pdfLoadingId === 'ticket-global'}
        onClick={async () => {
          setPdfLoadingId('ticket-global')
          try { await generateTailoringOrderTicketPdf(order) } finally { setPdfLoadingId(null) }
        }}
      >
        {pdfLoadingId === 'ticket-global' ? 'Generando...' : 'Imprimir ticket del pedido'}
      </Button>

      {/* Piezas del pedido */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <h3 className="text-base font-semibold text-white mb-4">Piezas del pedido</h3>
        {totalCount === 0 ? (
          <p className="text-gray-400 text-sm">No hay líneas en este pedido.</p>
        ) : (
          <>
            <p className="text-sm text-white/50 mb-2">
              {deliveredCount} de {totalCount} entregadas
            </p>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-green-600 transition-all duration-300"
                style={{ width: totalCount ? `${(deliveredCount / totalCount) * 100}%` : '0%' }}
              />
            </div>

            {/* Buscador de prendas dentro del pedido */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
              <Input
                value={lineQuery}
                onChange={(e) => setLineQuery(e.target.value)}
                placeholder="Buscar prenda por nombre, referencia, tejido..."
                className="pl-9 pr-9 bg-white/[0.05] border-white/15 text-white placeholder:text-white/40 focus-visible:border-[#c9a96e]/50"
              />
              {lineQuery && (
                <button
                  type="button"
                  onClick={() => setLineQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {normalizedQuery !== '' && (
              <p className="text-xs text-white/50 mb-3">
                {filteredCount === 0
                  ? 'Ninguna prenda coincide con la búsqueda.'
                  : `${filteredCount} de ${totalCount} prendas coinciden`}
              </p>
            )}

            {sastreriaLines.length > 0 && (
              <>
                <p className="text-xs font-semibold text-[#c9a96e] uppercase tracking-[0.15em] mb-3 mt-5">Sastrería</p>
                {sastreriaLines.map((line: any) => (
                  <div key={line.id} className="border-b border-white/[0.06] last:border-b-0">
                  <div className="flex items-center justify-between py-3">
                    <span className="mr-2" aria-hidden>👕</span>
                    <span className="text-white flex-1 min-w-0">
                      {getLineName(line)}
                      {lineRefs.get(String(line.id)) && (
                        <span className="ml-2 font-mono text-[11px] text-white/45 bg-white/[0.06] border border-white/10 rounded px-1.5 py-0.5">
                          {order.order_number}-{lineRefs.get(String(line.id))}
                        </span>
                      )}
                    </span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ml-2 ${LINE_STATUS_COLORS[line.status] || 'bg-gray-400'}`} />
                    <select
                      value={line.status || 'created'}
                      onChange={(e) => handleLineStatusChange(line.id, e.target.value)}
                      className="bg-white/[0.07] text-white border border-white/15 rounded-lg px-2 py-1 text-xs font-medium hover:bg-white/10 cursor-pointer focus:outline-none focus:border-[#c9a96e]/50 transition-all shrink-0 ml-2 [&>option]:bg-[#0d1629] [&>option]:text-white"
                    >
                      {((typeStatuses as readonly string[]).includes(line.status)
                        ? typeStatuses
                        : [line.status, ...typeStatuses].filter(Boolean) as string[]
                      ).map((s) => (
                        <option key={s} value={s}>{getOrderStatusLabel(s)}</option>
                      ))}
                    </select>
                    {line.status === 'finished' && !line.delivered_at && (
                      <button
                        type="button"
                        onClick={() => handleMarkDelivered(line.id)}
                        disabled={markingId === line.id}
                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-2 disabled:opacity-50 transition-colors"
                      >
                        {markingId === line.id ? '...' : 'Marcar entregado'}
                      </button>
                    )}
                    {line.delivered_at && (
                      <span className="text-xs px-2.5 py-1 rounded-md shrink-0 ml-2 font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                        Entregado
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownloadFichaSastreria(line)}
                      disabled={pdfLoadingId === line.id}
                      className="border border-white/15 text-white/60 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-2 hover:bg-white/[0.07] hover:text-white/80 disabled:opacity-50 transition-all"
                    >
                      {pdfLoadingId === line.id ? '...' : 'Descargar ficha'}
                    </button>
                    {canEditFicha && (
                      <button
                        type="button"
                        onClick={() => setEditingFichaLine(line)}
                        className="border border-white/15 text-white/60 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-2 hover:bg-white/[0.07] hover:text-white/80 transition-all inline-flex items-center gap-1"
                      >
                        <Pencil className="h-3 w-3" />
                        Editar ficha
                      </button>
                    )}
                  </div>
                    {photosByLine[line.id]?.length > 0 && (
                      <LinePhotosViewer urls={photosByLine[line.id]} className="pl-7 pb-3" />
                    )}
                  </div>
                ))}
              </>
            )}

            {camiseriaLines.length > 0 && (
              <>
                <p className="text-xs font-semibold text-[#c9a96e] uppercase tracking-[0.15em] mb-3 mt-5">Camisas a medida</p>
                {camiseriaLines.map((line: any) => {
                  const lineIndex = lines.indexOf(line)
                  return (
                    <div key={line.id} className="border-b border-white/[0.06] last:border-b-0">
                    <div className="flex items-center justify-between py-3">
                      <span className="mr-2" aria-hidden>👕</span>
                      <span className="text-white flex-1 min-w-0">
                        {getLineName(line)}
                        {lineRefs.get(String(line.id)) && (
                          <span className="ml-2 font-mono text-[11px] text-white/45 bg-white/[0.06] border border-white/10 rounded px-1.5 py-0.5">
                            {order.order_number}-{lineRefs.get(String(line.id))}
                          </span>
                        )}
                      </span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ml-2 ${LINE_STATUS_COLORS[line.status] || 'bg-gray-400'}`} />
                      <select
                        value={line.status || 'created'}
                        onChange={(e) => handleLineStatusChange(line.id, e.target.value)}
                        className="bg-white/[0.07] text-white border border-white/15 rounded-lg px-2 py-1 text-xs font-medium hover:bg-white/10 cursor-pointer focus:outline-none focus:border-[#c9a96e]/50 transition-all shrink-0 ml-2 [&>option]:bg-[#0d1629] [&>option]:text-white"
                      >
                        {((typeStatuses as readonly string[]).includes(line.status)
                          ? typeStatuses
                          : [line.status, ...typeStatuses].filter(Boolean) as string[]
                        ).map((s) => (
                          <option key={s} value={s}>{getOrderStatusLabel(s)}</option>
                        ))}
                      </select>
                      {line.status === 'finished' && !line.delivered_at && (
                        <button
                          type="button"
                          onClick={() => handleMarkDelivered(line.id)}
                          disabled={markingId === line.id}
                          className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-2 disabled:opacity-50 transition-colors"
                        >
                          {markingId === line.id ? '...' : 'Marcar entregado'}
                        </button>
                      )}
                      {line.delivered_at && (
                        <span className="text-xs px-2.5 py-1 rounded-md shrink-0 ml-2 font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          Entregado
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownloadFicha(line, lineIndex)}
                        disabled={pdfLoadingId === line.id}
                        className="border border-white/15 text-white/60 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-2 hover:bg-white/[0.07] hover:text-white/80 disabled:opacity-50 transition-all"
                      >
                        {pdfLoadingId === line.id ? '...' : 'Descargar ficha'}
                      </button>
                      {canEditFicha && (
                        <button
                          type="button"
                          onClick={() => setEditingFichaLine(line)}
                          className="border border-white/15 text-white/60 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-2 hover:bg-white/[0.07] hover:text-white/80 transition-all inline-flex items-center gap-1"
                        >
                          <Pencil className="h-3 w-3" />
                          Editar ficha
                        </button>
                      )}
                    </div>
                      {photosByLine[line.id]?.length > 0 && (
                        <LinePhotosViewer urls={photosByLine[line.id]} className="pl-7 pb-3" />
                      )}
                    </div>
                  )
                })}
              </>
            )}

            {complementosLines.length > 0 && (
              <>
                <p className="text-xs font-semibold text-[#c9a96e] uppercase tracking-[0.15em] mb-3 mt-5">Complementos</p>
                {complementosLines.map((line: any) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-b-0"
                  >
                    <span className="mr-2" aria-hidden>👕</span>
                    <span className="text-white flex-1 min-w-0">{getLineName(line)}</span>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-md shrink-0 ml-2 font-medium ${
                        line.delivered_at ? 'bg-green-500/15 text-green-400 border border-green-500/20' : 'bg-white/[0.06] text-white/50 border border-white/10'
                      }`}
                    >
                      {line.delivered_at ? 'Entregado' : 'Creado'}
                    </span>
                    {!line.delivered_at && (
                      <button
                        type="button"
                        onClick={() => handleMarkDelivered(line.id)}
                        disabled={markingId === line.id}
                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-2 disabled:opacity-50 transition-colors"
                      >
                        {markingId === line.id ? '...' : 'Marcar entregado'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownloadTicketComplemento(line)}
                      disabled={ticketLoadingId === line.id}
                      className="border border-white/15 text-white/60 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-2 hover:bg-white/[0.07] hover:text-white/80 disabled:opacity-50 transition-all"
                    >
                      {ticketLoadingId === line.id ? '...' : 'Descargar ticket'}
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </section>

      {/* Arreglos del pedido */}
      <section className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Scissors className="h-4 w-4 text-[#c9a96e]" />
            Arreglos
          </h3>
          <Button
            size="sm"
            className="bg-[#c9a96e]/15 border border-[#c9a96e]/30 text-[#c9a96e] hover:bg-[#c9a96e]/25 text-xs"
            onClick={() => setAlterationDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo arreglo
          </Button>
        </div>
        {alterationsLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-white/30" /></div>
        ) : orderAlterations.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-4">No hay arreglos vinculados a este pedido.</p>
        ) : (
          <div className="space-y-2">
            {orderAlterations.map(a => {
              const officialName = a.official_name || a.official?.name || 'Sin asignar'
              return (
              <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.06] last:border-b-0">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">
                    <span className="font-mono text-white/40 text-xs mr-2">{a.alteration_number}</span>
                    {a.description}
                  </p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {officialName}
                  </p>
                </div>
                <Select
                  value={a.status}
                  onValueChange={async (v) => {
                    const res = await updateAlterationStatus({ id: a.id, status: v as 'pending' | 'sent' | 'ready' | 'delivered' | 'cancelled' })
                    if (res.success) { toast.success('Estado actualizado'); loadAlterations() }
                    else toast.error('error' in res ? res.error : 'Error')
                  }}
                >
                  <SelectTrigger className="h-7 w-32 bg-transparent border-white/10 text-xs text-white shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                    <SelectItem value="pending" className="text-white text-xs focus:bg-white/10 focus:text-white">Pendiente</SelectItem>
                    <SelectItem value="sent" className="text-white text-xs focus:bg-white/10 focus:text-white">Enviado taller</SelectItem>
                    <SelectItem value="ready" className="text-white text-xs focus:bg-white/10 focus:text-white">Listo</SelectItem>
                    <SelectItem value="delivered" className="text-white text-xs focus:bg-white/10 focus:text-white">Entregado</SelectItem>
                    <SelectItem value="cancelled" className="text-white text-xs focus:bg-white/10 focus:text-white">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              )
            })}
          </div>
        )}
      </section>

      <NewAlterationDialog
        open={alterationDialogOpen}
        onOpenChange={setAlterationDialogOpen}
        storeId={activeStoreId}
        onCreated={loadAlterations}
        preselectedClientId={order.client_id}
        preselectedClientName={order.clients?.full_name ?? undefined}
        preselectedClientPhone={order.clients?.phone ?? null}
        preselectedOrderId={order.id}
      />

      <EditOrderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        order={order}
        onSaved={refreshOrder}
      />

      <EditFichaDialog
        open={!!editingFichaLine}
        onOpenChange={(v) => { if (!v) setEditingFichaLine(null) }}
        order={order}
        line={editingFichaLine}
        onSaved={() => { setEditingFichaLine(null); refreshOrder() }}
      />

      <Card className="border-white/10 bg-white/[0.04] shadow-none">
        <CardHeader>
          <h3 className="text-base font-semibold text-white">Pagos</h3>
        </CardHeader>
        <CardContent>
          <PaymentHistory
            entityType="tailoring_order"
            entityId={order.id}
            total={Number(order.total)}
            variant="sastre"
            onPaymentAdded={refreshOrder}
            entityStoreId={order.store_id ?? null}
            entityStoreName={order.stores?.name ?? null}
          />
        </CardContent>
      </Card>
    </div>
  )
}
