'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Mail, FileText, Send, Plus, Loader2, Eye, Pencil, Trash2,
  CheckCircle, XCircle, Clock, Megaphone, ChevronLeft, ChevronRight,
  ImageIcon, Users, UserCheck, UserX, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  listEmailTemplates,
  listCampaigns,
  getEmailLogs,
  getEmailTemplate,
  getCampaign,
  createCampaign,
  sendCampaign,
  updateEmailCampaign,
  upsertEmailTemplate,
  deleteCampaignAction,
  listNewsletterSubscribers,
  getSegmentCounts,
  previewCampaignContent,
  previewCampaignEmail,
  getEmailLogDetail,
} from '@/actions/emails'
import { formatDate, formatDateTime } from '@/lib/utils'
import { TemplateContentEditorDialog, type TemplateForEditor } from '@/components/admin/template-content-editor-dialog'
import { EmailTemplatePreviewModal } from '@/components/admin/email-template-preview-modal'
import { EmailPreviewDialog } from '@/components/admin/email-preview-dialog'
import { NewsletterContentEditor, type CampaignContent } from '@/components/admin/newsletter-content-editor'
import { TemplatesGallery } from '@/components/admin/templates-gallery'
import type { ProductSearchResult } from '@/actions/products'
import { usePermissions } from '@/hooks/use-permissions'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const segmentLabels: Record<string, string> = {
  all: 'Todos los clientes (excepto bajas)',
  vip: 'Clientes VIP (excepto bajas)',
  new_30d: 'Nuevos 30 días (excepto bajas)',
  inactive_90d: 'Inactivos 90 días (excepto bajas)',
  with_orders: 'Con pedidos (excepto bajas)',
  web_registered: 'Registrados web (excepto bajas)',
  optin_invitation: '📨 Invitación opt-in (RGPD — solo campaña inicial)',
}

/**
 * Texto de ayuda mostrado bajo el selector de segmento. El segmento
 * `optin_invitation` se dirige a clientes que aún no han dado consentimiento
 * marketing: úsalo SOLO con la plantilla `newsletter_optin`.
 */
const segmentHelpText: Record<string, string> = {
  optin_invitation: 'Este segmento envía a clientes que aún no han dado consentimiento marketing. Solo debe usarse con la plantilla "newsletter_optin".',
}

const categoryOptions: { value: string; label: string }[] = [
  { value: 'transactional', label: 'Transaccional' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'notification', label: 'Notificación' },
]

const LOGS_PAGE_SIZE = 50

type Template = Record<string, unknown>
type Campaign = Record<string, unknown>
type LogEntry = Record<string, unknown>

function emptyContent(): CampaignContent {
  return {
    hero_image_url: '',
    hero_image_alt: '',
    title_kicker: '',
    title: '',
    subtitle: '',
    description: '',
    products: [],
    cta_text: '',
    cta_url: '',
  }
}

function contentFromFilters(filters: unknown): CampaignContent {
  const base = emptyContent()
  if (!filters || typeof filters !== 'object') return base
  const c = (filters as Record<string, unknown>).content
  if (!c || typeof c !== 'object') return base
  const raw = c as Record<string, unknown>
  return {
    hero_image_url: typeof raw.hero_image_url === 'string' ? raw.hero_image_url : '',
    hero_image_alt: typeof raw.hero_image_alt === 'string' ? raw.hero_image_alt : '',
    title_kicker:   typeof raw.title_kicker === 'string' ? raw.title_kicker : '',
    title:          typeof raw.title === 'string' ? raw.title : '',
    subtitle:       typeof raw.subtitle === 'string' ? raw.subtitle : '',
    description:    typeof raw.description === 'string' ? raw.description : '',
    products:       Array.isArray(raw.products) ? (raw.products as ProductSearchResult[]) : [],
    cta_text:       typeof raw.cta_text === 'string' ? raw.cta_text : '',
    cta_url:        typeof raw.cta_url === 'string' ? raw.cta_url : '',
  }
}

/** Códigos de plantilla que disparan el editor estructurado en lugar del textarea HTML. */
const STRUCTURED_TEMPLATE_CODES = new Set(['newsletter_default', 'newsletter_optin'])

