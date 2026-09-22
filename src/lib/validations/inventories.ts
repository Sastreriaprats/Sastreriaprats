import { z } from 'zod'

/**
 * Inventarios de tienda (recuento físico). Petición de Mónica, 22-sep-2026:
 * poder contar el género de una tienda y ver «qué había y qué hemos contado»
 * para entender por qué falla el stock.
 */

export const inventoryScopeSchema = z.enum(['full', 'category', 'season', 'brand'])
export const inventoryStatusSchema = z.enum(['in_progress', 'completed', 'cancelled'])

export const createInventorySchema = z.object({
  warehouse_id: z.string().uuid('Almacén obligatorio'),
  scope: inventoryScopeSchema.default('full'),
  category_id: z.string().uuid().optional().nullable(),
  season: z.string().max(100).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
})

export const listInventoriesSchema = z.object({
  status: inventoryStatusSchema.or(z.literal('all')).default('all'),
  warehouse_id: z.string().uuid().optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(20),
})

/** Un escaneo de pistola: el código tal cual llega (EAN, SKU de variante o SKU). */
export const scanInventorySchema = z.object({
  inventory_id: z.string().uuid(),
  code: z.string().min(1, 'Código vacío').max(64),
  /** Normalmente 1; se admite otra cantidad para teclear cajas enteras. */
  quantity: z.number().int().min(1).max(9999).default(1),
})

export const setInventoryCountSchema = z.object({
  line_id: z.string().uuid(),
  /** `null` = vuelve a "sin contar" (no es lo mismo que contar 0). */
  counted_quantity: z.number().int().min(0).max(999999).nullable(),
})

export const closeInventorySchema = z.object({
  id: z.string().uuid(),
  /**
   * `true` = además de cerrar el recuento, deja el stock igual a lo contado
   * (movimiento 'inventory' por cada diferencia). `false` = solo informe.
   */
  apply_adjustments: z.boolean().default(false),
  /**
   * Qué hacer con lo que no se ha llegado a contar:
   *   'ignore' → se queda como estaba (no cuenta como diferencia)
   *   'zero'   → se da por contado a 0 (inventario completo de verdad)
   */
  uncounted: z.enum(['ignore', 'zero']).default('ignore'),
})

export const cancelInventorySchema = z.object({ id: z.string().uuid() })
export const getInventorySchema = z.object({ id: z.string().uuid() })

export type CreateInventoryInput = z.infer<typeof createInventorySchema>
export type ListInventoriesInput = z.infer<typeof listInventoriesSchema>
export type ScanInventoryInput = z.infer<typeof scanInventorySchema>
export type SetInventoryCountInput = z.infer<typeof setInventoryCountSchema>
export type CloseInventoryInput = z.infer<typeof closeInventorySchema>
export type InventoryScope = z.infer<typeof inventoryScopeSchema>
export type InventoryStatus = z.infer<typeof inventoryStatusSchema>
