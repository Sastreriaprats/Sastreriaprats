import type { Metadata, Viewport } from 'next'
import { Inter, Playfair_Display } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/components/providers/auth-provider'
import { QueryProvider } from '@/components/providers/query-provider'
import { SwUpdateProvider } from '@/components/pwa/sw-update-provider'
import { OnlineStatus } from '@/components/pwa/online-status'
import { PwaInstallProvider } from '@/components/pwa/install-provider'
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
    default: 'Sastrería Prats — Madrid · Sastrería a medida y boutique',
    template: '%s | Sastrería Prats',
  },
  description: 'Sastrería de lujo en Madrid desde 1985. Trajes a medida, americanas, camisería y colección boutique. Tradición artesanal y producto de boutique online.',
  keywords: ['sastrería Madrid', 'traje a medida Madrid', 'sastrería de lujo', 'camisería a medida', 'sastrería Prats', 'boutique hombre Madrid', 'americana a medida'],
  authors: [{ name: 'Sastrería Prats' }],
  creator: 'Sastrería Prats',
  publisher: 'Sastrería Prats',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://sastreriaprats.com'),
  // OJO: NO declarar `alternates.canonical` aquí. El layout raíz se hereda en
  // TODAS las páginas que no definan el suyo, y un canonical '/' global le decía
  // a Google que boutique, productos y servicios eran duplicados de la home.
  // Cada página declara su propio canonical en su `metadata`/`generateMetadata`.
  // Cuando se publique la versión en inglés, añade languages por página:
  // alternates: { languages: { 'es-ES': '/', 'en-US': '/en', 'x-default': '/' } },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://sastreriaprats.com',
    siteName: 'Sastrería Prats',
    title: 'Sastrería Prats — Madrid · Sastrería a medida y boutique',
    description: 'Sastrería de lujo en Madrid desde 1985.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sastrería Prats — Madrid',
    description: 'Sastrería de lujo en Madrid desde 1985.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  // Cuando tengas el código de verificación de Search Console, descomenta y pega:
  // verification: { google: 'TU_CODIGO_AQUI' },
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

    const [{ data: { user } }, { data: { session } }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ])

    if (!user) return { session: null, profile: null }

    // Serializar sesión para evitar "unexpected response" (objetos no serializables en RSC)
    const sessionPlain = session
      ? JSON.parse(JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          expires_at: session.expires_at,
          token_type: session.token_type,
          user: session.user ? {
            id: session.user.id,
            email: session.user.email,
            app_metadata: session.user.app_metadata,
            user_metadata: session.user.user_metadata,
            aud: session.user.aud,
            created_at: session.user.created_at,
            updated_at: session.user.updated_at,
          } : null,
        })) as Session
      : null

    const admin = createAdminClient()
    const [profileRes, userRolesRes] = await Promise.all([
      admin.from('profiles').select('*').eq('id', user.id).single(),
      admin.from('user_roles').select('roles(id, name, display_name, color, icon)').eq('user_id', user.id),
    ])

    if (!profileRes.data) return { session: sessionPlain, profile: null }

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
      lastLoginAt: pd.last_login_at != null ? String(new Date(pd.last_login_at as string).toISOString()) : null,
      createdAt: pd.created_at != null ? String(new Date(pd.created_at as string).toISOString()) : '',
      updatedAt: pd.updated_at != null ? String(new Date(pd.updated_at as string).toISOString()) : '',
      roles,
      stores: [],
      permissions,
    }

    return { session: sessionPlain, profile: JSON.parse(JSON.stringify(profile)) as UserWithRoles }
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
            <PwaInstallProvider>
              <SwUpdateProvider>
                {children}
              </SwUpdateProvider>
            </PwaInstallProvider>
          </AuthProvider>
        </QueryProvider>
        <Toaster richColors position="top-right" />
        <OnlineStatus />
      </body>
    </html>
  )
}
