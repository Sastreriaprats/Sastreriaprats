import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  // URL antigua de categoría por query → ruta propia, con 308 HTTP real y URL
  // limpia. No puede hacerse en la página (el streaming ya envió el 200) ni en
  // next.config redirects() (re-adjunta ?category= al destino).
  const { pathname, searchParams } = request.nextUrl
  if (pathname === '/boutique') {
    const category = searchParams.get('category')
    if (category) {
      return NextResponse.redirect(
        new URL(`/boutique/categoria/${encodeURIComponent(category)}`, request.url),
        308,
      )
    }
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
