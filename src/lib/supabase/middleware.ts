import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getRolesFromCookie, clearRolesCookie } from '@/lib/auth/role-cookie'

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

/** Obtiene roles: primero de cookie (fast path), luego fallback a Supabase REST */
async function resolveUserRoles(request: NextRequest, userId: string): Promise<string[]> {
  const cached = getRolesFromCookie(request)
  if (cached) return cached

  // Fallback: query directa a Supabase REST API (no pasa por /api/auth/me)
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}&select=roles(name)`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          'Content-Type': 'application/json',
        },
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const roles: string[] = []
    for (const ur of data ?? []) {
      const r = ur.roles
      if (!r) continue
      if (Array.isArray(r)) roles.push(...r.map((x: { name: string }) => x.name))
      else roles.push((r as { name: string }).name)
    }
    return roles
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

  // Corregir URL con espacio "mi cuenta" → "mi-cuenta"
  if (pathname.includes('mi cuenta')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace(/mi cuenta/g, 'mi-cuenta')
    const redirectRes = NextResponse.redirect(url)
    copySupabaseCookies(redirectRes, supabaseResponse)
    setSecurityHeaders(redirectRes)
    return redirectRes
  }

  const isAdminRoute    = pathname.startsWith('/admin')
  const isVendedorRoute = pathname.startsWith('/vendedor')
  const isPosRoute      = pathname.startsWith('/pos')
  const isClientRoute   = pathname.startsWith('/mi-cuenta')
  const isSastreRoute   = pathname.startsWith('/sastre')
  const isAuthRoute     = pathname.startsWith('/auth')
  const isLoginPage     = pathname === '/auth/login'

  const { data: { user }, error } = await supabase.auth.getUser()

  const isProtectedRoute = isAdminRoute || isPosRoute || isClientRoute || isSastreRoute || isVendedorRoute

  // Si hay error de sesión, limpiar cookies y redirigir a login
  if (error && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    const redirectRes = NextResponse.redirect(url)
    copySupabaseCookies(redirectRes, supabaseResponse)
    clearSupabaseCookies(redirectRes, request)
    clearRolesCookie(redirectRes)
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

  // Obtener roles UNA SOLA VEZ para todas las comprobaciones de esta request
  // (cookie hit → 0 queries; cache miss → 1 fetch REST directo a Supabase)
  const userRoles = user
    ? await resolveUserRoles(request, user.id)
    : []

  const hasSastreRole   = userRoles.some(n => SASTRE_ROLES.includes(n))
  const hasVendedorRole = userRoles.some(n => VENDEDOR_ROLES.includes(n))
  const hasStaffRole    = userRoles.some(n => STAFF_ROLES.includes(n))

  // Ruta /mi-cuenta: staff no debe entrar → redirigir a su panel
  if (user && isClientRoute) {
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

  // Autenticado en /auth/login → redirigir según rol
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    if (hasSastreRole) {
      url.pathname = '/sastre'
    } else if (hasVendedorRole) {
      url.pathname = '/vendedor'
    } else if (hasStaffRole) {
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

  // Ruta /admin: sastre → /sastre, vendedor → /vendedor
  // Excepciones: vendedor_avanzado puede acceder a codigos-barras, productos; todos los vendedores a /admin/calendario
  if (user && isAdminRoute) {
    const isVendedorAvanzado = userRoles.includes('vendedor_avanzado')
    const isCodigosBarrasRoute = pathname.startsWith('/admin/stock/codigos-barras')
    const isProductosRoute     = pathname.startsWith('/admin/stock/productos')
    const isCalendarioRoute    = pathname.startsWith('/admin/calendario')
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

  // Ruta /vendedor: usuario debe tener rol vendedor
  if (user && isVendedorRoute) {
    if (!hasVendedorRole) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      const redirectRes = NextResponse.redirect(url)
      copySupabaseCookies(redirectRes, supabaseResponse)
      setSecurityHeaders(redirectRes)
      return redirectRes
    }
  }

  // Ruta /sastre: usuario debe tener rol sastre
  if (user && isSastreRoute) {
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
