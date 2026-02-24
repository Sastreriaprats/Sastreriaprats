'use client'

import { useAuth } from '@/components/providers/auth-provider'

/**
 * Hook para verificar permisos del usuario actual.
 *
 * Uso:
 *   const { can, canAny, canAll } = usePermissions()
 *   if (can('clients.create')) { ... }
 *   if (canAny(['orders.read', 'orders.create'])) { ... }
 */
export function usePermissions() {
  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isAdmin,
    isSuperAdmin,
  } = useAuth()

  return {
    can: hasPermission,
    canAny: hasAnyPermission,
    canAll: hasAllPermissions,
    isAdmin,
    isSuperAdmin,
  }
}
