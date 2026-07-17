'use server'

import { protectedAction } from '@/lib/server/action-wrapper'
import { success, failure } from '@/lib/errors'
import { normalizeSearchTerm } from '@/lib/utils'
import { renderTemplate, sendEmail } from '@/lib/email/send'
import { generateOptInToken } from '@/lib/newsletter/tokens'
import {
  composeNewsletterEmail,
  type NewsletterContent,
  type NewsletterRecipient,
  type NewsletterTemplate,
} from '@/lib/email/newsletter-render'

const STRUCTURED_CODES = new Set(['newsletter_default', 'newsletter_optin'])

/** Valida los campos obligatorios del content según la plantilla.
 *  Devuelve null si pasa, o un string con el motivo si falla. */
function validateStructuredContent(code: string, content: NewsletterContent | null | undefined): string | null {
  const c = content || {}
  if (code === 'newsletter_default') {
    const hero = (c.hero_image_url || '').trim()
    const title = (c.title || '').trim()
    const heroOk = /^https?:\/\//i.test(hero)
    if (!heroOk || !title) {
      return 'Falta hero_image_url y/o title. Edita la campaña y completa los campos obligatorios.'
    }
  }
  if (code === 'newsletter_optin') {
    const hero = (c.hero_image_url || '').trim()
    if (!hero) {
      return 'Falta hero_image_url. Edita la campaña y completa la imagen hero.'
    }
  }
  return null
}

/**
 * Devuelve la URL pública base del sitio (sin barra final). Usa la misma
 * variable que el resto del proyecto: `NEXT_PUBLIC_APP_URL`. Si no está
 * configurada devuelve cadena vacía — el caller decide si bloquear.
 */
function getPublicSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')
}

/**
 * Comprueba si una campaña es la invitación inicial de opt-in (RGPD).
 * No debe llevar cabecera List-Unsubscribe porque el destinatario aún no
 * está suscrito a nada.
 */
function isOptInInvitationCampaign(
  campaign: Record<string, unknown>,
  template: Record<string, unknown> | null
): boolean {
  if (template?.code === 'newsletter_optin') return true
  if (campaign?.segment === 'optin_invitation') return true
  return false
}

// ==========================================
// EMAIL TEMPLATES
// ==========================================

export const listEmailTemplates = protectedAction<void, Record<string, unknown>[]>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx) => {
    const { data } = await ctx.adminClient
      .from('email_templates')
      .select('id, code, name, subject_es, subject_en, category, is_active, updated_at, thumbnail_url')
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

/**
 * Edición "sin código" de una plantilla: solo nombre, asunto y estado activo.
 * Pensado para que usuarios sin permiso técnico (Maryana, Mónica, etc.)
 * puedan ajustar metadatos de cualquier plantilla — incluyendo
 * transaccionales — sin tocar el HTML maestro.
 *
 * El HTML completo sigue protegido por `emails.manage_templates_html`
 * vía `upsertEmailTemplate`.
 */
export const updateTemplateContent = protectedAction<
  {
    id: string
    name: string
    subject_es: string
    is_active: boolean
    /** Diccionario de textos editables sin código (campos definidos por la
     *  plantilla en `editable_fields`). Opcional: si no se pasa, no se toca. */
    editable_fields?: Record<string, string>
  },
  { id: string; auditEntityId: string; auditDescription: string }
>(
  {
    permission: 'emails.view',
    auditModule: 'emails',
    auditAction: 'update',
    auditEntity: 'email_template',
    revalidate: ['/admin/emails'],
  },
  async (ctx, input) => {
    if (!input.id) return failure('Falta el id de la plantilla', 'VALIDATION')
    const name = (input.name ?? '').trim()
    const subject = (input.subject_es ?? '').trim()
    if (name.length < 3) return failure('El nombre debe tener al menos 3 caracteres', 'VALIDATION')
    if (subject.length < 5) return failure('El asunto debe tener al menos 5 caracteres', 'VALIDATION')

    const update: Record<string, unknown> = {
      name,
      subject_es: subject,
      is_active: !!input.is_active,
      updated_by: ctx.userId,
    }
    if (input.editable_fields && typeof input.editable_fields === 'object') {
      // Sanitización mínima: nos quedamos con entradas string. Sin validar
      // claves específicas porque cada plantilla define las suyas.
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(input.editable_fields)) {
        if (typeof v === 'string') clean[k] = v
      }
      update.editable_fields = clean
    }

    const { error } = await ctx.adminClient
      .from('email_templates')
      .update(update)
      .eq('id', input.id)

    if (error) return failure(error.message)
    return success({
      id: input.id,
      auditEntityId: String(input.id),
      auditDescription: `Plantilla de email "${name}"`,
    })
  }
)

