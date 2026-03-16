/**
 * Route Health Check
 * Verifica que todas las rutas de la app respondan correctamente.
 *
 * Uso: npx tsx src/tests/route-health-check.ts
 *
 * Rutas públicas: esperan 200
 * Rutas protegidas (auth): esperan 302 redirect a /auth/login (la ruta existe pero requiere login)
 * Cualquier 404 o 500 en ruta protegida = bug real
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const BASE_URL = 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ─── Colores ────────────────────────────────────────────────────────────────
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const red    = (s: string) => `\x1b[31m${s}\x1b[0m`
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`

// ─── Fetch a Supabase REST ───────────────────────────────────────────────────
async function supabaseQuery(table: string, select: string, filter?: string): Promise<string | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  try {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1${filter ? `&${filter}` : ''}`
    const res = await fetch(url, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    const row = data[0]
    return String(row[select.split(',')[0].trim()] ?? '')
  } catch {
    return null
  }
}

// ─── Fetch de IDs reales ─────────────────────────────────────────────────────
async function fetchDynamicIds(): Promise<Record<string, string>> {
  console.log(dim('  Buscando IDs reales en la base de datos...'))

  const [
    orderId,
    clientId,
    supplierId,
    productSlug,
    blogSlug,
  ] = await Promise.all([
    supabaseQuery('tailoring_orders', 'id'),
    supabaseQuery('clients', 'id'),
    supabaseQuery('suppliers', 'id'),
    supabaseQuery('products', 'slug', 'is_active=eq.true'),
    supabaseQuery('cms_pages', 'slug', 'status=eq.published'),
  ])

  const ids: Record<string, string> = {}

  if (orderId)     ids['ORDER_ID']    = orderId
  if (clientId)    ids['CLIENT_ID']   = clientId
  if (supplierId)  ids['SUPPLIER_ID'] = supplierId
  if (productSlug) ids['PRODUCT_SLUG'] = productSlug
  if (blogSlug)    ids['BLOG_SLUG']   = blogSlug

  const found = Object.entries(ids)
    .map(([k, v]) => `${k}=${dim(v.slice(0, 8) + '…')}`)
    .join(', ')
  console.log(dim(`  ${found || 'ninguno encontrado'}`))
  console.log()

  return ids
}

// ─── Definición de rutas ─────────────────────────────────────────────────────
interface RouteCheck {
  path: string
  type: 'public' | 'auth'
  /** Qué status code(s) se considera OK */
  expect: number[]
  label?: string
}

