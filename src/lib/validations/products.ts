import { z } from 'zod'

export const createProductSchema = z.object({
  sku: z.string().min(1, 'SKU requerido'),
  name: z.string().min(1, 'Nombre requerido'),
  description: z.string().optional().nullable(),
  product_type: z.enum(['boutique', 'tailoring_fabric', 'accessory', 'service']).default('boutique'),
  category_id: z.string().uuid().optional().nullable(),
  brand: z.string().optional().nullable(),
  collection: z.string().optional().nullable(),
  season: z.string().optional().nullable(),
  cost_price: z.number().min(0).optional().nullable(),
  base_price: z.number().min(0, 'Precio debe ser 0 o mayor').default(0),
  tax_rate: z.number().min(0).max(100).default(21),
  supplier_id: z.string().uuid().optional().nullable(),
  supplier_reference: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  min_stock_alert: z.number().min(0).optional().nullable().transform((v) => (v != null ? Math.round(v) : v)),
  is_visible_web: z.boolean().default(false),
  is_sample: z.boolean().default(false),
  is_active: z.boolean().default(true),
  web_slug: z.string().optional().nullable(),
  web_title: z.string().optional().nullable(),
  web_description: z.string().optional().nullable(),
  web_tags: z.array(z.string()).optional().nullable(),
  images: z.array(z.string()).optional().nullable(),
  main_image_url: z.string().optional().nullable(),
  fabric_meters_used: z.number().min(0).optional().nullable(),
})

export const updateProductSchema = createProductSchema.partial()

export const createVariantSchema = z.object({
  product_id: z.string().uuid(),
  size: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  variant_sku: z.string().min(1, 'SKU variante requerido'),
  barcode: z.string().optional().nullable(),
  price_override: z.number().optional().nullable(),
  cost_price_override: z.number().optional().nullable(),
  weight_grams: z.number().int().optional().nullable(),
})

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
export type CreateVariantInput = z.infer<typeof createVariantSchema>
