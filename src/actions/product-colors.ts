'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'

/** Color del catálogo de la tienda (mig 294). La centena del código es la familia. */
export type ProductColor = {
  code: number
  name: string
  family: string
  hex: string | null
}

/** Colores activos, por código. Alimenta el desplegable de la ficha y el informe. */
export const listProductColors = protectedAction<void, ProductColor[]>(
  { permission: 'products.view', auditModule: 'stock' },
  async (ctx) => {
    const { data, error } = await ctx.adminClient
      .from('product_colors')
      .select('code, name, family, hex')
      .eq('is_active', true)
      .order('code', { ascending: true })
    if (error) return failure(error.message)
    return success((data ?? []).map((c: Record<string, unknown>) => ({
      code: Number(c.code),
      name: String(c.name ?? ''),
      family: String(c.family ?? ''),
      hex: c.hex != null ? String(c.hex) : null,
    })))
  }
)
