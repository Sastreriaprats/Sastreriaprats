import Link from 'next/link'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOptInToken } from '@/lib/newsletter/tokens'
import { buildMetadata } from '@/lib/seo/metadata'

export const metadata = buildMetadata({
  title: 'Confirmar suscripción — Sastrería Prats',
  description: 'Confirma tu suscripción a la newsletter de Sastrería Prats.',
  path: '/newsletter/confirmar',
  noindex: true,
})

export const dynamic = 'force-dynamic'

type Outcome =
  | { kind: 'ok' }
  | { kind: 'expired' }
  | { kind: 'invalid' }

async function getClientIp(): Promise<string | null> {
  const h = await headers()
  const fwd = h.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  const cf = h.get('cf-connecting-ip')
  return cf?.trim() || null
}

async function processConfirmation(token: string | undefined): Promise<Outcome> {
  if (!token || !token.trim()) return { kind: 'invalid' }

  const result = verifyOptInToken(token)
  if (!result.valid) {
    return result.expired ? { kind: 'expired' } : { kind: 'invalid' }
  }

  const ip = await getClientIp()
  const admin = createAdminClient()
  const { error } = await admin
    .from('clients')
    .update({
      newsletter_subscribed: true,
      accepts_marketing: true,
      marketing_consent_date: new Date().toISOString(),
      marketing_consent_ip: ip,
      opt_in_token: null,
      opt_in_token_created_at: null,
      unsubscribed_at: null,
    })
    .eq('id', result.clientId)

  if (error) {
    console.error('[newsletter/confirmar] update error:', error)
    return { kind: 'invalid' }
  }
  return { kind: 'ok' }
}

export default async function ConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const outcome = await processConfirmation(token)

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-white">
      <div className="max-w-[500px] w-full text-center space-y-6">
        <div>
          <p className="text-[10px] tracking-[0.4em] text-gray-400 uppercase">Sastrería</p>
          <p className="font-serif text-2xl tracking-[0.3em] text-prats-navy mt-1">PRATS</p>
        </div>

        {outcome.kind === 'ok' && (
          <>
            <h1 className="font-serif text-3xl font-light text-prats-navy">Suscrito ✓</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              Tu suscripción a la newsletter de Sastrería Prats ha quedado confirmada.
              Te escribiremos sólo cuando tengamos algo realmente interesante que contarte:
              nuevas colecciones, eventos y consejos de estilo.
            </p>
            <p className="text-xs text-gray-400">
              Puedes darte de baja en cualquier momento desde el enlace de cualquier email.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 text-xs tracking-[0.2em] uppercase text-prats-navy border-b border-prats-navy/40 hover:border-prats-navy pb-0.5"
            >
              Volver a la web
            </Link>
          </>
        )}

        {outcome.kind === 'expired' && (
          <>
            <h1 className="font-serif text-3xl font-light text-prats-navy">El enlace ha caducado</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              Este enlace de confirmación ha caducado (la validez es de 30 días).
              Si todavía quieres suscribirte, escríbenos a{' '}
              <a href="mailto:info@sastreriaprats.com" className="text-prats-navy underline">
                info@sastreriaprats.com
              </a>{' '}
              o suscríbete desde nuestra web.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 text-xs tracking-[0.2em] uppercase text-prats-navy border-b border-prats-navy/40 hover:border-prats-navy pb-0.5"
            >
              Volver a la web
            </Link>
          </>
        )}

        {outcome.kind === 'invalid' && (
          <>
            <h1 className="font-serif text-3xl font-light text-prats-navy">Algo no ha ido bien</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              El enlace no es válido. Si has llegado aquí desde un email, asegúrate de copiarlo
              entero o pulsa de nuevo el botón del mensaje.
            </p>
            <Link
              href="/"
              className="inline-block mt-4 text-xs tracking-[0.2em] uppercase text-prats-navy border-b border-prats-navy/40 hover:border-prats-navy pb-0.5"
            >
              Volver a la web
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