export const upsertEmailTemplate = protectedAction<
  Record<string, unknown>,
  { id: string; auditEntityId: string; auditDescription: string }
>(
  {
    permission: 'emails.manage_templates_html',
    auditModule: 'emails',
    auditAction: 'update',
    auditEntity: 'email_template',
    revalidate: ['/admin/emails'],
  },
  async (ctx, input) => {
    const { id, ...data } = input
    const tplName = (typeof data.name === 'string' ? data.name : '').trim()
    if (id) {
      const { error } = await ctx.adminClient
        .from('email_templates')
        .update({ ...data, updated_by: ctx.userId })
        .eq('id', id as string)
      if (error) return failure(error.message)
      return success({
        id: id as string,
        auditEntityId: String(id),
        auditDescription: `Plantilla de email "${tplName}"`,
      })
    } else {
      const { data: row, error } = await ctx.adminClient
        .from('email_templates')
        .insert({ ...data, created_by: ctx.userId })
        .select('id')
        .single()
      if (error) return failure(error.message)
      return success({
        id: row.id,
        auditEntityId: String(row.id),
        auditDescription: `Plantilla de email "${tplName}"`,
      })
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
      .select('id, name, subject, status, segment, total_recipients, sent_count, delivered_count, opened_count, clicked_count, created_at, scheduled_at, sent_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    return success(data || [])
  }
)

/** Soft delete de una campaña. Se marca deleted_at=NOW() y deja de
 *  aparecer en el listado. Los email_logs y métricas asociadas se
 *  conservan (su FK no se toca). Idempotente: si ya está eliminada,
 *  no hace nada. */
export const deleteCampaignAction = protectedAction<
  string,
  { deleted: true; auditEntityId: string; auditDescription: string }
>(
  {
    permission: 'emails.send',
    auditModule: 'emails',
    auditAction: 'delete',
    auditEntity: 'email_campaign',
    revalidate: ['/admin/emails'],
  },
  async (ctx, campaignId) => {
    if (!campaignId?.trim()) return failure('ID de campaña requerido', 'VALIDATION')
    const { data: existing } = await ctx.adminClient
      .from('email_campaigns')
      .select('name')
      .eq('id', campaignId)
      .single()
    const campaignName = (existing?.name as string) || ''
    const { error } = await ctx.adminClient
      .from('email_campaigns')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', campaignId)
      .is('deleted_at', null)
    if (error) return failure(error.message)
    return success({
      deleted: true,
      auditEntityId: String(campaignId),
      auditDescription: `Campaña "${campaignName}" eliminada`,
    })
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
  {
    name: string
    subject: string
    segment: string
    template_id?: string
    body_html?: string
    segment_filters?: Record<string, unknown>
    /** Contenido estructurado para plantillas tipo newsletter_default/optin.
     *  Se guarda en segment_filters.content sin pisar otros filters. */
    content?: Record<string, unknown>
  },
  { id: string; recipients: number; auditEntityId: string; auditDescription: string }
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

    const baseFilters = input.segment_filters || {}
    const mergedFilters: Record<string, unknown> = input.content
      ? { ...baseFilters, content: input.content }
      : baseFilters

    const { data, error } = await ctx.adminClient.from('email_campaigns').insert({
      name: input.name,
      subject: input.subject,
      body_html: input.body_html || '',
      template_id: input.template_id || null,
      segment: input.segment,
      segment_filters: mergedFilters,
      status: 'draft',
      total_recipients: recipientCount,
      created_by: ctx.userId,
    }).select('id').single()

    if (error) return failure(error.message)
    return success({
      id: data.id,
      recipients: recipientCount,
      auditEntityId: String(data.id),
      auditDescription: `Campaña "${input.name}" creada (${recipientCount} destinatarios)`,
    })
  }
)

export const updateEmailCampaign = protectedAction<
  {
    id: string
    subject: string
    body_html?: string
    segment: string
    template_id?: string | null
    /** Contenido estructurado. Si se pasa, sobreescribe segment_filters.content. */
    content?: Record<string, unknown>
  },
  { id: string; auditEntityId: string; auditDescription: string }
>(
  {
    permission: 'emails.send',
    auditModule: 'emails',
    auditAction: 'update',
    auditEntity: 'email_campaign',
    revalidate: ['/admin/emails'],
  },
  async (ctx, input) => {
    const { data: existing } = await ctx.adminClient
      .from('email_campaigns')
      .select('id, name, status, segment_filters')
      .eq('id', input.id)
      .single()

    if (!existing) return failure('Campaña no encontrada')
    if ((existing.status as string) !== 'draft') return failure('Solo se pueden editar campañas en borrador')

    const recipientCount = await countSegment(ctx.adminClient, input.segment, undefined)

    // Merge defensivo de segment_filters: preservamos lo que hubiera y solo
    // actualizamos `content` si el caller lo pasó.
    const prevFilters = (existing.segment_filters as Record<string, unknown> | null) || {}
    const mergedFilters: Record<string, unknown> = input.content !== undefined
      ? { ...prevFilters, content: input.content }
      : prevFilters

    const { error } = await ctx.adminClient
      .from('email_campaigns')
      .update({
        subject: input.subject,
        body_html: input.body_html ?? '',
        segment: input.segment,
        template_id: input.template_id || null,
        segment_filters: mergedFilters,
        total_recipients: recipientCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)

    if (error) return failure(error.message)
    return success({
      id: input.id,
      auditEntityId: String(input.id),
      auditDescription: `Campaña "${(existing.name as string) || ''}"`,
    })
  }
)

export const sendCampaign = protectedAction<
  string,
  { sent: number; total: number; auditEntityId: string; auditDescription: string }
>(
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

    const template = campaign.email_templates as Record<string, unknown> | null
    const templateCode = (template?.code as string) || ''
    const isStructured = STRUCTURED_CODES.has(templateCode)
    const isOptInInvitation = isOptInInvitationCampaign(campaign, template)
    const publicUrl = getPublicSiteUrl()

    // Si la campaña usa una plantilla estructurada, esta debe existir y tener
    // body_html_es. Si template_id apuntaba a una plantilla borrada,
    // `email_templates` viene null y no podemos componer el email.
    if (campaign.template_id && !template) {
      return failure(
        'La plantilla asociada a la campaña ya no existe. Reasigna una plantilla activa antes de enviar.'
      )
    }

    // Pre-check: si la campaña requiere link de baja (no es optin_invitation)
    // y no hay NEXT_PUBLIC_APP_URL configurada, abortamos antes de tocar nada.
    // Sin URL los enlaces de baja saldrían rotos para todos los destinatarios.
    if (!isOptInInvitation && !publicUrl) {
      return failure(
        'No se puede enviar campaña sin PUBLIC_URL configurada. Define NEXT_PUBLIC_APP_URL en .env.'
      )
    }
    if (publicUrl && !publicUrl.startsWith('https://')) {
      console.warn(
        `[sendCampaign] NEXT_PUBLIC_APP_URL no es https (${publicUrl}). Aceptable solo en entornos de pruebas.`
      )
    }

    // Extraer el contenido estructurado de la campaña (segment_filters.content).
    const filters = (campaign.segment_filters as Record<string, unknown> | null) || {}
    const content = (filters.content as NewsletterContent | undefined) || null

    // Validar campos obligatorios para plantillas estructuradas ANTES de tocar
    // nada. Si falta lo crítico, la campaña queda en draft y no se envía.
    if (isStructured) {
      const validationError = validateStructuredContent(templateCode, content)
      if (validationError) return failure(validationError)
    }

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

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize)

      for (const recipient of batch) {
        const clientId = recipient.id as string
        let unsubscribeHeaders: Record<string, string> | undefined
        let unsubUrl = ''
        let confirmationUrl = ''
        // Generamos siempre un token por destinatario (lo usa baja o confirmar
        // según el tipo). Las cabeceras List-Unsubscribe solo se montan para
        // campañas no-optin: la invitación opt-in NO lleva baja porque el
        // destinatario aún no está suscrito a nada.
        if (clientId) {
          try {
            const tok = generateOptInToken(clientId)
            await ctx.adminClient
              .from('clients')
              .update({
                opt_in_token: tok,
                opt_in_token_created_at: new Date().toISOString(),
              })
              .eq('id', clientId)
            if (isOptInInvitation) {
              confirmationUrl = `${publicUrl}/newsletter/confirmar?token=${tok}`
              // Para invitaciones opt-in, además marcamos opt_in_sent_at para
              // el anti-spam de 6 meses del segmento optin_invitation.
              await ctx.adminClient
                .from('clients')
                .update({ opt_in_sent_at: new Date().toISOString() })
                .eq('id', clientId)
            } else {
              unsubUrl = `${publicUrl}/newsletter/baja?token=${tok}`
              unsubscribeHeaders = {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              }
            }
          } catch (tokenErr) {
            console.error('[sendCampaign] no se pudo preparar token:', tokenErr)
            await ctx.adminClient.from('email_logs').insert({
              campaign_id: campaignId,
              recipient_email: recipient.email,
              client_id: clientId,
              subject: campaign.subject,
              email_type: 'campaign',
              status: 'failed',
              error_message: 'No se pudo generar token (NEWSLETTER_TOKEN_SECRET?)',
            })
            continue
          }
        }

        let html: string | undefined
        try {
          if (isStructured && template) {
            html = composeNewsletterEmail({
              template: template as NewsletterTemplate,
              content,
              recipient: recipient as NewsletterRecipient,
              urls: {
                unsubscribeUrl: unsubUrl || undefined,
                confirmationUrl: confirmationUrl || undefined,
              },
              subject: campaign.subject as string,
            })
          } else {
            // Camino legacy: plantilla sin code conocido o sin plantilla.
            // Usamos el body de la plantilla (si la hay) o el body_html libre
            // de la campaña, con las mismas variables básicas que antes.
            html = renderTemplate(
              (template?.body_html_es as string) || (campaign.body_html as string) || '',
              {
                client_name: (recipient.full_name as string) || (recipient.first_name as string) || 'Cliente',
                client_email: recipient.email as string,
                first_name: (recipient.first_name as string) || '',
                last_name: (recipient.last_name as string) || '',
              }
            )
          }

          const result = await sendEmail({
            to: recipient.email as string,
            subject: campaign.subject as string,
            html,
            headers: unsubscribeHeaders,
          })

          await ctx.adminClient.from('email_logs').insert({
            campaign_id: campaignId,
            recipient_email: recipient.email,
            client_id: clientId,
            subject: campaign.subject,
            body_html: html,
            email_type: 'campaign',
            status: 'sent',
            sent_at: new Date().toISOString(),
            resend_id: result?.id ?? null,
          })

          sentCount++
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : 'Unknown error'
          await ctx.adminClient.from('email_logs').insert({
            campaign_id: campaignId,
            recipient_email: recipient.email,
            client_id: clientId,
            subject: campaign.subject,
            body_html: html ?? null,
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

    return success({
      sent: sentCount,
      total: recipients.length,
      auditEntityId: String(campaignId),
      auditDescription: `Campaña "${(campaign.name as string) || ''}" enviada (${sentCount}/${recipients.length})`,
    })
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
    // Columnas explícitas: body_html se excluye a propósito (puede pesar
    // decenas de KB por fila); se carga bajo demanda con getEmailLogDetail.
    let query = ctx.adminClient
      .from('email_logs')
      .select(
        'id, campaign_id, client_id, recipient_email, subject, email_type, status, error_message, sent_at, opened_at, clicked_at, email_campaigns(name)',
        { count: 'exact' }
      )
      .order('sent_at', { ascending: false })

    if (campaign_id) query = query.eq('campaign_id', campaign_id)
    if (client_id) query = query.eq('client_id', client_id)

    const limit = 50
    query = query.range((page - 1) * limit, page * limit - 1)

    const { data, count } = await query
    return success({ logs: data || [], total: count || 0, page })
  }
)

/**
 * Detalle de un envío individual del historial, incluido el HTML tal cual
 * se envió (email_logs.body_html, snapshot desde jul-2026). Para logs de
 * campaña anteriores a esa fecha body_html es null y el caller puede caer
 * a previewCampaignEmail con el campaign_id devuelto.
 */
export const getEmailLogDetail = protectedAction<string, Record<string, unknown>>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx, logId) => {
    const { data } = await ctx.adminClient
      .from('email_logs')
      .select('id, campaign_id, recipient_email, subject, body_html, email_type, status, error_message, sent_at, email_campaigns(name)')
      .eq('id', logId)
      .maybeSingle()
    if (!data) return failure('Envío no encontrado')
    return success(data)
  }
)

/**
 * Listado de clientes para la pestaña "Suscriptores" de newsletter, clasificados
 * en tres estados disjuntos que suman el total de clientes:
 *
 *  - 'unsubscribed' (dados de baja): unsubscribed_at IS NOT NULL. Pulsaron
 *    "darse de baja" en una newsletter. Es la única exclusión por voluntad.
 *  - 'active' (activos): NO dados de baja, ficha activa, con email y sin rebote.
 *    Reciben las campañas.
 *  - 'inactive' (inactivos): NO dados de baja pero no reciben por entregabilidad:
 *    ficha desactivada, sin email, o dirección rebotada.
 *
 * Los conteos se calculan siempre (independientes del filtro de la tabla) con
 * count exacto; 'inactive' se deriva como total − activos − bajas para evitar
 * expresar el complemento en PostgREST. Las filas se paginan de 50 en 50.
 */
const SUBSCRIBERS_PAGE_SIZE = 50

export const listNewsletterSubscribers = protectedAction<
  { status?: 'active' | 'inactive' | 'unsubscribed'; page?: number; search?: string },
  {
    subscribers: Record<string, unknown>[]
    total: number
    page: number
    counts: { total: number; active: number; inactive: number; unsubscribed: number }
  }
>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx, input) => {
    const status = input?.status ?? 'active'
    const page = Math.max(1, input?.page ?? 1)
    // Saneamos la búsqueda: comas y paréntesis romperían el parser de .or().
    const search = (input?.search ?? '').trim().replace(/[(),]/g, ' ').slice(0, 80)
    const c = ctx.adminClient

    // --- Conteos exactos (siempre, no dependen del filtro de la tabla) ---
    // 'active' usa el MISMO criterio que el envío real (applyMarketingBaseFilter),
    // incluida la validación de forma del email vía imatch, para que el número de
    // activos coincida con quién recibe de verdad. 'inactive' se deriva por resta.
    const [totalRes, unsubRes, activeRes] = await Promise.all([
      c.from('clients').select('id', { count: 'exact', head: true }),
      c.from('clients').select('id', { count: 'exact', head: true }).not('unsubscribed_at', 'is', null),
      c.from('clients').select('id', { count: 'exact', head: true })
        .is('unsubscribed_at', null).eq('is_active', true).not('email', 'is', null)
        .eq('email_bounced', false).filter('email', 'imatch', EMAIL_REGEX_POSIX),
    ])
    const total = totalRes.count || 0
    const unsubscribed = unsubRes.count || 0
    const active = activeRes.count || 0
    const counts = { total, active, unsubscribed, inactive: total - active - unsubscribed }

    // --- Filas paginadas del estado seleccionado ---
    // Inactivos = complemento de activos entre los NO dados de baja: ficha
    // desactivada, sin email, rebotado, o email con forma inválida. La regex se
    // envuelve en comillas dobles porque su `{2,}` lleva una coma que rompería
    // el parser de .or() de PostgREST.
    const inactiveOr =
      `is_active.eq.false,email.is.null,email_bounced.eq.true,email.not.imatch."${EMAIL_REGEX_POSIX}"`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyStatus = (q: any) => {
      if (status === 'unsubscribed') return q.not('unsubscribed_at', 'is', null)
      if (status === 'inactive') return q.is('unsubscribed_at', null).or(inactiveOr)
      return q.is('unsubscribed_at', null).eq('is_active', true).not('email', 'is', null)
        .eq('email_bounced', false).filter('email', 'imatch', EMAIL_REGEX_POSIX)
    }

    let query = c.from('clients').select(
      'id, first_name, last_name, full_name, email, is_active, email_bounced, unsubscribed_at, unsubscribe_reason, source, created_at',
      { count: 'exact' }
    )
    query = applyStatus(query)
    // Tokens AND sin acentos: search_text (clients, mig 142) cubre el nombre
    // normalizado; email se busca tal cual por token.
    if (search) {
      for (const t of normalizeSearchTerm(search).split(/\s+/).filter(Boolean)) {
        query = query.or(`search_text.ilike.%${t}%,email.ilike.%${t}%`)
      }
    }
    query = query
      .order('unsubscribed_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * SUBSCRIBERS_PAGE_SIZE, page * SUBSCRIBERS_PAGE_SIZE - 1)

    const { data, count } = await query
    return success({ subscribers: data || [], total: count || 0, page, counts })
  }
)

/**
 * Número de destinatarios de cada segmento, para mostrarlo junto a las opciones
 * del selector de campaña. Reutiliza exactamente la misma lógica de conteo que
 * el envío real (countSegment), así que el número coincide con lo que recibiría
 * una campaña creada con ese segmento.
 */
export const getSegmentCounts = protectedAction<void, Record<string, number>>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx) => {
    const segments = ['all', 'vip', 'new_30d', 'inactive_90d', 'with_orders', 'web_registered', 'optin_invitation']
    const entries = await Promise.all(
      segments.map(async (s) => [s, await countSegment(ctx.adminClient, s, undefined)] as const)
    )
    return success(Object.fromEntries(entries))
  }
)

