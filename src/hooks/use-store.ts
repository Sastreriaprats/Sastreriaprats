'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { useCallback } from 'react'

/**
 * Hook para gestionar la tienda activa del usuario.
 */
export function useActiveStore() {
  const { activeStoreId, setActiveStoreId, profile } = useAuth()

  const stores = profile?.stores ?? []

  const switchStore = useCallback(
    (storeId: string) => {
      setActiveStoreId(storeId)
    },
    [setActiveStoreId]
  )

  return {
    activeStoreId,
    stores,
    switchStore,
  }
}
