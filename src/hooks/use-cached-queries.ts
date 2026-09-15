'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getStoresList } from '@/actions/config'
import { getRolesAndPermissionsAction } from '@/actions/config'
import { getCurrentProfileAction } from '@/actions/auth'
import type { UserWithRoles } from '@/lib/types/auth'

// ─── useClientCategories ─────────────────────────────────────────────────────

export type ClientCategoryRow = {
  code: string
  name: string
  sort_order: number
  is_active: boolean
}

const FALLBACK_CLIENT_CATEGORIES: ClientCategoryRow[] = [
  { code: 'standard', name: 'Normal', sort_order: 0, is_active: true },
  { code: 'vip', name: 'VIP', sort_order: 1, is_active: true },
]

/**
 * Categorías de cliente (mig 285), editables en Configuración. Trae también las
 * INACTIVAS: hacen falta para poner nombre a un cliente que aún conserva una
 * categoría desactivada. Los selectores filtran con `active`.
 */
export function useClientCategories() {
  const supabase = useMemo(() => createClient(), [])
  const query = useQuery({
    queryKey: ['client-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_categories')
        .select('code, name, sort_order, is_active')
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as ClientCategoryRow[]
    },
  })
  // Respaldo si el catálogo no responde (p. ej. código desplegado antes que la
  // mig 285): las dos de siempre, para que ningún desplegable se quede vacío.
  const all = query.data && query.data.length > 0 ? query.data : FALLBACK_CLIENT_CATEGORIES
  return {
    all,
    active: all.filter((c) => c.is_active),
    /** Nombre visible de un code; si no está en el catálogo, el propio code. */
    labelOf: (code: string | null | undefined) =>
      all.find((c) => c.code === code)?.name ?? (code === 'standard' ? 'Normal' : (code ?? '')),
    isLoading: query.isLoading,
    refetch: query.refetch,
  }
}

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
  stores: Array<{ storeId: string; storeName: string; storeCode: string; isPrimary: boolean; storeType?: string }>
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