// ==========================================
// HELPERS
// ==========================================

/**
 * Regex POSIX (case-insensitive) para validar emails en BBDD vía operador
 * `imatch` de PostgREST (equivalente a `~*` en Postgres). Igual a la usada en
 * /api/public/newsletter para validación client/server (EMAIL_RE).
 */
const EMAIL_REGEX_POSIX = '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'

/**
 * Filtro base (modelo opt-out) para CUALQUIER campaña excepto la invitación
 * inicial opt-in. Incluye a TODOS los clientes —altas manuales y registros
 * web por igual— y solo deja fuera a quien no puede o no quiere recibir:
 *  - activo
 *  - email no nulo y con forma válida (entregabilidad)
 *  - sin rebotes previos (email_bounced = false) (entregabilidad)
 *  - no dado de baja (unsubscribed_at IS NULL) (única exclusión por voluntad)
 *
 * NOTA: deliberadamente NO se exige accepts_marketing ni newsletter_subscribed.
 * El criterio es opt-out: un cliente solo se excluye cuando pulsa "darse de
 * baja" en una newsletter (que marca unsubscribed_at), no por no haber dado un
 * opt-in explícito previo.
 *
 * El segmento 'optin_invitation' es la ÚNICA excepción legítima y NO debe
 * pasar por este helper.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyMarketingBaseFilter<T extends { eq: any; is: any; not: any; filter: any }>(query: T): T {
  return query
    .eq('is_active', true)
    .not('email', 'is', null)
    .filter('email', 'imatch', EMAIL_REGEX_POSIX)
    .eq('email_bounced', false)
    .is('unsubscribed_at', null)
}

/** Aplica filtros específicos por segmento. NO incluye el filtro RGPD base. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySegmentSpecificFilter<T extends { eq: any; gte: any; lte: any; gt: any; not: any }>(
  query: T,
  segment: string
): T {
  if (segment === 'vip') return query.eq('category', 'vip')
  if (segment === 'new_30d') return query.gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
  if (segment === 'inactive_90d') return query.lte('last_purchase_date', new Date(Date.now() - 90 * 86400000).toISOString())
  if (segment === 'with_orders') return query.gt('purchase_count', 0)
  if (segment === 'web_registered') return query.not('profile_id', 'is', null)
  return query
}

/**
 * Destinatarios del segmento especial 'optin_invitation'.
 *
 * Por definición se dirige a clientes que aún NO han dado consentimiento
 * marketing (accepts_marketing = false), excluye direcciones rebotadas y
 * a quienes ya recibieron la invitación en los últimos 6 meses (anti-spam).
 *
 * La query original SQL incluía DISTINCT ON (LOWER(TRIM(email))). Como
 * PostgREST no permite expresarlo directamente, traemos los rows ordenados
 * por created_at DESC y deduplicamos en JS quedándonos con el más reciente
 * por email normalizado.
 */
