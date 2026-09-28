'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success } from '@/lib/errors'
import { computeClientRetentionReport, type ClientRetentionReport } from '@/lib/reports/client-retention'

export type { RetentionStatus, RetentionChannel, RetentionClientRow, ClientRetentionReport } from '@/lib/reports/client-retention'

/** Ver src/lib/reports/client-retention.ts (criterios del informe). */
export const getClientRetentionReport = protectedAction<
  { start_date: string; end_date: string; store_id?: string },
  ClientRetentionReport
>(
  { permission: 'reports.view', auditModule: 'reports' },
  async (ctx, params) => success(await computeClientRetentionReport(ctx.adminClient, params)),
)
