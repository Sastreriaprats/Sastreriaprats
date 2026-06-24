import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// Acceso al esquema aislado 'aux' SOLO vía funciones internas (PostgREST), porque
// el serverless de Vercel no abre conexión directa. El contenido del ledger sigue
// cifrado; viaja en base64. Las funciones son SECURITY DEFINER y solo service_role.

export type Scope = 'B' | 'C'

// ---------- access ----------

export async function getScopesForUser(userId: string): Promise<Scope[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('fn_view_scopes', { p_uid: userId })
  if (error || !Array.isArray(data)) return []
  return data.map((s) => String(s) as Scope)
}

export type AccessRow = { userId: string; email: string; fullName: string; scope: Scope; createdAt: string }

export async function listAccess(): Promise<AccessRow[]> {
  const admin = createAdminClient()
  const { data } = await admin.rpc('fn_ops_access_list')
  return ((data ?? []) as Record<string, unknown>[]).map((x) => ({
    userId: String(x.user_id),
    email: String(x.email ?? ''),
    fullName: String(x.full_name ?? ''),
    scope: String(x.scope) as Scope,
    createdAt: String(x.created_at),
  }))
}

export async function grantAccess(userId: string, scope: Scope, grantedBy: string): Promise<void> {
  const admin = createAdminClient()
  await admin.rpc('fn_ops_access_grant', { p_uid: userId, p_scope: scope, p_by: grantedBy })
}

export async function revokeAccess(userId: string, scope: Scope): Promise<void> {
  const admin = createAdminClient()
  await admin.rpc('fn_ops_access_revoke', { p_uid: userId, p_scope: scope })
}

// ---------- entries (ledger cifrado) ----------

export type EntryRow = { id: string; payload: Buffer; createdAt: string }

export async function listEntries(): Promise<EntryRow[]> {
  const admin = createAdminClient()
  const { data } = await admin.rpc('fn_ops_entries_list')
  return ((data ?? []) as Record<string, unknown>[]).map((x) => ({
    id: String(x.id),
    payload: Buffer.from(String(x.payload_b64), 'base64'),
    createdAt: String(x.created_at),
  }))
}

export async function insertEntry(payload: Buffer): Promise<void> {
  const admin = createAdminClient()
  await admin.rpc('fn_ops_entry_insert', { p_payload_b64: payload.toString('base64') })
}

export async function deleteEntry(id: string): Promise<void> {
  const admin = createAdminClient()
  await admin.rpc('fn_ops_entry_delete', { p_id: id })
}
