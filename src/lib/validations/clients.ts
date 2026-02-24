import { z } from 'zod'

export const createClientSchema = z.object({
  first_name: z.string().min(1, 'Nombre requerido'),
  last_name: z.string().min(1, 'Apellido requerido'),
  email: z.string().email('Email inválido').optional().nullable(),
  phone: z.string().optional().nullable(),
  phone_secondary: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  gender: z.enum(['male', 'female']).default('male'),
  client_type: z.enum(['individual', 'company']).default('individual'),
  category: z.enum(['standard', 'vip', 'premium', 'gold', 'ambassador']).default('standard'),
  document_type: z.enum(['DNI', 'NIE', 'NIF', 'CIF', 'passport', 'other']).default('DNI'),
  document_number: z.string().optional().nullable(),
  company_name: z.string().optional().nullable(),
  company_nif: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  province: z.string().optional().nullable(),
  country: z.string().default('España'),
  nationality: z.string().optional().nullable(),
  standard_sizes: z.record(z.string(), z.string()).optional(),
  preferences: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional().nullable(),
  discount_percentage: z.number().min(0).max(100).default(0),
  accepts_marketing: z.boolean().default(false),
  accepts_data_storage: z.boolean().default(false),
  home_store_id: z.string().uuid().optional().nullable(),
  assigned_salesperson_id: z.string().uuid().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
})

export const updateClientSchema = createClientSchema.partial()

export type CreateClientInput = z.infer<typeof createClientSchema>
export type UpdateClientInput = z.infer<typeof updateClientSchema>

export const clientNoteSchema = z.object({
  client_id: z.string().uuid(),
  note_type: z.enum(['general', 'boutique_alteration', 'preference', 'complaint', 'compliment', 'fitting', 'follow_up', 'payment', 'incident']).default('general'),
  title: z.string().optional(),
  content: z.string().min(1, 'Contenido requerido'),
  is_pinned: z.boolean().default(false),
  is_private: z.boolean().default(false),
})

export const clientMeasurementsSchema = z.object({
  client_id: z.string().uuid(),
  garment_type_id: z.string().uuid(),
  measurement_type: z.enum(['artesanal', 'industrial']),
  values: z.record(z.string(), z.string()),
  body_observations: z.string().optional().nullable(),
  store_id: z.string().uuid().optional().nullable(),
  order_id: z.string().uuid().optional().nullable(),
})
