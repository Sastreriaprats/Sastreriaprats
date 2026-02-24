/**
 * Tipos para autenticación, perfiles con roles y permisos.
 */

export interface UserRoleInfo {
  roleId: string
  roleName: string
  displayName: string | null
  color: string | null
  icon: string | null
}

export interface UserWithRoles {
  id: string
  email: string
  fullName: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  phone: string | null
  preferredLocale: string | null
  darkMode: boolean | null
  isActive: boolean
  status: string
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  roles: UserRoleInfo[]
  stores: string[]
  permissions: string[]
}
