'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, Eye, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getOrder } from '@/actions/orders'
import { generateFichaForLine, generateFichaForLineCamiseria } from '@/lib/pdf/ficha-confeccion'
import { generateTicketBoutiquePDF } from '@/lib/pdf/ticket-boutique'

function getClientName(order: any): string {
  const c = order?.clients
  if (!c) return '—'
  if (c.full_name) return String(c.full_name)
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
}

function slugToPrendaLabel(slug: string): string {
  if (!slug || typeof slug !== 'string') return '—'
  return slug
    .trim()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function isLineComplement(line: any): boolean {
  const cfg = line?.configuration ?? {}
  return cfg.tipo === 'complemento' || cfg.product_name !== undefined
}

function isLineCamiseria(line: any): boolean {
  const cfg = line?.configuration ?? {}
  if (cfg.tipo === 'camiseria') return true
  if (cfg.puno !== undefined) return true
  return false
}

/** Líneas con ficha: sastrería o camisería (no complementos). Si hay alguna línea de camisería, solo se devuelven esas (no se mezclan con sastrería). */
function getFichaLines(lines: any[]): any[] {
  const nonComplement = lines.filter((l: any) => !isLineComplement(l))
  const hasCamiseria = nonComplement.some((l: any) => isLineCamiseria(l))
  if (hasCamiseria) return nonComplement.filter((l: any) => isLineCamiseria(l))
  return nonComplement
}

function getPrendaLabelForLine(line: any): string {
  if (isLineCamiseria(line)) return 'Camisa a medida'
  const cfg = line?.configuration ?? {}
  const prendaLabel = (cfg.prendaLabel as string)?.trim()
  if (prendaLabel) return prendaLabel
  const prenda = (cfg.prenda as string)?.trim()
  if (prenda) return slugToPrendaLabel(prenda)
  const gtName = (line?.garment_types?.name ?? '').toString().trim()
  return gtName || 'Prenda'
}

function isLineBoutique(line: any): boolean {
  const cfg = line?.configuration ?? {}
  return !!(cfg.product_variant_id || cfg.product_name)
}

export function NuevaVentaConfirmacionClient({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) {
      setLoading(false)
      return
    }
    let cancelled = false
    getOrder(orderId).then((res) => {
      if (cancelled) return
      if (res?.success && res.data) setOrder(res.data)
      else setOrder(null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [orderId])

  const lines = order?.tailoring_order_lines ?? []
  const fichaLines = getFichaLines(lines)
  const hasBoutiqueLines = lines.some((l: any) => isLineBoutique(l))

  const handlePrintFichaForLine = async (line: any, key: string, lineIndex?: number) => {
    if (!order) return
    setPdfLoading(key)
    try {
      if (isLineCamiseria(line) && typeof lineIndex === 'number') {
        await generateFichaForLineCamiseria(order, line, lineIndex)
      } else {
        await generateFichaForLine(order, line)
      }
    } finally {
      setPdfLoading(null)
    }
  }

  const handlePrintTicketBoutique = async () => {
    if (!order) return
    setPdfLoading('ticket')
    try {
      await generateTicketBoutiquePDF(order)
    } finally {
      setPdfLoading(null)
    }
  }

  if (!orderId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70 mb-4">Falta el ID del pedido.</p>
        <Button className="min-h-[48px] bg-[#1a2744] text-white border border-[#2a3a5c] hover:bg-[#243255] px-6 py-3 rounded-lg" onClick={() => router.push('/sastre/nueva-venta')}>
          Nueva venta
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70">Cargando pedido...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70 mb-4">No se encontró el pedido.</p>
        <Button className="min-h-[48px] bg-[#1a2744] text-white border border-[#2a3a5c] hover:bg-[#243255] px-6 py-3 rounded-lg" onClick={() => router.push('/sastre/nueva-venta')}>
          Nueva venta
        </Button>
      </div>
    )
  }

  const total = Number(order.total ?? 0)
  const totalPaid = Number(order.total_paid ?? 0)

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
      <div className="p-6 max-w-lg mx-auto w-full space-y-6">
        <h1 className="text-2xl font-serif text-white">Pedido creado correctamente</h1>

        <div className="rounded-xl border border-[#c9a96e]/30 bg-[#1a2744]/80 p-5 space-y-3">
          <p className="text-[#c9a96e] font-medium">✓ Nº {order.order_number}</p>
          <p className="text-white/90">Cliente: {getClientName(order)}</p>
          <p className="text-white/90">Total: {total.toFixed(2)} €</p>
          {totalPaid > 0 && (
            <p className="text-white/80">Entregado a cuenta: {totalPaid.toFixed(2)} €</p>
          )}
          <p className="text-white/80">Pendiente: {(Number(order.total_pending ?? 0)).toFixed(2)} €</p>
        </div>

        <div className="flex flex-col gap-3">
          {fichaLines.map((line: any, idx: number) => {
            const isCamisa = isLineCamiseria(line)
            const camisaNum = isCamisa
              ? fichaLines.filter((l: any) => isLineCamiseria(l)).indexOf(line) + 1
              : 0
            const camisaLineIndex = isCamisa ? fichaLines.filter((l: any) => isLineCamiseria(l)).indexOf(line) : undefined
            const label = isCamisa
              ? `Descargar ficha - Camisa a medida (${camisaNum})`
              : `Descargar ficha - ${getPrendaLabelForLine(line)}`
            const key = `line-${idx}`
            return (
              <Button
                key={key}
                type="button"
                className="bg-[#c9a96e] text-[#0a0f1e] hover:bg-[#b8935a] font-semibold px-6 py-3 rounded-lg w-full gap-2 min-h-[48px] justify-center"
                onClick={() => handlePrintFichaForLine(line, key, camisaLineIndex)}
                disabled={!!pdfLoading}
              >
                <Printer className="h-5 w-5" />
                {pdfLoading === key ? 'Generando...' : label}
              </Button>
            )
          })}
          {hasBoutiqueLines && (
            <Button
              type="button"
              className="bg-[#c9a96e] text-[#0a0f1e] hover:bg-[#b8935a] font-semibold px-6 py-3 rounded-lg w-full gap-2 min-h-[48px] justify-center"
              onClick={handlePrintTicketBoutique}
              disabled={!!pdfLoading}
            >
              <Printer className="h-5 w-5" />
              {pdfLoading === 'ticket' ? 'Generando...' : 'Imprimir ticket boutique'}
            </Button>
          )}
          <Button
            type="button"
            className="bg-[#1a2744] text-white border border-[#2a3a5c] hover:bg-[#243255] px-6 py-3 rounded-lg w-full gap-2 min-h-[48px] justify-center"
            onClick={() => router.push(`/sastre/pedidos/${orderId}`)}
          >
            <Eye className="h-5 w-5" />
            Ver pedido
          </Button>
          <Button
            type="button"
            className="min-h-[48px] gap-2 bg-[#c9a96e]/20 border border-[#c9a96e]/40 text-[#c9a96e] hover:bg-[#c9a96e]/30 justify-center"
            onClick={() => router.push('/sastre/nueva-venta')}
          >
            <Plus className="h-5 w-5" />
            Nueva venta
          </Button>
        </div>
      </div>
    </div>
  )
}
