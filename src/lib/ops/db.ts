import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { createAdminClient } from '@/lib/supabase/admin'

// Acceso de bajo nivel al esquema aislado 'aux' (no expuesto a la API; se llega
// por la conexión directa de Drizzle/postgres-js sobre SUPABASE_DB_URL, rol owner).
// Devuelve filas crudas; el cifrado/descifrado del contenido vive en crypto.ts.

export type Scope = 'B' | 'C'

type Row = Record<string, unknown>
const rows = (r: unknown): Row[] => r as unknown as Row[]

// ---------- access ----------

export async function getScopesForUser(userId: string): Promise<Scope[]> {
  // Vía PostgREST (camino probado en prod), no por conexión directa: el menú y
  // el gating no dependen del pooler. La función fn_view_scopes lee aux.access.
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('fn_view_scopes', { p_uid: userId })
  if (error || !Array.isArray(data)) return []
  return data.map((s) => String(s) as Scope)
}

export type AccessRow = { userId: string; email: string; fullName: string; scope: Scope; createdAt: string }

export async function listAccess(): Promise<AccessRow[]> {
  const r = await db.execute(sql`
    SELECT a.user_id, lower(p.email) AS email, p.full_name, a.scope, a.created_at
    FROM aux.access a
    JOIN public.profiles p ON p.id = a.user_id
    ORDER BY p.full_name, a.scope`)
  return rows(r).map((x) => ({
    userId: String(x.user_id),
    email: String(x.email),
    fullName: String(x.full_name ?? ''),
    scope: String(x.scope) as Scope,
    createdAt: String(x.created_at),
  }))
}

export async function grantAccess(userId: string, scope: Scope, grantedBy: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO aux.access (user_id, scope, granted_by)
    VALUES (${userId}, ${scope}, ${grantedBy})
    ON CONFLICT (user_id, scope) DO NOTHING`)
}

export async function revokeAccess(userId: string, scope: Scope): Promise<void> {
  await db.execute(sql`DELETE FROM aux.access WHERE user_id = ${userId} AND scope = ${scope}`)
}

// ---------- entries (ledger cifrado) ----------

export type EntryRow = { id: string; payload: Buffer; createdAt: string; updatedAt: string }

export async function insertEntry(payload: Buffer, dedup: Buffer | null): Promise<void> {
  await db.execute(sql`
    INSERT INTO aux.entries (payload, dedup_tag)
    VALUES (${payload}, ${dedup})
    ON CONFLICT (dedup_tag) DO NOTHING`)
}

export async function listEntries(): Promise<EntryRow[]> {
  const r = await db.execute(sql`SELECT id, payload, created_at, updated_at FROM aux.entries ORDER BY created_at`)
  return rows(r).map((x) => ({
    id: String(x.id),
    payload: Buffer.from(x.payload as Uint8Array),
    createdAt: String(x.created_at),
    updatedAt: String(x.updated_at),
  }))
}

export async function updateEntry(id: string, payload: Buffer): Promise<void> {
  await db.execute(sql`UPDATE aux.entries SET payload = ${payload}, updated_at = now() WHERE id = ${id}`)
}

export async function deleteEntry(id: string): Promise<void> {
  await db.execute(sql`DELETE FROM aux.entries WHERE id = ${id}`)
}
