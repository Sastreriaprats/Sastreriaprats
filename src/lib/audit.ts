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
 * Registra un evento en audit_log. Operación append-only.
 * Nunca lanza excepción para no interrumpir el flujo principal.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('audit_log').insert({
      user_id:     params.userId || null,
      user_name:   params.userName,
      action:      params.action,
      entity_type: params.entityType,
      entity_id:   params.entityId    || null,
      entity_label: params.entityLabel || null,
      changes:     params.changes    || null,
      metadata:    params.metadata   || null,
      store_id:    params.storeId    || null,
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
