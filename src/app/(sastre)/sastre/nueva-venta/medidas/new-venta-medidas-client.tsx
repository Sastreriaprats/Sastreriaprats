'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MedidasPageContent } from '@/app/(sastre)/sastre/medidas/[clientId]/medidas-page-content'
import { Button } from '@/components/ui/button'
import { NuevaVentaSteps } from '../nueva-venta-steps'
import { Loader2 } from 'lucide-react'

export function NewVentaMedidasClient({
  clientId,
  tipo,
  clientName,
  sastreName,
}: {
  clientId: string
  tipo: string
  clientName: string
  sastreName: string
}) {
  const router = useRouter()
  const saveRef = useRef<{ save: () => Promise<boolean> } | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!clientId || !tipo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <p className="text-white/70 mb-4">Faltan datos. Vuelve a seleccionar cliente y tipo.</p>
        <Button className="min-h-[48px]" variant="outline" onClick={() => router.push(`/sastre/nueva-venta/cliente?tipo=${encodeURIComponent(tipo || 'artesanal')}`)}>
          Ir a cliente
        </Button>
      </div>
    )
  }

  const handleContinuar = async () => {
    if (isDirty) {
      setSaving(true)
      try {
        const ok = await saveRef.current?.save()
        if (!ok) return
      } finally {
        setSaving(false)
      }
    }
    router.push(`/sastre/nueva-venta/prenda?tipo=${encodeURIComponent(tipo)}&clientId=${encodeURIComponent(clientId)}`)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 p-4 pb-0">
        <NuevaVentaSteps currentStep={3} tipo={tipo} clientId={clientId} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden min-w-0">
        <MedidasPageContent
          clientId={clientId}
          clientName={clientName}
          sastreName={sastreName}
          saveRef={saveRef}
          hideTabs={tipo === 'camiseria' ? ['Americana', 'Pantalón', 'Chaleco'] : ['Camisería']}
          onValuesChange={() => setIsDirty(true)}
          onSavingChange={setSaving}
          embedScroll={true}
        />
      </div>
      <div className="shrink-0 border-t border-[#c9a96e]/20 p-4 flex gap-3">
        <button
          type="button"
          onClick={handleContinuar}
          disabled={saving}
          className="flex-1 h-12 rounded-xl bg-[#c9a96e] text-[#0a1020] font-bold hover:bg-[#d4b47e] transition-colors touch-manipulation disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Guardando...
            </>
          ) : isDirty ? (
            'Guardar y continuar →'
          ) : (
            'Continuar →'
          )}
        </button>
      </div>
    </div>
  )
}
