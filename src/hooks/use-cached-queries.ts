'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getStoresList } from '@/actions/config'
import { getRolesAndPermissionsAction } from '@/actions/config'
import { getCurrentProfileAction } from '@/actions/auth'
import type { UserWithRoles } from '@/lib/types/auth'

// ─── useGarmentTypes ─────────────────────────────────────────────────────────

export type GarmentTypeRow = {
  id: string
  code: string
  name: string
  category: string | null
  sort_order: number
}

export function useGarmentTypes() {
  const supabase = useMemo(() => createClient(), [])
  const query = useQuery({
    queryKey: ['garment-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('garment_types')
        .select('id, code, name, category, sort_order')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as GarmentTypeRow[]
    },
  })
  return {
    data: query.data ?? undefined,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

// ─── useStores ───────────────────────────────────────────────────────────────

export function useStores() {
  const query = useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const res = await getStoresList()
      if (res.error) throw new Error(res.error)
      return res.data ?? []
    },
  })
  return {
    data: query.data ?? undefined,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

// ─── useRolesAndPermissions ──────────────────────────────────────────────────

export function useRolesAndPermissions() {
  const query = useQuery({
    queryKey: ['roles-and-permissions'],
    queryFn: async () => {
      const res = await getRolesAndPermissionsAction()
      if (res.error) throw new Error(res.error)
      return res.data!
    },
  })
  return {
    data: query.data ?? undefined,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

// ─── useCurrentProfile ───────────────────────────────────────────────────────

export type CurrentProfileResult = {
  profile: UserWithRoles
  stores: Array<{ storeId: string; storeName: string; storeCode: string; isPrimary: boolean }>
}

export function useCurrentProfile(userId: string | null) {
  const query = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      const result = await getCurrentProfileAction()
      if (!result) throw new Error('No profile')
      return result
    },
    enabled: !!userId,
  })
  return {
    data: query.data ?? undefined,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
