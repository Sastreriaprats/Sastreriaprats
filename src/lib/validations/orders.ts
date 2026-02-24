import { z } from 'zod'

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
  line_id: z.string().uuid().optional(),
  new_status: z.enum([
    'created', 'fabric_ordered', 'fabric_received', 'factory_ordered',
    'in_production', 'fitting', 'adjustments', 'finished', 'delivered',
    'incident', 'cancelled', 'requested', 'supplier_delivered',
  ]),
  notes: z.string().optional(),
})

export type CreateTailoringOrderInput = z.infer<typeof createTailoringOrderSchema>
export type TailoringOrderLineInput = z.infer<typeof tailoringOrderLineSchema>
export type ChangeOrderStatusInput = z.infer<typeof changeOrderStatusSchema>