function slugFrom(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function EmailsContent() {
  const { can } = usePermissions()
  const canEditTemplateHtml = can('emails.manage_templates_html')
  const [templates, setTemplates] = useState<Template[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [logs, setLogs] = useState<{ logs: LogEntry[]; total: number; page: number }>({ logs: [], total: 0, page: 1 })
  const [isLoading, setIsLoading] = useState(true)
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [showPreview, setShowPreview] = useState<string | null>(null)
  const [showTemplateModal, setShowTemplateModal] = useState<string | 'new' | null>(null)
  const [showEditCampaign, setShowEditCampaign] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [logsPage, setLogsPage] = useState(1)

  // --- Pestaña Suscriptores ---
  type SubStatus = 'active' | 'inactive' | 'unsubscribed'
  type SubRow = Record<string, unknown>
  const [subStatus, setSubStatus] = useState<SubStatus>('active')
  const [subPage, setSubPage] = useState(1)
  const [subSearch, setSubSearch] = useState('')
  const [subSearchInput, setSubSearchInput] = useState('')
  const [subscribers, setSubscribers] = useState<{ rows: SubRow[]; total: number }>({ rows: [], total: 0 })
  const [subCounts, setSubCounts] = useState({ total: 0, active: 0, inactive: 0, unsubscribed: 0 })
  const [subsLoading, setSubsLoading] = useState(false)
  /** Nº de destinatarios por segmento, para el selector de campaña. */
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number>>({})

  const [campaignForm, setCampaignForm] = useState({
    name: '', subject: '', segment: 'all', template_id: '', body_html: '',
  })
  const [campaignContent, setCampaignContent] = useState<CampaignContent>(emptyContent())

  const [templateForm, setTemplateForm] = useState({
    id: '',
    name: '',
    code: '',
    category: 'transactional',
    subject_es: '',
    subject_en: '',
    body_html_es: '',
    body_html_en: '',
    variables_text: '',
    is_active: true,
  })

  const [campaignEditForm, setCampaignEditForm] = useState({
    id: '',
    subject: '',
    body_html: '',
    segment: 'all',
    template_id: '',
  })
  const [campaignEditContent, setCampaignEditContent] = useState<CampaignContent>(emptyContent())
  /** Si != null, el AlertDialog de confirmación de envío masivo está abierto y apunta a esa campaña. */
  const [confirmSend, setConfirmSend] = useState<{ id: string; name: string; recipients: number } | null>(null)
  /** Si != null, el AlertDialog de confirmación de eliminación está abierto y apunta a esa campaña. */
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string; status: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  /** Galería de plantillas: si admin activa el toggle, también se ven las del sistema. */
  const [showSystemTemplates, setShowSystemTemplates] = useState(false)
  /** Modal de miniatura ampliada — guarda la plantilla cuya miniatura se muestra. */
  const [zoomThumbnail, setZoomThumbnail] = useState<Template | null>(null)
  /** Plantilla en edición de contenido (lápiz). null = dialog cerrado. */
  const [editingContent, setEditingContent] = useState<TemplateForEditor | null>(null)

  /**
   * Estado del diálogo de vista previa de email (reutilizado para 3 casos):
   *  - Previa "en caliente" del modal Nueva campaña / Editar (sin guardar).
   *  - Previa de una campaña en borrador ya guardada.
   *  - "Ver envío" de una campaña enviada: previa + lista de destinatarios
   *    (cuando `campaignId` está presente).
   */
  const [previewState, setPreviewState] = useState<{
    open: boolean
    loading: boolean
    html?: string
    subject?: string
    title: string
    campaignId?: string
    /** Nota al pie del diálogo: undefined = default (tokens ficticios), null = sin nota. */
    footnote?: string | null
    emptyMessage?: string
  }>({ open: false, loading: false, title: 'Vista previa del email' })

  type CampaignFormLike = { subject: string; segment: string; template_id: string; body_html: string }

  /** Vista previa a partir del contenido del formulario, sin guardar la campaña. */
  const previewFromForm = async (form: CampaignFormLike, content: CampaignContent) => {
    const structured = STRUCTURED_TEMPLATE_CODES.has(templateCodeFor(form.template_id))
    setPreviewState({ open: true, loading: true, title: 'Vista previa del email' })
    const res = await previewCampaignContent({
      template_id: form.template_id && form.template_id !== 'none' ? form.template_id : null,
      subject: form.subject,
      body_html: form.body_html,
      segment: form.segment,
      content: structured ? (content as unknown as Record<string, unknown>) : null,
    })
    if (res.success && res.data) {
      setPreviewState((p) => ({ ...p, loading: false, html: res.data!.html, subject: res.data!.subject }))
    } else {
      toast.error((!res.success && res.error) || 'No se pudo generar la vista previa')
      setPreviewState((p) => ({ ...p, open: false, loading: false }))
    }
  }

  /**
   * Vista previa de una campaña ya guardada. Si `withRecipients` es true (campaña
   * enviada), el diálogo añade la pestaña de destinatarios con su estado.
   */
  const openCampaignPreview = async (campaign: Campaign, withRecipients: boolean) => {
    const id = campaign.id as string
    setPreviewState({
      open: true,
      loading: true,
      title: withRecipients ? `Envío — ${(campaign.name as string) || 'campaña'}` : 'Vista previa del email',
      campaignId: withRecipients ? id : undefined,
    })
    const res = await previewCampaignEmail({ campaignId: id })
    if (res.success && res.data) {
      setPreviewState((p) => ({ ...p, loading: false, html: res.data!.html, subject: res.data!.subject }))
    } else {
      toast.error((!res.success && res.error) || 'No se pudo generar la vista previa')
      setPreviewState((p) => ({ ...p, open: false, loading: false, campaignId: undefined }))
    }
  }

  /**
   * Vista previa de un envío individual del historial. Muestra el HTML tal
   * cual se envió (email_logs.body_html, snapshot desde jul-2026). Si el log
   * es anterior y pertenece a una campaña, regenera la previa desde la
   * campaña; si es transaccional antiguo, no hay contenido que mostrar.
   */
  const openLogPreview = async (log: LogEntry) => {
    const recipient = (log.recipient_email as string) || ''
    setPreviewState({
      open: true,
      loading: true,
      title: `Email enviado — ${recipient}`,
    })
    const res = await getEmailLogDetail(log.id as string)
    if (!res.success || !res.data) {
      toast.error((!res.success && res.error) || 'No se pudo cargar el envío')
      setPreviewState((p) => ({ ...p, open: false, loading: false }))
      return
    }
    const d = res.data
    if (d.body_html) {
      setPreviewState((p) => ({
        ...p,
        loading: false,
        html: d.body_html as string,
        subject: (d.subject as string) || undefined,
        footnote: 'Copia exacta del email enviado. Ojo: los enlaces (incluida la baja) son reales; no los pulses desde aquí.',
      }))
      return
    }
    if (d.campaign_id) {
      const prev = await previewCampaignEmail({ campaignId: d.campaign_id as string })
      if (prev.success && prev.data) {
        setPreviewState((p) => ({
          ...p,
          loading: false,
          html: prev.data!.html,
          subject: prev.data!.subject,
          footnote: 'Envío anterior a jul-2026: no se guardó la copia exacta. Se muestra la campaña regenerada con datos genéricos.',
        }))
        return
      }
    }
    setPreviewState((p) => ({
      ...p,
      loading: false,
      html: undefined,
      subject: (d.subject as string) || undefined,
      emptyMessage: 'Este envío es anterior a jul-2026 y no se guardó su contenido. Los emails nuevos sí guardan copia exacta.',
      footnote: null,
    }))
  }

  /** Abre el dialog "sin código" para editar nombre/asunto/estado. */
  const openContentEditor = (t: Template) => {
    setEditingContent({
      id: t.id as string,
      code: (t.code as string) || '',
      name: (t.name as string) || '',
      subject_es: (t.subject_es as string) || '',
      is_active: Boolean(t.is_active),
    })
  }

  /** Devuelve el `code` de la plantilla por id, o '' si no la encuentra. */
  const templateCodeFor = useCallback((templateId: string): string => {
    if (!templateId || templateId === 'none') return ''
    const t = templates.find((x) => (x.id as string) === templateId)
    return (t?.code as string) || ''
  }, [templates])

  const loadTemplates = useCallback(async () => {
    const res = await listEmailTemplates()
    if (res.success) setTemplates(res.data ?? [])
  }, [])

  const loadCampaigns = useCallback(async () => {
    const res = await listCampaigns()
    if (res.success) setCampaigns(res.data ?? [])
  }, [])

  const loadLogs = useCallback(async (page: number) => {
    const res = await getEmailLogs({ page })
    if (res.success) setLogs(res.data ?? { logs: [], total: 0, page: 1 })
  }, [])

  const loadSegmentCounts = useCallback(async () => {
    const res = await getSegmentCounts()
    if (res.success && res.data) setSegmentCounts(res.data)
  }, [])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await Promise.all([
        loadTemplates(),
        loadCampaigns(),
        loadSegmentCounts(),
      ])
      setIsLoading(false)
    }
    load()
  }, [loadTemplates, loadCampaigns, loadSegmentCounts])

  useEffect(() => {
    loadLogs(logsPage)
  }, [logsPage, loadLogs])

  const loadSubscribers = useCallback(async (status: SubStatus, page: number, search: string) => {
    setSubsLoading(true)
    const res = await listNewsletterSubscribers({ status, page, search })
    if (res.success && res.data) {
      setSubscribers({ rows: res.data.subscribers ?? [], total: res.data.total ?? 0 })
      setSubCounts(res.data.counts ?? { total: 0, active: 0, inactive: 0, unsubscribed: 0 })
    }
    setSubsLoading(false)
  }, [])

  useEffect(() => {
    loadSubscribers(subStatus, subPage, subSearch)
  }, [subStatus, subPage, subSearch, loadSubscribers])

  const openNewTemplate = () => {
    setTemplateForm({
      id: '',
      name: '',
      code: '',
      category: 'transactional',
      subject_es: '',
      subject_en: '',
      body_html_es: '',
      body_html_en: '',
      variables_text: '',
      is_active: true,
    })
    setShowTemplateModal('new')
  }

  const openEditTemplate = async (template: Template) => {
    const id = template.id as string
    const res = await getEmailTemplate(id)
    if (!res.success || !res.data) {
      toast.error('No se pudo cargar la plantilla')
      return
    }
    const t = res.data
    const vars = (t.variables as string[] | null) ?? []
    setTemplateForm({
      id,
      name: (t.name as string) ?? '',
      code: (t.code as string) ?? '',
      category: (t.category as string) ?? 'transactional',
      subject_es: (t.subject_es as string) ?? '',
      subject_en: (t.subject_en as string) ?? '',
      body_html_es: (t.body_html_es as string) ?? '',
      body_html_en: (t.body_html_en as string) ?? '',
      variables_text: vars.join(', '),
      is_active: Boolean(t.is_active),
    })
    setShowTemplateModal(id)
  }

  const handleSaveTemplate = async () => {
    const { name, code, subject_es, body_html_es } = templateForm
    if (!name?.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (!code?.trim()) {
      toast.error('El código es obligatorio')
      return
    }
    if (!subject_es?.trim()) {
      toast.error('El asunto (ES) es obligatorio')
      return
    }
    if (!body_html_es?.trim()) {
      toast.error('El cuerpo HTML (ES) es obligatorio')
      return
    }
    const variables = templateForm.variables_text
      .split(',')
      .map((v) => v.trim().replace(/^\{\{|\}\}$/g, ''))
      .filter(Boolean)
    const payload: Record<string, unknown> = {
      name: templateForm.name.trim(),
      code: templateForm.code.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      category: templateForm.category,
      subject_es: templateForm.subject_es.trim(),
      subject_en: templateForm.subject_en.trim() || null,
      body_html_es: templateForm.body_html_es.trim(),
      body_html_en: templateForm.body_html_en.trim() || null,
      variables,
      is_active: templateForm.is_active,
    }
    if (templateForm.id) payload.id = templateForm.id

    const res = await upsertEmailTemplate(payload)
    if (res.success) {
      toast.success(templateForm.id ? 'Plantilla actualizada' : 'Plantilla creada')
      setShowTemplateModal(null)
      loadTemplates()
    } else {
      toast.error(res.error ?? 'Error al guardar')
    }
  }

  /** Pre-rellena el dialog "Nueva campaña" con esta plantilla y lo abre. */
  const useTemplate = (t: Template) => {
    setCampaignForm({
      name: '',
      subject: (t.subject_es as string) || '',
      segment: 'all',
      template_id: t.id as string,
      body_html: '',
    })
    setCampaignContent(emptyContent())
    setShowNewCampaign(true)
  }

  /** Activa/desactiva una plantilla persistiendo el cambio. */
  const toggleTemplateActive = async (t: Template) => {
    const res = await upsertEmailTemplate({
      id: t.id,
      name: t.name,
      code: t.code,
      category: t.category,
      subject_es: t.subject_es,
      subject_en: t.subject_en ?? null,
      body_html_es: t.body_html_es ?? '',
      body_html_en: t.body_html_en ?? null,
      variables: t.variables ?? [],
      is_active: !t.is_active,
    })
    if (res.success) {
      toast.success(t.is_active ? 'Plantilla desactivada' : 'Plantilla activada')
      loadTemplates()
    } else {
      toast.error(res.error ?? 'Error al actualizar')
    }
  }

  const handleCreateCampaign = async () => {
    if (!campaignForm.name || !campaignForm.subject) {
      toast.error('Nombre y asunto obligatorios')
      return
    }
    const code = templateCodeFor(campaignForm.template_id)
    const structured = STRUCTURED_TEMPLATE_CODES.has(code)

    // Validación CTA: si hay uno de los dos, deben estar ambos
    if (structured && code === 'newsletter_default') {
      const { cta_text, cta_url } = campaignContent
      if ((cta_text.trim() && !cta_url.trim()) || (!cta_text.trim() && cta_url.trim())) {
        toast.error('Si añades CTA debes rellenar tanto el texto como la URL')
        return
      }
    }

    const res = await createCampaign({
      ...campaignForm,
      template_id: campaignForm.template_id && campaignForm.template_id !== 'none' ? campaignForm.template_id : undefined,
      // Para plantillas estructuradas guardamos content y dejamos body_html vacío:
      // el HTML final se genera al enviar a partir de la plantilla.
      body_html: structured ? '' : campaignForm.body_html,
      content: structured ? (campaignContent as unknown as Record<string, unknown>) : undefined,
    })
    if (res.success) {
      toast.success(`Campaña creada — ${res.data?.recipients ?? 0} destinatarios`)
      setShowNewCampaign(false)
      setCampaignForm({ name: '', subject: '', segment: 'all', template_id: '', body_html: '' })
      setCampaignContent(emptyContent())
      loadCampaigns()
    } else {
      toast.error(res.error ?? 'Error al crear')
    }
  }

  const openEditCampaign = async (campaignId: string) => {
    const res = await getCampaign(campaignId)
    if (!res.success || !res.data) {
      toast.error('No se pudo cargar la campaña')
      return
    }
    const c = res.data
    setCampaignEditForm({
      id: campaignId,
      subject: (c.subject as string) ?? '',
      body_html: (c.body_html as string) ?? '',
      segment: (c.segment as string) ?? 'all',
      template_id: (c.template_id as string) || 'none',
    })
    setCampaignEditContent(contentFromFilters(c.segment_filters))
    setShowEditCampaign(campaignId)
  }

  const handleUpdateCampaign = async () => {
    if (!campaignEditForm.id) return
    const code = templateCodeFor(campaignEditForm.template_id)
    const structured = STRUCTURED_TEMPLATE_CODES.has(code)

    if (structured && code === 'newsletter_default') {
      const { cta_text, cta_url } = campaignEditContent
      if ((cta_text.trim() && !cta_url.trim()) || (!cta_text.trim() && cta_url.trim())) {
        toast.error('Si añades CTA debes rellenar tanto el texto como la URL')
        return
      }
    }

    const res = await updateEmailCampaign({
      id: campaignEditForm.id,
      subject: campaignEditForm.subject.trim(),
      body_html: structured ? '' : campaignEditForm.body_html,
      segment: campaignEditForm.segment,
      template_id: campaignEditForm.template_id && campaignEditForm.template_id !== 'none' ? campaignEditForm.template_id : null,
      content: structured ? (campaignEditContent as unknown as Record<string, unknown>) : undefined,
    })
    if (res.success) {
      toast.success('Campaña actualizada')
      setShowEditCampaign(null)
      loadCampaigns()
    } else {
      toast.error(res.error ?? 'Error al actualizar')
    }
  }

  const handleSendCampaign = async (id: string) => {
    setSendingId(id)
    const res = await sendCampaign(id)
    if (res.success) {
      toast.success(`Enviados ${res.data?.sent ?? 0} de ${res.data?.total ?? 0} emails`)
      loadCampaigns()
    } else {
      toast.error(res.error ?? 'Error al enviar')
    }
    setSendingId(null)
  }

  const handleDeleteCampaign = async (id: string) => {
    setDeletingId(id)
    const res = await deleteCampaignAction(id)
    if (res.success) {
      toast.success('Campaña eliminada')
      setConfirmDelete(null)
      loadCampaigns()
    } else {
      toast.error('error' in res ? res.error : 'Error al eliminar la campaña')
    }
    setDeletingId(null)
  }

  const totalSent = campaigns.reduce((s, c) => s + ((c.sent_count as number) || 0), 0)
  const totalOpened = campaigns.reduce((s, c) => s + ((c.opened_count as number) || 0), 0)
  const totalLogsPages = Math.max(1, Math.ceil(logs.total / LOGS_PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Emails y Comunicaciones</h1>
          <p className="text-muted-foreground">Plantillas, campañas y historial de envíos</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <FileText className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{templates.length}</p>
            <p className="text-xs text-muted-foreground">Plantillas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Megaphone className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{campaigns.length}</p>
            <p className="text-xs text-muted-foreground">Campañas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Send className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <p className="text-2xl font-bold">{totalSent}</p>
            <p className="text-xs text-muted-foreground">Emails enviados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <Eye className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold">{totalOpened}</p>
            <p className="text-xs text-muted-foreground">Abiertos</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns" className="gap-1"><Megaphone className="h-4 w-4" /> Campañas</TabsTrigger>
          <TabsTrigger value="subscribers" className="gap-1"><Users className="h-4 w-4" /> Suscriptores</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1"><FileText className="h-4 w-4" /> Plantillas</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1"><Mail className="h-4 w-4" /> Historial ({logs.total})</TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {/* CAMPAIGNS */}
          <TabsContent value="campaigns">
            <div className="flex justify-end mb-4">
              <Button onClick={() => setShowNewCampaign(true)} className="gap-2 bg-prats-navy hover:bg-prats-navy/90">
                <Plus className="h-4 w-4" /> Nueva campaña
              </Button>
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaña</TableHead>
                    <TableHead>Segmento</TableHead>
                    <TableHead className="text-right">Destinatarios</TableHead>
                    <TableHead className="text-right">Enviados</TableHead>
                    <TableHead className="text-right">Entregados</TableHead>
                    <TableHead className="text-right">Abiertos</TableHead>
                    <TableHead className="text-right">Clics</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-32 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : campaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                        Sin campañas creadas
                      </TableCell>
                    </TableRow>
                  ) : campaigns.map(c => (
                    <TableRow key={c.id as string}>
                      <TableCell>
                        <p className="font-medium">{c.name as string}</p>
                        <p className="text-xs text-muted-foreground">{c.subject as string}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {segmentLabels[c.segment as string] ?? (c.segment as string)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{(c.total_recipients as number) ?? 0}</TableCell>
                      <TableCell className="text-right text-sm">{(c.sent_count as number) ?? 0}</TableCell>
                      <TableCell className="text-right text-sm">{(c.delivered_count as number) ?? 0}</TableCell>
                      <TableCell className="text-right text-sm">
                        {(() => {
                          const sent = (c.sent_count as number) ?? 0
                          const opened = (c.opened_count as number) ?? 0
                          if (sent === 0) return '—'
                          return `${Math.round((opened / sent) * 100)}%`
                        })()}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {(() => {
                          const sent = (c.sent_count as number) ?? 0
                          const clicked = (c.clicked_count as number) ?? 0
                          if (sent === 0) return '—'
                          return `${Math.round((clicked / sent) * 100)}%`
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusColors[c.status as string] ?? ''}`}>
                          {c.status as string}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate((c.sent_at ?? c.created_at) as string)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {(c.status as string) === 'draft' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-xs"
                                onClick={() => openEditCampaign(c.id as string)}
                              >
                                <Pencil className="h-3 w-3" /> Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-xs"
                                onClick={() => openCampaignPreview(c, false)}
                              >
                                <Eye className="h-3 w-3" /> Vista previa
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-xs"
                                disabled={sendingId === (c.id as string)}
                                onClick={() => setConfirmSend({
                                  id: c.id as string,
                                  name: (c.name as string) || '',
                                  recipients: (c.total_recipients as number) || 0,
                                })}
                              >
                                {sendingId === (c.id as string)
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Send className="h-3 w-3" />}
                                Enviar
                              </Button>
                            </>
                          )}
                          {(c.status as string) !== 'draft' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs"
                              onClick={() => openCampaignPreview(c, true)}
                            >
                              <Eye className="h-3 w-3" /> Ver envío
                            </Button>
                          )}
                          {can('emails.send') && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            disabled={deletingId === (c.id as string)}
                            onClick={() => setConfirmDelete({
                              id: c.id as string,
                              name: (c.name as string) || '',
                              status: (c.status as string) || '',
                            })}
                            title="Eliminar campaña"
                            aria-label="Eliminar campaña"
                          >
                            {deletingId === (c.id as string)
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* SUSCRIPTORES — clientes clasificados por estado de newsletter */}
          <TabsContent value="subscribers">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {([
                { key: 'total' as const, status: null, label: 'Total clientes', value: subCounts.total, icon: Users, color: 'text-muted-foreground', ring: 'ring-prats-navy' },
                { key: 'active' as const, status: 'active' as SubStatus, label: 'Activos (reciben)', value: subCounts.active, icon: UserCheck, color: 'text-green-600', ring: 'ring-green-500' },
                { key: 'inactive' as const, status: 'inactive' as SubStatus, label: 'Inactivos (no reciben)', value: subCounts.inactive, icon: UserX, color: 'text-amber-600', ring: 'ring-amber-500' },
                { key: 'unsubscribed' as const, status: 'unsubscribed' as SubStatus, label: 'Dados de baja', value: subCounts.unsubscribed, icon: XCircle, color: 'text-red-600', ring: 'ring-red-500' },
              ]).map(card => {
                const Icon = card.icon
                const selectable = card.status !== null
                const selected = card.status === subStatus
                return (
                  <Card
                    key={card.key}
                    onClick={selectable ? () => { setSubStatus(card.status as SubStatus); setSubPage(1) } : undefined}
                    className={`${selectable ? 'cursor-pointer hover:bg-muted/40' : ''} ${selected ? `ring-2 ${card.ring}` : ''}`}
                  >
                    <CardContent className="pt-4 pb-3 text-center">
                      <Icon className={`h-5 w-5 mx-auto mb-1 ${card.color}`} />
                      <p className="text-2xl font-bold">{card.value}</p>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <form
              className="flex items-center gap-2 mb-4"
              onSubmit={(e) => { e.preventDefault(); setSubSearch(subSearchInput.trim()); setSubPage(1) }}
            >
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={subSearchInput}
                  onChange={(e) => setSubSearchInput(e.target.value)}
                  placeholder="Buscar por nombre o email…"
                  className="pl-8"
                />
              </div>
              <Button type="submit" variant="secondary">Buscar</Button>
              {subSearch && (
                <Button type="button" variant="ghost" onClick={() => { setSubSearch(''); setSubSearchInput(''); setSubPage(1) }}>
                  Limpiar
                </Button>
              )}
            </form>

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>{subStatus === 'unsubscribed' ? 'Baja' : subStatus === 'inactive' ? 'Motivo' : 'Alta'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : subscribers.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No hay clientes en este estado{subSearch ? ' para la búsqueda actual' : ''}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    subscribers.rows.map((s) => {
                      const name = (s.full_name as string)
                        || [s.first_name, s.last_name].filter(Boolean).join(' ').trim()
                        || '—'
                      const inactiveReason = !s.is_active ? 'Ficha desactivada'
                        : !s.email ? 'Sin email'
                        : s.email_bounced ? 'Email rebotado'
                        : 'Email inválido'
                      return (
                        <TableRow key={s.id as string}>
                          <TableCell>
                            <Link href={`/admin/clientes/${s.id}`} className="font-medium hover:underline">{name}</Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{(s.email as string) || <span className="italic">sin email</span>}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{(s.source as string) || '—'}</TableCell>
                          <TableCell className="text-sm">
                            {subStatus === 'unsubscribed' ? (
                              <div>
                                <span>{s.unsubscribed_at ? formatDate(s.unsubscribed_at as string) : '—'}</span>
                                {s.unsubscribe_reason ? (
                                  <p className="text-xs text-muted-foreground italic">{s.unsubscribe_reason as string}</p>
                                ) : null}
                              </div>
                            ) : subStatus === 'inactive' ? (
                              <Badge variant="outline" className="text-amber-600 border-amber-300">{inactiveReason}</Badge>
                            ) : (
                              <span className="text-muted-foreground">{s.created_at ? formatDate(s.created_at as string) : '—'}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {subscribers.total > 50 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  {subscribers.total} clientes · página {subPage} de {Math.max(1, Math.ceil(subscribers.total / 50))}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={subPage <= 1} onClick={() => setSubPage(p => Math.max(1, p - 1))}>
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    disabled={subPage >= Math.ceil(subscribers.total / 50)}
                    onClick={() => setSubPage(p => p + 1)}
                  >
                    Siguiente <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* TEMPLATES — galería visual */}
          <TabsContent value="templates">
            <TemplatesGallery
              templates={templates}
              canEditHtml={canEditTemplateHtml}
              showSystem={showSystemTemplates}
              onToggleShowSystem={setShowSystemTemplates}
              onUseTemplate={useTemplate}
              onEditDefault={openContentEditor}
              onEditHtml={openEditTemplate}
              onToggleActive={toggleTemplateActive}
              onPreview={setShowPreview}
              onZoom={setZoomThumbnail}
              onNewTemplate={openNewTemplate}
            />
          </TabsContent>

          {/* LOGS */}
          <TabsContent value="logs">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Asunto / Campaña</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Sin envíos registrados</TableCell>
                    </TableRow>
                  ) : logs.logs.map((l) => (
                    <TableRow
                      key={l.id as string}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openLogPreview(l)}
                    >
                      <TableCell>
                        <p className="text-sm">{l.recipient_email as string}</p>
                      </TableCell>
                      <TableCell>
                        {l.subject ? <p className="text-sm">{l.subject as string}</p> : null}
                        {(l.email_campaigns as Record<string, unknown>)?.name ? (
                          <Badge variant="outline" className="text-xs">
                            {(l.email_campaigns as Record<string, unknown>).name as string}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {(l.email_type as string) === 'transactional' ? 'Transaccional' : 'Campaña'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(l.status as string) === 'sent' || (l.status as string) === 'delivered'
                          ? <CheckCircle className="h-4 w-4 text-green-500" />
                          : (l.status as string) === 'failed'
                            ? <XCircle className="h-4 w-4 text-red-500" />
                            : <Clock className="h-4 w-4 text-gray-400" />}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(l.sent_at as string)}
                      </TableCell>
                      <TableCell>
                        <Eye className="h-4 w-4 text-muted-foreground" aria-label="Ver email enviado" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {logs.total > LOGS_PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Página {logs.page} de {totalLogsPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={logs.page <= 1}
                    onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={logs.page >= totalLogsPages}
                    onClick={() => setLogsPage((p) => Math.min(totalLogsPages, p + 1))}
                  >
                    Siguiente <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* New Campaign Dialog */}
      <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva campaña de email</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre de la campaña *</Label>
              <Input
                value={campaignForm.name}
                onChange={e => setCampaignForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Rebajas de verano"
              />
            </div>
            <div className="space-y-2">
              <Label>Asunto del email *</Label>
              <Input
                value={campaignForm.subject}
                onChange={e => setCampaignForm(p => ({ ...p, subject: e.target.value }))}
                placeholder="Ej: Descubre nuestra nueva colección"
              />
            </div>
            <div className="space-y-2">
              <Label>Segmento de clientes</Label>
              <Select value={campaignForm.segment} onValueChange={v => setCampaignForm(p => ({ ...p, segment: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(segmentLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}{segmentCounts[k] != null ? ` · ${segmentCounts[k]} destinatarios` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {segmentHelpText[campaignForm.segment] && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {segmentHelpText[campaignForm.segment]}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Plantilla base</Label>
              <Select value={campaignForm.template_id} onValueChange={v => setCampaignForm(p => ({ ...p, template_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar plantilla (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin plantilla</SelectItem>
                  {templates.filter(t => t.is_active).map(t => (
                    <SelectItem key={t.id as string} value={t.id as string}>{t.name as string}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NewsletterContentEditor
              templateCode={templateCodeFor(campaignForm.template_id)}
              content={campaignContent}
              onContentChange={setCampaignContent}
              bodyHtml={campaignForm.body_html}
              onBodyHtmlChange={(v) => setCampaignForm((p) => ({ ...p, body_html: v }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewCampaign(false)}>Cancelar</Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => previewFromForm(campaignForm, campaignContent)}
            >
              <Eye className="h-4 w-4" /> Vista previa
            </Button>
            <Button onClick={handleCreateCampaign} className="bg-prats-navy hover:bg-prats-navy/90">
              Crear campaña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Campaign Dialog (draft only) */}
      <Dialog open={!!showEditCampaign} onOpenChange={(open) => !open && setShowEditCampaign(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar campaña</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Asunto del email *</Label>
              <Input
                value={campaignEditForm.subject}
                onChange={e => setCampaignEditForm(p => ({ ...p, subject: e.target.value }))}
                placeholder="Asunto"
              />
            </div>
            <div className="space-y-2">
              <Label>Segmento de clientes</Label>
              <Select value={campaignEditForm.segment} onValueChange={v => setCampaignEditForm(p => ({ ...p, segment: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(segmentLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}{segmentCounts[k] != null ? ` · ${segmentCounts[k]} destinatarios` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {segmentHelpText[campaignEditForm.segment] && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  {segmentHelpText[campaignEditForm.segment]}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Plantilla base</Label>
              <Select value={campaignEditForm.template_id || 'none'} onValueChange={v => setCampaignEditForm(p => ({ ...p, template_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar plantilla (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin plantilla</SelectItem>
                  {templates.filter(t => t.is_active).map(t => (
                    <SelectItem key={t.id as string} value={t.id as string}>{t.name as string}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NewsletterContentEditor
              templateCode={templateCodeFor(campaignEditForm.template_id)}
              content={campaignEditContent}
              onContentChange={setCampaignEditContent}
              bodyHtml={campaignEditForm.body_html}
              onBodyHtmlChange={(v) => setCampaignEditForm((p) => ({ ...p, body_html: v }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditCampaign(null)}>Cancelar</Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => previewFromForm(campaignEditForm, campaignEditContent)}
            >
              <Eye className="h-4 w-4" /> Vista previa
            </Button>
            <Button onClick={handleUpdateCampaign} className="bg-prats-navy hover:bg-prats-navy/90">
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor "sin código" de plantilla (lápiz) */}
      <TemplateContentEditorDialog
        template={editingContent}
        onClose={() => setEditingContent(null)}
        onSaved={() => loadTemplates()}
      />

      {/* Zoom miniatura plantilla */}
      <Dialog open={!!zoomThumbnail} onOpenChange={(open) => { if (!open) setZoomThumbnail(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{(zoomThumbnail?.name as string) || 'Vista previa'}</DialogTitle>
          </DialogHeader>
          {zoomThumbnail?.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={zoomThumbnail.thumbnail_url as string}
              alt={zoomThumbnail.name as string}
              className="w-full h-auto border rounded bg-white"
            />
          ) : (
            <div className="aspect-[600/800] bg-muted/40 rounded flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="h-8 w-8 mb-2" />
              <p className="text-sm">Miniatura no disponible</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm mass send */}
      <AlertDialog
        open={!!confirmSend}
        onOpenChange={(open) => { if (!open) setConfirmSend(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar campaña a {confirmSend?.recipients ?? 0} destinatarios</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a enviar <strong>{confirmSend?.name || 'la campaña'}</strong> a{' '}
              <strong>{confirmSend?.recipients ?? 0}</strong> destinatarios.
              Esta acción es irreversible. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmSend) return
                const id = confirmSend.id
                setConfirmSend(null)
                await handleSendCampaign(id)
              }}
              className="bg-prats-navy hover:bg-prats-navy/90"
            >
              Enviar ahora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm delete (soft delete) */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar campaña?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Vas a eliminar <strong>{confirmDelete?.name || 'esta campaña'}</strong>.
                </p>
                {confirmDelete?.status === 'draft' && (
                  <p className="text-muted-foreground">
                    Esta campaña aún no se ha enviado. Se eliminará del listado.
                  </p>
                )}
                {confirmDelete?.status === 'sending' && (
                  <p className="text-amber-700">
                    Esta campaña se está enviando ahora mismo. Al eliminarla, los envíos en curso continuarán pero
                    dejará de aparecer en el historial.
                  </p>
                )}
                {confirmDelete?.status === 'sent' && (
                  <p className="text-muted-foreground">
                    Esta campaña ya se ha enviado. Al eliminarla, ya no aparecerá en el historial (las métricas y
                    logs de envío se conservan internamente).
                  </p>
                )}
                {(confirmDelete?.status === 'cancelled' || confirmDelete?.status === 'failed') && (
                  <p className="text-muted-foreground">
                    Esta campaña está en estado <strong>{confirmDelete.status}</strong>. Se eliminará del listado.
                  </p>
                )}
                {confirmDelete && !['draft', 'sending', 'sent', 'cancelled', 'failed'].includes(confirmDelete.status) && (
                  <p className="text-muted-foreground">
                    Estado actual: <strong>{confirmDelete.status}</strong>. Se eliminará del listado.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingId !== null}
              onClick={async () => {
                if (!confirmDelete) return
                await handleDeleteCampaign(confirmDelete.id)
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingId !== null ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Create/Edit Modal — editor HTML maestro (admin only) */}
      <Dialog open={!!showTemplateModal} onOpenChange={(open) => !open && setShowTemplateModal(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{templateForm.id ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
          </DialogHeader>
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            ⚠ <strong>ZONA TÉCNICA.</strong> Estás editando el HTML maestro de la plantilla. Solo administradores.
            Un cambio incorrecto puede romper los emails. Para editar solo el contenido visual sin código,
            vuelve atrás y usa &quot;Editar contenido por defecto&quot;.
          </div>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={templateForm.name}
                  onChange={e => {
                    setTemplateForm(p => ({ ...p, name: e.target.value }))
                    if (!templateForm.id && !templateForm.code) {
                      setTemplateForm(p => ({ ...p, code: slugFrom(e.target.value) }))
                    }
                  }}
                  placeholder="Ej: Bienvenida cliente"
                />
              </div>
              <div className="space-y-2">
                <Label>Código único (slug) *</Label>
                <Input
                  value={templateForm.code}
                  onChange={e => setTemplateForm(p => ({ ...p, code: e.target.value }))}
                  placeholder="bienvenida_cliente"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Solo letras minúsculas, números y _</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={templateForm.category} onValueChange={v => setTemplateForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Asunto (ES) *</Label>
                <Input
                  value={templateForm.subject_es}
                  onChange={e => setTemplateForm(p => ({ ...p, subject_es: e.target.value }))}
                  placeholder="Asunto en español"
                />
              </div>
              <div className="space-y-2">
                <Label>Asunto (EN)</Label>
                <Input
                  value={templateForm.subject_en}
                  onChange={e => setTemplateForm(p => ({ ...p, subject_en: e.target.value }))}
                  placeholder="Subject in English"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cuerpo HTML (ES) *</Label>
              <Textarea
                value={templateForm.body_html_es}
                onChange={e => setTemplateForm(p => ({ ...p, body_html_es: e.target.value }))}
                rows={8}
                placeholder="<h2>Hola {{client_name}}</h2><p>...</p>"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Cuerpo HTML (EN)</Label>
              <Textarea
                value={templateForm.body_html_en}
                onChange={e => setTemplateForm(p => ({ ...p, body_html_en: e.target.value }))}
                rows={4}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Variables disponibles (separadas por comas)</Label>
              <Input
                value={templateForm.variables_text}
                onChange={e => setTemplateForm(p => ({ ...p, variables_text: e.target.value }))}
                placeholder="client_name, order_number, total"
              />
              <p className="text-xs text-muted-foreground">Se usarán como {'{{nombre}}'} en el HTML</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="template-active"
                checked={templateForm.is_active}
                onCheckedChange={v => setTemplateForm(p => ({ ...p, is_active: v }))}
              />
              <Label htmlFor="template-active">Plantilla activa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateModal(null)}>Cancelar</Button>
            <Button onClick={handleSaveTemplate} className="bg-prats-navy hover:bg-prats-navy/90">
              {templateForm.id ? 'Guardar' : 'Crear plantilla'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Preview Dialog (iframe + metadata + Editar) */}
      <Dialog open={!!showPreview} onOpenChange={() => setShowPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Vista previa de plantilla</DialogTitle></DialogHeader>
          {showPreview && (
            <EmailTemplatePreviewModal
              templateId={showPreview}
              onClose={() => setShowPreview(null)}
              onEdit={() => {
                setShowPreview(null)
                openEditTemplate({ id: showPreview } as Template)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Vista previa de email: en caliente (modal), borrador, o envío + destinatarios */}
      <EmailPreviewDialog
        open={previewState.open}
        onOpenChange={(o) => setPreviewState((p) => ({ ...p, open: o }))}
        title={previewState.title}
        html={previewState.html}
        subject={previewState.subject}
        loading={previewState.loading}
        campaignId={previewState.campaignId}
        footnote={previewState.footnote}
        emptyMessage={previewState.emptyMessage}
      />
    </div>
  )
}
