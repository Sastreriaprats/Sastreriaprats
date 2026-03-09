import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SASTRE_ROLES = ['sastre', 'sastre_plus']
const VENDEDOR_ROLES = ['vendedor_basico', 'vendedor_avanzado']
const STAFF_ROLES = [
  'administrador', 'sastre', 'sastre_plus', 'vendedor_basico', 'vendedor_avanzado',
  'super_admin', 'admin', 'accountant', 'tailor', 'salesperson', 'web_manager', 'manager',
]

/** Copia todas las cookies de supabaseResponse al redirect para que la sesión se propague al cliente */
function copySupabaseCookies(redirectResponse: NextResponse, supabaseResponse: NextResponse): NextResponse {
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, cookie)
  })
  return redirectResponse
}

/** Borra en la respuesta todas las cookies de Supabase (sb-*) para cerrar sesión */
function clearSupabaseCookies(response: NextResponse, request: NextRequest): void {
  request.cookies.getAll().forEach((cookie) => {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.delete(cookie.name)
    }
  })
}

/** Obtiene los roles del usuario actual llamando al API (usa cookies de la request) */
async function getUserRoles(request: NextRequest): Promise<string[]> {
  try {
    const url = new URL('/api/auth/me', request.nextUrl.origin)
    const res = await fetch(url.toString(), {
      headers: { cookie: request.headers.get('cookie') || '' },
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.roles) ? data.roles : []
  } catch {
    return []
  }
}

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

  const pathname = request.nextUrl.pathname

  // Server Actions: POST con header Next-Action. No redirigir, solo refrescar sesión y dejar pasar.
  const isServerAction = request.method === 'POST' && request.headers.has('Next-Action')
  if (isServerAction) {
    await supabase.auth.getUser()
    setSecurityHeaders(supabaseResponse)
    return supabaseResponse
  }

  // Corregir URL con espacio "mi cuenta" → "mi-cuenta" (evita 404 y página offline)
  if (pathname.includes('mi cuenta')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace(/mi cuenta/g, 'mi-cuenta')
    const redirectRes = NextResponse.redirect(url)
    copySupabaseCookies(redirectRes, supabaseResponse)
    setSecurityHeaders(redirectRes)
    return redirectRes
  }

  const isAdminRoute  = pathname.startsWith('/admin')
  const isVendedorRoute = pathname.startsWith('/vendedor')
  const isPosRoute    = pathname.startsWith('/pos')
  const isClientRoute = pathname.startsWith('/mi-cuenta')
  const isSastreRoute = pathname.startsWith('/sastre')
  const isAuthRoute   = pathname.startsWith('/auth')
  const isLoginPage   = pathname === '/auth/login'

  const { data: { user }, error } = await supabase.auth.getUser()

  // Rutas protegidas que requieren sesión
  const isProtectedRoute = isAdminRoute || isPosRoute || isClientRoute || isSastreRoute || isVendedorRoute

  // Si hay error de sesión, limpiar cookies y redirigir a login
  if (error && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    const redirectRes = NextResponse.redirect(url)
    copySupabaseCookies(redirectRes, supabaseResponse)
    clearSupabaseCookies(redirectRes, request)
    setSecurityHeaders(redirectRes)
    return redirectRes
  }

  // No autenticado en ruta protegida → login
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    const redirectRes = NextResponse.redirect(url)
    copySupabaseCookies(redirectRes, supabaseResponse)
    setSecurityHeaders(redirectRes)
    return redirectRes
  }

  // Ruta /mi-cuenta: staff (sastre, administrador, vendedor, etc.) no debe entrar → redirigir a su panel
  if (user && isClientRoute) {
    const roleNames = await getUserRoles(request)
    const hasSastreRole = roleNames.some((n: string) => SASTRE_ROLES.includes(n))
    const hasVendedorRole = roleNames.some((n: string) => VENDEDOR_ROLES.includes(n))
    const hasStaffRole = roleNames.some((n: string) => STAFF_ROLES.includes(n))
    if (hasSastreRole) {
      const url = request.nextUrl.clone()
      url.pathname = '/sastre'
      const redirectRes = NextResponse.redirect(url)
      copySupabaseCookies(redirectRes, supabaseResponse)
      setSecurityHeaders(redirectRes)
      return redirectRes
    }
    if (hasVendedorRole) {
      const url = request.nextUrl.clone()
      url.pathname = '/vendedor'
      const redirectRes = NextResponse.redirect(url)
      copySupabaseCookies(redirectRes, supabaseResponse)
      setSecurityHeaders(redirectRes)
      return redirectRes
    }
    if (hasStaffRole) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/dashboard'
      const redirectRes = NextResponse.redirect(url)
      copySupabaseCookies(redirectRes, supabaseResponse)
      setSecurityHeaders(redirectRes)
      return redirectRes
    }
  }

  // Autenticado en /auth/login → redirigir según rol (sastre → /sastre, vendedor → /vendedor, staff → /admin, cliente → /mi-cuenta)
  if (user && isLoginPage) {
    const roleNames = await getUserRoles(request)
    const isSastre = roleNames.some((n: string) => SASTRE_ROLES.includes(n))
    const isVendedor = roleNames.some((n: string) => VENDEDOR_ROLES.includes(n))
    const isStaff = roleNames.some((n: string) => STAFF_ROLES.includes(n))
    const url = request.nextUrl.clone()
    if (isSastre) {
      url.pathname = '/sastre'
    } else if (isVendedor) {
      url.pathname = '/vendedor'
    } else if (isStaff) {
      url.pathname = '/admin/dashboard'
    } else {
      url.pathname = '/mi-cuenta'
    }
    const redirectRes = NextResponse.redirect(url)
    copySupabaseCookies(redirectRes, supabaseResponse)
    setSecurityHeaders(redirectRes)
    return redirectRes
  }

  // Autenticado en ruta auth (otras que no son /auth/login) → dashboard
  if (user && isAuthRoute && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/dashboard'
    const redirectRes = NextResponse.redirect(url)
    copySupabaseCookies(redirectRes, supabaseResponse)
    setSecurityHeaders(redirectRes)
    return redirectRes
  }

  // Ruta /admin: si el usuario tiene solo rol sastre/sastre_plus → redirigir a /sastre; si solo vendedor → /vendedor
  // Excepciones: vendedor_avanzado puede acceder a /admin/stock/codigos-barras, /admin/stock/productos (crear/editar); todos los vendedores a /admin/calendario
  if (user && isAdminRoute) {
    const roleNames = await getUserRoles(request)
    const hasSastreRole = roleNames.some((n: string) => SASTRE_ROLES.includes(n))
    const hasVendedorRole = roleNames.some((n: string) => VENDEDOR_ROLES.includes(n))
    const isVendedorAvanzado = roleNames.includes('vendedor_avanzado')
    const isCodigosBarrasRoute = pathname.startsWith('/admin/stock/codigos-barras')
    const isProductosRoute = pathname.startsWith('/admin/stock/productos')
    const isCalendarioRoute = pathname.startsWith('/admin/calendario')
    if (hasSastreRole) {
      const url = request.nextUrl.clone()
      url.pathname = '/sastre'
      const redirectRes = NextResponse.redirect(url)
      copySupabaseCookies(redirectRes, supabaseResponse)
      setSecurityHeaders(redirectRes)
      return redirectRes
    }
    if (hasVendedorRole && !(isVendedorAvanzado && (isCodigosBarrasRoute || isProductosRoute)) && !isCalendarioRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/vendedor'
      const redirectRes = NextResponse.redirect(url)
      copySupabaseCookies(redirectRes, supabaseResponse)
      setSecurityHeaders(redirectRes)
      return redirectRes
    }
  }

  // Ruta /vendedor: usuario debe tener rol vendedor_basico o vendedor_avanzado
  if (user && isVendedorRoute) {
    const roleNames = await getUserRoles(request)
    const hasVendedorRole = roleNames.some((n: string) => VENDEDOR_ROLES.includes(n))
    if (!hasVendedorRole) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      const redirectRes = NextResponse.redirect(url)
      copySupabaseCookies(redirectRes, supabaseResponse)
      setSecurityHeaders(redirectRes)
      return redirectRes
    }
  }

  // Ruta /sastre: usuario debe tener rol sastre o sastre_plus
  if (user && isSastreRoute) {
    const roleNames = await getUserRoles(request)
    const hasSastreRole = roleNames.some((n: string) => SASTRE_ROLES.includes(n))
    if (!hasSastreRole) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      const redirectRes = NextResponse.redirect(url)
      copySupabaseCookies(redirectRes, supabaseResponse)
      setSecurityHeaders(redirectRes)
      return redirectRes
    }
  }

  setSecurityHeaders(supabaseResponse)
  return supabaseResponse
}

function setSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
}
