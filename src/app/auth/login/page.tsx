import { Metadata } from 'next'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LoginForm } from './login-form'
import { Button } from '@/components/ui/button'
import { User } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Iniciar sesión',
}

const STAFF_ROLES = [
  'administrador', 'sastre', 'sastre_plus', 'vendedor_basico', 'vendedor_avanzado',
  'super_admin', 'admin', 'accountant', 'tailor', 'salesperson', 'web_manager', 'manager',
]

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string; mode?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  let displayName: string | null = null
  let isStaff = false

  if (user) {
    const admin = createAdminClient()
    const [profileRes, rolesRes] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', user.id).single(),
      admin.from('user_roles').select('roles(name)').eq('user_id', user.id),
    ])
    displayName = profileRes.data?.full_name ?? user.email ?? 'Usuario'
    const roleNames = (rolesRes.data ?? []).flatMap((ur: { roles?: { name: string } | { name: string }[] | null }) => {
      if (!ur.roles) return []
      return Array.isArray(ur.roles) ? ur.roles.map((r: { name: string }) => r.name) : [ur.roles.name]
    })
    isStaff = roleNames.some((n: string) => STAFF_ROLES.includes(n))
  }

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col justify-center px-8 py-12 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-light tracking-[0.2em] text-prats-navy">
              PRATS
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {params.mode === 'pos'
                ? 'Acceso al Terminal Punto de Venta'
                : params.mode === 'client'
                  ? 'Acceso a tu cuenta'
                  : 'Panel de Gestión'}
            </p>
          </div>

          {params.error === 'unauthorized' && (
            <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              No tienes permisos para acceder a esta sección.
            </div>
          )}

          {user && displayName ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-prats-navy/10 text-prats-navy">
                <User className="h-6 w-6" />
              </div>
              <p className="font-medium text-prats-navy">Ya has iniciado sesión</p>
              <p className="mt-1 text-sm text-muted-foreground">como {displayName}</p>
              <div className="mt-4 flex flex-col gap-2">
                <Button asChild className="w-full bg-prats-navy hover:bg-prats-navy/90">
                  <Link
                    href={
                      isStaff
                        ? '/admin/dashboard'
                        : (params.redirectTo && params.redirectTo.startsWith('/') ? params.redirectTo : '/mi-cuenta')
                    }
                  >
                    {isStaff
                      ? 'Ir al panel'
                      : params.redirectTo === '/reservar'
                        ? 'Continuar a reservar cita'
                        : 'Ir a mi cuenta'}
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                  <Link href="/">Volver al inicio</Link>
                </Button>
              </div>
            </div>
          ) : (
            <LoginForm
              redirectTo={params.redirectTo}
              mode={params.mode || 'admin'}
            />
          )}
        </div>
      </div>

      <div className="hidden bg-prats-navy lg:flex lg:flex-1 lg:items-center lg:justify-center">
        <div className="text-center">
          <h2 className="font-display text-6xl font-light tracking-[0.3em] text-white">
            PRATS
          </h2>
          <p className="mt-4 text-sm tracking-[0.3em] text-white/50">
            SASTRERÍA DE LUJO · MADRID
          </p>
        </div>
      </div>
    </div>
  )
}