function buildRoutes(ids: Record<string, string>): RouteCheck[] {
  const orderId    = ids['ORDER_ID']    ?? 'ID-NOT-FOUND'
  const clientId   = ids['CLIENT_ID']   ?? 'ID-NOT-FOUND'
  const supplierId = ids['SUPPLIER_ID'] ?? 'ID-NOT-FOUND'
  const productSlug = ids['PRODUCT_SLUG'] ?? 'slug-not-found'
  const blogSlug   = ids['BLOG_SLUG']   ?? 'slug-not-found'

  return [
    // ── Públicas ───────────────────────────────────────────────────────────
    { path: '/',                       type: 'public', expect: [200, 301, 302] },
    { path: '/boutique',               type: 'public', expect: [200] },
    { path: `/boutique/${productSlug}`, type: 'public', expect: [200], label: `/boutique/[slug]` },
    { path: '/blog',                   type: 'public', expect: [200] },
    { path: `/blog/${blogSlug}`,       type: 'public', expect: [200], label: `/blog/[slug]` },
    { path: '/sastreria',              type: 'public', expect: [200, 301, 302, 307] },
    { path: '/sobre-nosotros',         type: 'public', expect: [200] },
    { path: '/contacto',               type: 'public', expect: [200] },
    { path: '/tiendas',                type: 'public', expect: [200] },
    { path: '/aviso-legal',            type: 'public', expect: [200] },
    { path: '/privacidad',             type: 'public', expect: [200] },
    { path: '/cookies',                type: 'public', expect: [200] },

    // ── Sastre (protegidas: esperan 302 → /auth/login) ────────────────────
    { path: '/sastre',                              type: 'auth', expect: [200, 302, 307] },
    { path: '/sastre/pedidos',                      type: 'auth', expect: [200, 302, 307] },
    { path: `/sastre/pedidos/${orderId}`,           type: 'auth', expect: [200, 302, 307], label: '/sastre/pedidos/[id]' },
    { path: '/sastre/clientes',                     type: 'auth', expect: [200, 302, 307] },
    { path: `/sastre/clientes/${clientId}`,         type: 'auth', expect: [200, 302, 307], label: '/sastre/clientes/[id]' },
    { path: '/sastre/stock',                        type: 'auth', expect: [200, 302, 307] },
    { path: '/sastre/cobros',                       type: 'auth', expect: [200, 302, 307] },
    { path: '/sastre/calendario',                   type: 'auth', expect: [200, 302, 307] },

    // ── Admin (protegidas: esperan 302/307 → /auth/login) ────────────────
    { path: '/admin/dashboard',                          type: 'auth', expect: [200, 302, 307] },
    { path: '/admin/clientes',                           type: 'auth', expect: [200, 302, 307] },
    { path: `/admin/clientes/${clientId}`,               type: 'auth', expect: [200, 302, 307], label: '/admin/clientes/[id]' },
    { path: '/admin/pedidos',                            type: 'auth', expect: [200, 302, 307] },
    { path: `/admin/pedidos/${orderId}`,                 type: 'auth', expect: [200, 302, 307], label: '/admin/pedidos/[id]' },
    { path: '/admin/stock',                              type: 'auth', expect: [200, 302, 307] },
    { path: '/admin/proveedores',                        type: 'auth', expect: [200, 302, 307] },
    { path: `/admin/proveedores/${supplierId}`,          type: 'auth', expect: [200, 302, 307], label: '/admin/proveedores/[id]' },
    { path: '/admin/cobros',                             type: 'auth', expect: [200, 302, 307] },
    { path: '/admin/tickets',                            type: 'auth', expect: [200, 302, 307] },
    { path: '/admin/reporting',                          type: 'auth', expect: [200, 302, 307] },
    { path: '/admin/configuracion',                      type: 'auth', expect: [200, 302, 307] },
    { path: '/admin/calendario',                         type: 'auth', expect: [200, 302, 307] },
    { path: '/admin/contabilidad',                       type: 'auth', expect: [200, 302, 307] },
    { path: '/admin/emails',                             type: 'auth', expect: [200, 302, 307] },
    { path: '/admin/auditoria',                          type: 'auth', expect: [200, 302, 307] },
    { path: '/admin/tienda-online',                      type: 'auth', expect: [200, 302, 307] },
  ]
}

// ─── Check de una ruta ───────────────────────────────────────────────────────
interface CheckResult {
  path: string
  label?: string
  status: number | 'ERROR'
  redirectTo?: string
  ok: boolean
  type: 'public' | 'auth'
}

