'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Mail, FileText, Send, Plus, Loader2, Eye, Pencil,
  CheckCircle, XCircle, Clock, Megaphone, ChevronLeft, ChevronRight,
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
} from '@/actions/emails'
import { formatDate, formatDateTime } from '@/lib/utils'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

const segmentLabels: Record<string, string> = {
  all: 'Todos los clientes',
  vip: 'Clientes VIP',
  new_30d: 'Nuevos (30 días)',
  inactive_90d: 'Inactivos (90 días)',
  with_orders: 'Con pedidos',
  web_registered: 'Registrados web',
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

function slugFrom(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function EmailsContent() {
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

  const [campaignForm, setCampaignForm] = useState({
    name: '', subject: '', segment: 'all', template_id: '', body_html: '',
  })

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

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await Promise.all([
        loadTemplates(),
        loadCampaigns(),
      ])
      setIsLoading(false)
    }
    load()
  }, [loadTemplates, loadCampaigns])

  useEffect(() => {
    loadLogs(logsPage)
  }, [logsPage, loadLogs])

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

  const handleCreateCampaign = async () => {
    if (!campaignForm.name || !campaignForm.subject) {
      toast.error('Nombre y asunto obligatorios')
      return
    }
    const res = await createCampaign({
      ...campaignForm,
      template_id: campaignForm.template_id && campaignForm.template_id !== 'none' ? campaignForm.template_id : undefined,
    })
    if (res.success) {
      toast.success(`Campaña creada — ${res.data?.recipients ?? 0} destinatarios`)
      setShowNewCampaign(false)
      setCampaignForm({ name: '', subject: '', segment: 'all', template_id: '', body_html: '' })
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
    setShowEditCampaign(campaignId)
  }

  const handleUpdateCampaign = async () => {
    if (!campaignEditForm.id) return
    const res = await updateEmailCampaign({
      id: campaignEditForm.id,
      subject: campaignEditForm.subject.trim(),
      body_html: campaignEditForm.body_html,
      segment: campaignEditForm.segment,
      template_id: campaignEditForm.template_id && campaignEditForm.template_id !== 'none' ? campaignEditForm.template_id : null,
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
                                disabled={sendingId === (c.id as string)}
                                onClick={() => handleSendCampaign(c.id as string)}
                              >
                                {sendingId === (c.id as string)
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Send className="h-3 w-3" />}
                                Enviar
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* TEMPLATES */}
          <TabsContent value="templates">
            <div className="flex justify-end mb-4">
              <Button onClick={openNewTemplate} className="gap-2 bg-prats-navy hover:bg-prats-navy/90">
                <Plus className="h-4 w-4" /> Nueva plantilla
              </Button>
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plantilla</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Asunto (ES)</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Actualizado</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Sin plantillas</TableCell>
                    </TableRow>
                  ) : templates.map(t => (
                    <TableRow key={t.id as string}>
                      <TableCell className="font-medium">{t.name as string}</TableCell>
                      <TableCell className="font-mono text-xs">{t.code as string}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{t.category as string}</Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{t.subject_es as string}</TableCell>
                      <TableCell>
                        {t.is_active
                          ? <Badge className="bg-green-100 text-green-700 text-xs">Activa</Badge>
                          : <Badge variant="secondary" className="text-xs">Inactiva</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(t.updated_at as string)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Vista previa"
                            onClick={() => setShowPreview(t.id as string)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Editar"
                            onClick={() => openEditTemplate(t)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">Sin envíos registrados</TableCell>
                    </TableRow>
                  ) : logs.logs.map((l) => (
                    <TableRow key={l.id as string}>
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
        <DialogContent className="max-w-lg">
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
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="space-y-2">
              <Label>Contenido HTML</Label>
              <Textarea
                value={campaignForm.body_html}
                onChange={e => setCampaignForm(p => ({ ...p, body_html: e.target.value }))}
                rows={6}
                placeholder={'<h2>Tu contenido aquí</h2>\n<p>Usa {{client_name}} para personalizar</p>'}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Variables disponibles: {'{{client_name}}'}, {'{{first_name}}'}, {'{{client_email}}'}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewCampaign(false)}>Cancelar</Button>
            <Button onClick={handleCreateCampaign} className="bg-prats-navy hover:bg-prats-navy/90">
              Crear campaña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Campaign Dialog (draft only) */}
      <Dialog open={!!showEditCampaign} onOpenChange={(open) => !open && setShowEditCampaign(null)}>
        <DialogContent className="max-w-lg">
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
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="space-y-2">
              <Label>Contenido HTML</Label>
              <Textarea
                value={campaignEditForm.body_html}
                onChange={e => setCampaignEditForm(p => ({ ...p, body_html: e.target.value }))}
                rows={6}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditCampaign(null)}>Cancelar</Button>
            <Button onClick={handleUpdateCampaign} className="bg-prats-navy hover:bg-prats-navy/90">
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Create/Edit Modal */}
      <Dialog open={!!showTemplateModal} onOpenChange={(open) => !open && setShowTemplateModal(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{templateForm.id ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
          </DialogHeader>
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
            <TemplatePreviewModal
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
    </div>
  )
}

function TemplatePreviewModal({
  templateId,
  onClose,
  onEdit,
}: {
  templateId: string
  onClose: () => void
  onEdit: () => void
}) {
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const res = await getEmailTemplate(templateId)
      if (res.success) setTemplate(res.data ?? null)
      setLoading(false)
    }
    load()
  }, [templateId])

  if (loading) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      </div>
    )
  }
  if (!template) {
    return <p className="py-12 text-center text-muted-foreground">Plantilla no encontrada</p>
  }

  const html = (template.body_html_es as string) || ''
  const vars = (template.variables as string[]) ?? []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <Label className="text-muted-foreground">Nombre</Label>
          <p className="font-medium">{template.name as string}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Código</Label>
          <p className="font-mono">{template.code as string}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Categoría</Label>
          <p>{template.category as string}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Asunto (ES)</Label>
          <p>{(template.subject_es as string) || '—'}</p>
        </div>
      </div>
      {vars.length > 0 && (
        <div>
          <Label className="text-muted-foreground">Variables</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {vars.map(v => (
              <Badge key={v} variant="secondary" className="text-xs font-mono">{`{{${v}}}`}</Badge>
            ))}
          </div>
        </div>
      )}
      <div>
        <Label className="text-muted-foreground">Vista previa (HTML renderizado)</Label>
        <div className="mt-2 rounded-lg border bg-white overflow-hidden">
          <iframe
            title="Preview"
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;font-family:system-ui,sans-serif;">${html}</body></html>`}
            className="w-full min-h-[300px] border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
        <Button onClick={onEdit} className="bg-prats-navy hover:bg-prats-navy/90">
          <Pencil className="h-4 w-4 mr-2" /> Editar
        </Button>
      </div>
    </div>
  )
}
