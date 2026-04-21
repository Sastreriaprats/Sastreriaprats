/**
 * Aplicar migración 112 - Plazos de pago de pedidos a proveedores
 * npx tsx src/scripts/apply-migration-112.ts
 */
import dns from 'dns'
import * as fs from 'fs'
import * as path from 'path'
import { Client } from 'pg'

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim()
  }
}

loadEnv()

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL!
  const parsed = new URL(dbUrl)

  let host = parsed.hostname
  try {
    await dns.promises.lookup(host)
  } catch {
    console.log('DNS IPv4 no disponible, resolviendo IPv6...')
    const addrs = await dns.promises.resolve6(host)
    host = addrs[0]
    console.log(`  Resuelto a: ${host}`)
  }

  const client = new Client({
    host,
    port: parseInt(parsed.port || '5432', 10),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()

  const migration = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/112_supplier_order_payment_schedule.sql'),
    'utf-8'
  )

  console.log('Aplicando migración 112...')
  await client.query(migration)

  const check = await client.query(`
    SELECT count(*)::int AS total FROM supplier_order_payment_schedule
  `)
  console.log(`  Filas en supplier_order_payment_schedule tras backfill: ${check.rows[0].total}`)

  await client.end()
  console.log('\nMigración aplicada correctamente.')
}

main().catch(e => { console.error('Error:', e); process.exit(1) })
