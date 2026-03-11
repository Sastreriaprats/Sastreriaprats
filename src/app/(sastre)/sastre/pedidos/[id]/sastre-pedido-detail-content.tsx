'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { formatCurrency, formatDate, getOrderStatusLabel } from '@/lib/utils'
import { PaymentHistory } from '@/components/payments/payment-history'
import { getOrder, markLineDelivered, updateOrderStatus } from '@/actions/orders'
import { generateFichaForLineCamiseria } from '@/lib/pdf/ficha-confeccion'
import { generateTicketComplemento } from '@/lib/pdf/ticket-boutique'

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
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null)
  const [ticketLoadingId, setTicketLoadingId] = useState<string | null>(null)

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

  const SASTRE_STATUSES = ['in_workshop', 'pending_first_fitting', 'adjustments', 'finished', 'delivered', 'cancelled'] as const
  const statusOptions = SASTRE_STATUSES.includes(order?.status as any)
    ? [...SASTRE_STATUSES]
    : [order?.status, ...SASTRE_STATUSES].filter(Boolean)

  const handleStatusChange = async (newStatus: string) => {
    if (!order?.id || newStatus === order.status) return
    const res = await updateOrderStatus({ orderId: order.id, newStatus })
    if (res?.success) await refreshOrder()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="border-[#c9a96e]/20 bg-white/5">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">{order.order_number}</h2>
              <p className="text-white/60 text-sm mt-0.5">Cliente: {clientName}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-1 rounded bg-white/10 text-white/80">
                {getOrderStatusLabel(order.status)}
              </span>
              <select
                value={order.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="bg-[#1a2744] text-white border border-[#2a3a5c] rounded px-3 py-1.5 text-sm hover:bg-[#243255] cursor-pointer"
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
            <p className="text-white/50">Fecha</p>
            <p className="text-white">{formatDate(order.order_date)}</p>
          </div>
          <div>
            <p className="text-white/50">Total</p>
            <p className="text-white">{formatCurrency(order.total)}</p>
          </div>
          <div>
            <p className="text-white/50">Pagado</p>
            <p className="text-white">{formatCurrency(order.total_paid ?? 0)}</p>
          </div>
          <div>
            <p className="text-white/50">Pendiente</p>
            <p className="text-amber-400 font-medium">{formatCurrency(order.total_pending ?? 0)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Piezas del pedido */}
      <section className="bg-[#0f1e35] border border-[#1e3a5f] rounded-xl p-6">
        <h3 className="text-lg font-medium text-white mb-4">Piezas del pedido</h3>
        {totalCount === 0 ? (
          <p className="text-gray-400 text-sm">No hay líneas en este pedido.</p>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-2">
              {deliveredCount} de {totalCount} entregadas
            </p>
            <div className="h-2 bg-[#1e3a5f] rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-green-600 transition-all duration-300"
                style={{ width: totalCount ? `${(deliveredCount / totalCount) * 100}%` : '0%' }}
              />
            </div>

            {sastreriaLines.length > 0 && (
              <>
                <p className="text-sm text-gray-400 mb-2 mt-4">Sastrería</p>
                {sastreriaLines.map((line: any) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between py-3 border-b border-[#1e3a5f] last:border-b-0"
                  >
                    <span className="mr-2" aria-hidden>👕</span>
                    <span className="text-white flex-1 min-w-0">{getLineName(line)}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded shrink-0 ml-2 ${
                        line.delivered_at ? 'bg-green-600/80 text-white' : 'bg-gray-600 text-gray-300'
                      }`}
                    >
                      {line.delivered_at ? 'Entregado' : 'Creado'}
                    </span>
                    {!line.delivered_at && (
                      <button
                        type="button"
                        onClick={() => handleMarkDelivered(line.id)}
                        disabled={markingId === line.id}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm shrink-0 ml-2 disabled:opacity-50"
                      >
                        {markingId === line.id ? '...' : 'Marcar entregado'}
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}

            {camiseriaLines.length > 0 && (
              <>
                <p className="text-sm text-gray-400 mb-2 mt-4">Camisas a medida</p>
                {camiseriaLines.map((line: any) => {
                  const lineIndex = lines.indexOf(line)
                  return (
                    <div
                      key={line.id}
                      className="flex items-center justify-between py-3 border-b border-[#1e3a5f] last:border-b-0"
                    >
                      <span className="mr-2" aria-hidden>👕</span>
                      <span className="text-white flex-1 min-w-0">{getLineName(line)}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded shrink-0 ml-2 ${
                          line.delivered_at ? 'bg-green-600/80 text-white' : 'bg-gray-600 text-gray-300'
                        }`}
                      >
                        {line.delivered_at ? 'Entregado' : 'Creado'}
                      </span>
                      {!line.delivered_at && (
                        <button
                          type="button"
                          onClick={() => handleMarkDelivered(line.id)}
                          disabled={markingId === line.id}
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm shrink-0 ml-2 disabled:opacity-50"
                        >
                          {markingId === line.id ? '...' : 'Marcar entregado'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownloadFicha(line, lineIndex)}
                        disabled={pdfLoadingId === line.id}
                        className="border border-[#2a3a5c] text-gray-300 px-3 py-1.5 rounded text-sm shrink-0 ml-2 hover:bg-white/5 disabled:opacity-50"
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
                <p className="text-sm text-gray-400 mb-2 mt-4">Complementos</p>
                {complementosLines.map((line: any) => (
                  <div
                    key={line.id}
                    className="flex items-center justify-between py-3 border-b border-[#1e3a5f] last:border-b-0"
                  >
                    <span className="mr-2" aria-hidden>👕</span>
                    <span className="text-white flex-1 min-w-0">{getLineName(line)}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded shrink-0 ml-2 ${
                        line.delivered_at ? 'bg-green-600/80 text-white' : 'bg-gray-600 text-gray-300'
                      }`}
                    >
                      {line.delivered_at ? 'Entregado' : 'Creado'}
                    </span>
                    {!line.delivered_at && (
                      <button
                        type="button"
                        onClick={() => handleMarkDelivered(line.id)}
                        disabled={markingId === line.id}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm shrink-0 ml-2 disabled:opacity-50"
                      >
                        {markingId === line.id ? '...' : 'Marcar entregado'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownloadTicketComplemento(line)}
                      disabled={ticketLoadingId === line.id}
                      className="border border-[#2a3a5c] text-gray-300 px-3 py-1.5 rounded text-sm shrink-0 ml-2 hover:bg-[#1a2744] disabled:opacity-50"
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

      <Card className="border-[#c9a96e]/20 bg-white/5">
        <CardHeader>
          <h3 className="text-lg font-medium text-white">Pagos</h3>
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
