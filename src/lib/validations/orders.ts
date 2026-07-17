import { z } from 'zod'
import { ALL_VISIBLE_STATUSES } from '@/lib/orders/statuses'

export const createTailoringOrderSchema = z.object({
  client_id: z.string().uuid().optional().nullable(),
  official_id: z.string().uuid().optional().nullable(),
  order_type: z.enum(['artesanal', 'industrial', 'proveedor', 'oficial']),
  recipient_type: z.enum(['client', 'supplier', 'official', 'factory']).default('client'),
  recipient_name: z.string().optional().nullable(),
  parent_order_id: z.string().uuid().optional().nullable(),
  store_id: z.string().uuid('Tienda requerida'),
  estimated_delivery_date: z.string().optional().nullable(),
  alert_on_delivery: z.boolean().default(false),
  delivery_method: z.enum(['store', 'home']).default('store'),
  delivery_address: z.string().optional().nullable(),
  discount_percentage: z.number().min(0).max(100).default(0),
  internal_notes: z.string().optional().nullable(),
  client_notes: z.string().optional().nullable(),
})

export const tailoringOrderLineSchema = z.object({
  garment_type_id: z.string().uuid(),
  line_type: z.enum(['artesanal', 'industrial']),
  measurement_id: z.string().uuid().optional().nullable(),
  official_id: z.string().uuid().optional().nullable(),
  configuration: z.record(z.string(), z.any()).default({}),
  fabric_id: z.string().uuid().optional().nullable(),
  fabric_description: z.string().optional().nullable(),
  fabric_meters: z.number().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  unit_price: z.number().min(0),
  // Prenda regalo: permite PVP 0 de forma intencionada (mig 261). Debe estar
  // declarado aquí: zod hace strip de las claves desconocidas y se perdería.
  is_gift: z.boolean().default(false),
  discount_percentage: z.number().min(0).max(100).default(0),
  tax_rate: z.number().default(21),
  material_cost: z.number().default(0),
  labor_cost: z.number().default(0),
  factory_cost: z.number().default(0),
  model_name: z.string().optional().nullable(),
  model_size: z.string().optional().nullable(),
  finishing_notes: z.string().optional().nullable(),
})

export const changeOrderStatusSchema = z.object({
  order_id: z.string().uuid(),
  // Una prenda concreta (compat) o varias a la vez (multi-selección). Si se
  // envían `line_ids`, tienen prioridad sobre `line_id`. Si no se envía ninguno,
  // el cambio aplica a nivel de PEDIDO (propagación forward de todas las prendas).
  line_id: z.string().uuid().optional(),
  line_ids: z.array(z.string().uuid()).optional(),
  new_status: z.enum(ALL_VISIBLE_STATUSES as [string, ...string[]]),
  notes: z.string().optional(),
})

export type CreateTailoringOrderInput = z.infer<typeof createTailoringOrderSchema>
export type TailoringOrderLineInput = z.infer<typeof tailoringOrderLineSchema>
export type ChangeOrderStatusInput = z.infer<typeof changeOrderStatusSchema>
