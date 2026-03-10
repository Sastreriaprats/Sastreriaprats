'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, Eye, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getOrder } from '@/actions/orders'
import { generateFichaConfeccionPDF } from '@/lib/pdf/ficha-confeccion'

function getClientName(order: any): string {
  const c = order?.clients
  if (!c) return '—'
  if (c.full_name) return String(c.full_name)
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
}

export function NuevaVentaConfirmacionClient({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState<'ficha' | null>(null)

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

  const handlePrintFicha = async () => {
    if (!order) return
    setPdfLoading('ficha')
    try {
      await generateFichaConfeccionPDF(order)
    } finally {
      setPdfLoading(null)
    }
  }

  if (!orderId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70 mb-4">Falta el ID del pedido.</p>
        <Button className="min-h-[48px]" variant="outline" onClick={() => router.push('/sastre/nueva-venta')}>
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
        <Button className="min-h-[48px]" variant="outline" onClick={() => router.push('/sastre/nueva-venta')}>
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
          <Button
            type="button"
            variant="outline"
            className="min-h-[48px] gap-2 border-[#c9a96e]/40 text-white hover:bg-white/5 justify-center"
            onClick={handlePrintFicha}
            disabled={!!pdfLoading}
          >
            <Printer className="h-5 w-5" />
            {pdfLoading === 'ficha' ? 'Generando...' : 'Descargar ficha PDF'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-[48px] gap-2 border-[#c9a96e]/40 text-white hover:bg-white/5 justify-center"
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
