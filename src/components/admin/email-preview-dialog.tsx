'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Smartphone, Monitor, Loader2, CheckCircle, XCircle, Clock,
  ChevronLeft, ChevronRight, Mail, Users,
} from 'lucide-react'
import { getEmailLogs } from '@/actions/emails'
import { formatDateTime } from '@/lib/utils'

type Viewport = 'mobile' | 'desktop'

const VIEWPORT_WIDTH: Record<Viewport, number> = {
  mobile: 375,
  desktop: 640,
}

const LOGS_PAGE_SIZE = 50

type LogEntry = Record<string, unknown>

/**
 * Diálogo de vista previa de email reutilizable.
 *
 * - Siempre muestra el render del email en un iframe con toggle móvil/escritorio.
 * - Si se pasa `campaignId`, añade una pestaña "Destinatarios" que carga, de forma
 *   perezosa y paginada, la lista de a quién se envió (con su estado) desde
 *   `email_logs`. Útil para revisar campañas ya enviadas.
 *
 * El `html` lo provee el padre (lo obtiene de previewCampaignContent /
 * previewCampaignEmail). Si `loading` es true se muestra un spinner.
 */
export function EmailPreviewDialog({
  open,
  onOpenChange,
  title = 'Vista previa del email',
  subject,
  html,
  loading,
  campaignId,
  footnote,
  emptyMessage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  subject?: string
  html?: string
  loading?: boolean
  /** Si se indica, se muestra también la pestaña de destinatarios de esa campaña. */
  campaignId?: string
  /** Nota bajo el iframe. undefined = texto por defecto (tokens ficticios); null = sin nota. */
  footnote?: string | null
  /** Texto cuando no hay html que mostrar. */
  emptyMessage?: string
}) {
  const [viewport, setViewport] = useState<Viewport>('desktop')

  // --- Destinatarios (solo si hay campaignId) ---
  const [logs, setLogs] = useState<{ logs: LogEntry[]; total: number }>({ logs: [], total: 0 })
  const [logsPage, setLogsPage] = useState(1)
  const [logsLoading, setLogsLoading] = useState(false)

  const loadLogs = useCallback(async (cId: string, page: number) => {
    setLogsLoading(true)
    const res = await getEmailLogs({ page, campaign_id: cId })
    if (res.success && res.data) {
      setLogs({ logs: res.data.logs ?? [], total: res.data.total ?? 0 })
    }
    setLogsLoading(false)
  }, [])

  // Al abrir el diálogo de una campaña, resetea la paginación.
  useEffect(() => {
    if (open && campaignId) setLogsPage(1)
  }, [open, campaignId])

  useEffect(() => {
    if (open && campaignId) loadLogs(campaignId, logsPage)
  }, [open, campaignId, logsPage, loadLogs])

  const totalLogsPages = Math.max(1, Math.ceil(logs.total / LOGS_PAGE_SIZE))

  const renderPreview = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {subject ? (
          <p className="text-sm text-muted-foreground truncate">
            <span className="font-medium text-foreground">Asunto:</span> {subject}
          </p>
        ) : <span />}
        <div className="inline-flex rounded-md border bg-background overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${viewport === 'mobile' ? 'bg-prats-navy text-white' : 'hover:bg-accent'}`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Móvil
          </button>
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            className={`px-3 py-1.5 text-xs flex items-center gap-1.5 ${viewport === 'desktop' ? 'bg-prats-navy text-white' : 'hover:bg-accent'}`}
          >
            <Monitor className="h-3.5 w-3.5" /> Escritorio
          </button>
        </div>
      </div>

      <div className="flex justify-center bg-muted/40 rounded-md py-6 border">
        {loading ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-16">
            <Loader2 className="h-6 w-6 animate-spin mb-2" />
            <p className="text-sm">Generando vista previa…</p>
          </div>
        ) : html ? (
          <div
            className="bg-white shadow-md rounded-sm overflow-hidden transition-all"
            style={{ width: `${VIEWPORT_WIDTH[viewport]}px`, maxWidth: '100%' }}
          >
            <iframe
              title="Vista previa del email"
              srcDoc={html}
              className="w-full border-0"
              style={{ height: '60vh' }}
              sandbox="allow-same-origin"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-16 px-6 text-center">
            <Mail className="h-6 w-6 mb-2" />
            <p className="text-sm">{emptyMessage || 'No hay contenido para previsualizar.'}</p>
          </div>
        )}
      </div>
      {footnote !== null && (
        <p className="text-xs text-muted-foreground text-center">
          {footnote ?? 'Los enlaces de baja / confirmación usan tokens ficticios solo para esta vista. No tocan la base de datos.'}
        </p>
      )}
    </div>
  )

  const renderRecipients = () => (
    <div className="space-y-3">
      <div className="rounded-lg border max-h-[60vh] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Destinatario</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha de envío</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : logs.logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  Sin destinatarios registrados para esta campaña.
                </TableCell>
              </TableRow>
            ) : logs.logs.map((l) => {
              const status = l.status as string
              return (
                <TableRow key={l.id as string}>
                  <TableCell className="text-sm">{l.recipient_email as string}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      {status === 'opened' || status === 'clicked' ? (
                        <><CheckCircle className="h-4 w-4 text-blue-500" /> {status === 'clicked' ? 'Clicado' : 'Abierto'}</>
                      ) : status === 'delivered' ? (
                        <><CheckCircle className="h-4 w-4 text-green-500" /> Entregado</>
                      ) : status === 'sent' ? (
                        <><CheckCircle className="h-4 w-4 text-green-500" /> Enviado</>
                      ) : status === 'bounced' ? (
                        <><XCircle className="h-4 w-4 text-amber-500" /> Rebotado</>
                      ) : status === 'failed' || status === 'complained' ? (
                        <><XCircle className="h-4 w-4 text-red-500" /> {status === 'complained' ? 'Spam' : 'Fallido'}</>
                      ) : (
                        <><Clock className="h-4 w-4 text-gray-400" /> {status || 'Pendiente'}</>
                      )}
                    </span>
                    {l.error_message ? (
                      <p className="text-xs text-red-500 italic">{l.error_message as string}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.sent_at ? formatDateTime(l.sent_at as string) : '—'}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {logs.total > LOGS_PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {logs.total} destinatarios · página {logsPage} de {totalLogsPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              disabled={logsPage <= 1}
              onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={logsPage >= totalLogsPages}
              onClick={() => setLogsPage((p) => Math.min(totalLogsPages, p + 1))}
            >
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {campaignId ? (
          <Tabs defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview" className="gap-1"><Mail className="h-4 w-4" /> Vista previa</TabsTrigger>
              <TabsTrigger value="recipients" className="gap-1">
                <Users className="h-4 w-4" /> Destinatarios{logs.total ? ` (${logs.total})` : ''}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="mt-4">{renderPreview()}</TabsContent>
            <TabsContent value="recipients" className="mt-4">{renderRecipients()}</TabsContent>
          </Tabs>
        ) : (
          renderPreview()
        )}
      </DialogContent>
    </Dialog>
  )
}
