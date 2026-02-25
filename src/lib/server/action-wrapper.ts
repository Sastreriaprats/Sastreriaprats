import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/errors'
import { failure } from '@/lib/errors'
import { checkUserPermission, checkUserAnyPermission } from '@/actions/auth'
import { serializeForServerAction } from '@/lib/server/serialize'

export interface ActionContext {
  userId: string
  userEmail: string
  userName: string
  adminClient: ReturnType<typeof createAdminClient>
}

interface ActionOptions {
  /** Un permiso o lista de permisos (cualquiera de ellos basta). */
  permission?: string | string[]
  auditModule?: string
  auditAction?: 'create' | 'read' | 'update' | 'delete' | 'export' | 'import' | 'state_change' | 'payment' | 'refund'
  auditEntity?: string
  revalidate?: string[]
  public?: boolean
}

export function protectedAction<TInput, TOutput>(
  options: ActionOptions,
  handler: (ctx: ActionContext, input: TInput) => Promise<ActionResult<TOutput>>
) {
  return async (input: TInput): Promise<ActionResult<TOutput>> => {
    try {
      const supabase = await createServerSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user && !options.public) {
        return failure('No autenticado', 'UNAUTHORIZED')
      }

      const adminClient = createAdminClient()

      if (options.permission && user) {
        const codes = Array.isArray(options.permission) ? options.permission : [options.permission]
        const hasPerm = codes.length === 1
          ? await checkUserPermission(user.id, codes[0])
          : await checkUserAnyPermission(user.id, codes)
        if (!hasPerm) {
          return failure('Sin permisos para esta acción', 'FORBIDDEN')
        }
      }

      let userEmail = user?.email || 'system'
      let userName = 'System'
      if (user) {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('email, full_name')
          .eq('id', user.id)
          .single()
        if (profile) {
          userEmail = profile.email
          userName = profile.full_name
        }
      }

      const ctx: ActionContext = {
        userId: user?.id || 'system',
        userEmail,
        userName,
        adminClient,
      }

      const result = await handler(ctx, input)

      if (result.success && options.auditAction && options.auditAction !== 'read' && user) {
        const entityId = (result.data as any)?.id || undefined
        const entityDisplay = (result.data as any)?.name || (result.data as any)?.full_name || (result.data as any)?.order_number || undefined

        try {
          await adminClient.rpc('log_audit', {
            p_user_id: user.id,
            p_action: options.auditAction,
            p_module: options.auditModule || 'unknown',
            p_entity_type: options.auditEntity || undefined,
            p_entity_id: entityId,
            p_entity_display: entityDisplay ? `${options.auditEntity}: ${entityDisplay}` : undefined,
            p_description: `${options.auditAction} ${options.auditEntity || options.auditModule}`,
            p_new_data: options.auditAction === 'create' ? input : undefined,
          })
        } catch (auditError) {
          console.error('[Audit Error]', auditError)
        }
      }

      if (result.success && options.revalidate) {
        options.revalidate.forEach(path => revalidatePath(path))
      }

      if (result.success && result.data !== undefined) {
        try {
          return { ...result, data: serializeForServerAction(result.data) as TOutput }
        } catch (serializeErr) {
          console.error('[Action serialize]', serializeErr)
          return failure('Error al serializar la respuesta', 'INTERNAL')
        }
      }
      return result
    } catch (error: any) {
      console.error(`[Action Error] ${options.auditModule}.${options.auditAction}:`, error)
      return failure(error.message || 'Error interno del servidor', 'INTERNAL')
    }
  }
}
