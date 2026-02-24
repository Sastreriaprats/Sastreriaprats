'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, Session } from '@supabase/supabase-js'
import type { UserWithRoles } from '@/lib/types/auth'

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
  const backgroundFetchRef = useRef<AbortController | null>(null)

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

  const fetchProfileFull = useCallback(async (userId: string, signal?: AbortSignal): Promise<{ profile: UserWithRoles; stores: StoreInfo[] } | null> => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError || !profileData) return null
      if (signal?.aborted) return null

      // Fetch permissions with 8s timeout
      let roles: { roleId: string; roleName: string; displayName: string | null; color: string | null; icon: string | null }[] = []
      let userPermissions: string[] = []
      let storeList: StoreInfo[] = []

      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)

        const res = await fetch('/api/auth/permissions', { signal: controller.signal })
        clearTimeout(timer)

        if (res.ok && !signal?.aborted) {
          const data = await res.json()
          roles = (data.roles ?? []).map((r: { roleId?: string; roleName?: string; displayName?: string; color?: string; icon?: string }) => ({
            roleId: r.roleId ?? '', roleName: r.roleName ?? '',
            displayName: r.displayName ?? null, color: r.color ?? null, icon: r.icon ?? null,
          }))
          userPermissions = data.permissions ?? []
          storeList = (data.stores ?? []).map((s: { storeId?: string; storeName?: string; storeCode?: string; isPrimary?: boolean }) => ({
            storeId: s.storeId ?? '', storeName: s.storeName ?? '',
            storeCode: s.storeCode ?? '', isPrimary: s.isPrimary ?? false,
          }))
        }
      } catch (e) {
        console.warn('Permissions fetch failed:', e)
      }

      if (signal?.aborted) return null

      const builtProfile: UserWithRoles = {
        id: profileData.id,
        email: profileData.email,
        fullName: profileData.full_name ?? '',
        firstName: profileData.first_name ?? null,
        lastName: profileData.last_name ?? null,
        avatarUrl: profileData.avatar_url ?? null,
        phone: profileData.phone ?? null,
        preferredLocale: profileData.preferred_locale ?? null,
        darkMode: profileData.dark_mode ?? null,
        isActive: profileData.is_active ?? true,
        status: profileData.status ?? 'active',
        lastLoginAt: profileData.last_login_at ?? null,
        createdAt: profileData.created_at,
        updatedAt: profileData.updated_at,
        roles,
        stores: storeList.map(s => s.storeName),
        permissions: userPermissions,
      }

      return { profile: builtProfile, stores: storeList }
    } catch (error) {
      console.error('Error fetching profile:', error)
      return null
    }
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    const result = await fetchProfileFull(user.id)
    if (result) {
      setProfile(result.profile)
      applyStores(result.stores)
      saveCachedAuth(user.id, result)
    }
  }, [user, fetchProfileFull, applyStores])

  useEffect(() => {
    let cancelled = false

    const handleUserSession = async (userId: string, isInitial: boolean) => {
      if (isInitial) {
        // Restore from cache immediately so UI renders without any loading state
        const cached = loadCachedAuth(userId)
        if (cached) {
          setProfile(cached.profile)
          applyStores(cached.stores)
        }
      }

      // Cancel any in-flight background fetch
      if (backgroundFetchRef.current) {
        backgroundFetchRef.current.abort()
      }
      const ctrl = new AbortController()
      backgroundFetchRef.current = ctrl

      // Fetch fresh data in background (non-blocking for initial, blocking for sign-in)
      const result = await fetchProfileFull(userId, ctrl.signal)
      if (cancelled || ctrl.signal.aborted) return

      if (result) {
        setProfile(result.profile)
        applyStores(result.stores)
        saveCachedAuth(userId, result)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (cancelled) return
        setSession(newSession)
        setUser(newSession?.user ?? null)

        if (newSession?.user) {
          const isInitial = event === 'INITIAL_SESSION'
          if (!isInitial) hasSetInitialStore.current = false
          await handleUserSession(newSession.user.id, isInitial)
        } else {
          setProfile(null)
          setStores([])
        }
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
      if (backgroundFetchRef.current) {
        backgroundFetchRef.current.abort()
      }
    }
  }, [supabase, fetchProfileFull, applyStores])

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
