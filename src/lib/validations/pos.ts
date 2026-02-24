import { z } from 'zod'

export const openCashSessionSchema = z.object({
  store_id: z.string().uuid(),
  opening_amount: z.number().min(0),
})

export const closeCashSessionSchema = z.object({
  session_id: z.string().uuid(),
  counted_cash: z.number().min(0),
  closing_notes: z.string().optional(),
})

export const createSaleSchema = z.object({
  cash_session_id: z.string().uuid(),
  store_id: z.string().uuid(),
  client_id: z.string().uuid().optional().nullable(),
  sale_type: z.enum(['boutique', 'tailoring_deposit', 'tailoring_final', 'alteration', 'online']).default('boutique'),
  discount_percentage: z.number().min(0).max(100).default(0),
  discount_code: z.string().optional().nullable(),
  is_tax_free: z.boolean().default(false),
  tailoring_order_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const saleLineSchema = z.object({
  product_variant_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  sku: z.string().optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  unit_price: z.number().min(0),
  discount_percentage: z.number().min(0).max(100).default(0),
  tax_rate: z.number().default(21),
  cost_price: z.number().optional().nullable(),
})

export const salePaymentSchema = z.object({
  payment_method: z.enum(['cash', 'card', 'bizum', 'transfer', 'voucher', 'mixed']),
  amount: z.number().min(0),
  reference: z.string().optional().nullable(),
  voucher_id: z.string().uuid().optional().nullable(),
})

export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>
export type CreateSaleInput = z.infer<typeof createSaleSchema>
export type SaleLineInput = z.infer<typeof saleLineSchema>
export type SalePaymentInput = z.infer<typeof salePaymentSchema>
