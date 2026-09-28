'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success } from '@/lib/errors'
import { computeTailoringGarmentsReport, type TailoringGarmentsReport } from '@/lib/reports/tailoring-garments'

export type { Manufacturing, TailoringGarmentRow, TailoringGarmentsReport } from '@/lib/reports/tailoring-garments'

/** Ver src/lib/reports/tailoring-garments.ts (criterios del informe). */
export const getTailoringGarmentsReport = protectedAction<
  { start_date: string; end_date: string; store_id?: string },
  TailoringGarmentsReport
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, params) => success(await computeTailoringGarmentsReport(ctx.adminClient, params)),
)