async function getOptInInvitationRecipients(
  client: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>
): Promise<Record<string, unknown>[]> {
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString()

  const { data, error } = await client
    .from('clients')
    .select('id, first_name, last_name, full_name, email, created_at, opt_in_sent_at')
    .eq('is_active', true)
    .not('email', 'is', null)
    .filter('email', 'imatch', EMAIL_REGEX_POSIX)
    .neq('email', 'info@sastreriaprats.com')
    .eq('accepts_marketing', false)
    .eq('email_bounced', false)
    .or(`opt_in_sent_at.is.null,opt_in_sent_at.lt.${sixMonthsAgo}`)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getOptInInvitationRecipients]', error)
    return []
  }

  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  for (const row of data ?? []) {
    const email = String((row as { email?: unknown }).email ?? '').trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    out.push(row as Record<string, unknown>)
  }
  return out
}

async function countSegment(
  client: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  segment: string,
  filters?: Record<string, unknown>
): Promise<number> {
  if (segment === 'optin_invitation') {
    const recipients = await getOptInInvitationRecipients(client)
    return recipients.length
  }

  let query = client.from('clients').select('id', { count: 'exact', head: true })
  query = applyMarketingBaseFilter(query)
  query = applySegmentSpecificFilter(query, segment)

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
  if (segment === 'optin_invitation') {
    return getOptInInvitationRecipients(client)
  }

  let query = client.from('clients').select('id, first_name, last_name, full_name, email')
  query = applyMarketingBaseFilter(query)
  query = applySegmentSpecificFilter(query, segment)

  if (filters?.min_spent) query = query.gte('total_spent', filters.min_spent as number)

  const { data } = await query
  return data || []
}

