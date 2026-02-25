import type { Metadata, Viewport } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/components/providers/auth-provider'
import { QueryProvider } from '@/components/providers/query-provider'
import { ServiceWorkerRegister } from '@/components/pwa/sw-register'
import { OnlineStatus } from '@/components/pwa/online-status'
import { InstallPrompt } from '@/components/pwa/install-prompt'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserWithRoles } from '@/lib/types/auth'
import type { Session } from '@supabase/supabase-js'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: {
    default: 'Sastrería Prats — Panel de Gestión',
    template: '%s | Sastrería Prats',
  },
  description: 'Sistema de gestión integral para Sastrería Prats. Pedidos a medida, boutique, TPV, clientes, stock y contabilidad.',
  keywords: ['sastrería', 'gestión', 'pedidos', 'boutique', 'Madrid', 'trajes a medida'],
  authors: [{ name: 'FastIA', url: 'https://fastia.es' }],
  creator: 'FastIA',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://prats.fastia.es',
    siteName: 'Sastrería Prats',
    title: 'Sastrería Prats — Panel de Gestión',
    description: 'Sistema de gestión integral para sastrería de lujo.',
  },
  robots: {
    index: false,
    follow: false,
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1a2744',
}

async function getInitialAuthData(): Promise<{ session: Session | null; profile: UserWithRoles | null }> {
  try {
    const supabase = await createServerSupabaseClient()

    // getUser verifica contra el servidor (fiable). getSession solo para hidratar AuthProvider en cliente.
    const [{ data: { user } }, { data: { session } }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ])

    if (!user) return { session: null, profile: null }

    const admin = createAdminClient()
    const [profileRes, userRolesRes] = await Promise.all([
      admin.from('profiles').select('*').eq('id', user.id).single(),
      admin.from('user_roles').select('roles(id, name, display_name, color, icon)').eq('user_id', user.id),
    ])

    if (!profileRes.data) return { session, profile: null }

    const roles = (userRolesRes.data ?? []).map((ur: { roles?: unknown }) => {
      const r = ur.roles as { id: string; name: string; display_name: string | null; color: string | null; icon: string | null } | null
      return r ? { roleId: r.id, roleName: r.name, displayName: r.display_name, color: r.color, icon: r.icon } : null
    }).filter(Boolean) as UserWithRoles['roles']

    const rpRes = await admin.from('role_permissions').select('permissions(code)').in('role_id', roles.map(r => r.roleId))
    const permissions = [...new Set(
      (rpRes.data ?? []).flatMap((rp: { permissions?: unknown }) => {
        const p = rp.permissions as { code: string } | { code: string }[] | null
        if (!p) return []
        return Array.isArray(p) ? p.map(x => x.code) : [p.code]
      })
    )] as string[]

    const pd = profileRes.data as Record<string, unknown>
    const profile: UserWithRoles = {
      id: pd.id as string,
      email: pd.email as string,
      fullName: (pd.full_name as string) ?? '',
      firstName: (pd.first_name as string | null) ?? null,
      lastName: (pd.last_name as string | null) ?? null,
      avatarUrl: (pd.avatar_url as string | null) ?? null,
      phone: (pd.phone as string | null) ?? null,
      preferredLocale: (pd.preferred_locale as string | null) ?? null,
      darkMode: (pd.dark_mode as boolean | null) ?? null,
      isActive: (pd.is_active as boolean) ?? true,
      status: (pd.status as string) ?? 'active',
      lastLoginAt: (pd.last_login_at as string | null) ?? null,
      createdAt: pd.created_at as string,
      updatedAt: pd.updated_at as string,
      roles,
      stores: [],
      permissions,
    }

    return { session, profile }
  } catch {
    return { session: null, profile: null }
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { session, profile } = await getInitialAuthData()

  return (
    <html lang="es" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`${inter.variable} ${playfair.variable} font-sans antialiased`}>
        <QueryProvider>
          <AuthProvider initialSession={session} initialProfile={profile}>
            {children}
          </AuthProvider>
        </QueryProvider>
        <Toaster richColors position="top-right" />
        <ServiceWorkerRegister />
        <OnlineStatus />
        <InstallPrompt />
      </body>
    </html>
  )
}
