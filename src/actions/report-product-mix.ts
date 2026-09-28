'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success } from '@/lib/errors'
import { computeBoutiqueProductMix, type ProductMixReport } from '@/lib/reports/product-mix'

export type { ProductMixRow, ProductMixCategoryGroup, ProductMixColorGroup, ProductMixReport } from '@/lib/reports/product-mix'

/** Ver src/lib/reports/product-mix.ts (criterios del informe). */
export const getBoutiqueProductMix = protectedAction<
  { start_date: string; end_date: string; store_id?: string },
  ProductMixReport
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, params) => success(await computeBoutiqueProductMix(ctx.adminClient, params)),
)
