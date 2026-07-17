import { z } from 'zod'

// El único campo realmente obligatorio para identificar al cliente es el nombre.
// El resto puede llegar null desde la BD (clientes históricos) o vacío desde el form;
// las validaciones de "campo requerido para crear" se delegan al frontend.
export const createClientSchema = z.object({
  first_name: z.string().min(1, 'Nombre requerido'),
  last_name: z.string().nullable().optional(),
  email: z.string().email('Email inválido').nullable().optional().or(z.literal('')),
  phone: z.string().nullable().optional(),
  phone_secondary: z.string().nullable().optional(),
  date_of_birth: z.string().nullable().optional(),
  gender: z.enum(['male', 'female', 'other', 'unspecified']).nullable().optional(),
  salutation: z.enum(['sr', 'sra']).nullable().optional(),
  client_type: z.enum(['individual', 'company']).nullable().optional(),
  category: z.enum(['standard', 'vip', 'premium', 'gold', 'ambassador']).nullable().optional(),
  document_type: z.enum(['DNI', 'NIE', 'NIF', 'CIF', 'passport', 'other']).nullable().optional(),
  document_number: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  company_nif: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  standard_sizes: z.record(z.string(), z.string()).nullable().optional(),
  preferences: z.record(z.string(), z.any()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  source: z.string().nullable().optional(),
  discount_percentage: z.number().min(0).max(100).nullable().optional(),
  accepts_marketing: z.boolean().nullable().optional(),
  accepts_data_storage: z.boolean().nullable().optional(),
  home_store_id: z.string().uuid().nullable().optional(),
  assigned_salesperson_id: z.string().uuid().nullable().optional(),
  internal_notes: z.string().nullable().optional(),
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
