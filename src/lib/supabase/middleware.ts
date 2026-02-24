import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const isAdminRoute  = request.nextUrl.pathname.startsWith('/admin')
  const isPosRoute    = request.nextUrl.pathname.startsWith('/pos')
  const isClientRoute = request.nextUrl.pathname.startsWith('/mi-cuenta')
  const isAuthRoute   = request.nextUrl.pathname.startsWith('/auth')

  await supabase.auth.refreshSession()
  const { data: { user }, error } = await supabase.auth.getUser()

  // Si hay error de sesión, limpiar cookies y redirigir a login
  if (error && (isAdminRoute || isPosRoute || isClientRoute)) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    const redirectRes = NextResponse.redirect(url)
    redirectRes.cookies.delete('sb-access-token')
    redirectRes.cookies.delete('sb-refresh-token')
    setSecurityHeaders(redirectRes)
    return redirectRes
  }

  // No autenticado en ruta protegida → login
  if (!user && (isAdminRoute || isPosRoute || isClientRoute)) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    const redirectRes = NextResponse.redirect(url)
    setSecurityHeaders(redirectRes)
    return redirectRes
  }

  // Autenticado en ruta auth (excepto /auth/login) → dashboard
  // No redirigir desde /auth/login para que el icono "Iniciar sesión" lleve siempre a la página de login
  if (user && isAuthRoute && request.nextUrl.pathname !== '/auth/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/dashboard'
    const redirectRes = NextResponse.redirect(url)
    setSecurityHeaders(redirectRes)
    return redirectRes
  }

  // La verificación de roles se hace en el layout del admin (Node.js runtime),
  // no aquí en el middleware (Edge runtime), para evitar problemas con service_role key.

  setSecurityHeaders(supabaseResponse)
  return supabaseResponse
}

function setSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
}
