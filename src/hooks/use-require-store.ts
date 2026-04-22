'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/components/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'

export type AvailableStore = {
  storeId: string
  storeName: string
  storeCode?: string | null
  isPrimary?: boolean
}

export type UseRequireStoreResult = {
  /** ID de la tienda confirmada en esta sesión (null si aún no se ha confirmado). */
  storeId: string | null
  storeName: string | null
  isConfirmed: boolean
  availableStores: AvailableStore[]
  /** Marca esta tienda como confirmada en la sesión del navegador. */
  selectStore: (id: string) => void
  /** Limpia la confirmación (útil al cambiar de tienda). */
  clearConfirmation: () => void
  isLoading: boolean
}

function confirmedKey(userId: string | null | undefined): string | null {
  if (!userId) return null
  return `prats_store_confirmed_${userId}`
}

/**
 * Hook que fuerza al usuario a confirmar en qué tienda está trabajando
 * durante esta sesión de navegador. Reglas:
 * - Admin / super_admin → carga TODAS las tiendas físicas activas.
 * - Resto → solo las asignadas al usuario vía user_stores.
 * - Si hay exactamente 1 tienda disponible → auto-confirma sin modal.
 * - Si hay 2+ → requiere que el usuario elija.
 * - Si hay 0 → isConfirmed=false y availableStores vacío (el UI debe mostrar
 *   el mensaje "No tienes tiendas asignadas").
 * La confirmación vive en sessionStorage con clave por userId, así no se
 * comparte entre usuarios del mismo navegador ni persiste entre pestañas
 * cerradas.
 */
export function useRequireStore(): UseRequireStoreResult {
  const { user, stores: userStores, isAdmin, isSuperAdmin, activeStoreId, setActiveStoreId } = useAuth()

  const [adminStores, setAdminStores] = useState<AvailableStore[]>([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [didRestore, setDidRestore] = useState(false)

  // Cargar todas las tiendas físicas si el usuario es admin (cliente-side para evitar server round-trips)
  useEffect(() => {
    if (!isAdmin && !isSuperAdmin) {
      setAdminStores([])
      return
    }
    let cancelled = false
    setAdminLoading(true)
    const supabase = createClient()
    ;(async () => {
      try {
        const { data } = await supabase
          .from('stores')
          .select('id, name, code')
          .eq('is_active', true)
          .eq('store_type', 'physical')
          .order('name')
        if (cancelled) return
        const list: AvailableStore[] = (data ?? []).map((s: any) => ({
          storeId: String(s.id),
          storeName: String(s.name ?? s.id),
          storeCode: s.code ?? null,
        }))
        setAdminStores(list)
      } finally {
        if (!cancelled) setAdminLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isAdmin, isSuperAdmin])

  // Lista de tiendas disponibles según el rol
  const availableStores: AvailableStore[] = useMemo(() => {
    if (isAdmin || isSuperAdmin) return adminStores
    // Usuarios regulares: user_stores filtrando a físicas (o sin tipo conocido).
    return userStores
      .filter((s) => !s.storeType || s.storeType === 'physical')
      .map((s) => ({
        storeId: s.storeId,
        storeName: s.storeName,
        isPrimary: s.isPrimary,
      }))
  }, [isAdmin, isSuperAdmin, adminStores, userStores])

  // Restaurar confirmación de sessionStorage si sigue siendo válida
  useEffect(() => {
    if (didRestore) return
    if (!user?.id) return
    if (typeof window === 'undefined') return
    if (availableStores.length === 0 && adminLoading) return // esperar carga admin
    const key = confirmedKey(user.id)
    if (!key) return
    const confirmedId = window.sessionStorage.getItem(key)
    setDidRestore(true)
    if (confirmedId && availableStores.some((s) => s.storeId === confirmedId)) {
      setActiveStoreId(confirmedId)
      setIsConfirmed(true)
    }
  }, [user?.id, availableStores, adminLoading, didRestore, setActiveStoreId])

  const selectStore = useCallback(
    (id: string) => {
      if (!user?.id) return
      if (typeof window !== 'undefined') {
        const key = confirmedKey(user.id)
        if (key) window.sessionStorage.setItem(key, id)
      }
      setActiveStoreId(id)
      setIsConfirmed(true)
    },
    [user?.id, setActiveStoreId],
  )

  const clearConfirmation = useCallback(() => {
    if (!user?.id) return
    if (typeof window !== 'undefined') {
      const key = confirmedKey(user.id)
      if (key) window.sessionStorage.removeItem(key)
    }
    setIsConfirmed(false)
  }, [user?.id])

  // Auto-confirmar si el usuario tiene exactamente 1 tienda disponible
  useEffect(() => {
    if (!didRestore) return
    if (isConfirmed) return
    if (!user?.id) return
    if (availableStores.length === 1) {
      selectStore(availableStores[0].storeId)
    }
  }, [didRestore, isConfirmed, user?.id, availableStores, selectStore])

  const storeName = useMemo(() => {
    if (!activeStoreId) return null
    return availableStores.find((s) => s.storeId === activeStoreId)?.storeName ?? null
  }, [activeStoreId, availableStores])

  return {
    storeId: isConfirmed ? activeStoreId : null,
    storeName,
    isConfirmed,
    availableStores,
    selectStore,
    clearConfirmation,
    isLoading: adminLoading || !didRestore,
  }
}
