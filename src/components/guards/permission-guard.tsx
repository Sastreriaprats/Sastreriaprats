'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { Lock } from 'lucide-react'

interface PermissionGuardProps {
  children: React.ReactNode
  permission?: string
  permissions?: string[]
  requireAll?: boolean
  fallback?: React.ReactNode
  hideCompletely?: boolean
}

/**
 * Protege un componente o sección verificando permisos.
 *
 * Uso:
 *   <PermissionGuard permission="clients.create">
 *     <CreateClientButton />
 *   </PermissionGuard>
 *
 *   <PermissionGuard permissions={['orders.read', 'orders.create']} requireAll>
 *     <OrderForm />
 *   </PermissionGuard>
 */
export function PermissionGuard({
  children,
  permission,
  permissions,
  requireAll = false,
  fallback,
  hideCompletely = false,
}: PermissionGuardProps) {
  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isLoading,
  } = useAuth()

  if (isLoading) return null

  let hasAccess = false

  if (permission) {
    hasAccess = hasPermission(permission)
  } else if (permissions?.length) {
    hasAccess = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions)
  } else {
    hasAccess = true
  }

  if (hasAccess) return <>{children}</>

  if (hideCompletely) return null

  if (fallback) return <>{fallback}</>

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Lock className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">Acceso restringido</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        No tienes permisos para acceder a esta sección.
      </p>
    </div>
  )
}
