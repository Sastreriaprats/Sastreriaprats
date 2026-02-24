'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { renderTemplate, sendEmail } from '@/lib/email/send'

// ==========================================
// EMAIL TEMPLATES
// ==========================================

export const listEmailTemplates = protectedAction<void, Record<string, unknown>[]>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx) => {
    const { data } = await ctx.adminClient
      .from('email_templates')
      .select('id, code, name, subject_es, subject_en, category, is_active, updated_at')
      .order('category')
      .order('name')
    return success(data || [])
  }
)

export const getEmailTemplate = protectedAction<string, Record<string, unknown>>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx, id) => {
    const { data } = await ctx.adminClient.from('email_templates').select('*').eq('id', id).single()
    if (!data) return failure('Plantilla no encontrada')
    return success(data)
  }
)

export const upsertEmailTemplate = protectedAction<Record<string, unknown>, { id: string }>(
  {
    permission: 'emails.edit',
    auditModule: 'emails',
    auditAction: 'update',
    auditEntity: 'email_template',
    revalidate: ['/admin/emails'],
  },
  async (ctx, input) => {
    const { id, ...data } = input
    if (id) {
      const { error } = await ctx.adminClient
        .from('email_templates')
        .update({ ...data, updated_by: ctx.userId })
        .eq('id', id as string)
      if (error) return failure(error.message)
      return success({ id: id as string })
    } else {
      const { data: row, error } = await ctx.adminClient
        .from('email_templates')
        .insert({ ...data, created_by: ctx.userId })
        .select('id')
        .single()
      if (error) return failure(error.message)
      return success({ id: row.id })
    }
  }
)

// ==========================================
// CAMPAIGNS
// ==========================================

export const listCampaigns = protectedAction<void, Record<string, unknown>[]>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx) => {
    const { data } = await ctx.adminClient
      .from('email_campaigns')
      .select('id, name, subject, status, segment, total_recipients, sent_count, opened_count, created_at, scheduled_at, sent_at')
      .order('created_at', { ascending: false })
    return success(data || [])
  }
)

export const getCampaign = protectedAction<string, Record<string, unknown>>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx, id) => {
    const { data } = await ctx.adminClient
      .from('email_campaigns')
      .select('*, email_templates(name, code)')
      .eq('id', id)
      .single()
    if (!data) return failure('Campaña no encontrada')
    return success(data)
  }
)

export const createCampaign = protectedAction<
  { name: string; subject: string; segment: string; template_id?: string; body_html?: string; segment_filters?: Record<string, unknown> },
  { id: string; recipients: number }
>(
  {
    permission: 'emails.send',
    auditModule: 'emails',
    auditAction: 'create',
    auditEntity: 'email_campaign',
    revalidate: ['/admin/emails'],
  },
  async (ctx, input) => {
    const recipientCount = await countSegment(ctx.adminClient, input.segment, input.segment_filters)

    const { data, error } = await ctx.adminClient.from('email_campaigns').insert({
      name: input.name,
      subject: input.subject,
      body_html: input.body_html || '',
      template_id: input.template_id || null,
      segment: input.segment,
      segment_filters: input.segment_filters || {},
      status: 'draft',
      total_recipients: recipientCount,
      created_by: ctx.userId,
    }).select('id').single()

    if (error) return failure(error.message)
    return success({ id: data.id, recipients: recipientCount })
  }
)

