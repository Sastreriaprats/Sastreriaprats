'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

export type OrphanStockMovement = {
  id: string
  reference_type: string
  reference_id: string
  movement_type: string
  quantity: number
  product_name: string
  variant_desc: string | null
  created_at: string
}

// Lista los stock_movements huérfanos (reference_id NOT NULL cuya entidad ya no
// existe), de TODOS los reference_type. Read-only (el RPC solo lee). Permiso real
// stock_movements.reverse (mismo que revertir movimientos).
export const listOrphanStockMovements = protectedAction<void, OrphanStockMovement[]>(
  { permission: 'stock_movements.reverse', auditModule: 'stock' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient.rpc('rpc_list_orphan_stock_movements')
    if (error) return failure(error.message)
    return success((data ?? []) as OrphanStockMovement[])
  }
)

// Borra SOLO los huérfanos: el RPC re-evalúa el mismo NOT EXISTS dentro del DELETE,
// así que es imposible borrar un movement cuya entidad sí existe. Borrar solo quita
// el registro del log; NO recalcula stock_levels (no hay trigger). Snapshot a
// audit_logs vía el wrapper (auditOldData = lo borrado).
export const cleanOrphanStockMovements = protectedAction<void, { count: number }>(
  { permission: 'stock_movements.reverse', auditAction: 'delete', auditModule: 'stock', auditEntity: 'stock' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient.rpc('rpc_clean_orphan_stock_movements')
    if (error) return failure(error.message)
    const d = (data ?? { count: 0, deleted: [] }) as { count: number; deleted: unknown[] }
    return success({
      count: d.count,
      auditEntityDisplay: `${d.count} movimiento(s) de stock huérfano(s)`,
      auditDescription: `Limpieza de ${d.count} movimiento(s) de stock huérfano(s)`,
      auditOldData: d.deleted,
      auditMetadata: { count: d.count },
    } as { count: number })
  }
)
