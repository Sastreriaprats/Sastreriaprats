'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/components/providers/auth-provider'
import { getCurrentProfileAction } from '@/actions/auth'
import { getStoresList, getRolesAndPermissionsAction } from '@/actions/config'

/**
 * Precarga en caché los datos que usan el sidebar y la configuración (stores, profile, roles)
 * para que al navegar ya estén disponibles.
 */
export function AdminDataPrefetcher() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    const userId = user?.id ?? null

    const prefetch = async () => {
      const promises: Promise<unknown>[] = [
        queryClient.prefetchQuery({
          queryKey: ['stores'],
          queryFn: async () => {
            const res = await getStoresList()
            if (res.error) throw new Error(res.error)
            return res.data ?? []
          },
        }),
        queryClient.prefetchQuery({
          queryKey: ['roles-and-permissions'],
          queryFn: async () => {
            const res = await getRolesAndPermissionsAction()
            if (res.error) throw new Error(res.error)
            return res.data!
          },
        }),
      ]
      if (userId) {
        promises.push(
          queryClient.prefetchQuery({
            queryKey: ['profile', userId],
            queryFn: async () => {
              const result = await getCurrentProfileAction()
              if (!result) throw new Error('No profile')
              return result
            },
          })
        )
      }
      await Promise.allSettled(promises)
    }

    prefetch()
  }, [queryClient, user?.id])

  return null
}
