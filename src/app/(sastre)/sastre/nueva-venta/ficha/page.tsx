'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/providers/auth-provider'
import { SastreLayoutWithSidebar } from '@/app/(sastre)/components/sastre-layout-with-sidebar'
import { NuevaVentaFichaClient } from './nueva-venta-ficha-client'

function NuevaVentaFichaPage() {
  const searchParams = useSearchParams()
  const { profile, activeStoreId } = useAuth()

  const sastreName = profile?.fullName ?? profile?.firstName ?? profile?.lastName ?? 'Sastre'
  const clientId = searchParams.get('clientId') ?? ''
  const tipo = searchParams.get('tipo') ?? searchParams.get('orderType') ?? ''
  const prenda = searchParams.get('prenda') ?? ''

  const content =
    activeStoreId == null ? (
      <p className="text-white/90 text-center py-8">
        Selecciona tu tienda en el menú superior antes de crear una venta
      </p>
    ) : (
      <NuevaVentaFichaClient
        clientId={clientId}
        tipo={tipo}
        prenda={prenda}
        sastreName={sastreName}
        defaultStoreId={activeStoreId}
      />
    )

  return <SastreLayoutWithSidebar sastreName={sastreName}>{content}</SastreLayoutWithSidebar>
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NuevaVentaFichaPage />
    </Suspense>
  )
}