export const sendCampaign = protectedAction<string, { sent: number; total: number }>(
  {
    permission: 'emails.send',
    auditModule: 'emails',
    auditAction: 'state_change',
    auditEntity: 'email_campaign',
    revalidate: ['/admin/emails'],
  },
  async (ctx, campaignId) => {
    const { data: campaign } = await ctx.adminClient
      .from('email_campaigns')
      .select('*, email_templates(*)')
      .eq('id', campaignId)
      .single()

    if (!campaign) return failure('Campaña no encontrada')
    if ((campaign.status as string) !== 'draft') return failure('Solo se pueden enviar campañas en borrador')

    const recipients = await getSegmentRecipients(
      ctx.adminClient,
      campaign.segment as string,
      campaign.segment_filters as Record<string, unknown> | undefined
    )

    await ctx.adminClient
      .from('email_campaigns')
      .update({ status: 'sending', sent_at: new Date().toISOString() })
      .eq('id', campaignId)

    let sentCount = 0
    const batchSize = 50
    const template = campaign.email_templates as Record<string, unknown> | null

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize)

      for (const recipient of batch) {
        try {
          const html = renderTemplate(
            (template?.body_html_es as string) || (campaign.body_html as string) || '',
            {
              client_name: (recipient.full_name as string) || (recipient.first_name as string) || 'Cliente',
              client_email: recipient.email as string,
              first_name: (recipient.first_name as string) || '',
              last_name: (recipient.last_name as string) || '',
            }
          )

          await sendEmail({
            to: recipient.email as string,
            subject: campaign.subject as string,
            html,
          })

          await ctx.adminClient.from('email_logs').insert({
            campaign_id: campaignId,
            recipient_email: recipient.email,
            client_id: recipient.id,
            subject: campaign.subject,
            email_type: 'campaign',
            status: 'sent',
            sent_at: new Date().toISOString(),
          })

          sentCount++
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : 'Unknown error'
          await ctx.adminClient.from('email_logs').insert({
            campaign_id: campaignId,
            recipient_email: recipient.email,
            client_id: recipient.id,
            subject: campaign.subject,
            email_type: 'campaign',
            status: 'failed',
            error_message: errMsg,
          })
        }
      }

      if (i + batchSize < recipients.length) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    await ctx.adminClient.from('email_campaigns').update({
      status: 'sent', sent_count: sentCount, total_recipients: recipients.length,
    }).eq('id', campaignId)

    return success({ sent: sentCount, total: recipients.length })
  }
)

// ==========================================
// EMAIL LOGS
// ==========================================

export const getEmailLogs = protectedAction<
  { page?: number; campaign_id?: string; client_id?: string },
  { logs: Record<string, unknown>[]; total: number; page: number }
>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx, { page = 1, campaign_id, client_id }) => {
    let query = ctx.adminClient
      .from('email_logs')
      .select('*, email_campaigns(name)', { count: 'exact' })
      .order('sent_at', { ascending: false })

    if (campaign_id) query = query.eq('campaign_id', campaign_id)
    if (client_id) query = query.eq('client_id', client_id)

    const limit = 50
    query = query.range((page - 1) * limit, page * limit - 1)

    const { data, count } = await query
    return success({ logs: data || [], total: count || 0, page })
  }
)

// ==========================================
// HELPERS
// ==========================================

async function countSegment(
  client: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  segment: string,
  filters?: Record<string, unknown>
): Promise<number> {
  let query = client.from('clients').select('id', { count: 'exact' }).eq('is_active', true)

  if (segment === 'vip') query = query.eq('category', 'vip')
  else if (segment === 'new_30d') query = query.gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
  else if (segment === 'inactive_90d') query = query.lte('last_purchase_date', new Date(Date.now() - 90 * 86400000).toISOString())
  else if (segment === 'with_orders') query = query.gt('purchase_count', 0)
  else if (segment === 'web_registered') query = query.not('profile_id', 'is', null)

  if (filters?.min_spent) query = query.gte('total_spent', filters.min_spent as number)
  if (filters?.category) query = query.eq('category', filters.category as string)

  const { count } = await query
  return count || 0
}

async function getSegmentRecipients(
  client: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  segment: string,
  filters?: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  let query = client
    .from('clients')
    .select('id, first_name, last_name, full_name, email')
    .eq('is_active', true)
    .not('email', 'is', null)

  if (segment === 'vip') query = query.eq('category', 'vip')
  else if (segment === 'new_30d') query = query.gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
  else if (segment === 'inactive_90d') query = query.lte('last_purchase_date', new Date(Date.now() - 90 * 86400000).toISOString())
  else if (segment === 'with_orders') query = query.gt('purchase_count', 0)
  else if (segment === 'web_registered') query = query.not('profile_id', 'is', null)

  if (filters?.min_spent) query = query.gte('total_spent', filters.min_spent as number)

  const { data } = await query
  return data || []
}

