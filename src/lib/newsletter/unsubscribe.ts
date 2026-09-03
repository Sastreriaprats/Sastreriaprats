import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOptInToken } from '@/lib/newsletter/tokens'

export type UnsubscribeOutcome =
  | { kind: 'ok'; token: string }
  | { kind: 'expired' }
  | { kind: 'invalid' }

/**
 * Da de baja de marketing al cliente que firma el token.
 *
 * Vive aparte de la pagina porque hay dos entradas: el enlace que pulsa la
 * persona (GET a /newsletter/baja) y el boton "Cancelar suscripcion" del propio
 * cliente de correo, que segun la RFC 8058 hace un POST a la URI de la cabecera
 * List-Unsubscribe. Las dos tienen que dar exactamente la misma baja.
 *
 * Se escriben los tres campos a la vez porque el envio filtra por dos vias
 * distintas: `applyMarketingBaseFilter` exige `unsubscribed_at IS NULL` y el
 * segmento de invitacion opt-in mira `accepts_marketing`. Marcar solo uno
 * dejaba al cliente fuera de las campañas pero dentro de las invitaciones.
 */
export async function processUnsubscribe(token: string | undefined): Promise<UnsubscribeOutcome> {
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
      accepts_marketing: false,
      unsubscribed_at: new Date().toISOString(),
    })
    .eq('id', result.clientId)

  if (error) {
    console.error('[newsletter/baja] update error:', error)
    return { kind: 'invalid' }
  }
  return { kind: 'ok', token }
}
