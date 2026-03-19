'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CreateClientDialog } from '@/app/(admin)/admin/clientes/create-client-dialog'
import { ArrowLeft } from 'lucide-react'

const ORDER_TYPE_LABELS: Record<string, string> = {
  artesanal: 'Artesanal',
  industrial: 'Industrial',
  camiseria: 'Camisería',
}

export function NuevoClienteClient({ orderType }: { orderType: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(true)
  }, [])

  if (!orderType) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70 mb-4">Falta el tipo de pedido.</p>
        <Button className="min-h-[48px] bg-white/[0.06] border border-white/15 text-white/70 font-medium hover:bg-white/10 hover:text-white transition-all" onClick={() => router.push('/sastre/nueva-venta')}>
          Volver
        </Button>
      </div>
    )
  }

  const handleSuccessWithId = (clientId: string) => {
    const params = new URLSearchParams({ clientId, orderType })
    router.push(`/sastre/nueva-venta/medidas?${params.toString()}`)
  }

  const handleCancel = () => {
    setOpen(false)
    router.push(`/sastre/nueva-venta/elegir-cliente?orderType=${encodeURIComponent(orderType)}`)
  }

  const tipoLabel = ORDER_TYPE_LABELS[orderType] ?? orderType

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
      <div className={`p-6 max-w-2xl mx-auto w-full space-y-6 transition-opacity ${open ? 'opacity-50 pointer-events-none' : ''}`}>
        <h1 className="text-2xl font-serif text-white text-center">Nueva venta — {tipoLabel}</h1>
        <p className="text-white/60 text-center">Crear nuevo cliente</p>

        <Button
          type="button"
          variant="outline"
          className="min-h-[48px] gap-2 !border-[#c9a96e]/50 !bg-[#1a2744] text-[#c9a96e] hover:!bg-[#1e2d4a] hover:!border-[#c9a96e]/70"
          onClick={() => router.push(`/sastre/nueva-venta/elegir-cliente?orderType=${encodeURIComponent(orderType)}`)}
        >
          <ArrowLeft className="h-5 w-5" />
          Volver
        </Button>

        <p className="text-white/50 text-sm text-center">
          Si el cuadro de alta no se ha abierto, haz clic en el botón de abajo.
        </p>
        <Button
          type="button"
          className="min-h-[48px] bg-[#c9a96e] hover:bg-[#c9a96e]/90 text-prats-navy"
          onClick={() => setOpen(true)}
        >
          Abrir formulario de nuevo cliente
        </Button>
      </div>

      <CreateClientDialog
        open={open}
        onOpenChange={setOpen}
        onSuccess={() => {}}
        onSuccessWithId={handleSuccessWithId}
        onCancel={handleCancel}
      />
    </div>
  )
}
