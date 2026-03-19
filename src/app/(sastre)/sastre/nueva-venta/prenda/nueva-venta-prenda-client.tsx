'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function NuevaVentaPrendaClient({ tipo, clientId }: { tipo: string; clientId: string }) {
  const router = useRouter()

  useEffect(() => {
    if (tipo && clientId) {
      router.replace(
        `/sastre/nueva-venta/ficha?tipo=${encodeURIComponent(tipo)}&clientId=${encodeURIComponent(clientId)}`
      )
    }
  }, [tipo, clientId, router])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <p className="text-white/70">Cargando...</p>
    </div>
  )
}
