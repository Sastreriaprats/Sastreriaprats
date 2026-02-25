'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'
import type { UserWithRoles } from '@/lib/types/auth'
import { useCurrentProfile } from '@/hooks/use-cached-queries'

export interface StoreInfo {
  storeId: string
  storeName: string
  isPrimary: boolean
}

interface CachedAuth {
  profile: UserWithRoles
  stores: StoreInfo[]
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserWithRoles | null
  stores: StoreInfo[]
  isLoading: boolean
  permissions: Set<string>
  activeStoreId: string | null
  setActiveStoreId: (id: string | null) => void
  hasPermission: (code: string) => boolean
  hasAnyPermission: (codes: string[]) => boolean
  hasAllPermissions: (codes: string[]) => boolean
  hasRole: (role: string) => boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function getCacheKey(uid: string) { return `prats_auth_v3_${uid}` }

function loadCachedAuth(uid: string): CachedAuth | null {
  try {
    const raw = localStorage.getItem(getCacheKey(uid))
    if (!raw) return null
    return JSON.parse(raw) as CachedAuth
  } catch { return null }
}

function saveCachedAuth(uid: string, data: CachedAuth) {
  try { localStorage.setItem(getCacheKey(uid), JSON.stringify(data)) } catch {}
}

function clearCachedAuth(uid: string) {
  try { localStorage.removeItem(getCacheKey(uid)) } catch {}
}

export function AuthProvider({
  children,
  initialSession,
  initialProfile,
}: {
  children: React.ReactNode
  initialSession?: Session | null
  initialProfile?: UserWithRoles | null
}) {
  // Crear el cliente una sola vez — llamar createClient() en cada render
  // genera múltiples instancias que compiten por el mismo Navigator Lock de auth
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null)
  const [session, setSession] = useState<Session | null>(initialSession ?? null)
  const [profile, setProfile] = useState<UserWithRoles | null>(initialProfile ?? null)
  const [stores, setStores] = useState<StoreInfo[]>([])
  // isLoading false by default: we show UI immediately from cache
  const [isLoading, setIsLoading] = useState(false)
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('prats_active_store')
    }
    return null
  })
  const hasSetInitialStore = useRef(false)

  const setActiveStoreId = useCallback((id: string | null) => {
    setActiveStoreIdState(id)
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('prats_active_store', id)
      else localStorage.removeItem('prats_active_store')
    }
  }, [])

  const permissions = new Set(profile?.permissions ?? [])

  const applyStores = useCallback((storeList: StoreInfo[]) => {
    setStores(storeList)
    if (!hasSetInitialStore.current && storeList.length > 0) {
      hasSetInitialStore.current = true
      const primary = storeList.find(s => s.isPrimary)
      const firstStoreId = primary?.storeId ?? storeList[0]?.storeId
      if (firstStoreId) {
        setActiveStoreIdState(firstStoreId)
        if (typeof window !== 'undefined') {
          localStorage.setItem('prats_active_store', firstStoreId)
        }
      }
    }
  }, [])

  const { data: profileData, refetch: refetchProfileQuery } = useCurrentProfile(user?.id ?? null)

  useEffect(() => {
    if (user?.id && profileData) {
      setProfile(profileData.profile)
      const storeList: StoreInfo[] = profileData.stores.map(s => ({ storeId: s.storeId, storeName: s.storeName, isPrimary: s.isPrimary }))
      applyStores(storeList)
      saveCachedAuth(user.id, { profile: profileData.profile, stores: storeList })
    }
  }, [user?.id, profileData, applyStores])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    await refetchProfileQuery()
  }, [user, refetchProfileQuery])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession)
        setUser(newSession?.user ?? null)

        if (newSession?.user) {
          const isInitial = event === 'INITIAL_SESSION'
          if (isInitial) {
            const cached = loadCachedAuth(newSession.user.id)
            if (cached) {
              setProfile(cached.profile)
              applyStores(cached.stores)
            }
          } else {
            hasSetInitialStore.current = false
          }
        } else {
          setProfile(null)
          setStores([])
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [supabase, applyStores])

  const hasPermission = useCallback((code: string): boolean => permissions.has(code), [profile?.permissions])
  const hasAnyPermission = useCallback((codes: string[]): boolean => codes.some((code) => permissions.has(code)), [profile?.permissions])
  const hasAllPermissions = useCallback((codes: string[]): boolean => codes.every((code) => permissions.has(code)), [profile?.permissions])
  const hasRole = useCallback((role: string): boolean => (profile?.roles?.some((r) => r.roleName === role) ?? false), [profile?.roles])
  const isAdmin = hasRole('administrador') || hasRole('admin') || hasRole('super_admin')
  const isSuperAdmin = hasRole('administrador') || hasRole('super_admin')

  const signOut = useCallback(async () => {
    if (user?.id) clearCachedAuth(user.id)
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
    setStores([])
    hasSetInitialStore.current = false
    if (typeof window !== 'undefined') {
      localStorage.removeItem('prats_active_store')
    }
  }, [supabase, user?.id])

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        stores,
        isLoading,
        permissions,
        activeStoreId,
        setActiveStoreId,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        hasRole,
        isAdmin,
        isSuperAdmin,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
