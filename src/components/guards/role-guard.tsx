'use client'

import { useAuth } from '@/components/providers/auth-provider'

interface RoleGuardProps {
  children: React.ReactNode
  role?: string
  roles?: string[]
  fallback?: React.ReactNode
  hideCompletely?: boolean
}

export function RoleGuard({
  children,
  role,
  roles,
  fallback,
  hideCompletely = false,
}: RoleGuardProps) {
  const { hasRole, isLoading } = useAuth()

  if (isLoading) return null

  let hasAccess = false

  if (role) {
    hasAccess = hasRole(role)
  } else if (roles?.length) {
    hasAccess = roles.some((r) => hasRole(r))
  } else {
    hasAccess = true
  }

  if (hasAccess) return <>{children}</>
  if (hideCompletely) return null
  if (fallback) return <>{fallback}</>
  return null
}
