import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClient, getClientMeasurements } from '@/actions/clients'
import { SastreHeader } from '../../../components/sastre-header'
import { Ruler, Phone, Mail, MapPin } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

export default async function SastreClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, first_name, last_name')
    .eq('id', user.id)
    .single()
  const sastreName = profile?.full_name || profile?.first_name || profile?.last_name || 'Sastre'

  const clientResult = await getClient(id)
  if (!clientResult.success || !clientResult.data) notFound()
  const client = clientResult.data as Record<string, unknown>

  const measurementsResult = await getClientMeasurements({ clientId: id })
  const allMeasurements = measurementsResult.success ? (measurementsResult.data || []) : []
  const lastThree = allMeasurements.slice(0, 3) as Array<{ id: string; created_at?: string; taken_at?: string; version?: number; garment_types?: { name?: string } | null; values?: Record<string, unknown> }>

  const fullName = String(client.full_name || `${client.first_name || ''} ${client.last_name || ''}`).trim() || 'Sin nombre'

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'radial-gradient(ellipse at top, #1a2744 0%, #0a1020 70%)' }}
    >
      <SastreHeader sastreName={sastreName} sectionTitle={fullName} backHref="/sastre/clientes" />
      <main className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Ficha cliente */}
          <div className="rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629] p-6">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="w-24 h-24 rounded-2xl border border-[#c9a96e]/40 bg-[#0d1629]/80 flex items-center justify-center shrink-0">
                <span className="font-serif text-3xl text-[#c9a96e]">{fullName.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-serif text-2xl text-white mb-3">{fullName}</h1>
                {client.email && (
                  <p className="flex items-center gap-2 text-white/80 text-sm">
                    <Mail className="h-4 w-4 text-[#c9a96e] shrink-0" />
                    {String(client.email)}
                  </p>
                )}
                {client.phone && (
                  <p className="flex items-center gap-2 text-white/80 text-sm mt-1">
                    <Phone className="h-4 w-4 text-[#c9a96e] shrink-0" />
                    {String(client.phone)}
                  </p>
                )}
                {client.address && (
                  <p className="flex items-center gap-2 text-white/70 text-sm mt-1">
                    <MapPin className="h-4 w-4 text-[#c9a96e] shrink-0" />
                    {String(client.address)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <Link
            href={`/sastre/medidas/${id}`}
            className="flex items-center justify-center gap-3 w-full h-14 rounded-2xl border-2 border-white/60 bg-transparent text-white font-serif text-xl font-medium hover:bg-white/5 transition-colors touch-manipulation"
          >
            <Ruler className="h-7 w-7" />
            Tomar medidas
          </Link>

          <section>
            <h2 className="text-sm font-medium text-[#c9a96e] uppercase tracking-wide mb-3">Historial de medidas</h2>
            {lastThree.length === 0 ? (
              <p className="text-white/60 text-sm py-4">Aún no hay medidas registradas.</p>
            ) : (
              <ul className="space-y-3">
                {lastThree.map((m) => (
                  <li
                    key={m.id}
                    className="p-4 rounded-2xl border border-[#c9a96e]/20 bg-gradient-to-br from-[#1a2744] to-[#0d1629]"
                  >
                    <p className="font-serif text-white font-medium">
                      {(m.garment_types as { name?: string } | null)?.name ?? 'Medidas'}
                      {m.version != null ? ` · v${m.version}` : ''}
                    </p>
                    <p className="text-sm text-white/60 mt-1">
                      {m.taken_at
                        ? formatDateTime(m.taken_at)
                        : m.created_at
                          ? formatDateTime(m.created_at)
                          : '—'}
                    </p>
                    {m.values && Object.keys(m.values).length > 0 && (
                      <p className="text-xs text-white/50 mt-2 line-clamp-2">
                        {Object.entries(m.values as Record<string, unknown>)
                          .slice(0, 5)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>

      <footer className="py-6 text-center shrink-0">
        <p className="text-xs text-white/20 tracking-widest">
          SASTRERÍA PRATS · PANEL DE GESTIÓN · 2026
        </p>
      </footer>
    </div>
  )
}
