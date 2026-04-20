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

      let adminClient: ReturnType<typeof createAdminClient>
      try {
        adminClient = createAdminClient()
      } catch (adminErr: unknown) {
        const msg = adminErr instanceof Error ? adminErr.message : 'Error al conectar con la base de datos'
        console.error('[Action] createAdminClient:', adminErr)
        return failure(msg, 'INTERNAL')
      }

      if (options.permission && user) {
        try {
          const codes = Array.isArray(options.permission) ? options.permission : [options.permission]
          const hasPerm = codes.length === 1
            ? await checkUserPermission(user.id, codes[0])
            : await checkUserAnyPermission(user.id, codes)
          if (!hasPerm) {
            return failure('Sin permisos para esta acción', 'FORBIDDEN')
          }
        } catch (permErr) {
          console.error('[Action] permission check:', permErr)
          return failure('Error al verificar permisos', 'INTERNAL')
        }
      }

      let userEmail = user?.email || 'system'
      let userName = 'System'
      if (user) {
        try {
          const { data: profile } = await adminClient
            .from('profiles')
            .select('email, full_name')
            .eq('id', user.id)
            .single()
          if (profile) {
            userEmail = profile.email
            userName = profile.full_name
          }
        } catch {
          // Ignorar error de perfil; usar valores por defecto
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
        const data = result.data as Record<string, unknown> | undefined
        const entityId = data?.id != null ? (data.id as string) : (typeof data?.auditEntityId === 'string' ? data.auditEntityId as string : undefined)
        // Descripción legible: la acción puede devolver auditDescription y audit_entity_display (no se envían al cliente)
        const auditDescription = data?.auditDescription ?? data?.audit_description
        const auditEntityDisplay = data?.auditEntityDisplay ?? data?.audit_entity_display
        const fallbackDisplay = data?.name ?? data?.full_name ?? data?.order_number ?? data?.ticket_number
        const entityDisplay = typeof auditEntityDisplay === 'string'
          ? auditEntityDisplay
          : typeof fallbackDisplay === 'string'
            ? `${options.auditEntity}: ${fallbackDisplay}`
            : undefined
        const description = typeof auditDescription === 'string'
          ? auditDescription
          : entityDisplay ?? (() => {
              const actionEs: Record<string, string> = { create: 'Crear', update: 'Editar', delete: 'Eliminar', payment: 'Pago', state_change: 'Cambio estado', refund: 'Devolución', export: 'Exportar', import: 'Importar' }
              const entityEs: Record<string, string> = { sale: 'Venta', tailoring_order: 'Pedido', order: 'Pedido', orders: 'Pedidos', client: 'Cliente', invoice: 'Factura', stock: 'Stock', client_measurements: 'Medidas', product_variant: 'Variante', product: 'Producto', appointment: 'Cita', cash_withdrawal: 'Arqueo', return: 'Devolución' }
              const e = options.auditEntity || options.auditModule || ''
              return `${actionEs[options.auditAction] ?? options.auditAction} ${entityEs[e] ?? e}`
            })()

        // Datos antes/después provistos explícitamente por el handler para registrar diff detallado
        const auditOldData = data?.auditOldData ?? data?.audit_old_data
        const auditNewData = data?.auditNewData ?? data?.audit_new_data
        const auditMetadata = data?.auditMetadata ?? data?.audit_metadata

        const pOldData = auditOldData !== undefined ? auditOldData : undefined
        const pNewData = auditNewData !== undefined
          ? auditNewData
          : options.auditAction === 'create'
            ? input
            : undefined

        try {
          await adminClient.rpc('log_audit', {
            p_user_id: user.id,
            p_action: options.auditAction,
            p_module: options.auditModule || 'unknown',
            p_entity_type: options.auditEntity || undefined,
            p_entity_id: entityId,
            p_entity_display: entityDisplay ?? undefined,
            p_description: description,
            p_old_data: pOldData,
            p_new_data: pNewData,
            p_metadata: auditMetadata,
          })
        } catch (auditError) {
          console.error('[Audit Error]', auditError)
        }

        // Quitar campos de auditoría para no enviarlos al cliente
        if (data && (
          data.auditDescription !== undefined || data.audit_description !== undefined ||
          data.auditEntityDisplay !== undefined || data.audit_entity_display !== undefined ||
          data.auditEntityId !== undefined ||
          data.auditOldData !== undefined || data.audit_old_data !== undefined ||
          data.auditNewData !== undefined || data.audit_new_data !== undefined ||
          data.auditMetadata !== undefined || data.audit_metadata !== undefined
        )) {
          const {
            auditDescription: _1, auditEntityDisplay: _2, audit_description: _3, audit_entity_display: _4,
            auditEntityId: _5,
            auditOldData: _6, audit_old_data: _7,
            auditNewData: _8, audit_new_data: _9,
            auditMetadata: _10, audit_metadata: _11,
            ...rest
          } = data
          result.data = rest as TOutput
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Error interno del servidor'
      console.error(`[Action Error] ${options.auditModule ?? 'action'}:`, error)
      return failure(message, 'INTERNAL')
    }
  }
}
