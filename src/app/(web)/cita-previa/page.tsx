import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BookingContent } from './booking-content'
import { CalendarDays, LogIn, UserPlus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CitaPreviaPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Si no está autenticado → mostrar pantalla de login
  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="space-y-3">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-prats-navy/10">
              <CalendarDays className="h-8 w-8 text-prats-navy" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-prats-navy">Reserva tu cita en Prats</h1>
            <p className="text-muted-foreground">
              Para reservar una cita necesitas identificarte. Así guardamos tus citas y podemos preparar la visita especialmente para ti.
            </p>
          </div>

          <div className="grid gap-3">
            <Link
              href="/auth/login?mode=client&redirect=/cita-previa"
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-prats-navy bg-prats-navy px-6 py-4 text-sm font-semibold text-white hover:bg-prats-navy/90 transition-colors"
            >
              <LogIn className="h-4 w-4" /> Iniciar sesión
            </Link>
            <Link
              href="/auth/registro?redirect=/cita-previa"
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-prats-navy px-6 py-4 text-sm font-semibold text-prats-navy hover:bg-prats-navy/5 transition-colors"
            >
              <UserPlus className="h-4 w-4" /> Crear cuenta nueva
            </Link>
          </div>

          <p className="text-xs text-muted-foreground">
            Al crear una cuenta, tus datos quedarán guardados en tu perfil de cliente de Sastrería Prats para futuras visitas.
          </p>
        </div>
      </div>
    )
  }

  const admin = createAdminClient()

  // Buscar el cliente vinculado a este usuario
  const { data: client } = await admin
    .from('clients')
    .select('id, full_name, email, phone')
    .eq('profile_id', user.id)
    .single()

  if (!client) {
    // El usuario tiene cuenta pero no tiene perfil de cliente todavía
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <CalendarDays className="mx-auto h-12 w-12 text-prats-navy/30" />
          <h1 className="text-xl font-bold">Perfil de cliente no encontrado</h1>
          <p className="text-muted-foreground text-sm">
            Tu cuenta existe pero aún no tienes un perfil de cliente en Sastrería Prats. Por favor contacta con nosotros en{' '}
            <a href="mailto:info@sastreriaprats.com" className="text-prats-navy underline">info@sastreriaprats.com</a> para que lo creemos.
          </p>
        </div>
      </div>
    )
  }

  // Cargar tiendas físicas
  const { data: stores } = await admin
    .from('stores')
    .select('id, name, address')
    .eq('store_type', 'physical')
    .eq('is_active', true)
    .order('name')

  return (
    <BookingContent
      client={client as { id: string; full_name: string; email?: string }}
      stores={(stores || []) as { id: string; name: string; address?: string }[]}
    />
  )
}