/**
 * Compone el HTML que se enviaría de una campaña SIN enviarlo. Reutilizable
 * para preview/envío de prueba (Fase 12). Acepta un destinatario stub
 * opcional; si no se pasa, usa valores placeholder para el preview.
 *
 * Los tokens son ficticios (`preview-token`) — solo sirven para que las URLs
 * sean visualmente correctas. No tocan BBDD.
 */
export const previewCampaignEmail = protectedAction<
  {
    campaignId: string
    recipient?: { first_name?: string; full_name?: string; email?: string }
  },
  { html: string; subject: string }
>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx, { campaignId, recipient }) => {
    const { data: campaign } = await ctx.adminClient
      .from('email_campaigns')
      .select('*, email_templates(*)')
      .eq('id', campaignId)
      .single()

    if (!campaign) return failure('Campaña no encontrada')

    const template = campaign.email_templates as Record<string, unknown> | null
    if (campaign.template_id && !template) {
      return failure('La plantilla asociada a la campaña ya no existe.')
    }

    const templateCode = (template?.code as string) || ''
    const isStructured = STRUCTURED_CODES.has(templateCode)
    const isOptInInvitation = isOptInInvitationCampaign(campaign, template)
    const publicUrl = getPublicSiteUrl() || 'https://sastreriaprats.com'

    const filters = (campaign.segment_filters as Record<string, unknown> | null) || {}
    const content = (filters.content as NewsletterContent | undefined) || null

    const fakeToken = 'preview-token'
    const unsubscribeUrl = isOptInInvitation ? undefined : `${publicUrl}/newsletter/baja?token=${fakeToken}`
    const confirmationUrl = isOptInInvitation ? `${publicUrl}/newsletter/confirmar?token=${fakeToken}` : undefined

    const rec: NewsletterRecipient = {
      first_name: recipient?.first_name || 'Ejemplo',
      full_name: recipient?.full_name || 'Cliente Ejemplo',
      email: recipient?.email || 'preview@sastreriaprats.com',
    }

    let html: string
    if (isStructured && template) {
      html = composeNewsletterEmail({
        template: template as NewsletterTemplate,
        content,
        recipient: rec,
        urls: { unsubscribeUrl, confirmationUrl },
        subject: campaign.subject as string,
      })
    } else {
      html = renderTemplate(
        (template?.body_html_es as string) || (campaign.body_html as string) || '',
        {
          client_name: rec.full_name || rec.first_name || 'Cliente',
          client_email: rec.email || '',
          first_name: rec.first_name || '',
          last_name: '',
        }
      )
    }

    return success({ html, subject: (campaign.subject as string) || '' })
  }
)

