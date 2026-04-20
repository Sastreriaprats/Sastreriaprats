'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

export interface DiscountCodeRow {
  id: string
  code: string
  description: string | null
  discount_type: string
  discount_value: string
  min_purchase: string | null
  max_uses: number | null
  current_uses: number
  valid_from: string | null
  valid_until: string | null
  applies_to: string
  is_active: boolean
  created_at: string
}

export interface CreateDiscountCodeInput {
  code: string
  description: string | null
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_purchase: number | null
  max_uses: number | null
  valid_from: string | null
  valid_until: string | null
  applies_to: 'all' | 'online' | 'boutique'
}

export const listDiscountCodes = protectedAction<void, DiscountCodeRow[]>(
  { permission: 'pos.apply_discount', auditModule: 'discounts' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('discount_codes')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return failure(error.message)
    return success((data ?? []) as DiscountCodeRow[])
  },
)

export const createDiscountCode = protectedAction<CreateDiscountCodeInput, DiscountCodeRow>(
  {
    permission: 'pos.apply_discount',
    auditModule: 'discounts',
    auditAction: 'create',
    auditEntity: 'discount_code',
    revalidate: ['/admin/descuentos'],
  },
  async (ctx, input) => {
    const code = input.code.trim().toUpperCase()
    if (!code) return failure('El código es obligatorio')
    if (!(input.discount_value > 0)) return failure('El valor del descuento debe ser mayor que 0')

    const { data, error } = await ctx.adminClient
      .from('discount_codes')
      .insert({
        code,
        description: input.description,
        discount_type: input.discount_type,
        discount_value: input.discount_value,
        min_purchase: input.min_purchase,
        max_uses: input.max_uses,
        valid_from: input.valid_from,
        valid_until: input.valid_until,
        applies_to: input.applies_to,
        is_active: true,
        current_uses: 0,
      })
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505' || /unique|duplicate/i.test(error.message)) {
        return failure('Este código ya existe')
      }
      return failure(error.message)
    }
    return success(data as DiscountCodeRow)
  },
)

export const toggleDiscountCodeActive = protectedAction<{ id: string; is_active: boolean }, { id: string; is_active: boolean }>(
  {
    permission: 'pos.apply_discount',
    auditModule: 'discounts',
    auditAction: 'update',
    auditEntity: 'discount_code',
    revalidate: ['/admin/descuentos'],
  },
  async (ctx, { id, is_active }) => {
    const { error } = await ctx.adminClient
      .from('discount_codes')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return failure(error.message)
    return success({ id, is_active })
  },
)

export const deleteDiscountCode = protectedAction<{ id: string }, { id: string }>(
  {
    permission: 'pos.apply_discount',
    auditModule: 'discounts',
    auditAction: 'delete',
    auditEntity: 'discount_code',
    revalidate: ['/admin/descuentos'],
  },
  async (ctx, { id }) => {
    const { error } = await ctx.adminClient
      .from('discount_codes')
      .delete()
      .eq('id', id)
    if (error) return failure(error.message)
    return success({ id })
  },
)
