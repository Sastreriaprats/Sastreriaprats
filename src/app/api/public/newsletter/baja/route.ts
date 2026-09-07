import { NextRequest, NextResponse } from 'next/server'
import { processUnsubscribe } from '@/lib/newsletter/unsubscribe'

export const dynamic = 'force-dynamic'

/**
 * Baja "One-Click" de la RFC 8058.
 *
 * Los emails salen con `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, y
 * eso obliga a que la URI de `List-Unsubscribe` acepte un POST: Gmail y
 * Outlook pintan su propio boton "Cancelar suscripcion" y hacen POST, nunca
 * GET. La cabecera apuntaba a la pagina web, que solo responde a GET, asi que
 * ese boton no daba de baja a nadie.
 *
 * El token viaja en la query. El cuerpo que manda el cliente de correo es
 * `List-Unsubscribe=One-Click` y no hace falta leerlo, pero se acepta igual.
 */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? undefined
  const outcome = await processUnsubscribe(token)

  // Un token invalido o caducado no se convierte en error visible: el cliente
  // de correo no enseña el cuerpo de la respuesta y reintentar no arregla nada.
  if (outcome.kind !== 'ok') {
    console.warn('[api/newsletter/baja] baja one-click no aplicada:', outcome.kind)
  }
  return new NextResponse(null, { status: 200 })
}

/**
 * Algunos clientes de correo siguen el enlace con GET. En ese caso la baja la
 * hace la pagina, que ademas puede preguntar el motivo.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  const url = new URL('/newsletter/baja', req.nextUrl.origin)
  if (token) url.searchParams.set('token', token)
  return NextResponse.redirect(url)
}
