import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/errors'
import { failure } from '@/lib/errors'
import { checkUserPermission, checkUserAnyPermission } from '@/actions/auth'
import { serializeForServerAction } from '@/lib/server/serialize'

/** Traducción de acción de auditoría a español (columna "Acción" / fallback). */
const ACTION_ES: Record<string, string> = {
  create: 'Crear', update: 'Editar', delete: 'Eliminar', payment: 'Pago',
  state_change: 'Cambio estado', refund: 'Devolución', export: 'Exportar', import: 'Importar',
}

/** Traducción de entidad de auditoría a español (prefijo de descripción y fallback). */
const ENTITY_ES: Record<string, string> = {
  sale: 'Venta', sales: 'Venta', tailoring_order: 'Pedido', order: 'Pedido', orders: 'Pedido',
  tailoring_order_line: 'Línea de pedido', client: 'Cliente', client_note: 'Nota de cliente',
  client_measurements: 'Medidas', invoice: 'Factura', estimate: 'Presupuesto',
  journal_entry: 'Asiento', stock: 'Stock', product: 'Producto', product_variant: 'Variante',
  product_category: 'Categoría', appointment: 'Cita', cash_withdrawal: 'Arqueo',
  cash_session: 'Sesión de caja', return: 'Devolución', fitting: 'Prueba', alteration: 'Arreglo',
  fabric: 'Tejido', voucher: 'Vale', schedule_block: 'Bloqueo de agenda',
  discount_code: 'Código de descuento', blog_post: 'Entrada de blog',
  email_template: 'Plantilla de email', email_campaign: 'Campaña de email',
  delivery_note: 'Albarán', supplier_delivery_note: 'Albarán de proveedor',
  product_reservation: 'Reserva', product_reservation_line: 'Línea de reserva',
  supplier: 'Proveedor', supplier_order: 'Pedido a proveedor',
  supplier_invoice: 'Factura de proveedor', supplier_invoice_payment: 'Pago de factura de proveedor',
  supplier_order_payment_schedule: 'Plazo de pedido a proveedor',
  ap_supplier_invoice_due_date: 'Vencimiento de factura', migration: 'Migración',
}

export interface ActionContext {
  userId: string
  userEmail: string
  userName: string
  adminClient: ReturnType<typeof createAdminClient>
}

export type AdminClient = ActionContext['adminClient']

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
        // Identificadores de negocio reconocidos automáticamente para la descripción.
        // El orden no importa (normalmente solo uno existe); todos deben ser identificadores
        // legibles de la entidad, no campos de cantidad.
        const fallbackDisplay = data?.name ?? data?.full_name ?? data?.order_number ?? data?.ticket_number
          ?? data?.invoice_number ?? data?.estimate_number ?? data?.entry_number
          ?? data?.reservation_number ?? data?.fitting_number ?? data?.alteration_number
          ?? data?.variant_sku ?? data?.supplier_reference
        const entityLabel = ENTITY_ES[options.auditEntity || options.auditModule || ''] ?? options.auditEntity
        const entityDisplay = typeof auditEntityDisplay === 'string'
          ? auditEntityDisplay
          : typeof fallbackDisplay === 'string'
            ? `${entityLabel}: ${fallbackDisplay}`
            : undefined
        const description = typeof auditDescription === 'string'
          ? auditDescription
          : entityDisplay ?? (() => {
              const e = options.auditEntity || options.auditModule || ''
              return `${ACTION_ES[options.auditAction] ?? options.auditAction} ${ENTITY_ES[e] ?? e}`
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
          // Si tras quitar los campos de auditoría no queda nada, devolvemos
          // undefined para preservar el contrato de los handlers que antes
          // hacían success(undefined) (ahora solo aportan auditDescription).
          result.data = (Object.keys(rest).length > 0 ? rest : undefined) as TOutput
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
