import { z } from 'zod'

export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  legal_name: z.string().optional().nullable(),
  nif_cif: z.string().optional().nullable(),
  supplier_types: z.array(z.enum(['fabric', 'manufacturing', 'accessories', 'trimmings', 'services', 'logistics', 'other'])).default([]),
  contact_name: z.string().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  country: z.string().default('España'),
  bank_name: z.string().optional().nullable(),
  bank_iban: z.string().optional().nullable(),
  bank_swift: z.string().optional().nullable(),
  payment_terms: z.enum(['immediate', 'net_15', 'net_30', 'net_60', 'net_90', 'custom']).default('net_30'),
  payment_days: z.number().default(30),
  minimum_order: z.number().optional().nullable(),
  shipping_included: z.boolean().default(false),
  internal_notes: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
})

export const updateSupplierSchema = createSupplierSchema.partial()

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>