/**
 * Vista previa "en caliente" desde el modal de creación/edición: renderiza el
 * email a partir del contenido que el usuario está escribiendo en ese momento,
 * SIN necesidad de guardar la campaña antes. Usa exactamente la misma lógica de
 * render que `previewCampaignEmail`, pero cargando la plantilla por id en vez de
 * leer una campaña existente. No persiste nada.
 */
export const previewCampaignContent = protectedAction<
  {
    template_id?: string | null
    subject?: string
    body_html?: string
    segment?: string
    content?: Record<string, unknown> | null
    recipient?: { first_name?: string; full_name?: string; email?: string }
  },
  { html: string; subject: string }
>(
  { permission: 'emails.view', auditModule: 'emails' },
  async (ctx, input) => {
    let template: Record<string, unknown> | null = null
    if (input.template_id && input.template_id !== 'none') {
      const { data } = await ctx.adminClient
        .from('email_templates')
        .select('*')
        .eq('id', input.template_id)
        .single()
      if (!data) return failure('La plantilla seleccionada ya no existe.')
      template = data
    }

    const templateCode = (template?.code as string) || ''
    const isStructured = STRUCTURED_CODES.has(templateCode)
    const isOptInInvitation =
      templateCode === 'newsletter_optin' || input.segment === 'optin_invitation'
    const publicUrl = getPublicSiteUrl() || 'https://sastreriaprats.com'

    const fakeToken = 'preview-token'
    const unsubscribeUrl = isOptInInvitation ? undefined : `${publicUrl}/newsletter/baja?token=${fakeToken}`
    const confirmationUrl = isOptInInvitation ? `${publicUrl}/newsletter/confirmar?token=${fakeToken}` : undefined

    const rec: NewsletterRecipient = {
      first_name: input.recipient?.first_name || 'Ejemplo',
      full_name: input.recipient?.full_name || 'Cliente Ejemplo',
      email: input.recipient?.email || 'preview@sastreriaprats.com',
    }

    let html: string
    if (isStructured && template) {
      html = composeNewsletterEmail({
        template: template as NewsletterTemplate,
        content: (input.content as NewsletterContent | undefined) || null,
        recipient: rec,
        urls: { unsubscribeUrl, confirmationUrl },
        subject: input.subject || '',
      })
    } else {
      html = renderTemplate(
        (template?.body_html_es as string) || (input.body_html as string) || '',
        {
          client_name: rec.full_name || rec.first_name || 'Cliente',
          client_email: rec.email || '',
          first_name: rec.first_name || '',
          last_name: '',
        }
      )
    }

    return success({ html, subject: input.subject || '' })
  }
)

