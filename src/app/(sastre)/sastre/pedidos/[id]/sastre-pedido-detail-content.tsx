'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate, getOrderStatusLabel } from '@/lib/utils'
import { PaymentHistory } from '@/components/payments/payment-history'
import { getOrder, markLineDelivered, updateOrderStatus } from '@/actions/orders'
import { getAlterationsByOrder, updateAlterationStatus, type AlterationRow } from '@/actions/alterations'
import { generateFichaForLine, generateFichaForLineCamiseria } from '@/lib/pdf/ficha-confeccion'
import { generateTicketComplemento } from '@/lib/pdf/ticket-boutique'
import { generateTailoringOrderTicketPdf } from '@/lib/pdf/tailoring-order-ticket'
import { NewAlterationDialog } from '@/app/(sastre)/sastre/arreglos/arreglos-content'
import { Plus, Scissors, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useActiveStore } from '@/hooks/use-store'

function slugToPrendaLabel(slug: string): string {
  if (!slug || typeof slug !== 'string') return '—'
  return slug
    .trim()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function capitalizar(s: string | undefined): string {
  if (s == null || typeof s !== 'string') return ''
  const t = s.trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ''
}

type LineGroup = 'sastreria' | 'camiseria' | 'complementos'

function getLineGroup(line: any): LineGroup {
  const cfg = line?.configuration ?? {}
  if (cfg.product_name !== undefined) return 'complementos'
  if (cfg.tipo === 'camiseria' || cfg.puno !== undefined) return 'camiseria'
  return 'sastreria'
}

function getLineName(line: any): string {
  const cfg = line?.configuration ?? {}
  const group = getLineGroup(line)
  if (group === 'sastreria') {
    const prendaLabel = (cfg.prendaLabel as string)?.trim()
    if (prendaLabel) return prendaLabel
    return slugToPrendaLabel((cfg.prenda as string) ?? '')
  }
  if (group === 'camiseria') {
    const labelCuello = (cfg.modCuello as string)?.trim() || 'Italiano'
    const labelPuno = capitalizar(cfg.puno as string)
    return `Camisa (${labelCuello}, ${labelPuno})`
  }
  return (cfg.product_name as string) ?? 'Complemento'
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

  // Arreglos del pedido
  const [orderAlterations, setOrderAlterations] = useState<AlterationRow[]>([])
  const [alterationsLoading, setAlterationsLoading] = useState(true)
  const [alterationDialogOpen, setAlterationDialogOpen] = useState(false)

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

  const lines: any[] = order?.tailoring_order_lines ?? []
  const hasCamiseriaLines = lines.some((l: any) => isLineCamiseria(l))
  const visibleLines = hasCamiseriaLines
    ? lines.filter(
        (l: any) =>
          !(!isLineCamiseria(l) && !isComplemento(l) && isLineCamisaByPrenda(l))
      )
    : lines

  const deliveredCount = visibleLines.filter((l: any) => l.delivered_at).length
  const totalCount = visibleLines.length

  const groupLines = (group: LineGroup) =>
    visibleLines.filter((l: any) => getLineGroup(l) === group)

  const sastreriaLines = groupLines('sastreria')
  const camiseriaLines = groupLines('camiseria')
  const complementosLines = groupLines('complementos')

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

  const SASTRE_STATUSES = ['in_production', 'fitting', 'adjustments', 'finished', 'delivered', 'cancelled'] as const
  const statusOptions = SASTRE_STATUSES.includes(order?.status as any)
    ? [...SASTRE_STATUSES]
    : [order?.status, ...SASTRE_STATUSES].filter(Boolean)

  const handleStatusChange = async (newStatus: string) => {
    if (!order?.id || newStatus === order.status) return
    const res = await updateOrderStatus({ orderId: order.id, newStatus })
    if (res?.success) await refreshOrder()
  }

  const LINE_STATUS_COLORS: Record<string, string> = {
    created:     'bg-gray-400',
    in_workshop: 'bg-blue-400',
    fitting:     'bg-amber-400',
    adjustments: 'bg-orange-400',
    finished:    'bg-green-400',
    delivered:   'bg-emerald-400',
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
            <p className="text-white">{formatCurrency(order.total)}</p>
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

            {sastreriaLines.length > 0 && (
              <>
                <p className="text-xs font-semibold text-[#c9a96e] uppercase tracking-[0.15em] mb-3 mt-5">Sastrería</p>
                {sastreriaLines.map((line: any) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-b-0"
                  >
                    <span className="mr-2" aria-hidden>👕</span>
                    <span className="text-white flex-1 min-w-0">{getLineName(line)}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ml-2 ${LINE_STATUS_COLORS[line.status] || 'bg-gray-400'}`} />
                    <select
                      value={line.status || 'created'}
                      onChange={(e) => handleLineStatusChange(line.id, e.target.value)}
                      className="bg-white/[0.07] text-white border border-white/15 rounded-lg px-2 py-1 text-xs font-medium hover:bg-white/10 cursor-pointer focus:outline-none focus:border-[#c9a96e]/50 transition-all shrink-0 ml-2 [&>option]:bg-[#0d1629] [&>option]:text-white"
                    >
                      <option value="in_production">En confección</option>
                      <option value="fitting">En prueba</option>
                      <option value="adjustments">Arreglos</option>
                      <option value="finished">Finalizada</option>
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
                        onClick={() => handleDownloadFicha(line, lineIndex)}
                        disabled={pdfLoadingId === line.id}
                        className="border border-white/15 text-white/60 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 ml-2 hover:bg-white/[0.07] hover:text-white/80 disabled:opacity-50 transition-all"
                      >
                        {pdfLoadingId === line.id ? '...' : 'Descargar ficha'}
                      </button>
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
            {orderAlterations.map(a => (
              <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.06] last:border-b-0">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{a.description}</p>
                  <p className="text-white/40 text-xs mt-0.5">
                    {a.assigned_to_profile?.full_name ?? 'Sin asignar'}
                    {a.has_cost ? ` · ${formatCurrency(a.cost)}` : ''}
                  </p>
                </div>
                <Select
                  value={a.status}
                  onValueChange={async (v) => {
                    const res = await updateAlterationStatus({ id: a.id, status: v as 'pending' | 'in_progress' | 'completed' | 'delivered' })
                    if (res.success) { toast.success('Estado actualizado'); loadAlterations() }
                    else toast.error(res.error ?? 'Error')
                  }}
                >
                  <SelectTrigger className="h-7 w-28 bg-transparent border-white/10 text-xs text-white shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d1629] border border-white/20 text-white">
                    <SelectItem value="pending" className="text-white text-xs focus:bg-white/10 focus:text-white">Pendiente</SelectItem>
                    <SelectItem value="in_progress" className="text-white text-xs focus:bg-white/10 focus:text-white">En curso</SelectItem>
                    <SelectItem value="completed" className="text-white text-xs focus:bg-white/10 focus:text-white">Completado</SelectItem>
                    <SelectItem value="delivered" className="text-white text-xs focus:bg-white/10 focus:text-white">Entregado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </section>

      <NewAlterationDialog
        open={alterationDialogOpen}
        onOpenChange={setAlterationDialogOpen}
        storeId={activeStoreId}
        onCreated={loadAlterations}
        preselectedClientId={order.client_id}
        preselectedOrderId={order.id}
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
          />
        </CardContent>
      </Card>
    </div>
  )
}
