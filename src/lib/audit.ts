import { createAdminClient } from '@/lib/supabase/admin'

export interface AuditParams {
  userId: string
  userName: string
  action: 'create' | 'update' | 'delete' | 'login' | 'logout'
  entityType: string
  entityId?: string
  entityLabel?: string
  changes?: Record<string, { old: unknown; new: unknown }>
  metadata?: Record<string, unknown>
  storeId?: string
}

/**
 * Registra un evento en audit_logs. Operación append-only.
 * Nunca lanza excepción para no interrumpir el flujo principal.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const admin = createAdminClient()

    // Mapeo al esquema de audit_logs (plural): el diff "changes" se separa en old_data/new_data.
    const oldData: Record<string, unknown> = {}
    const newData: Record<string, unknown> = {}
    for (const [key, change] of Object.entries(params.changes ?? {})) {
      oldData[key] = change.old
      newData[key] = change.new
    }

    // audit_logs guarda user_email y user_full_name; los resolvemos del profile.
    let userEmail: string | null = null
    let userFullName: string | null = params.userName ?? null
    if (params.userId) {
      const { data: profile } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('id', params.userId)
        .maybeSingle()
      if (profile) {
        userEmail = (profile.email as string | null) ?? null
        userFullName = (profile.full_name as string | null) ?? userFullName
      }
    }

    await admin.from('audit_logs').insert({
      user_id:        params.userId || null,
      user_email:     userEmail,
      user_full_name: userFullName,
      action:         params.action,
      module:         params.entityType,
      entity_type:    params.entityType,
      entity_id:      params.entityId ?? null,
      entity_display: params.entityLabel ?? null,
      old_data:       Object.keys(oldData).length ? oldData : null,
      new_data:       Object.keys(newData).length ? newData : null,
      metadata:       params.metadata ?? null,
      store_id:       params.storeId ?? null,
    })
  } catch (err) {
    console.error('[audit] Error registrando evento:', err)
  }
}

/** Helper: extrae campos cambiados comparando old vs new objects. */
export function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  skipFields: string[] = ['updated_at', 'created_at', 'id']
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {}
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  for (const key of keys) {
    if (skipFields.includes(key)) continue
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      changes[key] = { old: oldObj[key], new: newObj[key] }
    }
  }
  return changes
}

/**
 * Construye los campos `auditOldData` y `auditNewData` solo con los campos que cambiaron
 * entre antes y después. Devuelve `null` si no hay cambios. Los valores resultantes
 * se pasan al wrapper `protectedAction` para registrar un diff legible en audit_logs.
 *
 * @param before Objeto con el estado anterior (ej. fila leída antes del update).
 * @param after  Objeto con el estado nuevo (ej. fila devuelta tras el update).
 * @param skip   Campos a ignorar (por defecto timestamps, id y metadatos irrelevantes).
 */
export function buildAuditDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  skip: string[] = ['id', 'created_at', 'updated_at', 'last_movement_at']
): { auditOldData: Record<string, unknown>; auditNewData: Record<string, unknown> } | null {
  const oldObj = (before ?? {}) as Record<string, unknown>
  const newObj = (after ?? {}) as Record<string, unknown>
  const oldData: Record<string, unknown> = {}
  const newData: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)])
  for (const key of keys) {
    if (skip.includes(key)) continue
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      oldData[key] = oldObj[key] ?? null
      newData[key] = newObj[key] ?? null
    }
  }
  if (Object.keys(newData).length === 0) return null
  return { auditOldData: oldData, auditNewData: newData }
}
