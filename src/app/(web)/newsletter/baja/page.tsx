import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOptInToken } from '@/lib/newsletter/tokens'
import { buildMetadata } from '@/lib/seo/metadata'
import { UnsubscribeReasonForm } from './unsubscribe-reason-form'

export const metadata = buildMetadata({
  title: 'Darse de baja — Sastrería Prats',
  description: 'Baja de la newsletter de Sastrería Prats.',
  path: '/newsletter/baja',
  noindex: true,
})

export const dynamic = 'force-dynamic'

type Outcome =
  | { kind: 'ok'; token: string }
  | { kind: 'expired' }
  | { kind: 'invalid' }

async function processUnsubscribe(token: string | undefined): Promise<Outcome> {
  if (!token || !token.trim()) return { kind: 'invalid' }

  const result = verifyOptInToken(token)
  if (!result.valid) {
    return result.expired ? { kind: 'expired' } : { kind: 'invalid' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clients')
    .update({
      newsletter_subscribed: false,
      unsubscribed_at: new Date().toISOString(),
    })
    .eq('id', result.clientId)

  if (error) {
    console.error('[newsletter/baja] update error:', error)
    return { kind: 'invalid' }
  }
  return { kind: 'ok', token }
}

export default async function BajaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const outcome = await processUnsubscribe(token)

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-white">
      <div className="max-w-[500px] w-full text-center space-y-6">
        <div>
          <p className="text-[10px] tracking-[0.4em] text-gray-400 uppercase">Sastrería</p>
          <p className="font-serif text-2xl tracking-[0.3em] text-prats-navy mt-1">PRATS</p>
        </div>

        {outcome.kind === 'ok' && (
          <>
            <h1 className="font-serif text-3xl font-light text-prats-navy">Te has dado de baja</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              Ya no recibirás más emails de la newsletter de Sastrería Prats.
              Lamentamos verte marchar.
            </p>
            <p className="text-xs text-gray-400">
              Si fue un error, puedes volver a suscribirte desde{' '}
              <Link href="/" className="text-prats-navy underline">nuestra web</Link>.
            </p>

            <div className="pt-6 border-t border-gray-100">
              <UnsubscribeReasonForm token={outcome.token} />
            </div>

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
              Este enlace de baja ya no es válido. Si necesitas darte de baja de la newsletter,
              escríbenos a{' '}
              <a href="mailto:info@sastreriaprats.com" className="text-prats-navy underline">
                info@sastreriaprats.com
              </a>.
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
            <h1 className="font-serif text-3xl font-light text-prats-navy">El enlace no es válido</h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              El enlace de baja no es correcto. Si has llegado aquí desde un email, asegúrate
              de copiarlo entero. También puedes escribirnos a{' '}
              <a href="mailto:info@sastreriaprats.com" className="text-prats-navy underline">
                info@sastreriaprats.com
              </a>.
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
