'use server'

import { protectedAction, type AdminClient } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

export type ClientErrorRow = {
  id: string
  created_at: string
  user_id: string | null
  source: string
  error_message: string | null
  user_agent: string | null
  context: Record<string, unknown>
}

async function userIsFullAdmin(ctx: { adminClient: AdminClient; userId: string }): Promise<boolean> {
  const { data: roleRows } = await ctx.adminClient
    .from('user_roles').select('roles!inner(name)').eq('user_id', ctx.userId)
  return (roleRows ?? []).some((ur: { roles?: { name?: string } | { name?: string }[] }) => {
    const r = ur.roles
    const name = Array.isArray(r) ? r[0]?.name : r?.name
    return name === 'administrador' || name === 'super_admin'
  })
}

/**
 * Registra un error de cliente (telemetría). Cualquier usuario autenticado puede
 * escribir su propio log (sin permiso concreto). NUNCA debe romper el flujo que
 * la llama: los call-sites la invocan con .catch(() => {}).
 */
export const logClientError = protectedAction<
  { source: string; error_message?: string | null; user_agent?: string | null; context?: Record<string, unknown> },
  { ok: true }
>(
  { auditModule: 'system' },
  async (ctx, input) => {
    await ctx.adminClient.from('client_error_log').insert({
      user_id: ctx.userId !== 'system' ? ctx.userId : null,
      source: (input.source || 'unknown').slice(0, 80),
      error_message: input.error_message ? String(input.error_message).slice(0, 2000) : null,
      user_agent: input.user_agent ? String(input.user_agent).slice(0, 500) : null,
      context: input.context ?? {},
    })
    return success({ ok: true })
  }
)

/** Lee los últimos errores de cliente. Solo administradores. */
export const getClientErrors = protectedAction<
  { source?: string; limit?: number },
  ClientErrorRow[]
>(
  { auditModule: 'system' },
  async (ctx, { source, limit = 100 }) => {
    if (!(await userIsFullAdmin(ctx))) return failure('Solo administradores', 'FORBIDDEN')
    let q = ctx.adminClient
      .from('client_error_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 500))
    if (source?.trim()) q = q.eq('source', source.trim())
    const { data, error } = await q
    if (error) return failure(error.message)
    return success((data ?? []) as ClientErrorRow[])
  }
)