async function checkRoute(route: RouteCheck): Promise<CheckResult> {
  const url = `${BASE_URL}${route.path}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',          // No seguir redirects automáticamente
      headers: {
        'User-Agent': 'RouteHealthCheck/1.0',
      },
    })

    const status = res.status
    const redirectTo = res.headers.get('location') ?? undefined
    const ok = route.expect.includes(status)

    return { path: route.path, label: route.label, status, redirectTo, ok, type: route.type }
  } catch (err) {
    return { path: route.path, label: route.label, status: 'ERROR', ok: false, type: route.type }
  }
}

// ─── Formato de resultado ────────────────────────────────────────────────────
function formatResult(r: CheckResult): string {
  const displayPath = r.label ?? r.path
  const pathPadded = displayPath.padEnd(42)

  if (r.status === 'ERROR') {
    return `  ${red('❌ ERROR')}  ${pathPadded}  ${red('No se pudo conectar')}`
  }

  if (r.ok) {
    if (r.status === 200) {
      return `  ${green('✅  200')}  ${pathPadded}`
    }
    if (r.status === 301 || r.status === 302 || r.status === 307) {
      const dest = r.redirectTo ?? ''
      const toLogin = dest.includes('/auth/login')
      if (r.type === 'auth' && toLogin) {
        return `  ${green(`✅  ${r.status}`)}  ${pathPadded}  ${dim('→ /auth/login (protegida OK)')}`
      }
      return `  ${yellow(`⚠️   ${r.status}`)}  ${pathPadded}  ${dim(`→ ${dest}`)}`
    }
    return `  ${green(`✅  ${r.status}`)}  ${pathPadded}`
  }

  // No OK
  if (r.status === 404) {
    return `  ${red('❌  404')}  ${pathPadded}  ${red('RUTA NO ENCONTRADA')}`
  }
  if (r.status === 500) {
    return `  ${red('❌  500')}  ${pathPadded}  ${red('ERROR INTERNO')}`
  }
  if (r.status === 302 && r.type === 'public') {
    return `  ${yellow('⚠️   302')}  ${pathPadded}  ${dim(`→ ${r.redirectTo ?? ''}`)}`
  }
  return `  ${red(`❌  ${r.status}`)}  ${pathPadded}`
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log()
  console.log(bold('━━━ Route Health Check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log(dim(`  Base URL: ${BASE_URL}`))
  console.log(dim(`  Supabase: ${SUPABASE_URL ? '✓ configurado' : '✗ no configurado'}`))
  console.log()

  // 1. Buscar IDs reales
  const ids = await fetchDynamicIds()

  // 2. Construir rutas
  const routes = buildRoutes(ids)

  // 3. Ejecutar checks (en paralelo por grupos de 10 para no saturar)
  const results: CheckResult[] = []
  const chunkSize = 10
  for (let i = 0; i < routes.length; i += chunkSize) {
    const chunk = routes.slice(i, i + chunkSize)
    const chunkResults = await Promise.all(chunk.map(checkRoute))
    results.push(...chunkResults)
  }

  // 4. Imprimir resultados agrupados
  const publicResults = results.filter(r => r.type === 'public')
  const sastreResults = results.filter(r => r.type === 'auth' && (r.label ?? r.path).startsWith('/sastre'))
  const adminResults  = results.filter(r => r.type === 'auth' && (r.label ?? r.path).startsWith('/admin'))

  console.log(bold('  RUTAS PÚBLICAS'))
  publicResults.forEach(r => console.log(formatResult(r)))
  console.log()

  console.log(bold('  RUTAS SASTRE  ') + dim('(sin auth → se espera 302 a /auth/login)'))
  sastreResults.forEach(r => console.log(formatResult(r)))
  console.log()

  console.log(bold('  RUTAS ADMIN  ') + dim('(sin auth → se espera 302 a /auth/login)'))
  adminResults.forEach(r => console.log(formatResult(r)))
  console.log()

  // 5. Resumen
  const total   = results.length
  const passing = results.filter(r => r.ok).length
  const failing = results.filter(r => !r.ok)

  console.log(bold('━━━ Resumen ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'))
  console.log(`  Total:   ${total}`)
  console.log(`  ${green('Pasando')}: ${passing}`)
  console.log(`  ${failing.length > 0 ? red('Fallando') : green('Fallando')}: ${failing.length}`)

  if (failing.length > 0) {
    console.log()
    console.log(red('  Rutas con problemas:'))
    failing.forEach(r => {
      console.log(`    ${red('•')} ${r.label ?? r.path}  →  ${r.status}`)
    })
  }

  console.log()

  process.exit(failing.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(red('Error fatal:'), err)
  process.exit(1)
})
