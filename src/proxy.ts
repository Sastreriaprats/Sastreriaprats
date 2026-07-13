import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Los segmentos dinámicos públicos (producto, categoría, post) renderizan en
 * streaming: cuando la página llama a notFound() el status 200 ya se envió y
 * Google recibe un soft-404. La comprobación de existencia debe vivir aquí,
 * antes de renderizar — mismo patrón que el gating de /panel en updateSession:
 * rewrite a una ruta inexistente (/__nf) para que Next sirva el 404 real.
 * Devuelve la query PostgREST que comprueba existencia, o null si la ruta no
 * necesita comprobación.
 */
function existenceProbe(pathname: string): string | null {
  const norm = (raw: string) => {
    try {
      return encodeURIComponent(decodeURIComponent(raw))
    } catch {
      return encodeURIComponent(raw)
    }
  }
  let m = pathname.match(/^\/blog\/([^/]+)$/)
  if (m) return `blog_posts?select=slug&slug=eq.${norm(m[1])}&status=eq.published&limit=1`
  m = pathname.match(/^\/boutique\/categoria\/([^/]+)$/)
  if (m) return `product_categories?select=slug&slug=eq.${norm(m[1])}&is_active=eq.true&is_visible_web=eq.true&limit=1`
  m = pathname.match(/^\/boutique\/([^/]+)$/)
  if (m && m[1] !== 'categoria') return `products?select=web_slug&web_slug=eq.${norm(m[1])}&is_active=eq.true&is_visible_web=eq.true&limit=1`
  return null
}

/** true = existe, false = no existe, null = no se pudo comprobar (fail-open). */
async function existsInDb(probe: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${probe}`, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    })
    if (!res.ok) return null
    const rows = await res.json()
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return null
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // URL antigua de categoría por query → ruta propia, con 308 HTTP real y URL
  // limpia. No puede hacerse en la página (el streaming ya envió el 200) ni en
  // next.config redirects() (re-adjunta ?category= al destino).
  if (pathname === '/boutique') {
    const category = searchParams.get('category')
    if (category) {
      return NextResponse.redirect(
        new URL(`/boutique/categoria/${encodeURIComponent(category)}`, request.url),
        308,
      )
    }
  }

  // 404 HTTP real para contenido público inexistente (ver existenceProbe).
  if (request.method === 'GET' || request.method === 'HEAD') {
    const probe = existenceProbe(pathname)
    if (probe && (await existsInDb(probe)) === false) {
      const url = request.nextUrl.clone()
      url.pathname = '/__nf' // ruta inexistente → Next sirve la 404 real
      return NextResponse.rewrite(url)
    }
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
