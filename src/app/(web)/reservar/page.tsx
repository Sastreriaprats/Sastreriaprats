import type { Metadata } from 'next'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BookingContent } from '../cita-previa/booking-content'
import { CalendarDays, LogIn, UserPlus } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Reservar cita — Sastrería Prats',
  description: 'Reserva tu cita en Sastrería Prats. El Viso o Wellington. Trajes a medida, camisería y boutique en Madrid.',
}

export const dynamic = 'force-dynamic'

export default async function ReservarPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ─── No autenticado: obligar a registrarse o iniciar sesión ─────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-white">
        <div className="bg-[#1B2A4A] py-12 px-4 text-center">
          <p className="text-xs tracking-[0.4em] text-white/40 uppercase mb-2">Sastrería Prats</p>
          <h1 className="font-serif text-4xl font-light text-white">Reservar cita</h1>
        </div>

        <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
          <div className="max-w-md w-full text-center space-y-8">
            <div className="space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1B2A4A]/10">
                <CalendarDays className="h-8 w-8 text-[#1B2A4A]" />
              </div>
              <h2 className="text-xl font-serif font-light text-[#1B2A4A]">
                Para reservar la cita debes registrarte como cliente
              </h2>
              <p className="text-sm text-[#1B2A4A]/60">
                Así guardamos tus citas en tu perfil y podemos preparar tu visita. Si ya tienes cuenta, inicia sesión.
              </p>
            </div>

            <div className="grid gap-3">
              <Link
                href="/auth/login?mode=client&redirectTo=/reservar"
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#1B2A4A] bg-[#1B2A4A] px-6 py-4 text-sm font-semibold text-white hover:bg-[#1B2A4A]/90 transition-colors"
              >
                <LogIn className="h-4 w-4" /> Iniciar sesión
              </Link>
              <Link
                href="/auth/registro?redirect=/reservar"
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#1B2A4A] px-6 py-4 text-sm font-semibold text-[#1B2A4A] hover:bg-[#1B2A4A]/5 transition-colors"
              >
                <UserPlus className="h-4 w-4" /> Crear cuenta (registrarse como cliente)
              </Link>
            </div>

            <p className="text-xs text-[#1B2A4A]/50">
              Al crear una cuenta, tus datos quedarán en tu perfil de cliente de Sastrería Prats para futuras visitas y reservas.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const admin = createAdminClient()

  const { data: client } = await admin
    .from('clients')
    .select('id, full_name, email, phone')
    .eq('profile_id', user.id)
    .single()

  if (!client) {
    return (
      <div className="min-h-screen bg-white">
        <div className="bg-[#1B2A4A] py-12 px-4 text-center">
          <h1 className="font-serif text-4xl font-light text-white">Reservar cita</h1>
        </div>
        <div className="min-h-[50vh] flex items-center justify-center px-4 py-16">
          <div className="max-w-md w-full text-center space-y-4">
            <CalendarDays className="mx-auto h-12 w-12 text-[#1B2A4A]/30" />
            <h2 className="text-xl font-serif text-[#1B2A4A]">Perfil de cliente no encontrado</h2>
            <p className="text-sm text-[#1B2A4A]/60">
              Tu cuenta existe pero no tienes aún un perfil de cliente. Contacta con nosotros en{' '}
              <a href="mailto:info@sastreriaprats.com" className="text-[#1B2A4A] underline">info@sastreriaprats.com</a> para darte de alta.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { data: stores } = await admin
    .from('stores')
    .select('id, name, address')
    .eq('store_type', 'physical')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-[#1B2A4A] py-12 px-4 text-center">
        <p className="text-xs tracking-[0.4em] text-white/40 uppercase mb-2">Sastrería Prats</p>
        <h1 className="font-serif text-4xl font-light text-white">Reservar cita</h1>
      </div>
      <BookingContent
        client={client as { id: string; full_name: string; email?: string }}
        stores={(stores || []) as { id: string; name: string; address?: string }[]}
      />
    </div>
  )
}
