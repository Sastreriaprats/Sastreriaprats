'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { InvoicesTab } from '@/app/(admin)/admin/contabilidad/accounting-content'

/**
 * Módulo de facturas de cliente standalone, reutilizable fuera del contexto
 * de tabs de Contabilidad. Reutiliza InvoicesTab (la misma lógica que el tab
 * "Facturas" de /admin/contabilidad) — sin duplicar código.
 *
 * Lo usa la ruta dedicada /admin/facturas (gated por accounting.manage_invoices),
 * que da acceso a facturas sin exponer el resto de contabilidad.
 */
export function InvoicesPanel() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const [editId, setEditId] = useState<string | null>(searchParams.get('edit'))

  useEffect(() => {
    const e = searchParams.get('edit')
    if (e !== editId) setEditId(e)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleEditConsumed = useCallback(() => {
    setEditId(null)
    router.replace(pathname)
  }, [router, pathname])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Facturas</h1>
        <p className="text-muted-foreground">Facturas de cliente: crear, emitir, anular e imprimir.</p>
      </div>
      <InvoicesTab editId={editId} onEditConsumed={handleEditConsumed} />
    </div>
  )
}