/**
 * Envía la campaña al email del usuario autenticado como vista previa real,
 * con el subject prefijado `[PRUEBA]`. No toca email_logs, no toca clients,
 * no añade cabeceras List-Unsubscribe. Aplica la misma validación de
 * contenido obligatorio que el envío masivo.
 */
export const sendCampaignTestEmail = protectedAction<
  { campaignId: string },
  { sentTo: string; auditEntityId: string; auditDescription: string }
>(
  {
    permission: 'emails.send',
    auditModule: 'emails',
    auditAction: 'create',
    auditEntity: 'email_campaign',
  },
  async (ctx, { campaignId }) => {
    const adminEmail = (ctx.userEmail || '').trim()
    if (!adminEmail || !adminEmail.includes('@') || adminEmail === 'system') {
      return failure('Tu usuario no tiene email asociado.')
    }

    const { data: campaign } = await ctx.adminClient
      .from('email_campaigns')
      .select('*, email_templates(*)')
      .eq('id', campaignId)
      .single()
    if (!campaign) return failure('Campaña no encontrada')

    const template = campaign.email_templates as Record<string, unknown> | null
    if (campaign.template_id && !template) {
      return failure('La plantilla asociada a la campaña ya no existe.')
    }

    const templateCode = (template?.code as string) || ''
    const isStructured = STRUCTURED_CODES.has(templateCode)
    const isOptInInvitation = isOptInInvitationCampaign(campaign, template)

    const filters = (campaign.segment_filters as Record<string, unknown> | null) || {}
    const content = (filters.content as NewsletterContent | undefined) || null

    if (isStructured) {
      const validationError = validateStructuredContent(templateCode, content)
      if (validationError) return failure(validationError)
    }

    const publicUrl = getPublicSiteUrl() || 'https://sastreriaprats.com'
    const fakeToken = 'preview-token'
    const unsubscribeUrl = isOptInInvitation ? undefined : `${publicUrl}/newsletter/baja?token=${fakeToken}`
    const confirmationUrl = isOptInInvitation ? `${publicUrl}/newsletter/confirmar?token=${fakeToken}` : undefined

    const rec: NewsletterRecipient = {
      first_name: (ctx.userName || 'Ejemplo').split(/\s+/)[0],
      full_name: ctx.userName || 'Cliente Ejemplo',
      email: adminEmail,
    }

    let html: string
    if (isStructured && template) {
      html = composeNewsletterEmail({
        template: template as NewsletterTemplate,
        content,
        recipient: rec,
        urls: { unsubscribeUrl, confirmationUrl },
        subject: campaign.subject as string,
      })
    } else {
      html = renderTemplate(
        (template?.body_html_es as string) || (campaign.body_html as string) || '',
        {
          client_name: rec.full_name || rec.first_name || 'Cliente',
          client_email: adminEmail,
          first_name: rec.first_name || '',
          last_name: '',
        }
      )
    }

    const subject = '[PRUEBA] ' + (campaign.subject as string || '')

    try {
      await sendEmail({ to: adminEmail, subject, html })
      return success({
        sentTo: adminEmail,
        auditEntityId: String(campaignId),
        auditDescription: `Email de prueba de campaña "${(campaign.name as string) || ''}" a ${adminEmail}`,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al enviar'
      return failure(msg)
    }
  }
)

