'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import {
  Mail, FileText, Send, Plus, Loader2, Eye, Pencil,
  CheckCircle, XCircle, Clock, Megaphone,
} from 'lucide-react'
import { toast } from 'sonner'
import { listEmailTemplates, listCampaigns, getEmailLogs, createCampaign, sendCampaign } from '@/actions/emails'
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

type Template = Record<string, unknown>
type Campaign = Record<string, unknown>
type LogEntry = Record<string, unknown>

export function EmailsContent() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [logs, setLogs] = useState<{ logs: LogEntry[]; total: number }>({ logs: [], total: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [showPreview, setShowPreview] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const [campaignForm, setCampaignForm] = useState({
    name: '', subject: '', segment: 'all', template_id: '', body_html: '',
  })

  useEffect(() => {
    const load = async () => {
      const [tRes, cRes, lRes] = await Promise.all([
        listEmailTemplates(),
        listCampaigns(),
        getEmailLogs({ page: 1 }),
      ])
      if (tRes.success) setTemplates(tRes.data)
      if (cRes.success) setCampaigns(cRes.data)
      if (lRes.success) setLogs(lRes.data)
      setIsLoading(false)
    }
    load()
  }, [])

  const handleCreateCampaign = async () => {
    if (!campaignForm.name || !campaignForm.subject) {
      toast.error('Nombre y asunto obligatorios')
      return
    }
    const res = await createCampaign({
      ...campaignForm,
      template_id: campaignForm.template_id || undefined,
    })
    if (res.success) {
      toast.success(`Campaña creada — ${res.data.recipients} destinatarios`)
      setShowNewCampaign(false)
      setCampaignForm({ name: '', subject: '', segment: 'all', template_id: '', body_html: '' })
      const cRes = await listCampaigns()
      if (cRes.success) setCampaigns(cRes.data)
    } else {
      toast.error(res.error || 'Error al crear')
    }
  }

  const handleSendCampaign = async (id: string) => {
    setSendingId(id)
    const res = await sendCampaign(id)
    if (res.success) {
      toast.success(`Enviados ${res.data.sent} de ${res.data.total} emails`)
      const cRes = await listCampaigns()
      if (cRes.success) setCampaigns(cRes.data)
    } else {
      toast.error(res.error || 'Error al enviar')
    }
    setSendingId(null)
  }

  const totalSent = campaigns.reduce((s, c) => s + ((c.sent_count as number) || 0), 0)
  const totalOpened = campaigns.reduce((s, c) => s + ((c.opened_count as number) || 0), 0)

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
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                      </TableCell>
                    </TableRow>
                  ) : campaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
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
                          {segmentLabels[c.segment as string] || (c.segment as string)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{(c.total_recipients as number) || 0}</TableCell>
                      <TableCell className="text-right text-sm">{(c.sent_count as number) || 0}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusColors[c.status as string] || ''}`}>
                          {c.status as string}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate((c.sent_at || c.created_at) as string)}
                      </TableCell>
                      <TableCell>
                        {(c.status as string) === 'draft' && (
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
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* TEMPLATES */}
          <TabsContent value="templates">
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
                    <TableHead className="w-10" />
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setShowPreview(t.id as string)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
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

      {/* Template Preview Dialog */}
      <Dialog open={!!showPreview} onOpenChange={() => setShowPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Vista previa de plantilla</DialogTitle></DialogHeader>
          {showPreview && <TemplatePreview templateId={showPreview} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TemplatePreview({ templateId }: { templateId: string }) {
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { getEmailTemplate } = await import('@/actions/emails')
      const res = await getEmailTemplate(templateId)
      if (res.success) setTemplate(res.data)
      setLoading(false)
    }
    load()
  }, [templateId])

  if (loading) return <div className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
  if (!template) return <p className="py-12 text-center text-muted-foreground">Plantilla no encontrada</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
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
          <p>{template.subject_es as string}</p>
        </div>
        <div>
          <Label className="text-muted-foreground">Asunto (EN)</Label>
          <p>{(template.subject_en as string) || '—'}</p>
        </div>
      </div>
      {template.variables && (template.variables as string[]).length > 0 ? (
        <div>
          <Label className="text-muted-foreground">Variables</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {(template.variables as string[]).map(v => (
              <Badge key={v} variant="secondary" className="text-xs font-mono">{`{{${v}}}`}</Badge>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <Label className="text-muted-foreground">Vista previa HTML</Label>
        <div
          className="mt-2 rounded-lg border bg-white p-4 text-sm"
          dangerouslySetInnerHTML={{ __html: (template.body_html_es as string) || '' }}
        />
      </div>
    </div>
  )
}
